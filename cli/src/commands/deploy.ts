import { Command } from 'commander';
import { colors, newline, panel, createSpinner } from '../ui/display.js';
import { getProjectContext } from '../project/projectManager.js';

/**
 * Deploy command — ported from deploymentActions.ts, deployments.ts,
 * ephemeralEnvironments.ts, canaryAutoTuner.ts, smartRollbackOrchestrator.ts
 */
export function deployCommand(): Command {
  const cmd = new Command('deploy')
    .description('Deployment tools and environment management');

  cmd.command('preview')
    .description('Generate deployment preview')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (opts) => {
      const ctx = getProjectContext(opts.path);
      if (!ctx) {
        console.log(`  ${colors.error('✗')} No project found. Run ${colors.primary('poseidev project init')}`);
        return;
      }

      const hasDocker = ctx.files.some(f => f.toLowerCase().includes('dockerfile'));
      const hasVercel = ctx.files.some(f => f.includes('vercel.json'));
      const hasNetlify = ctx.files.some(f => f.includes('netlify.toml'));

      newline();
      panel('🚀 Deployment Preview', [
        `${colors.bold('Project:')} ${ctx.name}`,
        `${colors.bold('Files:')}   ${ctx.fileCount}`,
        `${colors.bold('Stack:')}   ${ctx.techStack.join(', ')}`,
        '',
        `${colors.bold('Deployment options detected:')}`,
        hasDocker ? `  ${colors.success('✓')} Docker — Dockerfile found` : `  ${colors.muted('○')} Docker`,
        hasVercel ? `  ${colors.success('✓')} Vercel — vercel.json found` : `  ${colors.muted('○')} Vercel`,
        hasNetlify ? `  ${colors.success('✓')} Netlify — netlify.toml found` : `  ${colors.muted('○')} Netlify`,
        '',
        colors.muted('Tip: Run `poseidev deploy generate <platform>` to create deploy configs'),
      ].join('\n'));
      newline();
    });

  cmd.command('generate <platform>')
    .description('Generate deployment config (docker, vercel, netlify, railway, fly)')
    .action(async (platform: string) => {
      const { callWithFallback } = await import('../models/modelManager.js');
      const ctx = getProjectContext();

      const spinner = createSpinner(`Generating ${platform} config...`);
      spinner.start();

      try {
        const result = await callWithFallback([
          { role: 'system', content: `Generate production-ready deployment configuration for ${platform}. Include all necessary files, environment variable placeholders, build commands, and optimization settings.` },
          { role: 'user', content: `Generate ${platform} deployment config for a ${ctx?.techStack.join(', ') || 'web'} project named ${ctx?.name || 'my-app'}.` },
        ], { maxTokens: 4096 });

        spinner.succeed(`${platform} config generated`);
        newline();
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        spinner.fail(`Failed: ${err.message}`);
      }
      newline();
    });

  cmd.command('checklist')
    .description('Pre-deployment checklist')
    .action(async () => {
      const { callWithFallback } = await import('../models/modelManager.js');
      const ctx = getProjectContext();
      const context = ctx ? (await import('../project/projectManager.js')).readProjectFilesForContext(ctx.projectPath, 5, 10) : '';

      const spinner = createSpinner('Generating checklist...');
      spinner.start();

      try {
        const result = await callWithFallback([
          { role: 'system', content: 'Generate a comprehensive pre-deployment checklist specific to this project. Include security, performance, SEO, accessibility, and environment checks.' },
          { role: 'user', content: `Pre-deployment checklist for:\n${context.slice(0, 3000)}` },
        ], { maxTokens: 2048 });

        spinner.succeed('Checklist ready');
        newline();
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        spinner.fail(`Failed: ${err.message}`);
      }
      newline();
    });

  return cmd;
}
