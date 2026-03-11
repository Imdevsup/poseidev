import { Command } from 'commander';
import { colors, newline, divider, createSpinner, panel } from '../ui/display.js';
import { callWithFallback } from '../models/modelManager.js';
import { readProjectFilesForContext, getProjectContext } from '../project/projectManager.js';

/**
 * Test command — ported from web app's testingFramework.ts, testExecution.ts,
 * autoTestGeneration.ts, testFlakinessPrediction.ts, propertyTestSynthesizer.ts
 */
export function testCommand(): Command {
  const cmd = new Command('test')
    .description('AI-powered testing tools');

  // ── generate (ported from autoTestGeneration.ts) ──
  cmd.command('generate [file]')
    .description('Generate tests for a file or project')
    .option('-f, --framework <fw>', 'Test framework: jest, vitest, pytest, mocha', 'vitest')
    .option('-o, --output <path>', 'Output test file path')
    .option('--coverage', 'Target high code coverage')
    .action(async (file: string | undefined, opts) => {
      const spinner = createSpinner('Generating tests...');
      spinner.start();

      let codeContext = '';
      if (file) {
        const fs = await import('fs');
        codeContext = fs.readFileSync(file, 'utf-8');
      } else {
        const ctx = getProjectContext();
        if (ctx) codeContext = readProjectFilesForContext(ctx.projectPath, 10, 20);
      }

      try {
        const result = await callWithFallback([
          { role: 'system', content: `You are a senior QA engineer. Generate comprehensive unit tests using ${opts.framework}.

Requirements:
- Test all public functions and methods
- Include edge cases and error scenarios
- Mock external dependencies
- Write descriptive test names
- ${opts.coverage ? 'Target 90%+ code coverage' : 'Cover main functionality'}
- Include setup/teardown as needed
- Add inline comments explaining test logic

Output complete, runnable test files.` },
          { role: 'user', content: `Generate tests for:\n\`\`\`\n${codeContext.slice(0, 6000)}\n\`\`\`` },
        ], { maxTokens: 8192 });

        spinner.succeed('Tests generated');
        newline();

        if (opts.output) {
          const fs = await import('fs');
          const path = await import('path');
          const dir = path.dirname(opts.output);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(opts.output, result.content);
          console.log(`  ${colors.success('✓')} Tests written to ${colors.primary(opts.output)}`);
        } else {
          const { renderMarkdown } = await import('../chat/markdownRenderer.js');
          console.log(renderMarkdown(result.content));
        }
      } catch (err: any) {
        spinner.fail(`Test generation failed: ${err.message}`);
      }
      newline();
    });

  // ── run ──
  cmd.command('run')
    .description('Run project tests')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (opts) => {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      const path = await import('path');

      const pkgPath = path.join(opts.path, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        console.log(`  ${colors.error('✗')} No package.json found`);
        return;
      }

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const testScript = pkg.scripts?.test;

      if (!testScript) {
        console.log(`  ${colors.warning('⚠')} No test script found in package.json`);
        return;
      }

      const spinner = createSpinner(`Running: ${testScript}`);
      spinner.start();

      try {
        const output = execSync(`npm test`, { cwd: opts.path, encoding: 'utf-8', timeout: 120000 });
        spinner.succeed('Tests passed');
        console.log(output);
      } catch (err: any) {
        spinner.fail('Tests failed');
        console.log(err.stdout || err.message);
      }
    });

  // ── analyze (ported from testFlakinessPrediction.ts) ──
  cmd.command('analyze')
    .description('Analyze test quality and coverage gaps')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (opts) => {
      const spinner = createSpinner('Analyzing test suite...');
      spinner.start();

      const ctx = getProjectContext(opts.path);
      const codeContext = ctx ? readProjectFilesForContext(ctx.projectPath, 10, 20) : '';

      try {
        const result = await callWithFallback([
          { role: 'system', content: `You are a testing expert. Analyze the test suite and provide:
1. Test coverage gaps — files/functions without tests
2. Test quality issues — fragile tests, missing assertions
3. Flakiness risks — async issues, timing dependencies
4. Missing test categories — unit, integration, e2e
5. Recommendations for improvement

Be specific with file references.` },
          { role: 'user', content: `Analyze tests:\n${codeContext.slice(0, 5000)}` },
        ], { maxTokens: 2048 });

        spinner.succeed('Analysis complete');
        newline();
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        spinner.fail(`Analysis failed: ${err.message}`);
      }
      newline();
    });

  return cmd;
}
