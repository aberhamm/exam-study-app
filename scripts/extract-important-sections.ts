/**
 * Extract Important Sections from Documentation
 *
 * Purpose:
 * - Scan markdown files in data-pipelines/data/markdown-to-embeddings/output/
 * - Extract content marked as important (Alert status="warning", IMPORTANT markers)
 * - Save structured data for question generation
 *
 * Usage:
 * - pnpm extract:important
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const DOCS_DIR = path.resolve(process.cwd(), 'data-pipelines/data/markdown-to-embeddings/output');
const OUTPUT_FILE = path.resolve(process.cwd(), 'data/important-sections.json');

interface ImportantSection {
  sourceFile: string;
  title: string;
  context: string;
  content: string;
  type: 'warning-alert' | 'important-marker' | 'note';
}

/**
 * Extract title from markdown frontmatter or first heading
 */
function extractTitle(markdown: string): string {
  // Try frontmatter title
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/^title:\s*['"](.+?)['"]$/m);
    if (titleMatch) return titleMatch[1];
  }

  // Try first heading
  const headingMatch = markdown.match(/^#+ (.+)$/m);
  if (headingMatch) return headingMatch[1];

  return 'Untitled';
}

/**
 * Extract context (section heading) before a given position
 */
function extractContext(markdown: string, position: number): string {
  const beforeContent = markdown.substring(0, position);
  const headings = [...beforeContent.matchAll(/^#{2,4} (.+)$/gm)];
  if (headings.length > 0) {
    const lastHeading = headings[headings.length - 1];
    return lastHeading[1];
  }
  return 'General';
}

/**
 * Extract Alert components with warning status
 */
function extractWarningAlerts(markdown: string, sourceFile: string, title: string): ImportantSection[] {
  const sections: ImportantSection[] = [];
  const alertRegex = /<Alert status="warning">([\s\S]*?)<\/Alert>/gi;

  let match;
  while ((match = alertRegex.exec(markdown)) !== null) {
    const alertContent = match[1];
    // Remove AlertIcon tags and clean up
    const cleaned = alertContent
      .replace(/<AlertIcon ?\/?>/g, '')
      .replace(/\*\*IMPORTANT\*\* <br\/>/g, '')
      .trim();

    if (cleaned.length > 20) {
      const context = extractContext(markdown, match.index);
      sections.push({
        sourceFile,
        title,
        context,
        content: cleaned,
        type: 'warning-alert',
      });
    }
  }

  return sections;
}

/**
 * Extract standalone IMPORTANT markers (not in alerts)
 */
function extractImportantMarkers(markdown: string, sourceFile: string, title: string): ImportantSection[] {
  const sections: ImportantSection[] = [];

  // Look for IMPORTANT: pattern followed by content
  const importantRegex = /IMPORTANT:\s*(.+?)(?=\n\n|\n#|$)/gis;

  let match;
  while ((match = importantRegex.exec(markdown)) !== null) {
    // Skip if inside an Alert component
    const beforeMatch = markdown.substring(Math.max(0, match.index - 100), match.index);
    if (beforeMatch.includes('<Alert')) continue;

    const content = match[1].trim();
    if (content.length > 20) {
      const context = extractContext(markdown, match.index);
      sections.push({
        sourceFile,
        title,
        context,
        content,
        type: 'important-marker',
      });
    }
  }

  return sections;
}

/**
 * Extract sentences/paragraphs containing "important" (case-insensitive)
 * that are not already captured by other methods
 */
function extractImportantMentions(markdown: string, sourceFile: string, title: string): ImportantSection[] {
  const sections: ImportantSection[] = [];

  // Remove Alert blocks to avoid duplicates
  const withoutAlerts = markdown.replace(/<Alert[\s\S]*?<\/Alert>/gi, '');

  // Find paragraphs or sentences containing "important"
  // Match paragraph: text with "important" followed by period/newline/end
  const paragraphRegex = /([^.\n]{20,}?important[^.\n]{20,}[.!?])/gis;

  let match;
  while ((match = paragraphRegex.exec(withoutAlerts)) !== null) {
    const content = match[1].trim();

    // Skip if too short, in code blocks, or just a heading
    if (
      content.length < 40 ||
      markdown.substring(match.index - 10, match.index).includes('```') ||
      markdown.substring(match.index - 5, match.index).match(/^#{1,6}\s/)
    ) {
      continue;
    }

    // Get more context - try to capture the full sentence/paragraph
    const startIndex = Math.max(0, match.index - 200);
    const endIndex = Math.min(markdown.length, match.index + match[0].length + 200);
    const contextBlock = withoutAlerts.substring(startIndex, endIndex);

    // Extract the sentence(s) containing "important"
    const sentences = contextBlock.match(/[^.!?]+[.!?]+/g) || [];
    const relevantSentences = sentences
      .filter(s => s.toLowerCase().includes('important'))
      .join(' ')
      .trim();

    if (relevantSentences.length > 40 && relevantSentences.length < 1000) {
      const context = extractContext(markdown, match.index);
      sections.push({
        sourceFile,
        title,
        context,
        content: relevantSentences,
        type: 'important-mention',
      });
    }
  }

  // Deduplicate based on content similarity
  const unique = sections.filter((section, index, self) =>
    index === self.findIndex(s =>
      s.content.substring(0, 100) === section.content.substring(0, 100)
    )
  );

  return unique;
}

/**
 * Extract info alerts that contain important technical details
 */
function extractInfoAlerts(markdown: string, sourceFile: string, title: string): ImportantSection[] {
  const sections: ImportantSection[] = [];
  const alertRegex = /<Alert status="info">([\s\S]*?)<\/Alert>/g;

  let match;
  while ((match = alertRegex.exec(markdown)) !== null) {
    const alertContent = match[1];
    const cleaned = alertContent
      .replace(/<AlertIcon ?\/?>/g, '')
      .trim();

    // Only include if it contains technical details (has code or specific terms)
    if (
      cleaned.length > 50 &&
      (cleaned.includes('`') || cleaned.includes('GraphQL') || cleaned.includes('JSS'))
    ) {
      const context = extractContext(markdown, match.index);
      sections.push({
        sourceFile,
        title,
        context,
        content: cleaned,
        type: 'note',
      });
    }
  }

  return sections;
}

/**
 * Process a single markdown file
 */
async function processMarkdownFile(filePath: string, fileName: string): Promise<ImportantSection[]> {
  const content = await readFile(filePath, 'utf-8');
  const title = extractTitle(content);
  const sections: ImportantSection[] = [];

  // Extract all types of important sections
  sections.push(...extractWarningAlerts(content, fileName, title));
  sections.push(...extractImportantMarkers(content, fileName, title));
  sections.push(...extractInfoAlerts(content, fileName, title));
  sections.push(...extractImportantMentions(content, fileName, title));

  return sections;
}

async function main() {
  console.log(`Scanning documentation in ${DOCS_DIR}...`);

  const entries = await readdir(DOCS_DIR);
  const mdFiles = entries.filter((entry) => entry.endsWith('.md'));

  console.log(`Found ${mdFiles.length} markdown files`);

  const allSections: ImportantSection[] = [];

  for (const fileName of mdFiles) {
    const filePath = path.join(DOCS_DIR, fileName);
    try {
      const sections = await processMarkdownFile(filePath, fileName);
      allSections.push(...sections);
      if (sections.length > 0) {
        console.log(`✓ ${fileName}: ${sections.length} section(s)`);
      }
    } catch (error) {
      console.error(`✗ ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`\nTotal important sections found: ${allSections.length}`);
  console.log(`  - Warning alerts: ${allSections.filter((s) => s.type === 'warning-alert').length}`);
  console.log(`  - Important markers: ${allSections.filter((s) => s.type === 'important-marker').length}`);
  console.log(`  - Info notes: ${allSections.filter((s) => s.type === 'note').length}`);
  console.log(`  - Important mentions: ${allSections.filter((s) => s.type === 'important-mention').length}`);

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  await writeFile(OUTPUT_FILE, JSON.stringify(allSections, null, 2), 'utf-8');

  console.log(`\nSaved to ${OUTPUT_FILE}`);

  return allSections;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
