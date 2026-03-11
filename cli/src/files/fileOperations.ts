import fs from 'fs';
import path from 'path';
import { colors, newline, panel, codeBlock, createSpinner } from '../ui/display.js';

/**
 * File Operations Engine
 * Parses AI responses for file operation blocks and executes them.
 * Includes verification checks to confirm operations actually worked.
 */

export interface FileOperation {
  type: 'create' | 'edit' | 'delete' | 'rename' | 'move';
  filepath: string;
  content?: string;
  newPath?: string;
}

// ─────────────────────────────────────────────
// Parse AI response for file operations
// ─────────────────────────────────────────────
export function parseFileOperations(response: string): { operations: FileOperation[]; cleanResponse: string } {
  const operations: FileOperation[] = [];
  let cleanResponse = response;

  // Pattern: ===CREATE: filepath===\n...content...\n===END===
  const createPattern = /===CREATE:\s*(.+?)===\n([\s\S]*?)===END===/g;
  let match;
  while ((match = createPattern.exec(response)) !== null) {
    operations.push({ type: 'create', filepath: match[1].trim(), content: match[2].trimEnd() });
    cleanResponse = cleanResponse.replace(match[0], `📄 Created: \`${match[1].trim()}\``);
  }

  // Pattern: ===EDIT: filepath===\n...content...\n===END===
  const editPattern = /===EDIT:\s*(.+?)===\n([\s\S]*?)===END===/g;
  while ((match = editPattern.exec(response)) !== null) {
    operations.push({ type: 'edit', filepath: match[1].trim(), content: match[2].trimEnd() });
    cleanResponse = cleanResponse.replace(match[0], `✏️ Edited: \`${match[1].trim()}\``);
  }

  // Pattern: ===DELETE: filepath===\n===END===
  const deletePattern = /===DELETE:\s*(.+?)===\s*===END===/g;
  while ((match = deletePattern.exec(response)) !== null) {
    operations.push({ type: 'delete', filepath: match[1].trim() });
    cleanResponse = cleanResponse.replace(match[0], `🗑️ Deleted: \`${match[1].trim()}\``);
  }

  // Pattern: ===RENAME: oldpath -> newpath===\n===END===
  const renamePattern = /===RENAME:\s*(.+?)\s*->\s*(.+?)===\s*===END===/g;
  while ((match = renamePattern.exec(response)) !== null) {
    operations.push({ type: 'rename', filepath: match[1].trim(), newPath: match[2].trim() });
    cleanResponse = cleanResponse.replace(match[0], `📝 Renamed: \`${match[1].trim()}\` → \`${match[2].trim()}\``);
  }

  // Also detect standard code blocks with file paths: ```language:filepath
  const codeBlockPattern = /```(?:\w+):([^\n]+)\n([\s\S]*?)```/g;
  while ((match = codeBlockPattern.exec(response)) !== null) {
    const fp = match[1].trim();
    if (operations.some(op => op.filepath === fp)) continue;
    operations.push({ type: 'create', filepath: fp, content: match[2].trimEnd() });
  }

  return { operations, cleanResponse };
}

