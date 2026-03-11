import { Command } from 'commander';
import { colors, newline, createSpinner, panel, divider, createTable } from '../ui/display.js';
import { callWithFallback } from '../models/modelManager.js';

/**
 * Prompt command — ported from promptEnhancement.ts, promptABTesting.ts,
 * promptCorpusBrowser.ts, promptCurriculum.ts
 */
export function promptCommand(): Command {
  const cmd = new Command('prompt')
    .description('Prompt engineering and enhancement tools');

  cmd.command('enhance <prompt...>')
    .description('Enhance a prompt for better AI results')
    .option('-l, --level <level>', 'Enhancement: light, standard, deep', 'standard')
    .action(async (promptParts: string[], opts) => {
      const original = promptParts.join(' ');
      const spinner = createSpinner('Enhancing prompt...');
      spinner.start();

      try {
        const result = await callWithFallback([
          { role: 'system', content: `You are a prompt engineering expert. Enhance the given prompt to produce better AI outputs.

Enhancement level: ${opts.level}
- light: Minor clarity improvements
- standard: Add context, constraints, format specification
- deep: Complete rewrite with chain-of-thought, examples, role-setting

Output format:
**Enhanced Prompt:**
[the improved prompt]

**Changes Made:**
- [list of changes]

**Tips:**
- [usage tips]` },
          { role: 'user', content: `Enhance this prompt: "${original}"` },
        ], { maxTokens: 2048 });

        spinner.succeed('Prompt enhanced');
        newline();
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        spinner.fail(`Failed: ${err.message}`);
      }
      newline();
    });

  cmd.command('templates')
    .description('Browse prompt templates')
    .action(() => {
      const templates = [
        ['Code Review', 'Review this code for bugs, security, and best practices: [CODE]'],
        ['Refactor', 'Refactor this code to improve readability and performance: [CODE]'],
        ['Debug', 'Debug this error and explain the fix: [ERROR] in [CODE]'],
        ['Explain', 'Explain this code in detail, step by step: [CODE]'],
        ['Test Gen', 'Generate comprehensive tests for: [CODE]'],
        ['API Design', 'Design a REST API for: [REQUIREMENTS]'],
        ['Schema', 'Design a database schema for: [REQUIREMENTS]'],
        ['Architecture', 'Design the architecture for: [PROJECT DESCRIPTION]'],
        ['Docs', 'Write documentation for: [CODE]'],
        ['Migration', 'Create a migration plan from [OLD] to [NEW]'],
      ];

      newline();
      divider('Prompt Templates');
      console.log(createTable(['Template', 'Pattern'], templates));
      newline();
      console.log(`  ${colors.muted('Use in chat:')} ${colors.primary('poseidev chat "Review this code for bugs..."')}`);
      newline();
    });

  cmd.command('compare <promptA> <promptB>')
    .description('A/B test two prompts')
    .action(async (promptA: string, promptB: string) => {
      const spinner = createSpinner('Testing both prompts...');
      spinner.start();

      try {
        const [resultA, resultB] = await Promise.all([
          callWithFallback([{ role: 'user', content: promptA }], { maxTokens: 1024 }),
          callWithFallback([{ role: 'user', content: promptB }], { maxTokens: 1024 }),
        ]);

        spinner.succeed('Both prompts tested');
        newline();

        panel('Prompt A', `${colors.muted(promptA)}\n\n${resultA.content.slice(0, 300)}...`);
        newline();
        panel('Prompt B', `${colors.muted(promptB)}\n\n${resultB.content.slice(0, 300)}...`);
      } catch (err: any) {
        spinner.fail(`Failed: ${err.message}`);
      }
      newline();
    });

  return cmd;
}
