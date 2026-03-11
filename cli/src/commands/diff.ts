import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { colors, newline, codeBlock } from '../ui/display.js';

/**
 * Diff command — ported from diffEngine.ts
 */
export function diffCommand(): Command {
  const cmd = new Command('diff')
    .description('View and generate code diffs')
    .argument('[file]', 'File to show recent changes for')
    .option('--compare <file2>', 'Compare with another file')
    .action(async (file: string | undefined, opts) => {
      if (!file) {
        console.log(`  ${colors.muted('Usage:')} ${colors.primary('poseidev diff <file>')}`);
        console.log(`  ${colors.muted('Compare:')} ${colors.primary('poseidev diff file1.ts --compare file2.ts')}`);
        return;
      }

      if (opts.compare) {
        // Compare two files
        if (!fs.existsSync(file) || !fs.existsSync(opts.compare)) {
          console.log(`  ${colors.error('✗')} File not found`);
          return;
        }

        const { diffLines } = await import('diff');
        const content1 = fs.readFileSync(file, 'utf-8');
        const content2 = fs.readFileSync(opts.compare, 'utf-8');

        const changes = diffLines(content1, content2);

        newline();
        console.log(`  ${colors.muted('---')} ${colors.accent(file)}`);
        console.log(`  ${colors.muted('+++')} ${colors.success(opts.compare)}`);
        console.log(colors.muted('  ' + '─'.repeat(50)));

        changes.forEach(part => {
          const lines = part.value.split('\n').filter(Boolean);
          lines.forEach(line => {
            if (part.added) {
              console.log(`  ${colors.success('+ ' + line)}`);
            } else if (part.removed) {
              console.log(`  ${colors.accent('- ' + line)}`);
            } else {
              console.log(`  ${colors.muted('  ' + line)}`);
            }
          });
        });
        newline();
      } else {
        // Show file with git diff if available
        try {
          const { execSync } = await import('child_process');
          const diff = execSync(`git diff -- "${file}"`, { encoding: 'utf-8', cwd: process.cwd() });
          if (diff.trim()) {
            newline();
            diff.split('\n').forEach(line => {
              if (line.startsWith('+') && !line.startsWith('+++')) {
                console.log(`  ${colors.success(line)}`);
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                console.log(`  ${colors.accent(line)}`);
              } else if (line.startsWith('@@')) {
                console.log(`  ${colors.info(line)}`);
              } else {
                console.log(`  ${colors.muted(line)}`);
              }
            });
            newline();
          } else {
            console.log(`  ${colors.muted('No changes detected for')} ${file}`);
          }
        } catch {
          // Not a git repo or git not available
          if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf-8');
            codeBlock(content, path.extname(file).slice(1) || 'text');
          } else {
            console.log(`  ${colors.error('✗')} File not found: ${file}`);
          }
        }
      }
    });

  return cmd;
}
