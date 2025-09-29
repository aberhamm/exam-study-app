#!/usr/bin/env node

import { join } from 'path';
import { OpenAI } from 'openai';
import { Logger } from '../../shared/utils/logger.js';
import { readMarkdownFile, writeJsonFile, generateOutputPath, findMarkdownFiles } from '../../shared/utils/file-utils.js';
import { config, getEnvConfig, getPipelinePaths, getMongoConfig } from './config.js';
import { EMBEDDING_CONFIG, TEXT_PREPROCESSING } from './prompts.js';
import { createMongoDBService, MongoDBService } from '../../shared/services/mongodb.js';
import type { EmbeddingDocument, TextChunk, EmbeddingVector } from '../../shared/types/embedding.js';

interface CliArgs {
  inputPath?: string;
  outputDir?: string;
  title?: string;
  description?: string;
  tags?: string[];
  saveToMongo?: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm markdown-to-embeddings [input-path] [options]

Arguments:
  input-path              Path to markdown file or directory (default: data/markdown-to-embeddings/input/)

Options:
  --output-dir <dir>      Output directory for embedding files (default: data/markdown-to-embeddings/output/)
  --title <title>         Document title for metadata (single file only)
  --description <desc>    Document description for metadata (single file only)
  --tags <tag1,tag2>      Comma-separated tags for metadata (single file only)
  --save-to-mongo         Save embeddings to MongoDB (requires MONGODB_URI and MONGODB_DATABASE)
  --help, -h              Show this help message

Environment Variables:
  OPENAI_API_KEY          Required: Your OpenAI API key
  OPENAI_EMBEDDING_MODEL  Optional: Model to use (default: ${config.defaultModel})
  EMBEDDING_DIMENSIONS    Optional: Embedding dimensions (default: ${config.defaultEmbeddingDimensions})
  MONGODB_URI            Optional: MongoDB connection URI (required with --save-to-mongo)
  MONGODB_DATABASE       Optional: MongoDB database name (required with --save-to-mongo)

Examples:
  # Process all files in default input directory
  pnpm markdown-to-embeddings

  # Process single file
  pnpm markdown-to-embeddings data/markdown-to-embeddings/input/document.md

  # Process all files in specific directory
  pnpm markdown-to-embeddings data/markdown-to-embeddings/input/

  # Process with custom output directory
  pnpm markdown-to-embeddings --output-dir data/markdown-to-embeddings/output/

  # Process single file with metadata
  pnpm markdown-to-embeddings document.md --title "Study Guide" --tags "study,guide"

  # Process and save to MongoDB
  pnpm markdown-to-embeddings --save-to-mongo
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
      case '--output-dir':
        parsedArgs.outputDir = value;
        break;
      case '--title':
        parsedArgs.title = value;
        break;
      case '--description':
        parsedArgs.description = value;
        break;
      case '--tags':
        parsedArgs.tags = value ? value.split(',').map(tag => tag.trim()) : [];
        break;
      case '--save-to-mongo':
        parsedArgs.saveToMongo = true;
        i--; // This flag doesn't have a value, so don't skip the next argument
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
    TEXT_PREPROCESSING.markdownPatterns.forEach(pattern => {
      if (pattern.global) {
        processed = processed.replace(pattern, '$1');
      } else {
        processed = processed.replace(pattern, '$1');
      }
    });
  }

  if (EMBEDDING_CONFIG.normalizeWhitespace) {
    // Remove extra whitespace and normalize line breaks
    processed = processed.replace(/\s+/g, ' ');
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');
    processed = processed.trim();
  }

  return processed;
}

function chunkText(content: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  const chunkSize = config.chunkSize;
  const overlap = config.chunkOverlap;

  if (EMBEDDING_CONFIG.strategy === 'sentence-aware') {
    // Split by sentences while respecting chunk size
    const sentences = content.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    let chunkStartIndex = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          startIndex: chunkStartIndex,
          endIndex: chunkStartIndex + currentChunk.length,
          chunkIndex: chunkIndex++,
        });

        // Start new chunk with overlap
        const overlapStart = Math.max(0, currentChunk.length - overlap);
        const overlapText = currentChunk.substring(overlapStart);
        chunkStartIndex += currentChunk.length - overlapText.length;
        currentChunk = overlapText + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        startIndex: chunkStartIndex,
        endIndex: chunkStartIndex + currentChunk.length,
        chunkIndex: chunkIndex,
      });
    }
  } else {
    // Fixed-size chunking
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const chunk = content.substring(i, i + chunkSize);
      chunks.push({
        content: chunk,
        startIndex: i,
        endIndex: i + chunk.length,
        chunkIndex: Math.floor(i / (chunkSize - overlap)),
      });
    }
  }

  return chunks;
}

async function generateEmbeddings(
  chunks: TextChunk[],
  client: OpenAI,
  model: string,
  dimensions: number,
  logger: Logger
): Promise<EmbeddingVector[]> {
  const embeddings: EmbeddingVector[] = [];

  logger.info('Generating embeddings', { chunkCount: chunks.length, model, dimensions });

  // Process chunks in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    try {
      const response = await client.embeddings.create({
        model,
        input: batch.map(chunk => chunk.content),
        dimensions,
      });

      response.data.forEach((embedding, index) => {
        embeddings.push({
          embedding: embedding.embedding,
          chunk: batch[index],
          model,
          dimensions,
        });
      });

      logger.info('Batch processed', {
        batchIndex: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(chunks.length / batchSize),
        processedChunks: i + batch.length
      });

      // Small delay to respect rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Embedding generation failed for batch', {
        batchIndex: Math.floor(i / batchSize) + 1,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  return embeddings;
}

