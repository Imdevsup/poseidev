import { Command } from 'commander';
import { colors, newline, createSpinner, statusBar } from '../ui/display.js';
import { callWithFallback, streamCall } from '../models/modelManager.js';
import { getConfig } from '../config/configManager.js';
import { ConversationStore } from '../chat/conversationStore.js';
import { renderMarkdown } from '../chat/markdownRenderer.js';
import { getProjectContext, readProjectFilesForContext } from '../project/projectManager.js';
import { getSystemPrompt } from '../prompts/promptEnhancer.js';

export function chatCommand(): Command {
  const cmd = new Command('chat')
    .description('Chat with AI about your project')
    .argument('[message...]', 'Message to send (or enter interactive mode)')
    .option('-m, --model <model>', 'Override active model')
    .option('-c, --context', 'Include project files as context', true)
    .option('--no-stream', 'Disable streaming')
    .option('-t, --temperature <temp>', 'Override temperature')
    .option('--max-tokens <tokens>', 'Override max tokens')
    .option('-f, --file <path>', 'Include specific file as context')
    .option('--system <prompt>', 'Custom system prompt')
    .action(async (messageParts: string[], opts) => {
      const config = getConfig();
      const message = messageParts.join(' ');

      if (!message) {
        // No message = enter REPL
        const { startREPL } = await import('../repl.js');
        await startREPL({ model: opts.model, verbose: false });
        return;
      }

      const projectCtx = getProjectContext();
      const systemPrompt = opts.system || getSystemPrompt(config.get('experienceLevel'), projectCtx);

      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      // Add file context if requested
      if (opts.file) {
        const fs = await import('fs');
        try {
          const content = fs.readFileSync(opts.file, 'utf-8');
          messages[1].content = `File: ${opts.file}\n\`\`\`\n${content}\n\`\`\`\n\n${message}`;
        } catch (err: any) {
          console.error(`  ${colors.error('✗')} Could not read file: ${err.message}`);
          return;
        }
      }

      newline();

      if (opts.stream !== false) {
        // Streaming mode
        try {
          process.stdout.write(`  ${colors.secondary('◆')} `);
          const modelId = opts.model || config.get('activeModel');
          for await (const chunk of streamCall(messages, {
            modelId,
            temperature: opts.temperature ? parseFloat(opts.temperature) : undefined,
            maxTokens: opts.maxTokens ? parseInt(opts.maxTokens) : undefined,
          })) {
            process.stdout.write(chunk);
          }
          newline();
        } catch {
          // Fallback
          const result = await callWithFallback(messages, {
            preferredModel: opts.model || config.get('activeModel'),
            showProgress: true,
          });
          console.log(renderMarkdown(result.content));
        }
      } else {
        const result = await callWithFallback(messages, {
          preferredModel: opts.model || config.get('activeModel'),
          showProgress: true,
          temperature: opts.temperature ? parseFloat(opts.temperature) : undefined,
          maxTokens: opts.maxTokens ? parseInt(opts.maxTokens) : undefined,
        });
        console.log(renderMarkdown(result.content));
      }

      newline();
    });

  return cmd;
}
