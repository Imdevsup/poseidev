import { Command } from 'commander';
import { colors, createTable, panel, newline, divider, createSpinner } from '../ui/display.js';
import { getAvailableModels, setActiveModel, getActiveModel, MODELS, getClient } from '../models/modelManager.js';
import { getApiKey, getConfig } from '../config/configManager.js';

export function modelsCommand(): Command {
  const cmd = new Command('models')
    .description('Manage and switch AI models');

  // ── list ──
  cmd.command('list')
    .alias('ls')
    .description('List all available models')
    .action(() => {
      const models = getAvailableModels();
      const config = getConfig();
      const activeId = config.get('activeModel');

      newline();
      divider('AI Models');

      const rows = models.map(m => [
        m.id === activeId ? colors.success('→ ' + m.name) : `  ${m.name}`,
        m.provider,
        m.available ? colors.success('● ready') : colors.error('○ no key'),
        m.speed,
        m.strengths.join(', '),
      ]);

      console.log(createTable(['Model', 'Provider', 'Status', 'Speed', 'Strengths'], rows));

      newline();
      console.log(`  ${colors.muted('Switch:')} ${colors.primary('poseidev models switch <model-id>')}`);
      console.log(`  ${colors.muted('Test:')}   ${colors.primary('poseidev models test')}`);
      newline();
    });

  // ── switch ──
  cmd.command('switch <model-id>')
    .alias('use')
    .description('Switch the active AI model')
    .action((modelId: string) => {
      try {
        setActiveModel(modelId);
        const model = MODELS[modelId];
        console.log(`  ${colors.success('✓')} Active model: ${colors.primary(model?.name || modelId)}`);
        console.log(`  ${colors.muted(model?.description || '')}`);
      } catch (err: any) {
        console.error(`  ${colors.error('✗')} ${err.message}`);
      }
    });

  // ── test ──
  cmd.command('test')
    .description('Test all configured API keys')
    .action(async () => {
      newline();
      divider('Testing API Keys');

      for (const [id, model] of Object.entries(MODELS)) {
        const key = getApiKey(model.apiKeyId);
        if (!key) {
          console.log(`  ${colors.error('○')} ${model.name} — ${colors.muted('no key configured')}`);
          continue;
        }

        const spinner = createSpinner(`Testing ${model.name}...`);
        spinner.start();

        try {
          const client = getClient(id);
          const start = Date.now();
          await client.chat.completions.create({
            model: id,
            messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
            max_tokens: 5,
          });
          const latency = Date.now() - start;
          spinner.succeed(`${model.name} — ${colors.success('working')} (${latency}ms)`);
        } catch (err: any) {
          spinner.fail(`${model.name} — ${colors.error(err.message.slice(0, 50))}`);
        }
      }
      newline();
    });

  // ── info ──
  cmd.command('info [model-id]')
    .description('Show detailed info about a model')
    .action((modelId?: string) => {
      const id = modelId || getConfig().get('activeModel');
      const model = MODELS[id];

      if (!model) {
        console.error(`  ${colors.error('✗')} Unknown model: ${id}`);
        return;
      }

      newline();
      panel(`${model.name}`, [
        `${colors.bold('ID:')}         ${model.id}`,
        `${colors.bold('Provider:')}   ${model.provider}`,
        `${colors.bold('Max Tokens:')} ${model.maxTokens}`,
        `${colors.bold('Speed:')}      ${model.speed}`,
        `${colors.bold('Cost:')}       ${model.costPer1kTokens === 0 ? colors.success('Free') : `$${model.costPer1kTokens}/1k tokens`}`,
        `${colors.bold('Strengths:')}  ${model.strengths.join(', ')}`,
        '',
        colors.muted(model.description),
      ].join('\n'));
      newline();
    });

  // Default: list
  cmd.action(() => {
    cmd.commands.find(c => c.name() === 'list')?.parse([]);
  });

  return cmd;
}
