import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { colors, newline, divider, panel, createTable, createSpinner, successPanel, warningPanel, errorPanel } from '../ui/display.js';
import { callWithFallback } from '../models/modelManager.js';
import { scanProjectFiles, readProjectFilesForContext } from '../project/projectManager.js';

export function analyzeCommand(): Command {
  const cmd = new Command('analyze')
    .description('Analyze code quality, security, and project health');

  // ── health (ported from codeHealthVisualizer.ts) ──
  cmd.command('health')
    .description('Run code health analysis')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--ai', 'Use AI for deep analysis')
    .action(async (opts) => {
      const spinner = createSpinner('Analyzing code health...');
      spinner.start();

      const files = scanProjectFiles(opts.path);
      const stats = analyzeFileStats(files, opts.path);

      spinner.succeed('Analysis complete');

      newline();
      panel('🏥 Code Health Report', [
        `${colors.bold('Total Files:')}       ${stats.totalFiles}`,
        `${colors.bold('Total Lines:')}       ${stats.totalLines.toLocaleString()}`,
        `${colors.bold('Code Lines:')}        ${stats.codeLines.toLocaleString()}`,
        `${colors.bold('Comment Lines:')}     ${stats.commentLines.toLocaleString()}`,
        `${colors.bold('Blank Lines:')}       ${stats.blankLines.toLocaleString()}`,
        `${colors.bold('Avg File Size:')}     ${Math.round(stats.totalLines / Math.max(stats.totalFiles, 1))} lines`,
        '',
        `${colors.bold('Comment Ratio:')}     ${(stats.commentRatio * 100).toFixed(1)}%`,
        `${colors.bold('Health Score:')}       ${getHealthEmoji(stats.healthScore)} ${stats.healthScore}/100`,
      ].join('\n'));

      // Language breakdown
      if (Object.keys(stats.languages).length > 0) {
        newline();
        divider('Language Breakdown');
        const langRows = Object.entries(stats.languages)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 15)
          .map(([lang, count]) => [lang, String(count), `${((count / stats.totalFiles) * 100).toFixed(1)}%`]);
        console.log(createTable(['Language', 'Files', '%'], langRows));
      }

      // Large files warning
      if (stats.largeFiles.length > 0) {
        newline();
        warningPanel('⚠ Large Files (>500 lines)', stats.largeFiles.map(
          f => `${f.path} — ${f.lines} lines`
        ).join('\n'));
      }

      // AI deep analysis
      if (opts.ai) {
        newline();
        const aiSpinner = createSpinner('Running AI deep analysis...');
        aiSpinner.start();

        try {
          const context = readProjectFilesForContext(opts.path, 15, 30);
          const result = await callWithFallback([
            { role: 'system', content: `You are a senior code quality analyst. Analyze the code and provide actionable insights on:
1. Code quality issues (complexity, duplication, naming)
2. Architecture concerns
3. Missing error handling
4. Performance issues
5. Security concerns
6. Testing gaps

Be specific with file names and line references when possible. Rate overall health 1-10.` },
            { role: 'user', content: `Analyze this project:\n${context}` },
          ], { maxTokens: 2048 });

          aiSpinner.succeed('AI analysis complete');
          const { renderMarkdown } = await import('../chat/markdownRenderer.js');
          console.log(renderMarkdown(result.content));
        } catch (err: any) {
          aiSpinner.fail(`AI analysis failed: ${err.message}`);
        }
      }

      newline();
    });

  // ── security (ported from securityActions.ts) ──
  cmd.command('security')
    .description('Run AI-powered security scan')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--level <level>', 'Scan level: basic, standard, strict', 'standard')
    .action(async (opts) => {
      const spinner = createSpinner('Running security scan...');
      spinner.start();

      // Static analysis first
      const files = scanProjectFiles(opts.path);
      const findings = staticSecurityScan(files, opts.path);

      spinner.succeed(`Static scan complete — ${findings.length} findings`);

      if (findings.length > 0) {
        newline();
        const rows = findings.map(f => [
          f.severity === 'critical' ? colors.error(f.severity) :
            f.severity === 'high' ? colors.accent(f.severity) :
              f.severity === 'medium' ? colors.warning(f.severity) :
                colors.info(f.severity),
          f.file,
          f.issue,
        ]);
        console.log(createTable(['Severity', 'File', 'Issue'], rows));
      }

      // AI deep scan
      newline();
      const aiSpinner = createSpinner('Running AI security analysis...');
      aiSpinner.start();

      try {
        const context = readProjectFilesForContext(opts.path, 10, 20);
        const result = await callWithFallback([
          { role: 'system', content: `You are a security expert. Analyze the code for:
1. SQL/NoSQL injection vulnerabilities
2. XSS vulnerabilities
3. Authentication/authorization flaws
4. Secrets/credentials in code
5. Insecure dependencies
6. Path traversal
7. CSRF vulnerabilities
8. Insecure cryptography
9. Data exposure risks

For each finding, specify: severity (critical/high/medium/low), file, line(s), description, and fix recommendation.
Scan level: ${opts.level}` },
          { role: 'user', content: `Scan this project for security issues:\n${context}` },
        ], { maxTokens: 3072 });

        aiSpinner.succeed('AI security scan complete');
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        aiSpinner.fail(`AI scan failed: ${err.message}`);
      }
      newline();
    });

  // ── complexity (ported from advancedCodeAnalysis.ts) ──
  cmd.command('complexity')
    .description('Analyze code complexity')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (opts) => {
      const spinner = createSpinner('Analyzing complexity...');
      spinner.start();

      const files = scanProjectFiles(opts.path);
      const results = analyzeComplexity(files, opts.path);

      spinner.succeed('Complexity analysis complete');
      newline();

      const rows = results
        .filter(r => r.complexity > 5)
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 20)
        .map(r => [
          r.file,
          String(r.functions),
          r.complexity > 20 ? colors.error(String(r.complexity)) :
            r.complexity > 10 ? colors.warning(String(r.complexity)) :
              String(r.complexity),
          String(r.lines),
        ]);

      if (rows.length > 0) {
        console.log(createTable(['File', 'Functions', 'Complexity', 'Lines'], rows));
      } else {
        successPanel('✅ Complexity', 'All files have acceptable complexity levels!');
      }
      newline();
    });

  // ── intent (ported from ai.ts analyzeIntentDetailed) ──
  cmd.command('intent <requirements...>')
    .description('Analyze project requirements with AI')
    .action(async (requirements: string[]) => {
      const req = requirements.join(' ');
      const spinner = createSpinner('Analyzing requirements...');
      spinner.start();

      try {
        const result = await callWithFallback([
          { role: 'system', content: `You are Poseidev's intent analysis engine. Analyze requirements and provide THREE implementation plans: Easy, Standard, Visionary.

For EACH plan:
1. Summary of approach
2. Deliverables
3. Estimated time
4. Risk level (low/medium/high)
5. Key trade-offs

Also identify: assumptions, constraints, edge cases, ambiguities, missing info.
Respond in clear markdown format.` },
          { role: 'user', content: `Analyze: ${req}` },
        ], { maxTokens: 4096 });

        spinner.succeed('Intent analysis complete');
        newline();
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch (err: any) {
        spinner.fail(`Analysis failed: ${err.message}`);
      }
      newline();
    });

  // ── deps ──
  cmd.command('deps')
    .description('Analyze project dependencies')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action((opts) => {
      const pkgPath = path.join(opts.path, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        console.log(`  ${colors.error('✗')} No package.json found`);
        return;
      }

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = Object.entries(pkg.dependencies || {});
      const devDeps = Object.entries(pkg.devDependencies || {});

      newline();
      divider('Dependencies');
      console.log(`  ${colors.bold('Production:')} ${deps.length}  |  ${colors.bold('Dev:')} ${devDeps.length}  |  ${colors.bold('Total:')} ${deps.length + devDeps.length}`);
      newline();

      if (deps.length > 0) {
        const rows = deps.map(([name, version]) => [name, String(version)]);
        console.log(createTable(['Package', 'Version'], rows));
      }
      newline();
    });

  return cmd;
}

