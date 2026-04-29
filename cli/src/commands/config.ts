import { Command } from 'commander';
import chalk from 'chalk';
import { colors, createTable, panel, newline, divider, createSpinner } from '../ui/display.js';
import { getConfig, setApiKey, listApiKeys, getConfigPath, addCustomProvider, removeCustomProvider } from '../config/configManager.js';

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('Manage API keys, settings, and preferences');

  // ── set-key ──
  cmd.command('set-key <provider> <key>')
    .description('Set an API key (nvidia-kimi, nvidia-glm5, nvidia-qwen, deepseek, anthropic, google)')
    .action(async (provider: string, key: string) => {
      try {
        setApiKey(provider, key);
        console.log(`  ${colors.success('✓')} API key for ${colors.primary(provider)} saved successfully`);
        console.log(`  ${colors.muted('Stored in:')} ${getConfigPath()}`);

        // Validate key
        const spinner = createSpinner('Validating key...');
        spinner.start();
        try {
          const { getClient, MODELS } = await import('../models/modelManager.js');
          const modelId = Object.entries(MODELS).find(([, m]) => m.apiKeyId === provider)?.[0];
          if (modelId) {
            const client = getClient(modelId);
            await client.chat.completions.create({
              model: modelId,
              messages: [{ role: 'user', content: 'Hello' }],
              max_tokens: 5,
            });
            spinner.succeed(`Key validated — ${colors.success('working!')}`);
          } else {
            spinner.succeed('Key saved');
          }
        } catch (err: any) {
          spinner.warn(`Key saved but validation failed: ${err.message.slice(0, 60)}`);
        }
      } catch (err: any) {
        console.error(`  ${colors.error('✗')} ${err.message}`);
      }
    });

  // ── show ──
  cmd.command('show')
    .description('Show current configuration')
    .action(() => {
      const config = getConfig();
      const keys = listApiKeys();

      newline();
      divider('API Keys');
      const keyRows = keys.map(k => [
        k.provider,
        k.configured ? colors.success('● configured') : colors.error('○ not set'),
        k.masked,
      ]);
      console.log(createTable(['Provider', 'Status', 'Key'], keyRows));

      newline();
      divider('Settings');
      const settings = [
        ['Active Model', config.get('activeModel')],
        ['Experience Level', config.get('experienceLevel')],
        ['Temperature', String(config.get('temperature'))],
        ['Max Tokens', String(config.get('maxTokens'))],
        ['Stream Responses', String(config.get('streamResponses'))],
        ['Auto-Build Debate', String(config.get('autoBuild.enableDebateMode'))],
        ['Self-Healing', String(config.get('autoBuild.enableSelfHealing'))],
        ['Theme', config.get('theme')],
      ];
      settings.forEach(([key, val]) => {
        console.log(`  ${colors.muted(key!.padEnd(22))} ${val}`);
      });

      newline();
      console.log(`  ${colors.muted('Config file:')} ${getConfigPath()}`);
      newline();
    });

  // ── set ──
  cmd.command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const config = getConfig();
      const validKeys: Record<string, (v: string) => any> = {
        'model': (v) => { config.set('activeModel', v); return v; },
        'level': (v) => { config.set('experienceLevel', v as any); return v; },
        'temperature': (v) => { config.set('temperature', parseFloat(v)); return parseFloat(v); },
        'max-tokens': (v) => { config.set('maxTokens', parseInt(v)); return parseInt(v); },
        'theme': (v) => { config.set('theme', v as any); return v; },
        'stream': (v) => { config.set('streamResponses', v === 'true'); return v === 'true'; },
        'debate': (v) => { config.set('autoBuild.enableDebateMode', v === 'true'); return v === 'true'; },
        'self-healing': (v) => { config.set('autoBuild.enableSelfHealing', v === 'true'); return v === 'true'; },
        'editor': (v) => { config.set('editor', v); return v; },
      };

      if (validKeys[key]) {
        const result = validKeys[key](value);
        console.log(`  ${colors.success('✓')} ${key} = ${colors.primary(String(result))}`);
      } else {
        console.error(`  ${colors.error('✗')} Unknown key: ${key}`);
        console.log(`  ${colors.muted('Valid keys:')} ${Object.keys(validKeys).join(', ')}`);
      }
    });

  // ── reset ──
  cmd.command('reset')
    .description('Reset all settings to defaults')
    .action(async () => {
      const { confirm } = await import('../ui/display.js');
      const yes = await confirm('Reset all settings to defaults?');
      if (yes) {
        const config = getConfig();
        config.clear();
        console.log(`  ${colors.success('✓')} Configuration reset to defaults`);
      }
    });

  // ── add-provider ──
  cmd.command('add-provider <name> <key> <base-url>')
    .description('Add a custom OpenAI-compatible provider (any endpoint that speaks the OpenAI chat completions API)')
    .action((name: string, key: string, baseUrl: string) => {
      addCustomProvider(name, key, baseUrl);
      console.log(`  ${colors.success('✓')} Custom provider ${colors.primary(name)} added`);
      console.log(`  ${colors.muted('Base URL:')} ${baseUrl}`);
    });

  // ── remove-provider ──
  cmd.command('remove-provider <name>')
    .description('Remove a custom provider')
    .action((name: string) => {
      removeCustomProvider(name);
      console.log(`  ${colors.success('✓')} Custom provider ${colors.primary(name)} removed`);
    });

  // ── path ──
  cmd.command('path')
    .description('Show config file path')
    .action(() => {
      console.log(getConfigPath());
    });

  return cmd;
}