async function processFile(
  inputFile: string,
  outputFile: string,
  client: OpenAI,
  logger: Logger,
  args: CliArgs,
  envConfig: ReturnType<typeof getEnvConfig>,
  mongoService?: MongoDBService
): Promise<{ success: boolean; chunkCount?: number; error?: string; mongoId?: string }> {
  try {
    logger.info('Processing file', { inputFile, outputFile });

    // Read markdown file
    const markdownContent = readMarkdownFile(inputFile);
    logger.info('Markdown file read successfully', { inputFile, contentLength: markdownContent.length });

    // Preprocess text
    const processedContent = preprocessText(markdownContent);
    logger.info('Text preprocessed', { originalLength: markdownContent.length, processedLength: processedContent.length });

    // Chunk the text
    const chunks = chunkText(processedContent);
    logger.info('Text chunked', { chunkCount: chunks.length });

    // Generate embeddings
    const embeddings = await generateEmbeddings(chunks, client, envConfig.model, envConfig.dimensions, logger);
    logger.info('Embeddings generated', { embeddingCount: embeddings.length });

    // Prepare output document
    const document: EmbeddingDocument = {
      sourceFile: inputFile,
      totalChunks: chunks.length,
      embeddings,
      metadata: {
        title: args.title,
        description: args.description,
        tags: args.tags,
        createdAt: new Date().toISOString(),
        model: envConfig.model,
        dimensions: envConfig.dimensions,
      },
    };

    // Write output file
    writeJsonFile(outputFile, document);
    logger.info('Output file written successfully', { inputFile, outputFile, chunkCount: chunks.length });

    // Save to MongoDB if requested
    let mongoId: string | undefined;
    if (mongoService) {
      try {
        mongoId = await mongoService.saveEmbeddingDocument(document);
        logger.info('Document saved to MongoDB', { inputFile, mongoId, chunkCount: chunks.length });
      } catch (mongoError) {
        logger.error('Failed to save to MongoDB', {
          inputFile,
          error: mongoError instanceof Error ? mongoError.message : String(mongoError)
        });
        // Continue with success since file was still written
      }
    }

    return { success: true, chunkCount: chunks.length, mongoId };
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
    const logFile = join(paths.defaultLogsDir, `markdown-to-embeddings-${new Date().toISOString().slice(0, 10)}.log`);
    const logger = new Logger(logFile);

    logger.info('Starting markdown-to-embeddings pipeline', { args });

    // Get environment configuration
    const envConfig = getEnvConfig();
    logger.info('Environment configuration loaded', { model: envConfig.model, dimensions: envConfig.dimensions });

    // Initialize MongoDB service if requested
    if (args.saveToMongo) {
      try {
        const mongoConfig = getMongoConfig();
        mongoService = createMongoDBService(mongoConfig.uri, mongoConfig.database);
        await mongoService.connect();
        logger.info('MongoDB service connected', { uri: mongoConfig.uri, database: mongoConfig.database });
      } catch (mongoError) {
        logger.error('Failed to connect to MongoDB', {
          error: mongoError instanceof Error ? mongoError.message : String(mongoError)
        });
        throw new Error(`MongoDB connection failed: ${mongoError instanceof Error ? mongoError.message : String(mongoError)}`);
      }
    }

    // Determine input path (use default if not provided)
    const inputPath = args.inputPath || paths.defaultInputDir;
    logger.info('Input path determined', { inputPath });

    // Find input files
    const inputFiles = findMarkdownFiles(inputPath, config.supportedInputExtensions);
    logger.info('Input files discovered', { fileCount: inputFiles.length, files: inputFiles });

    // Determine output directory
    const outputDir = args.outputDir || paths.defaultOutputDir;
    logger.info('Output directory determined', { outputDir });

    // Initialize OpenAI client
    const client = new OpenAI({ apiKey: envConfig.apiKey });
    logger.info('OpenAI client initialized');

    // Process files sequentially
    const results = [];
    let totalChunks = 0;
    let successCount = 0;
    let failureCount = 0;

    console.log(`🚀 Processing ${inputFiles.length} file(s)...`);

    for (let i = 0; i < inputFiles.length; i++) {
      const inputFile = inputFiles[i];
      const outputFile = generateOutputPath(inputFile, outputDir);

      console.log(`\n📄 [${i + 1}/${inputFiles.length}] Processing: ${inputFile}`);

      const result = await processFile(inputFile, outputFile, client, logger, args, envConfig, mongoService);
      results.push({ inputFile, outputFile, ...result });

      if (result.success) {
        successCount++;
        totalChunks += result.chunkCount || 0;
        let successMessage = `   ✅ Success: ${result.chunkCount} chunks → ${outputFile}`;
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

    // Close MongoDB connection if it was opened
    if (mongoService) {
      try {
        await mongoService.disconnect();
        logger.info('MongoDB service disconnected');
      } catch (mongoError) {
        logger.error('Failed to disconnect from MongoDB', {
          error: mongoError instanceof Error ? mongoError.message : String(mongoError)
        });
      }
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

    // Close MongoDB connection if it was opened
    if (mongoService) {
      try {
        await mongoService.disconnect();
      } catch (mongoError) {
        console.warn('Failed to disconnect MongoDB service during cleanup', mongoError);
      }
    }

    // Try to log error if logger is available
    try {
      const paths = getPipelinePaths();
      const logFile = join(paths.defaultLogsDir, `markdown-to-embeddings-${new Date().toISOString().slice(0, 10)}.log`);
      const logger = new Logger(logFile);
      logger.error('Pipeline failed', { error: error instanceof Error ? error.message : String(error), processingTime });
    } catch (logError) {
      console.warn('Failed to write pipeline error log', logError);
    }

    process.exit(1);
  }
}

// Run the pipeline
main();
