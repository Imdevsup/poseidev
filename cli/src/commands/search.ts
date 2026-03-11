import { Command } from 'commander';
import { colors, newline } from '../ui/display.js';

/**
 * Search command — ported from intelligentSearch.ts, searchQueries.ts
 */
export function searchCommand(): Command {
  const cmd = new Command('search')
    .description('Search across project files')
    .argument('<query...>', 'Search query')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--ai', 'Use AI-powered semantic search')
    .action(async (queryParts: string[], opts) => {
      const query = queryParts.join(' ');

      if (opts.ai) {
        const { semanticSearch } = await import('../search/searchEngine.js');
        await semanticSearch(query, opts.path);
      } else {
        const { searchFiles } = await import('../search/searchEngine.js');
        await searchFiles(query, opts.path);
      }
    });

  return cmd;
}