// ─────────────────────────────────────────────
// Static Analysis Helpers
// ─────────────────────────────────────────────
interface FileStats {
  totalFiles: number;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  commentRatio: number;
  healthScore: number;
  languages: Record<string, number>;
  largeFiles: { path: string; lines: number }[];
}

function analyzeFileStats(files: string[], basePath: string): FileStats {
  const stats: FileStats = {
    totalFiles: files.length,
    totalLines: 0, codeLines: 0, commentLines: 0, blankLines: 0,
    commentRatio: 0, healthScore: 0,
    languages: {}, largeFiles: [],
  };

  const codeExts = ['.ts','.tsx','.js','.jsx','.py','.rs','.go','.java','.rb','.css','.html','.json','.md','.sql','.yaml','.yml'];

  for (const file of files) {
    const ext = path.extname(file);
    if (!codeExts.includes(ext)) continue;

    const lang = ext.replace('.', '');
    stats.languages[lang] = (stats.languages[lang] || 0) + 1;

    try {
      const content = fs.readFileSync(path.join(basePath, file), 'utf-8');
      const lines = content.split('\n');
      stats.totalLines += lines.length;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) stats.blankLines++;
        else if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) stats.commentLines++;
        else stats.codeLines++;
      }

      if (lines.length > 500) stats.largeFiles.push({ path: file, lines: lines.length });
    } catch { /* skip */ }
  }

  stats.commentRatio = stats.codeLines > 0 ? stats.commentLines / stats.codeLines : 0;

  // Health score calculation (ported from codeHealthVisualizer.ts)
  let score = 70; // baseline
  if (stats.commentRatio > 0.1) score += 10;
  if (stats.commentRatio > 0.2) score += 5;
  if (stats.largeFiles.length === 0) score += 10;
  if (stats.largeFiles.length > 5) score -= 15;
  score = Math.max(0, Math.min(100, score));
  stats.healthScore = score;

  return stats;
}

function getHealthEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}

interface SecurityFinding {
  severity: string;
  file: string;
  issue: string;
}

function staticSecurityScan(files: string[], basePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const patterns = [
    { regex: /password\s*=\s*['"][^'"]+['"]/, severity: 'critical', issue: 'Hardcoded password' },
    { regex: /api[_-]?key\s*=\s*['"][^'"]+['"]/, severity: 'critical', issue: 'Hardcoded API key' },
    { regex: /secret\s*=\s*['"][^'"]+['"]/, severity: 'high', issue: 'Hardcoded secret' },
    { regex: /eval\s*\(/, severity: 'high', issue: 'Use of eval()' },
    { regex: /innerHTML\s*=/, severity: 'medium', issue: 'Direct innerHTML assignment (XSS risk)' },
    { regex: /dangerouslySetInnerHTML/, severity: 'medium', issue: 'dangerouslySetInnerHTML usage' },
    { regex: /document\.write/, severity: 'medium', issue: 'document.write usage' },
    { regex: /\bconsole\.(log|debug|info)\b/, severity: 'low', issue: 'Console logging in production' },
    { regex: /TODO|FIXME|HACK|XXX/, severity: 'low', issue: 'Unresolved TODO/FIXME' },
  ];

  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go'];

  for (const file of files.slice(0, 100)) {
    if (!codeExts.some(e => file.endsWith(e))) continue;
    try {
      const content = fs.readFileSync(path.join(basePath, file), 'utf-8');
      for (const pattern of patterns) {
        if (pattern.regex.test(content)) {
          findings.push({ severity: pattern.severity, file, issue: pattern.issue });
        }
      }
    } catch { /* skip */ }
  }

  return findings;
}

interface ComplexityResult {
  file: string;
  functions: number;
  complexity: number;
  lines: number;
}

function analyzeComplexity(files: string[], basePath: string): ComplexityResult[] {
  const results: ComplexityResult[] = [];
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py'];

  for (const file of files) {
    if (!codeExts.some(e => file.endsWith(e))) continue;
    try {
      const content = fs.readFileSync(path.join(basePath, file), 'utf-8');
      const lines = content.split('\n');

      // Count functions and branching (simplified cyclomatic complexity)
      const funcCount = (content.match(/function\s|=>\s*{|def\s/g) || []).length;
      const branchCount = (content.match(/\bif\b|\belse\b|\bfor\b|\bwhile\b|\bswitch\b|\bcatch\b|\bcase\b|\b\?\b/g) || []).length;
      const complexity = funcCount + branchCount;

      if (funcCount > 0 || complexity > 3) {
        results.push({ file, functions: funcCount, complexity, lines: lines.length });
      }
    } catch { /* skip */ }
  }

  return results;
}
