#!/usr/bin/env node

import { join } from 'path';
import { OpenRouterClient } from '../../shared/clients/openrouter.js';
import { Logger } from '../../shared/utils/logger.js';
import { readMarkdownFile, writeJsonFile, generateOutputPath, findMarkdownFiles } from '../../shared/utils/file-utils.js';
import { config, getEnvConfig, getPipelinePaths } from './config.js';
import type { ExternalQuestionsFile } from '../../shared/types/external-question.js';

interface CliArgs {
  inputPath?: string;
  outputDir?: string;
  examId?: string;
  examTitle?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm markdown-to-json [input-path] [options]

Arguments:
  input-path              Path to markdown file or directory (default: data/markdown-to-json/input/)

Options:
  --output-dir <dir>      Output directory for JSON files (default: data/markdown-to-json/output/)
  --exam-id <id>          Exam ID for the question set (single file only)
  --exam-title <title>    Exam title for the question set (single file only)
  --help, -h              Show this help message

Environment Variables:
  OPENROUTER_API_KEY      Required: Your OpenRouter API key
  OPENROUTER_MODEL        Optional: Model to use (default: ${config.defaultModel})

Examples:
  # Process all files in default input directory
  pnpm markdown-to-json

  # Process single file
  pnpm markdown-to-json data/markdown-to-json/input/quiz.md

  # Process all files in specific directory
  pnpm markdown-to-json data/markdown-to-json/input/

  # Process with custom output directory
  pnpm markdown-to-json --output-dir data/markdown-to-json/output/

  # Process single file with metadata
  pnpm markdown-to-json quiz.md --exam-title "Math Quiz"
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
      case '--exam-id':
        parsedArgs.examId = value;
        break;
      case '--exam-title':
        parsedArgs.examTitle = value;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return parsedArgs;
}

async function processFile(
  inputFile: string,
  outputFile: string,
  client: OpenRouterClient,
  logger: Logger,
  args: CliArgs
): Promise<{ success: boolean; questionCount?: number; error?: string }> {
  try {
    logger.info('Processing file', { inputFile, outputFile });

    // Read markdown file
    const markdownContent = readMarkdownFile(inputFile);
    logger.info('Markdown file read successfully', { inputFile, contentLength: markdownContent.length });

    // Convert markdown to questions
    logger.info('Converting markdown to questions via OpenRouter API', { inputFile });
    const questions = await client.convertMarkdownToQuestions(markdownContent);
    logger.info('Questions converted successfully', { inputFile, questionCount: questions.length });

    // Prepare output data
    const output: ExternalQuestionsFile = {
      questions,
    };

    // Only add metadata for single file processing
    if (args.examId) {
      output.examId = args.examId;
    }

    if (args.examTitle) {
      output.examTitle = args.examTitle;
    }

    // Write output file
    writeJsonFile(outputFile, output);
    logger.info('Output file written successfully', { inputFile, outputFile, questionCount: questions.length });

    return { success: true, questionCount: questions.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('File processing failed', { inputFile, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

async function main() {
  const startTime = Date.now();

  try {
    // Parse CLI arguments
    const args = parseArgs();

    // Get pipeline-specific paths
    const paths = getPipelinePaths();

    // Setup logging
    const logFile = join(paths.defaultLogsDir, `markdown-to-json-${new Date().toISOString().slice(0, 10)}.log`);
    const logger = new Logger(logFile);

    logger.info('Starting markdown-to-json pipeline', { args });

    // Get environment configuration
    const envConfig = await getEnvConfig();
    logger.info('Environment configuration loaded', { model: envConfig.model });

    // Determine input path (use default if not provided)
    const inputPath = args.inputPath || paths.defaultInputDir;
    logger.info('Input path determined', { inputPath });

    // Find input files
    const inputFiles = findMarkdownFiles(inputPath, config.supportedInputExtensions);
    logger.info('Input files discovered', { fileCount: inputFiles.length, files: inputFiles });

    // Determine output directory
    const outputDir = args.outputDir || paths.defaultOutputDir;
    logger.info('Output directory determined', { outputDir });

    // Initialize OpenRouter client
    const client = new OpenRouterClient(envConfig.apiKey, envConfig.model);
    logger.info('OpenRouter client initialized');

    // Process files sequentially
    const results = [];
    let totalQuestions = 0;
    let successCount = 0;
    let failureCount = 0;

    console.log(`🚀 Processing ${inputFiles.length} file(s)...`);

    for (let i = 0; i < inputFiles.length; i++) {
      const inputFile = inputFiles[i];
      const outputFile = generateOutputPath(inputFile, outputDir);

      console.log(`\n📄 [${i + 1}/${inputFiles.length}] Processing: ${inputFile}`);

      const result = await processFile(inputFile, outputFile, client, logger, args);
      results.push({ inputFile, outputFile, ...result });

      if (result.success) {
        successCount++;
        totalQuestions += result.questionCount || 0;
        console.log(`   ✅ Success: ${result.questionCount} questions → ${outputFile}`);
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
      totalQuestions,
      results,
    });

    // Display summary
    console.log(`\n📊 Processing Summary:`);
    console.log(`   📁 Total files: ${inputFiles.length}`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📝 Total questions: ${totalQuestions}`);
    console.log(`   ⏱️  Processing time: ${processingTime}ms`);

    if (failureCount > 0) {
      console.log(`\n❌ Some files failed to process. Check the log file for details: ${logFile}`);
      process.exit(1);
    } else {
      console.log(`\n🎉 All files processed successfully!`);
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Pipeline failed: ${error}`);

    // Try to log error if logger is available
    try {
      const paths = getPipelinePaths();
      const logFile = join(paths.defaultLogsDir, `markdown-to-json-${new Date().toISOString().slice(0, 10)}.log`);
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
