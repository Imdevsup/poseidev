import fs from 'fs';
import path from 'path';
import { colors, newline, divider } from '../ui/display.js';
import { scanProjectFiles } from '../project/projectManager.js';

/**
 * Search engine — ported from intelligentSearch.ts, searchQueries.ts,
 * semanticCodeNavigation.ts, intentStopSearch.ts
 */
export async function searchFiles(query: string, basePath: string): Promise<void> {
  const files = scanProjectFiles(basePath);
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.rb', '.css', '.html', '.json', '.md'];
  const queryLower = query.toLowerCase();
  const results: { file: string; line: number; content: string; score: number }[] = [];

  for (const file of files) {
    if (!codeExts.some(e => file.endsWith(e))) continue;

    try {
      const fullPath = path.join(basePath, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Filename match (highest priority)
      if (file.toLowerCase().includes(queryLower)) {
        results.push({ file, line: 0, content: `[filename match]`, score: 100 });
      }

      // Content matches
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(queryLower)) {
          results.push({
            file,
            line: idx + 1,
            content: line.trim().slice(0, 100),
            score: 50,
          });
        }
      });

      // Function/class name match
      const funcMatch = content.match(new RegExp(`(?:function|class|const|export)\\s+\\w*${query}\\w*`, 'gi'));
      if (funcMatch) {
        funcMatch.forEach(match => {
          results.push({ file, line: 0, content: match.trim(), score: 80 });
        });
      }
    } catch { /* skip */ }
  }

  // Sort by score and deduplicate
  const sorted = results
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  if (sorted.length === 0) {
    console.log(`  ${colors.muted('No results for:')} "${query}"`);
    return;
  }

  newline();
  divider(`Search: "${query}" (${sorted.length} results)`);

  sorted.forEach(r => {
    const location = r.line > 0 ? `:${r.line}` : '';
    console.log(
      `  ${colors.secondary(r.file)}${colors.muted(location)}`
    );
    console.log(
      `    ${highlightMatch(r.content, query)}`
    );
  });
  newline();
}

function highlightMatch(text: string, query: string): string {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, colors.warning('$1'));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Semantic search using AI (ported from semanticCodeNavigation.ts)
 */
export async function semanticSearch(query: string, basePath: string): Promise<void> {
  const { createSpinner } = await import('../ui/display.js');
  const { callWithFallback } = await import('../models/modelManager.js');
  const { readProjectFilesForContext } = await import('../project/projectManager.js');

  const spinner = createSpinner('Searching with AI...');
  spinner.start();

  try {
    const context = readProjectFilesForContext(basePath, 15, 30);
    const result = await callWithFallback([
      { role: 'system', content: 'You are a code search engine. Find all relevant code locations matching the query. For each result, show: file path, line range, and relevant code snippet. Be precise.' },
      { role: 'user', content: `Search for: "${query}"\n\nProject code:\n${context}` },
    ], { maxTokens: 2048 });

    spinner.succeed(`AI search complete`);
    newline();
    const { renderMarkdown } = await import('../chat/markdownRenderer.js');
    console.log(renderMarkdown(result.content));
  } catch (err: any) {
    spinner.fail(`AI search failed: ${err.message}`);
  }
}
