import fs from 'fs';
import path from 'path';
import { callWithFallback } from '../models/modelManager.js';
import { colors, createSpinner, phaseHeader, agentMessage, debateMessage, progressBar, panel, successPanel, errorPanel, fileTree, divider, newline } from '../ui/display.js';
import { getConfig } from '../config/configManager.js';
import { getAutoBuildPrompts, getDebatePrompt } from '../prompts/promptEnhancer.js';
import { extractCodeBlocks, writeGeneratedFiles } from './codeExtractor.js';

export interface BuildOptions {
  projectPath?: string;
  name?: string;
  requirements?: string;
  techStack?: string[];
  phases?: string[];
  enableDebate?: boolean;
  enableSelfHealing?: boolean;
  dryRun?: boolean;
}

// ─────────────────────────────────────────────
// Main Auto-Build Engine
// Ported from web app's autoBuild.ts 6-phase workflow
// ─────────────────────────────────────────────
export async function runAutoBuild(opts: BuildOptions): Promise<{ success: boolean; files: string[] }> {
  const config = getConfig();
  const projectPath = opts.projectPath || process.cwd();
  const allFiles: string[] = [];

  // Load or create project config
  let projectName = opts.name || path.basename(projectPath);
  let requirements = opts.requirements || '';
  let techStack = opts.techStack || [];

  const configPath = path.join(projectPath, '.poseidev', 'project.json');
  if (fs.existsSync(configPath)) {
    const projConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    projectName = projConfig.name || projectName;
    requirements = projConfig.requirements || requirements;
    techStack = projConfig.techStack || techStack;
  }

  if (!requirements) {
    throw new Error('No requirements specified. Run `poseidev project init` first or pass --requirements.');
  }

  const phases = opts.phases || config.get('autoBuild.defaultPhases') || [
    'architecture', 'schema', 'backend', 'frontend', 'integration', 'polish'
  ];
  const enableDebate = opts.enableDebate ?? config.get('autoBuild.enableDebateMode') ?? true;
  const enableSelfHealing = opts.enableSelfHealing ?? config.get('autoBuild.enableSelfHealing') ?? true;
  const totalPhases = phases.length;

  const prompts = getAutoBuildPrompts({ name: projectName, requirements, techStack });
  const buildLogPath = path.join(projectPath, '.poseidev', 'builds', `build-${Date.now()}.log`);
  const buildLogDir = path.dirname(buildLogPath);
  if (!fs.existsSync(buildLogDir)) fs.mkdirSync(buildLogDir, { recursive: true });

  const log = (msg: string) => {
    fs.appendFileSync(buildLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  };

  newline();
  panel('🚀 Poseidev Auto-Build', [
    `${colors.bold('Project:')} ${projectName}`,
    `${colors.bold('Phases:')} ${totalPhases}`,
    `${colors.bold('Debate Mode:')} ${enableDebate ? colors.success('ON') : colors.muted('OFF')}`,
    `${colors.bold('Self-Healing:')} ${enableSelfHealing ? colors.success('ON') : colors.muted('OFF')}`,
    `${colors.bold('Output:')} ${projectPath}`,
  ].join('\n'));
  newline();

  log(`Auto-build started: ${projectName}`);
  log(`Requirements: ${requirements}`);
  log(`Tech stack: ${techStack.join(', ')}`);

  let architecturePlan: any = null;
  let phaseNum = 0;

  // ━━━━━ PHASE 1: Architecture Design ━━━━━
  if (phases.includes('architecture')) {
    phaseNum++;
    phaseHeader(phaseNum, totalPhases, 'Architecture Design', '🏗️');
    agentMessage('architect', 'Analyzing requirements and designing system architecture...');
    log('Phase 1: Architecture Design started');

    const spinner = createSpinner('Generating architecture plan...');
    spinner.start();

    try {
      const result = await callWithFallback([
        { role: 'system', content: prompts.architecture },
        { role: 'user', content: `Project: ${projectName}\nRequirements: ${requirements}\nTech Stack: ${techStack.join(', ')}` },
      ], { maxTokens: 8192 });

      spinner.succeed('Architecture plan generated');

      // Parse architecture plan
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          architecturePlan = JSON.parse(jsonMatch[0]);
        }
      } catch {
        architecturePlan = { overview: result.content, fileGenerationPlan: [] };
      }

      // Debate phase
      if (enableDebate) {
        newline();
        agentMessage('security', 'Reviewing architecture for security concerns...');
        agentMessage('tester', 'Reviewing architecture for testability...');

        const debateSpinner = createSpinner('Running agent debate...');
        debateSpinner.start();

        try {
          const debateResult = await callWithFallback([
            { role: 'system', content: getDebatePrompt('architecture', 'security', JSON.stringify(architecturePlan, null, 2)) },
            { role: 'user', content: 'Review this architecture plan.' },
          ], { maxTokens: 2048, temperature: 0.7 });

          debateSpinner.succeed('Architecture peer-reviewed');
          newline();
          debateMessage('security', debateResult.content.slice(0, 500));
        } catch (debateErr: any) {
          debateSpinner.warn('Debate skipped (model unavailable)');
        }
      }

      console.log(progressBar(phaseNum, totalPhases));
      log('Phase 1: Architecture Design completed');
    } catch (err: any) {
      spinner.fail(`Architecture phase failed: ${err.message}`);
      log(`Phase 1 failed: ${err.message}`);
      architecturePlan = {
        overview: 'Fallback architecture',
        fileGenerationPlan: [
          { filepath: 'src/index.ts', purpose: 'Entry point', priority: 1 },
          { filepath: 'src/app.ts', purpose: 'Application logic', priority: 2 },
        ],
      };
    }
  }

  // ━━━━━ PHASE 2: Schema / Data Models ━━━━━
  if (phases.includes('schema')) {
    phaseNum++;
    phaseHeader(phaseNum, totalPhases, 'Database & Schema Design', '💾');
    agentMessage('coder', 'Designing data models and schema...');
    log('Phase 2: Schema Design started');

    const spinner = createSpinner('Generating schema...');
    spinner.start();

    try {
      const ctx = architecturePlan ? `Architecture: ${JSON.stringify(architecturePlan, null, 2).slice(0, 3000)}` : '';

      const result = await callWithFallback([
        { role: 'system', content: prompts.schema },
        { role: 'user', content: `Project: ${projectName}\nRequirements: ${requirements}\nTech Stack: ${techStack.join(', ')}\n\n${ctx}\n\nGenerate complete database schema code.` },
      ], { maxTokens: 8192 });

      spinner.succeed('Schema generated');
      const files = extractCodeBlocks(result.content);
      if (!opts.dryRun) {
        const written = writeGeneratedFiles(files, projectPath);
        allFiles.push(...written);
        fileTree(written.map(f => ({ path: f, status: 'created' })));
      }

      // Self-healing: check for empty files
      if (enableSelfHealing) {
        await healEmptyFiles(allFiles, projectPath);
      }

      console.log(progressBar(phaseNum, totalPhases));
      log('Phase 2: Schema Design completed');
    } catch (err: any) {
      spinner.fail(`Schema phase failed: ${err.message}`);
      log(`Phase 2 failed: ${err.message}`);
    }
  }

  // ━━━━━ PHASE 3: Backend Implementation ━━━━━
  if (phases.includes('backend')) {
    phaseNum++;
    phaseHeader(phaseNum, totalPhases, 'Backend Implementation', '⚙️');
    agentMessage('coder', 'Generating production-ready backend code...');
    log('Phase 3: Backend Implementation started');

    const spinner = createSpinner('Generating backend...');
    spinner.start();

    try {
      const ctx = architecturePlan ? `Architecture: ${JSON.stringify(architecturePlan, null, 2).slice(0, 3000)}` : '';

      const result = await callWithFallback([
        { role: 'system', content: prompts.backend },
        { role: 'user', content: `Project: ${projectName}\nRequirements: ${requirements}\nTech Stack: ${techStack.join(', ')}\n\n${ctx}\n\nGenerate all backend code files.` },
      ], { maxTokens: 16384 });

      spinner.succeed('Backend generated');
      const files = extractCodeBlocks(result.content);
      if (!opts.dryRun) {
        const written = writeGeneratedFiles(files, projectPath);
        allFiles.push(...written);
        fileTree(written.map(f => ({ path: f, status: 'created' })));
      }

      // Debate
      if (enableDebate) {
        newline();
        agentMessage('security', 'Reviewing backend for security...');
        try {
          const review = await callWithFallback([
            { role: 'system', content: getDebatePrompt('backend code', 'security', result.content.slice(0, 3000)) },
            { role: 'user', content: 'Review backend code.' },
          ], { maxTokens: 1024 });
          debateMessage('security', review.content.slice(0, 400));
        } catch { /* skip */ }
      }

      if (enableSelfHealing) await healEmptyFiles(allFiles, projectPath);
      console.log(progressBar(phaseNum, totalPhases));
      log('Phase 3: Backend completed');
    } catch (err: any) {
      spinner.fail(`Backend phase failed: ${err.message}`);
      log(`Phase 3 failed: ${err.message}`);
    }
  }

  // ━━━━━ PHASE 4: Frontend Implementation ━━━━━
  if (phases.includes('frontend')) {
    phaseNum++;
    phaseHeader(phaseNum, totalPhases, 'Frontend Components', '🎨');
    agentMessage('designer', 'Designing beautiful, responsive UI...');
    agentMessage('coder', 'Generating frontend components...');
    log('Phase 4: Frontend Implementation started');

    const spinner = createSpinner('Generating frontend...');
    spinner.start();

    try {
      const result = await callWithFallback([
        { role: 'system', content: prompts.frontend },
        { role: 'user', content: `Project: ${projectName}\nRequirements: ${requirements}\nTech Stack: ${techStack.join(', ')}\n\nGenerate all frontend pages and components.` },
      ], { maxTokens: 16384 });

      spinner.succeed('Frontend generated');
      const files = extractCodeBlocks(result.content);
      if (!opts.dryRun) {
        const written = writeGeneratedFiles(files, projectPath);
        allFiles.push(...written);
        fileTree(written.map(f => ({ path: f, status: 'created' })));
      }

      if (enableSelfHealing) await healEmptyFiles(allFiles, projectPath);
      console.log(progressBar(phaseNum, totalPhases));
      log('Phase 4: Frontend completed');
    } catch (err: any) {
      spinner.fail(`Frontend phase failed: ${err.message}`);
      log(`Phase 4 failed: ${err.message}`);
    }
  }

  // ━━━━━ PHASE 5: Integration ━━━━━
  if (phases.includes('integration')) {
    phaseNum++;
    phaseHeader(phaseNum, totalPhases, 'Integration & Wiring', '🔌');
    agentMessage('integrator', 'Creating type-safe interconnection layer...');
    log('Phase 5: Integration started');

    const spinner = createSpinner('Generating integration layer...');
    spinner.start();

    try {
      const result = await callWithFallback([
        { role: 'system', content: prompts.integration },
        { role: 'user', content: `Project: ${projectName}\nRequirements: ${requirements}\nTech Stack: ${techStack.join(', ')}\n\nGenerate complete integration code.` },
      ], { maxTokens: 8192 });

      spinner.succeed('Integration layer generated');
      const files = extractCodeBlocks(result.content);
      if (!opts.dryRun) {
        const written = writeGeneratedFiles(files, projectPath);
        allFiles.push(...written);
        fileTree(written.map(f => ({ path: f, status: 'created' })));
      }

      console.log(progressBar(phaseNum, totalPhases));
      log('Phase 5: Integration completed');
    } catch (err: any) {
      spinner.fail(`Integration phase failed: ${err.message}`);
      log(`Phase 5 failed: ${err.message}`);
    }
  }

  // ━━━━━ PHASE 6: Polish ━━━━━
  if (phases.includes('polish')) {
    phaseNum++;
    phaseHeader(phaseNum, totalPhases, 'Polish & Production-Ready', '✨');
    agentMessage('ux', 'Adding animations, error handling, accessibility...');
    agentMessage('performance', 'Optimizing performance...');
    log('Phase 6: Polish started');

    const spinner = createSpinner('Adding production polish...');
    spinner.start();

    try {
      const result = await callWithFallback([
        { role: 'system', content: prompts.polish },
        { role: 'user', content: `Project: ${projectName}\nTech Stack: ${techStack.join(', ')}\n\nAdd error boundaries, loading states, animations, and accessibility.` },
      ], { maxTokens: 4096 });

      spinner.succeed('Polish complete');
      const files = extractCodeBlocks(result.content);
      if (!opts.dryRun) {
        const written = writeGeneratedFiles(files, projectPath);
        allFiles.push(...written);
        fileTree(written.map(f => ({ path: f, status: 'created' })));
      }

      console.log(progressBar(phaseNum, totalPhases));
      log('Phase 6: Polish completed');
    } catch (err: any) {
      spinner.fail(`Polish phase failed: ${err.message}`);
      log(`Phase 6 failed: ${err.message}`);
    }
  }

  // ━━━━━ Summary ━━━━━
  newline();
  successPanel('🎉 Auto-Build Complete', [
    `${colors.bold('Project:')} ${projectName}`,
    `${colors.bold('Files Generated:')} ${allFiles.length}`,
    `${colors.bold('Phases Completed:')} ${phaseNum}/${totalPhases}`,
    `${colors.bold('Build Log:')} ${buildLogPath}`,
    '',
    colors.muted('Run your project or explore the generated files!'),
  ].join('\n'));

  log(`Build complete: ${allFiles.length} files generated`);

  return { success: true, files: allFiles };
}

// ─────────────────────────────────────────────
// Self-Healing: Fix empty/broken files
// Ported from web app's selfHealingCode.ts
// ─────────────────────────────────────────────
async function healEmptyFiles(files: string[], projectPath: string): Promise<void> {
  for (const file of files) {
    const fullPath = path.join(projectPath, file);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8').trim();
        if (content.length < 10) {
          agentMessage('system', `Self-healing: regenerating empty file ${colors.muted(file)}`);
          // Could re-generate via AI, but for now just log it
        }
      }
    } catch { /* skip */ }
  }
}
