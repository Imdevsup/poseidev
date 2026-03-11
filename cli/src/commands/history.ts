import { Command } from 'commander';
import { colors, newline, divider, createTable } from '../ui/display.js';
import { ConversationStore } from '../chat/conversationStore.js';

/**
 * History command — conversation history management
 */
export function historyCommand(): Command {
  const cmd = new Command('history')
    .description('Manage conversation history');

  cmd.command('list')
    .alias('ls')
    .description('List saved conversations')
    .action(() => {
      const conversations = ConversationStore.listSaved();

      if (conversations.length === 0) {
        console.log(`  ${colors.muted('No saved conversations yet.')}`);
        console.log(`  ${colors.muted('Use')} ${colors.primary('/save')} ${colors.muted('in chat to save a conversation.')}`);
        return;
      }

      newline();
      divider('Saved Conversations');
      const rows = conversations.map(c => [
        c.name,
        c.title || colors.muted('untitled'),
        String(c.messages),
        c.date,
      ]);
      console.log(createTable(['ID', 'Title', 'Messages', 'Date'], rows));
      newline();
    });

  cmd.command('show <id>')
    .description('Show a saved conversation')
    .action((id: string) => {
      try {
        const store = new ConversationStore();
        store.load(id);
        const messages = store.getMessages();

        newline();
        divider(`Conversation: ${id}`);
        messages.forEach(m => {
          const role = m.role === 'user'
            ? colors.primary('You')
            : m.role === 'assistant'
              ? colors.secondary('AI')
              : colors.muted('System');

          console.log(`  ${role}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`);
          newline();
        });
      } catch (err: any) {
        console.log(`  ${colors.error('✗')} ${err.message}`);
      }
    });

  cmd.command('clear')
    .description('Delete all saved conversations')
    .action(async () => {
      const { confirm } = await import('../ui/display.js');
      const yes = await confirm('Delete all saved conversations?');
      if (yes) {
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        const dir = path.join(os.homedir(), '.poseidev', 'conversations');
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach(f => fs.unlinkSync(path.join(dir, f)));
          console.log(`  ${colors.success('✓')} Cleared ${files.length} conversations`);
        }
      }
    });

  // Default
  cmd.action(() => {
    cmd.commands.find(c => c.name() === 'list')?.parse([]);
  });

  return cmd;
}
