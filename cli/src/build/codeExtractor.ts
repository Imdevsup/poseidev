import fs from 'fs';
import path from 'path';
import { colors } from '../ui/display.js';

export interface CodeFile {
  filepath: string;
  content: string;
  language: string;
}

/**
 * Extract code blocks from AI response text
 * Handles formats: ```language:filepath, ```filepath, ```language\n// filepath
 * Ported from web app's autoBuild/codeExtractor.ts
 */
export function extractCodeBlocks(text: string): CodeFile[] {
  const files: CodeFile[] = [];

  // Pattern 1: ```language:filepath
  const pattern1 = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = pattern1.exec(text)) !== null) {
    files.push({
      language: match[1],
      filepath: match[2].trim(),
      content: match[3].trim(),
    });
  }

  // Pattern 2: ```filepath (extension-based language detection)
  const pattern2 = /```([^\n:]+\.\w+)\n([\s\S]*?)```/g;
  while ((match = pattern2.exec(text)) !== null) {
    const fp = match[1].trim();
    // Skip if already captured
    if (files.some(f => f.filepath === fp)) continue;

    files.push({
      filepath: fp,
      content: match[2].trim(),
      language: detectLanguage(fp),
    });
  }

  // Pattern 3: ```language\n// filepath: ...\n or # filepath: ...
  const pattern3 = /```(\w+)\n(?:\/\/|#|--)\s*(?:file(?:path)?[:=]?\s*)?([^\n]+)\n([\s\S]*?)```/g;
  while ((match = pattern3.exec(text)) !== null) {
    const fp = match[2].trim();
    if (files.some(f => f.filepath === fp)) continue;

    files.push({
      language: match[1],
      filepath: fp,
      content: match[3].trim(),
    });
  }

  return files;
}

/**
 * Write extracted code files to disk
 */
export function writeGeneratedFiles(files: CodeFile[], baseDir: string): string[] {
  const written: string[] = [];

  for (const file of files) {
    try {
      // Clean filepath
      let filepath = file.filepath
        .replace(/^\/+/, '')
        .replace(/\\/g, '/')
        .trim();

      // Security: prevent path traversal
      if (filepath.includes('..')) continue;

      const fullPath = path.join(baseDir, filepath);
      const dir = path.dirname(fullPath);

      // Create directory
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(fullPath, file.content, 'utf-8');
      written.push(filepath);
    } catch (err: any) {
      console.error(`  ${colors.error('✗')} Failed to write ${file.filepath}: ${err.message}`);
    }
  }

  return written;
}

/**
 * Detect language from file extension
 */
function detectLanguage(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'bash',
    '.dockerfile': 'dockerfile',
    '.prisma': 'prisma',
    '.graphql': 'graphql',
    '.proto': 'protobuf',
    '.toml': 'toml',
    '.xml': 'xml',
    '.svg': 'svg',
    '.env': 'dotenv',
  };
  return langMap[ext] || 'text';
}

/**
 * Merge new code into existing file (append or replace sections)
 */
export function mergeCode(existing: string, generated: string, strategy: 'replace' | 'append' | 'smart' = 'smart'): string {
  if (strategy === 'replace') return generated;
  if (strategy === 'append') return existing + '\n\n' + generated;

  // Smart merge: if file has markers, replace between them
  const markerStart = '// --- POSEIDEV GENERATED START ---';
  const markerEnd = '// --- POSEIDEV GENERATED END ---';

  if (existing.includes(markerStart) && existing.includes(markerEnd)) {
    const before = existing.substring(0, existing.indexOf(markerStart));
    const after = existing.substring(existing.indexOf(markerEnd) + markerEnd.length);
    return before + markerStart + '\n' + generated + '\n' + markerEnd + after;
  }

  // Default: replace entire file
  return generated;
}
