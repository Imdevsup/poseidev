import chalk from 'chalk';
import { colors, panel, newline, divider, cosmicGradient, poseidevGradient, successPanel, createSpinner } from '../ui/display.js';
import { getConfig, setApiKey, listApiKeys, getConfigPath } from '../config/configManager.js';
import { MODELS } from '../models/modelManager.js';

/**
 * Interactive onboarding wizard for first-time users
 * Walks through API key setup, model selection, and preferences
 */
export async function runOnboarding(): Promise<void> {
  const { default: inquirer } = await import('inquirer');

  newline();
  console.log(cosmicGradient('  ╔══════════════════════════════════════════════╗'));
  console.log(cosmicGradient('  ║       Welcome to Poseidev CLI Editor        ║'));
  console.log(cosmicGradient('  ╚══════════════════════════════════════════════╝'));
  newline();

  console.log(`  ${colors.muted("Let's get you set up in under 2 minutes!")}`);
  newline();

  // ── Step 1: API Key ──
  divider('Step 1 of 3 — API Key');
  console.log(`  Poseidev uses ${colors.primary('NVIDIA NIM')} (free) for AI — no credit card needed.`);
  console.log(`  Get your key at: ${colors.secondary('https://build.nvidia.com')}`);
  newline();

  const { hasKey } = await inquirer.prompt([{
    type: 'confirm',
    name: 'hasKey',
    message: colors.primary('Do you have an NVIDIA API key?'),
    default: true,
  }]);

  if (hasKey) {
    const { apiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'apiKey',
      message: colors.primary('Paste your NVIDIA API key:'),
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 10) return 'Please enter a valid API key';
        return true;
      },
    }]);

    const spinner = createSpinner('Saving and validating...');
    spinner.start();

    try {
      setApiKey('nvidia-kimi', apiKey);
      spinner.succeed(`${colors.success('API key saved and ready!')}`);
    } catch (err: any) {
      spinner.warn(`Key saved but could not validate: ${err.message.slice(0, 40)}`);
    }

    // Ask for additional keys
    const { moreKeys } = await inquirer.prompt([{
      type: 'confirm',
      name: 'moreKeys',
      message: colors.muted('Do you have additional NVIDIA model keys? (optional)'),
      default: false,
    }]);

    if (moreKeys) {
      const { glm5Key } = await inquirer.prompt([{
        type: 'password',
        name: 'glm5Key',
        message: colors.muted('GLM5 / Llama key (or press Enter to skip):'),
        mask: '*',
      }]);
      if (glm5Key) setApiKey('nvidia-glm5', glm5Key);

      const { qwenKey } = await inquirer.prompt([{
        type: 'password',
        name: 'qwenKey',
        message: colors.muted('Qwen 3.5 key (or press Enter to skip):'),
        mask: '*',
      }]);
      if (qwenKey) setApiKey('nvidia-qwen', qwenKey);
    }
  } else {
    newline();
    panel('🔑 Get a Free API Key', [
      `${colors.primary('1.')} Go to ${colors.secondary('https://build.nvidia.com')}`,
      `${colors.primary('2.')} Sign up (free, no credit card)`,
      `${colors.primary('3.')} Create an API key for any model`,
      `${colors.primary('4.')} Come back and run: ${colors.teal('poseidev config set-key nvidia-kimi YOUR_KEY')}`,
    ].join('\n'));
    newline();
  }

  // ── Step 2: Experience Level ──
  divider('Step 2 of 3 — Your Level');
  const { level } = await inquirer.prompt([{
    type: 'list',
    name: 'level',
    message: colors.primary('What\'s your coding experience?'),
    choices: [
      { name: `${colors.success('🌱')} Beginner — I'm learning to code`, value: 'beginner' },
      { name: `${colors.primary('🚀')} Intermediate — I build projects regularly`, value: 'intermediate' },
      { name: `${colors.purple('⚡')} Expert — I architect production systems`, value: 'expert' },
    ],
    default: 'intermediate',
  }]);

  const config = getConfig();
  config.set('experienceLevel', level);
  console.log(`  ${colors.success('✓')} AI will adapt to your ${colors.primary(level)} level`);

  // ── Step 3: Preferences ──
  divider('Step 3 of 3 — Preferences');
  const { preferences } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'preferences',
    message: colors.primary('Enable features:'),
    choices: [
      { name: 'Stream AI responses in real-time', value: 'stream', checked: true },
      { name: 'Auto-build with agent debate mode', value: 'debate', checked: true },
      { name: 'Code self-healing (auto-fix errors)', value: 'selfHeal', checked: true },
      { name: 'Show token usage', value: 'tokens', checked: true },
    ],
  }]);

  config.set('streamResponses', preferences.includes('stream'));
  config.set('autoBuild.enableDebateMode', preferences.includes('debate'));
  config.set('autoBuild.enableSelfHealing', preferences.includes('selfHeal'));
  config.set('showTokenUsage', preferences.includes('tokens'));

  // ── Done ──
  newline();
  successPanel('🎉 You\'re All Set!', [
    `${colors.bold('Model:')}    ${config.get('activeModel')}`,
    `${colors.bold('Level:')}    ${level}`,
    `${colors.bold('Config:')}   ${getConfigPath()}`,
    '',
    `${colors.bold('Quick commands:')}`,
    `  ${colors.teal('poseidev')}               — Interactive AI chat`,
    `  ${colors.teal('poseidev chat "..."')}     — One-shot question`,
    `  ${colors.teal('poseidev build')}          — Generate a full project`,
    `  ${colors.teal('poseidev agents debate')}  — Multi-agent discussion`,
    `  ${colors.teal('poseidev analyze health')} — Scan code quality`,
    `  ${colors.teal('poseidev --help')}         — All commands`,
    '',
    `${colors.muted('In chat, the AI can create, edit, delete, and rename files for you.')}`,
    `${colors.muted("Just describe what you want — it'll handle the rest!")}`,
  ].join('\n'));
  newline();
}

/**
 * Check if this is the first run and needs onboarding
 */
export function needsOnboarding(): boolean {
  const keys = listApiKeys();
  return !keys.some(k => k.configured);
}
