import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join, extname, basename } from 'path';

export function readMarkdownFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    throw new Error(`Input file is empty: ${filePath}`);
  }

  return content;
}

export function writeJsonFile(filePath: string, data: any): void {
  // Ensure output directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const jsonString = JSON.stringify(data, null, 2);
  writeFileSync(filePath, jsonString, 'utf-8');
}

export function generateOutputPath(inputPath: string, outputDir: string): string {
  const filename = basename(inputPath).replace(/\.(md|markdown)$/i, '.json');
  return join(outputDir, filename);
}

export function findMarkdownFiles(inputPath: string, supportedExtensions: string[]): string[] {
  if (!existsSync(inputPath)) {
    throw new Error(`Input path not found: ${inputPath}`);
  }

  const stats = statSync(inputPath);

  if (stats.isFile()) {
    // Single file - validate extension
    const fileExtension = extname(inputPath).toLowerCase();
    if (!supportedExtensions.includes(fileExtension)) {
      throw new Error(`Unsupported file extension: ${fileExtension}. Supported: ${supportedExtensions.join(', ')}`);
    }
    return [inputPath];
  }

  if (stats.isDirectory()) {
    // Directory - find all markdown files
    const files = readdirSync(inputPath, { withFileTypes: true });
    const markdownFiles: string[] = [];

    for (const file of files) {
      if (file.isFile()) {
        const fileExtension = extname(file.name).toLowerCase();
        if (supportedExtensions.includes(fileExtension)) {
          markdownFiles.push(join(inputPath, file.name));
        }
      }
    }

    if (markdownFiles.length === 0) {
      throw new Error(`No markdown files found in directory: ${inputPath}`);
    }

    // Sort files alphabetically for consistent processing order
    return markdownFiles.sort();
  }

  throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
}