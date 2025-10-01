#!/usr/bin/env node

import { basename, join, extname } from 'path';
import { createHash } from 'crypto';
import { Logger } from '../../shared/utils/logger.js';
import {
  readJsonMarkdownFile,
  readMarkdownFileWithMeta,
  extractUrlFromPath,
  findMarkdownFiles,
  moveFileToDir,
} from '../../shared/utils/file-utils.js';
import {
  config,
  getEnvConfig,
  getPipelinePaths,
  getMongoConfig,
  JSON_MARKDOWN_FIELD,
} from './config.js';
import { EMBEDDING_CONFIG } from './prompts.js';
import { createMongoDBService, MongoDBService } from '../../shared/services/mongodb.js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import type {
  EmbeddingChunkDocument,
  TextChunk,
  EmbeddingVector,
} from '../../shared/types/embedding.js';

interface CliArgs {
  inputPath?: string;
  title?: string;
  description?: string;
  tags?: string[];
  saveToMongo?: boolean; // accepted but ignored; Mongo is always used
  jsonField?: string;
  collection?: string;
  group?: string;
  baseUrl?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm markdown-to-embeddings [input-path] [options]

Arguments:
  input-path              Path to a JSON/Markdown file or directory (default: data-pipelines/data/markdown-to-embeddings/input/)

Options:
  --json-field <name>     JSON field that contains markdown (default: ${JSON_MARKDOWN_FIELD})
  --collection <name>     MongoDB collection to use (default: env EMBEDDINGS_COLLECTION or 'embeddings')
  --group <name>          Optional group identifier applied to all documents
  --base-url <url>        Base URL for markdown files (default: ${config.defaultBaseUrl})
  --title <title>         Optional title metadata (single file only)
  --description <desc>    Optional description metadata (single file only)
  --tags <tag1,tag2>      Optional comma-separated tags (single file only)
  --save-to-mongo         Accepted but ignored; saving to MongoDB is always enabled
  --help, -h              Show this help message

Environment Variables:
  OPENAI_API_KEY          Required: Your OpenAI API key
  OPENAI_EMBEDDING_MODEL  Optional: Model to use (default: ${config.defaultModel})
  EMBEDDING_DIMENSIONS    Optional: Embedding dimensions (default: ${config.defaultEmbeddingDimensions})
  MONGODB_URI             Required: MongoDB connection URI
  MONGODB_DATABASE        Required: MongoDB database name
  EMBEDDINGS_COLLECTION   Optional: MongoDB collection name (default: 'embeddings')

Notes:
  - If --group is omitted, a run-scoped id like run_<token> is generated per invocation and printed at start.
  - For markdown files, URLs are generated from file paths: pages/learn/foo.md -> https://base-url/pages/learn/foo


Examples:
  # Process all files in default input directory
  pnpm markdown-to-embeddings

  # Process markdown files with custom base URL
  pnpm markdown-to-embeddings --base-url https://docs.example.com

  # Process single file
  pnpm markdown-to-embeddings data/markdown-to-embeddings/input/document.json

