import { Command } from 'commander';
import { colors, newline, createSpinner } from '../ui/display.js';
import { callWithFallback } from '../models/modelManager.js';
import { readProjectFilesForContext, getProjectContext } from '../project/projectManager.js';

/**
 * Security command — ported from securityActions.ts, securityMutations.ts, 
 * credentialVault.ts, complianceGates.ts, tamperEvidentAudit.ts
 */
export function securityCommand(): Command {
  const cmd = new Command('security')
    .description('Security scanning and vulnerability detection');

  cmd.command('scan')
    .description('Run a full security scan (alias for analyze security)')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--level <level>', 'basic, standard, strict', 'standard')
    .action(async (opts) => {
      // Delegate to analyze security
      const { analyzeCommand } = await import('./analyze.js');
      const analyze = analyzeCommand();
      await analyze.parseAsync(['security', '--path', opts.path, '--level', opts.level], { from: 'user' });
    });

  cmd.command('audit')
    .description('Generate security audit report')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (opts) => {
      const spinner = createSpinner('Generating security audit...');
      spinner.start();

      const ctx = getProjectContext(opts.path);
      const context = ctx ? readProjectFilesForContext(ctx.projectPath, 15, 30) : '';

      try {
        const result = await callWithFallback([
          { role: 'system', content: `You are a certified security auditor. Generate a formal security audit report covering:

1. **Executive Summary** — overall risk level, key findings
2. **Authentication & Authorization** — auth flows, session management
3. **Input Validation** — injection risks, sanitization
4. **Data Protection** — encryption, sensitive data handling
5. **API Security** — rate limiting, CORS, headers
6. **Dependency Risks** — known vulnerabilities in deps
7. **Infrastructure** — environment variables, secrets management  
8. **Compliance** — OWASP Top 10 checklist status

For each finding: severity, location, description, remediation.
End with a risk matrix and priority action items.` },
          { role: 'user', content: `Audit this project:\n${context}` },
        ], { maxTokens: 4096 });

        spinner.succeed('Audit complete');
        newline();
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        spinner.fail(`Audit failed: ${err.message}`);
      }
      newline();
    });

  cmd.command('fix <issue...>')
    .description('Get AI fix suggestions for a security issue')
    .action(async (issueParts: string[]) => {
      const issue = issueParts.join(' ');
      const spinner = createSpinner('Generating fix...');
      spinner.start();

      try {
        const result = await callWithFallback([
          { role: 'system', content: 'You are a security remediation expert. Provide specific, code-level fixes for security issues. Include before/after code examples.' },
          { role: 'user', content: `Fix this security issue: ${issue}` },
        ], { maxTokens: 2048 });

        spinner.succeed('Fix generated');
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
