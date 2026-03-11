#!/usr/bin/env node

import { Command } from 'commander';
import { displayBanner, displayWelcome } from './ui/display.js';
import { configCommand } from './commands/config.js';
import { modelsCommand } from './commands/models.js';
import { chatCommand } from './commands/chat.js';
import { buildCommand } from './commands/build.js';
import { projectCommand } from './commands/project.js';
import { analyzeCommand } from './commands/analyze.js';
import { agentsCommand } from './commands/agents.js';
import { testCommand } from './commands/test.js';
import { securityCommand } from './commands/security.js';
import { deployCommand } from './commands/deploy.js';
import { promptCommand } from './commands/prompt.js';
import { diffCommand } from './commands/diff.js';
import { searchCommand } from './commands/search.js';
import { historyCommand } from './commands/history.js';
import { startREPL } from './repl.js';
import { getConfig } from './config/configManager.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('poseidev')
  .description(chalk.cyan('⚡ Poseidev — The AI-Powered CLI Code Editor'))
  .version('1.0.0', '-v, --version')
  .option('--no-banner', 'Skip the startup banner')
  .option('--no-color', 'Disable colored output')
  .option('--verbose', 'Enable verbose logging')
  .option('--model <model>', 'Override the active AI model')
  .option('--project <path>', 'Set the project directory');

// Register all commands
program.addCommand(configCommand());
program.addCommand(modelsCommand());
program.addCommand(chatCommand());
program.addCommand(buildCommand());
program.addCommand(projectCommand());
program.addCommand(analyzeCommand());
program.addCommand(agentsCommand());
program.addCommand(testCommand());
program.addCommand(securityCommand());
program.addCommand(deployCommand());
program.addCommand(promptCommand());
program.addCommand(diffCommand());
program.addCommand(searchCommand());
program.addCommand(historyCommand());

// Default action: enter interactive REPL
program.action(async (opts) => {
  if (opts.banner !== false) {
    await displayBanner();
  }

  // Check if first run / no API keys configured
  const { needsOnboarding, runOnboarding } = await import('./onboarding/wizard.js');
  if (needsOnboarding()) {
    await runOnboarding();
  }

  // Enter interactive REPL
  await startREPL({
    model: opts.model,
    projectPath: opts.project,
    verbose: opts.verbose,
  });
});

// Prevent crashes — keep the REPL alive
process.on('uncaughtException', (err) => {
  console.error(chalk.red('\n  ✗ Unexpected error:'), err.message);
  console.error(chalk.gray('  The REPL is still running. Type your next message.\n'));
});

process.on('unhandledRejection', (reason: any) => {
  console.error(chalk.red('\n  ✗ Async error:'), reason?.message || reason);
  console.error(chalk.gray('  The REPL is still running. Type your next message.\n'));
});

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('Fatal error:'), err.message);
  process.exit(1);
});