  # Process all files in specific directory with group
  pnpm markdown-to-embeddings data/markdown-to-embeddings/input/ --group production-docs
`);
    process.exit(0);
  }

  const parsedArgs: CliArgs = {};

  // Check if first argument is a flag or a path
  let argIndex = 0;
  if (args.length > 0 && !args[0].startsWith('--')) {
    parsedArgs.inputPath = args[0];
    argIndex = 1;
  }

  for (let i = argIndex; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--title':
        parsedArgs.title = value;
        break;
      case '--description':
        parsedArgs.description = value;
        break;
      case '--tags':
        parsedArgs.tags = value ? value.split(',').map((tag) => tag.trim()) : [];
        break;
      case '--save-to-mongo':
        parsedArgs.saveToMongo = true;
        i--; // This flag doesn't have a value, so don't skip the next argument
        break;
      case '--json-field':
        parsedArgs.jsonField = value;
        break;
      case '--collection':
        parsedArgs.collection = value;
        break;
      case '--group':
        parsedArgs.group = value;
        break;
      case '--base-url':
        parsedArgs.baseUrl = value;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return parsedArgs;
}

function preprocessText(content: string): string {
  let processed = content;

  if (EMBEDDING_CONFIG.removeMarkdownFormatting) {
    // Remove ATX header markers but keep text
    processed = processed.replace(/^#{1,6}\s+/gm, '');
    // Bold and italic
    processed = processed.replace(/\*\*(.*?)\*\*/g, '$1');
    processed = processed.replace(/\*(.*?)\*/g, '$1');
    // Inline code
    processed = processed.replace(/`(.*?)`/g, '$1');
    // Links: keep link text
    processed = processed.replace(/\[(.*?)\]\(.*?\)/g, '$1');
    // List markers (unordered and ordered)
    processed = processed.replace(/^\s*[-*+]\s+/gm, '');
    processed = processed.replace(/^\s*\d+\.\s+/gm, '');
  }

  if (EMBEDDING_CONFIG.normalizeWhitespace) {
    // Normalize excessive whitespace but preserve paragraph breaks
    processed = processed.replace(/[\t\f\r ]+/g, ' ');
    processed = processed.replace(/\n{3,}/g, '\n\n');
    processed = processed.trim();
  }

  return processed;
}

function extractHeadings(markdown: string): Array<{ level: number; text: string; index: number }> {
  const headings: Array<{ level: number; text: string; index: number }> = [];
  const lines = markdown.split(/\n/);
  let pos = 0;
  let inFence = false;
  for (const line of lines) {
    const fenceMatch = line.match(/^```/);
    if (fenceMatch) {
      inFence = !inFence;
    }
    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) {
        const level = m[1].length;
        // strip simple inline markdown from heading text
        const text = m[2]
          .replace(/\[(.*?)\]\(.*?\)/g, '$1')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/`(.*?)`/g, '$1')
          .trim();
        headings.push({ level, text, index: pos });
      }
    }
    pos += line.length + 1; // +1 for newline
  }
  return headings;
}

function attachSectionPathsToChunks(chunks: TextChunk[], markdown: string) {
  const headings = extractHeadings(markdown);
  // Maintain a stack of latest headings per level
  const stack: (string | undefined)[] = new Array(6).fill(undefined);
  let hIdx = 0;
  for (const chunk of chunks) {
    // Advance heading pointer up to this chunk's start
    while (hIdx < headings.length && headings[hIdx].index <= chunk.startIndex) {
      const h = headings[hIdx];
      stack[h.level - 1] = h.text;
      for (let d = h.level; d < stack.length; d++) stack[d] = undefined;
      hIdx++;
    }
    const path = stack.filter(Boolean).join(' > ');
    const nearest = (() => {
      for (let d = stack.length - 1; d >= 0; d--) {
        if (stack[d]) return stack[d];
      }
      return undefined;
    })();
    chunk.metadata = {
      ...(chunk.metadata || {}),
      sectionPath: path || undefined,
      nearestHeading: nearest,
    };
  }
}

async function chunkTextWithLangChain(content: string): Promise<TextChunk[]> {
  // Use RecursiveCharacterTextSplitter with markdown-aware separators
  // This tries to split at natural boundaries in order:
  // 1. Headings (##, ###, etc.)
  // 2. Paragraphs (\n\n)
  // 3. Sentences
  // 4. Words
  const splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
    chunkSize: 1500,      // Slightly smaller for more focused chunks
    chunkOverlap: 200,    // Good overlap to maintain context between chunks
  });

  const docs = await splitter.createDocuments([content]);
  const chunks: TextChunk[] = [];
  let searchStart = 0;
  let idx = 0;
  for (const d of docs) {
    const text = d.pageContent;
    const found = content.indexOf(text, searchStart);
    const startIndex = found >= 0 ? found : searchStart;
    const endIndex = startIndex + text.length;
    searchStart = endIndex;
    chunks.push({ content: text, startIndex, endIndex, chunkIndex: idx++ });
  }
  return chunks;
}

