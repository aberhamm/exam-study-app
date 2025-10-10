import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'fs';
import { dirname, join, extname, basename, relative } from 'path';
import matter from 'gray-matter';

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

export function writeJsonFile<T>(filePath: string, data: T): void {
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
    // Directory - find all markdown files recursively
    return findMarkdownFilesRecursive(inputPath, supportedExtensions);
  }

  throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
}

/**
 * Recursively find all files with supported extensions in a directory tree
 */
function findMarkdownFilesRecursive(dirPath: string, supportedExtensions: string[]): string[] {
  const markdownFiles: string[] = [];

  function traverse(currentPath: string) {
    const entries = readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively traverse subdirectories
        traverse(fullPath);
      } else if (entry.isFile()) {
        const fileExtension = extname(entry.name).toLowerCase();
        if (supportedExtensions.includes(fileExtension)) {
          markdownFiles.push(fullPath);
        }
      }
    }
  }

  traverse(dirPath);

  if (markdownFiles.length === 0) {
    throw new Error(`No input files found in directory: ${dirPath}`);
  }

  // Sort files alphabetically for consistent processing order
  return markdownFiles.sort();
}

export function readJsonMarkdownFile(
  filePath: string,
  field: string = 'markdown'
): { markdown: string; meta: Record<string, unknown> } {
  if (!existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    throw new Error(`Input file is empty: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`JSON root must be an object: ${filePath}`);
  }

  const obj = parsed as Record<string, unknown>;
  const value = obj[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or empty '${field}' field in JSON: ${filePath}`);
  }

  const meta: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === field) continue;
    meta[key] = val as unknown;
  }

  return { markdown: value, meta };
}

export function moveFileToDir(filePath: string, destDir: string): string {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  const base = basename(filePath);
  const ext = extname(base);
  const name = base.slice(0, base.length - ext.length);
  let destPath = join(destDir, base);
  let counter = 1;
  while (existsSync(destPath)) {
    destPath = join(destDir, `${name}-processed-${counter}${ext}`);
    counter += 1;
  }
  renameSync(filePath, destPath);
  return destPath;
}

/**
 * Read a markdown file and extract frontmatter metadata + content
 * @param filePath - Path to the markdown file
 * @returns Object containing markdown content and metadata from frontmatter
 */
export function readMarkdownFileWithMeta(
  filePath: string
): { markdown: string; meta: Record<string, unknown> } {
  if (!existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const fileContent = readFileSync(filePath, 'utf-8');
  if (!fileContent.trim()) {
    throw new Error(`Input file is empty: ${filePath}`);
  }

  // Parse frontmatter using gray-matter
  const { data, content } = matter(fileContent);

  if (!content.trim()) {
    throw new Error(`Markdown content is empty after frontmatter: ${filePath}`);
  }

  return {
    markdown: content,
    meta: data as Record<string, unknown>,
  };
}

/**
 * Extract URL path from file path based on the input directory structure
 * @param filePath - Full path to the file
 * @param baseInputDir - Base input directory path
 * @param baseUrl - Optional base URL to prepend (e.g., 'https://developers.sitecore.com')
 * @returns Fully qualified URL or relative path derived from file system path
 */
export function extractUrlFromPath(
  filePath: string,
  baseInputDir: string,
  baseUrl?: string
): string {
  // Get the relative path from the base input directory
  const relPath = relative(baseInputDir, filePath);

  // Remove file extension
  const pathWithoutExt = relPath.replace(/\.(md|markdown)$/i, '');

  // Convert to URL format (forward slashes, remove 'index' if present)
  let urlPath = pathWithoutExt.replace(/\\/g, '/');

  // Remove trailing '/index' if present
  urlPath = urlPath.replace(/\/index$/, '');

  // Ensure it starts with a forward slash
  const relativeUrl = '/' + urlPath;

  // If baseUrl provided, prepend it (removing any trailing slash from baseUrl)
  if (baseUrl) {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    return cleanBaseUrl + relativeUrl;
  }

  return relativeUrl;
}