// ─────────────────────────────────────────────
// Execute file operations with verification
// ─────────────────────────────────────────────
export async function executeFileOperations(
  operations: FileOperation[],
  basePath: string,
  _options: { autoApprove?: boolean } = {}
): Promise<{ applied: string[]; skipped: string[]; verified: string[] }> {
  if (operations.length === 0) return { applied: [], skipped: [], verified: [] };

  const applied: string[] = [];
  const skipped: string[] = [];
  const verified: string[] = [];

  // Show what we're about to do
  newline();
  console.log(`  ${colors.secondary('◆')} ${colors.bold('Writing files...')}`);
  newline();

  // Execute each operation
  for (const op of operations) {
    try {
      const fullPath = path.join(basePath, op.filepath);

      // Security: prevent path traversal
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(basePath))) {
        console.log(`  ${colors.error('✗')} Blocked path traversal: ${op.filepath}`);
        skipped.push(op.filepath);
        continue;
      }

      switch (op.type) {
        case 'create':
        case 'edit': {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, op.content || '', 'utf-8');

          // ── Verification ──
          const check = verifyFile(fullPath, op.content || '');
          const lines = (op.content || '').split('\n').length;
          const sizeBytes = Buffer.byteLength(op.content || '', 'utf-8');
          const sizeStr = sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`;

          if (check.ok) {
            console.log(`  ${colors.success('✓')} ${colors.secondary(op.filepath)}  ${colors.muted(`${lines} lines · ${sizeStr} · ${resolved}`)}`);
            applied.push(op.filepath);
            verified.push(op.filepath);
          } else {
            console.log(`  ${colors.warning('⚠')} ${colors.secondary(op.filepath)} — written but ${check.issue}`);
            applied.push(op.filepath);
          }
          break;
        }
        case 'delete': {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            // Verify deletion
            if (!fs.existsSync(fullPath)) {
              console.log(`  ${colors.success('✓')} Deleted: ${colors.secondary(op.filepath)}`);
              applied.push(op.filepath);
              verified.push(op.filepath);
            } else {
              console.log(`  ${colors.warning('⚠')} Delete may have failed: ${op.filepath} — file still exists`);
            }
          } else {
            console.log(`  ${colors.muted('–')} Already gone: ${op.filepath}`);
            skipped.push(op.filepath);
          }
          break;
        }
        case 'rename':
        case 'move': {
          const newFullPath = path.join(basePath, op.newPath!);
          const newDir = path.dirname(newFullPath);
          if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
          if (fs.existsSync(fullPath)) {
            fs.renameSync(fullPath, newFullPath);
            // Verify rename
            if (fs.existsSync(newFullPath) && !fs.existsSync(fullPath)) {
              console.log(`  ${colors.success('✓')} Renamed: ${colors.secondary(op.filepath)} → ${colors.secondary(op.newPath!)}`);
              applied.push(op.filepath);
              verified.push(op.filepath);
            } else {
              console.log(`  ${colors.warning('⚠')} Rename may have failed: ${op.filepath}`);
            }
          } else {
            console.log(`  ${colors.muted('–')} Not found: ${op.filepath}`);
            skipped.push(op.filepath);
          }
          break;
        }
      }
    } catch (err: any) {
      console.log(`  ${colors.error('✗')} Failed: ${op.filepath} — ${err.message}`);
      skipped.push(op.filepath);
    }
  }

  // ── Summary with verification status ──
  newline();
  const allOk = verified.length === applied.length && skipped.length === 0;
  if (allOk) {
    console.log(`  ${colors.success('✓')} All ${applied.length} file(s) written and verified`);
  } else {
    if (applied.length > 0) console.log(`  ${colors.success('✓')} ${applied.length} applied (${verified.length} verified)`);
    if (skipped.length > 0) console.log(`  ${colors.warning('⚠')} ${skipped.length} skipped`);
  }

  return { applied, skipped, verified };
}

// ─────────────────────────────────────────────
// Verification: check file was written correctly
// ─────────────────────────────────────────────
function verifyFile(filePath: string, expectedContent: string): { ok: boolean; issue?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, issue: 'file does not exist after write' };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0 && expectedContent.length > 0) {
      return { ok: false, issue: 'file is empty' };
    }

    const actual = fs.readFileSync(filePath, 'utf-8');
    if (actual.length !== expectedContent.length) {
      return { ok: false, issue: `size mismatch (wrote ${expectedContent.length}, got ${actual.length})` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, issue: err.message };
  }
}

// ─────────────────────────────────────────────
// Direct file operation commands (for use in REPL)
// ─────────────────────────────────────────────
export function createFile(filepath: string, content: string, basePath: string): void {
  const fullPath = path.join(basePath, filepath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

export function editFile(filepath: string, content: string, basePath: string): void {
  createFile(filepath, content, basePath);
}

export function deleteFile(filepath: string, basePath: string): boolean {
  const fullPath = path.join(basePath, filepath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

export function renameFile(oldPath: string, newPath: string, basePath: string): void {
  const fullOld = path.join(basePath, oldPath);
  const fullNew = path.join(basePath, newPath);
  const dir = path.dirname(fullNew);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(fullOld, fullNew);
}

export function readFile(filepath: string, basePath: string): string | null {
  const fullPath = path.join(basePath, filepath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

export function listFiles(dirPath: string, basePath: string): string[] {
  const fullPath = path.join(basePath, dirPath);
  try {
    return fs.readdirSync(fullPath, { withFileTypes: true })
      .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
  } catch {
    return [];
  }
}