async function generateEmbeddingsLC(
  chunks: TextChunk[],
  embeddingsClient: OpenAIEmbeddings,
  model: string,
  dimensions: number,
  logger: Logger
): Promise<EmbeddingVector[]> {
  logger.info('Generating embeddings', { chunkCount: chunks.length, model, dimensions });
  const vectors = await embeddingsClient.embedDocuments(chunks.map((c) => c.content));
  return vectors.map((vec, i) => ({ embedding: vec, chunk: chunks[i], model, dimensions }));
}

async function processFile(
  inputFile: string,
  embeddingsClient: OpenAIEmbeddings,
  logger: Logger,
  args: CliArgs,
  envConfig: Awaited<ReturnType<typeof getEnvConfig>>,
  mongoService: MongoDBService,
  outputDir: string,
  defaultGroup: string,
  baseInputDir: string
): Promise<{ success: boolean; chunkCount?: number; error?: string; mongoId?: string }> {
  try {
    const groupId = args.group || defaultGroup;
    logger.info('Processing file', { inputFile, groupId });

    // Determine file type and read appropriately
    const fileExt = extname(inputFile).toLowerCase();
    let markdown: string;
    let sourceMeta: Record<string, unknown>;

    if (fileExt === '.json') {
      // Read JSON file and extract markdown + metadata
      const { markdown: md, meta } = readJsonMarkdownFile(
        inputFile,
        args.jsonField || JSON_MARKDOWN_FIELD
      );
      markdown = md;
      const maybeObj = meta as Record<string, unknown>;
      const nestedMeta =
        maybeObj && typeof maybeObj['metadata'] === 'object' && maybeObj['metadata'] !== null
          ? (maybeObj['metadata'] as Record<string, unknown>)
          : undefined;
      sourceMeta = nestedMeta || maybeObj || {};
      logger.info('JSON file read successfully', { inputFile, contentLength: markdown.length });
    } else if (fileExt === '.md' || fileExt === '.markdown') {
      // Read markdown file with frontmatter
      const { markdown: md, meta } = readMarkdownFileWithMeta(inputFile);
      markdown = md;
      sourceMeta = meta;

      // Extract URL from file path if not provided in metadata
      if (!sourceMeta.url) {
        // Use CLI arg, fallback to default
        const baseUrl = args.baseUrl || config.defaultBaseUrl;
        sourceMeta.url = extractUrlFromPath(inputFile, baseInputDir, baseUrl);
      }

      logger.info('Markdown file read successfully', {
        inputFile,
        contentLength: markdown.length,
        extractedUrl: sourceMeta.url
      });
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }

    // Chunk the original markdown (preserves headings for context)
    const chunks = await chunkTextWithLangChain(markdown);
    logger.info('Text chunked', { chunkCount: chunks.length });

    // Attach per-chunk metadata
    const chunkTotal = chunks.length;
    const sourceBasename = basename(inputFile);
    for (const c of chunks) {
      c.metadata = {
        sourceFile: inputFile,
        sourceBasename,
        chunkIndex: c.chunkIndex,
        chunkTotal,
        startIndex: c.startIndex,
        endIndex: c.endIndex,
        groupId,
        ...sourceMeta,
      };
    }

    // Attach section paths derived from nearest headings in original markdown
    attachSectionPathsToChunks(chunks, markdown);

    // Generate embeddings
    // Preprocess each chunk for embedding content
    const processedChunks: TextChunk[] = chunks.map((c) => ({
      ...c,
      content: preprocessText(c.content),
    }));
    const embeddings = await generateEmbeddingsLC(
      processedChunks,
      embeddingsClient,
      envConfig.model,
      envConfig.dimensions,
      logger
    );
    logger.info('Embeddings generated', { embeddingCount: embeddings.length });

    // Promote commonly used metadata from JSON meta or CLI
    const titleFromMeta =
      typeof sourceMeta.title === 'string' && sourceMeta.title.trim()
        ? (sourceMeta.title as string)
        : undefined;
    const descFromMeta =
      typeof sourceMeta.description === 'string' && sourceMeta.description.trim()
        ? (sourceMeta.description as string)
        : undefined;
    const urlFromMeta =
      typeof sourceMeta.url === 'string' && sourceMeta.url.trim()
        ? (sourceMeta.url as string)
        : undefined;
    const tagsFromMeta = Array.isArray(sourceMeta.tags)
      ? (sourceMeta.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : typeof sourceMeta.tags === 'string'
      ? String(sourceMeta.tags)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const metaTitle = titleFromMeta || args.title;
    const metaDescription = descFromMeta || args.description;
    const metaUrl = urlFromMeta;
    const metaTags: string[] | undefined = tagsFromMeta || args.tags;

    // Build per-chunk documents and bulk upsert
    const fileContentHash = createHash('sha256').update(markdown).digest('hex');
    const chunkDocs: EmbeddingChunkDocument[] = embeddings.map((ev, i) => {
      const c = chunks[i];
      const md = c.metadata as Record<string, unknown> | undefined;
      const sectionPath =
        typeof md?.['sectionPath'] === 'string' ? (md['sectionPath'] as string) : undefined;
      const nearestHeading =
        typeof md?.['nearestHeading'] === 'string' ? (md['nearestHeading'] as string) : undefined;
      const chunkContentHash = createHash('sha256')
        .update(processedChunks[i].content)
        .digest('hex');
      return {
        embedding: ev.embedding,
        text: processedChunks[i].content,
        sourceFile: inputFile,
        sourceBasename,
        groupId,
        title: metaTitle,
        description: metaDescription,
        url: metaUrl,
        tags: metaTags,
        sectionPath,
        nearestHeading,
        chunkIndex: c.chunkIndex,
        chunkTotal: chunks.length,
        startIndex: c.startIndex,
        endIndex: c.endIndex,
        model: envConfig.model,
        dimensions: envConfig.dimensions,
        contentHash: fileContentHash,
        chunkContentHash,
        sourceMeta,
      };
    });

    try {
      const bulkResult = await mongoService.bulkUpsertEmbeddingChunks(chunkDocs);
      logger.info('Chunk documents upserted to MongoDB', { inputFile, ...bulkResult });
    } catch (mongoError) {
      logger.error('Failed to bulk upsert chunk documents', {
        inputFile,
        error: mongoError instanceof Error ? mongoError.message : String(mongoError),
      });
      throw mongoError;
    }

    // Move processed file into output directory
    try {
      const movedPath = moveFileToDir(inputFile, outputDir);
      logger.info('Moved processed file', { from: inputFile, to: movedPath });
    } catch (moveError) {
      logger.warn('Failed to move processed file', {
        inputFile,
        error: moveError instanceof Error ? moveError.message : String(moveError),
      });
    }

    return { success: true, chunkCount: chunks.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('File processing failed', { inputFile, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

async function main() {
  const startTime = Date.now();
  let mongoService: MongoDBService | undefined;

  try {
    // Parse CLI arguments
    const args = parseArgs();

    // Get pipeline-specific paths
    const paths = getPipelinePaths();

    // Setup logging
    const logFile = join(
      paths.defaultLogsDir,
      `markdown-to-embeddings-${new Date().toISOString().slice(0, 10)}.log`
    );
    const logger = new Logger(logFile);

    logger.info('Starting markdown-to-embeddings pipeline', { args });

    // Get environment configuration for embeddings
    const envConfig = await getEnvConfig();
    logger.info('Environment configuration loaded', {
      model: envConfig.model,
      dimensions: envConfig.dimensions,
    });
    // Generate a run-scoped default group if not provided
    const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultGroup = `run_${runToken}`;
    if (!process.argv.includes('--group')) {
      console.log(`Using default group: ${defaultGroup}`);
    }

    // Initialize MongoDB service (always required)
    try {
      const mongoEnv = await getMongoConfig();
      const collection = args.collection || mongoEnv.collection;
      mongoService = createMongoDBService(mongoEnv.uri, mongoEnv.database, collection);
      await mongoService.connect();
      logger.info('MongoDB service connected', {
        uri: mongoEnv.uri,
        database: mongoEnv.database,
        collection,
      });
    } catch (mongoError) {
      logger.error('Failed to connect to MongoDB', {
        error: mongoError instanceof Error ? mongoError.message : String(mongoError),
      });
      throw new Error(
        `MongoDB connection failed: ${
          mongoError instanceof Error ? mongoError.message : String(mongoError)
        }`
      );
    }

    // Determine input path (use default if not provided)
    const inputPath = args.inputPath || paths.defaultInputDir;
    logger.info('Input path determined', { inputPath });

    // Find input files (.json)
    const inputFiles = findMarkdownFiles(inputPath, config.supportedInputExtensions);
    logger.info('Input files discovered', { fileCount: inputFiles.length, files: inputFiles });

    // Initialize LangChain OpenAI embeddings client
    const embeddingsClient = new OpenAIEmbeddings({
      model: envConfig.model,
      dimensions: envConfig.dimensions,
      apiKey: envConfig.apiKey,
    });
    logger.info('OpenAI embeddings client initialized');

    // Process files sequentially
    const results = [];
    let totalChunks = 0;
    let successCount = 0;
    let failureCount = 0;

    console.log(`🚀 Processing ${inputFiles.length} file(s)...`);

    for (let i = 0; i < inputFiles.length; i++) {
      const inputFile = inputFiles[i];

      console.log(`\n📄 [${i + 1}/${inputFiles.length}] Processing: ${inputFile}`);

      const result = await processFile(
        inputFile,
        embeddingsClient,
        logger,
        args,
        envConfig,
        mongoService,
        paths.defaultOutputDir,
        defaultGroup,
        paths.defaultInputDir
      );
      results.push({ inputFile, ...result });

      if (result.success) {
        successCount++;
        totalChunks += result.chunkCount || 0;
        let successMessage = `   ✅ Success: ${result.chunkCount} chunks`;
        if (result.mongoId) {
          successMessage += ` (MongoDB ID: ${result.mongoId})`;
        }
        console.log(successMessage);
      } else {
        failureCount++;
        console.log(`   ❌ Failed: ${result.error}`);
      }
    }

    const processingTime = Date.now() - startTime;

    // Log final results
    logger.info('Pipeline completed', {
      processingTime: `${processingTime}ms`,
      totalFiles: inputFiles.length,
      successCount,
      failureCount,
      totalChunks,
      results,
    });

    // Display summary
    console.log(`\n📊 Processing Summary:`);
    console.log(`   📁 Total files: ${inputFiles.length}`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📦 Total chunks: ${totalChunks}`);
    console.log(`   ⏱️  Processing time: ${processingTime}ms`);

    // Close MongoDB connection
    try {
      await mongoService.disconnect();
      logger.info('MongoDB service disconnected');
    } catch (mongoError) {
      logger.error('Failed to disconnect from MongoDB', {
        error: mongoError instanceof Error ? mongoError.message : String(mongoError),
      });
    }

    if (failureCount > 0) {
      console.log(`\n❌ Some files failed to process. Check the log file for details: ${logFile}`);
      process.exit(1);
    } else {
      console.log(`\n🎉 All files processed successfully!`);
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Pipeline failed: ${error}`);

    // Close MongoDB connection during cleanup
    try {
      if (mongoService) await mongoService.disconnect();
    } catch (mongoError) {
      console.warn('Failed to disconnect MongoDB service during cleanup', mongoError);
    }

    // Try to log error if logger is available
    try {
      const paths = getPipelinePaths();
      const logFile = join(
        paths.defaultLogsDir,
        `markdown-to-embeddings-${new Date().toISOString().slice(0, 10)}.log`
      );
      const logger = new Logger(logFile);
      logger.error('Pipeline failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });
    } catch (logError) {
      console.warn('Failed to write pipeline error log', logError);
    }

    process.exit(1);
  }
}

// Run the pipeline
main();
