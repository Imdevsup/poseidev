import { Command } from 'commander';
import { colors, newline, divider, panel, createSpinner, agentMessage, debateMessage, createTable } from '../ui/display.js';
import { callWithFallback } from '../models/modelManager.js';
import { getDebatePrompt } from '../prompts/promptEnhancer.js';
import { readProjectFilesForContext, getProjectContext } from '../project/projectManager.js';

/**
 * Agent system — ported from web app's agentCollaboration.ts, agentDebateMode.ts,
 * agentOrchestration.ts, agentMemory.ts, agentReputationSystem.ts, agentPermissions.ts
 */

const AGENT_TYPES = [
  { type: 'architect', name: 'Architect', emoji: '🏗️', desc: 'System design, scalability, patterns' },
  { type: 'coder', name: 'Coder', emoji: '💻', desc: 'Implementation, algorithms, code quality' },
  { type: 'designer', name: 'Designer', emoji: '🎨', desc: 'UI/UX, responsive design, accessibility' },
  { type: 'security', name: 'Security', emoji: '🔒', desc: 'Vulnerabilities, auth, data protection' },
  { type: 'tester', name: 'Tester', emoji: '🧪', desc: 'Testing strategies, edge cases, QA' },
  { type: 'integrator', name: 'Integrator', emoji: '🔌', desc: 'API wiring, data flow, connectivity' },
  { type: 'performance', name: 'Performance', emoji: '⚡', desc: 'Optimization, profiling, caching' },
  { type: 'devops', name: 'DevOps', emoji: '🚀', desc: 'Deployment, CI/CD, infrastructure' },
];

export function agentsCommand(): Command {
  const cmd = new Command('agents')
    .description('Multi-agent AI collaboration system');

  // ── list ──
  cmd.command('list')
    .description('List all available AI agents')
    .action(() => {
      newline();
      divider('AI Agents');
      const rows = AGENT_TYPES.map(a => [
        `${a.emoji} ${a.name}`,
        a.type,
        a.desc,
      ]);
      console.log(createTable(['Agent', 'ID', 'Specialization'], rows));
      newline();
    });

  // ── debate (ported from agentDebateMode.ts) ──
  cmd.command('debate <topic...>')
    .description('Start a multi-agent debate on a topic')
    .option('-a, --agents <agents>', 'Comma-separated agent types', 'architect,security,tester,coder')
    .option('-r, --rounds <rounds>', 'Number of debate rounds', '2')
    .action(async (topicParts: string[], opts) => {
      const topic = topicParts.join(' ');
      const agents = opts.agents.split(',').map((a: string) => a.trim());
      const rounds = parseInt(opts.rounds);

      newline();
      panel('💬 Agent Debate Mode', [
        `${colors.bold('Topic:')}  ${topic}`,
        `${colors.bold('Agents:')} ${agents.map((a: string) => {
          const agent = AGENT_TYPES.find(t => t.type === a);
          return agent ? `${agent.emoji} ${agent.name}` : a;
        }).join(', ')}`,
        `${colors.bold('Rounds:')} ${rounds}`,
      ].join('\n'));
      newline();

      // Get project context if available
      const ctx = getProjectContext();
      let projectContext = '';
      if (ctx) {
        projectContext = readProjectFilesForContext(ctx.projectPath, 5, 10);
      }

      for (let round = 1; round <= rounds; round++) {
        divider(`Round ${round}/${rounds}`);

        for (const agentType of agents) {
          const agent = AGENT_TYPES.find(t => t.type === agentType);
          if (!agent) continue;

          agentMessage(agentType, 'Preparing response...');

          const spinner = createSpinner(`${agent.emoji} ${agent.name} is thinking...`);
          spinner.start();

          try {
            const prompt = getDebatePrompt(topic, agentType, projectContext);
            const result = await callWithFallback([
              { role: 'system', content: prompt },
              { role: 'user', content: `Topic: ${topic}\nProvide your expert perspective. Round ${round}/${rounds}.` },
            ], { maxTokens: 1024, temperature: 0.8 });

            spinner.stop();
            debateMessage(agentType, result.content);
            newline();
          } catch (err: any) {
            spinner.fail(`${agent.name} couldn't respond: ${err.message.slice(0, 40)}`);
          }
        }
      }

      // Consensus summary
      divider('Consensus');
      const spinner = createSpinner('Synthesizing debate results...');
      spinner.start();

      try {
        const result = await callWithFallback([
          { role: 'system', content: 'You are the debate moderator. Synthesize the key points, areas of agreement, and unresolved concerns from the multi-agent debate. Provide a clear recommendation.' },
          { role: 'user', content: `Summarize the debate on: ${topic}` },
        ], { maxTokens: 1024 });

        spinner.succeed('Consensus reached');
        const { renderMarkdown } = await import('../chat/markdownRenderer.js');
        console.log(renderMarkdown(result.content));
      } catch {
        spinner.warn('Could not generate consensus summary');
      }
      newline();
    });

  // ── review (ported from agentCollaboration.ts) ──
  cmd.command('review [file]')
    .description('Multi-agent code review')
    .option('-a, --agents <agents>', 'Comma-separated reviewer agents', 'coder,security,architect')
    .action(async (file: string | undefined, opts) => {
      const agents = opts.agents.split(',').map((a: string) => a.trim());
      let content = '';

      if (file) {
        const fs = await import('fs');
        content = fs.readFileSync(file, 'utf-8');
      } else {
        const ctx = getProjectContext();
        if (ctx) content = readProjectFilesForContext(ctx.projectPath, 5, 15);
      }

      if (!content) {
        console.log(`  ${colors.error('✗')} No code to review. Pass a file or init a project.`);
        return;
      }

      newline();
      panel('🔍 Multi-Agent Code Review', `Reviewing ${file || 'project'} with ${agents.length} agents`);
      newline();

      for (const agentType of agents) {
        const agent = AGENT_TYPES.find(t => t.type === agentType);
        if (!agent) continue;

        const spinner = createSpinner(`${agent.emoji} ${agent.name} reviewing...`);
        spinner.start();

        try {
          const prompt = getDebatePrompt('code review', agentType, content.slice(0, 4000));
          const result = await callWithFallback([
            { role: 'system', content: prompt },
            { role: 'user', content: 'Review this code thoroughly.' },
          ], { maxTokens: 1536 });

          spinner.stop();
          debateMessage(agentType, result.content);
          newline();
        } catch (err: any) {
          spinner.fail(`${agent.name} review failed: ${err.message.slice(0, 40)}`);
        }
      }
    });

  // ── ask (ported from agentMentions.ts + agentCollaborativeChat.ts) ──
  cmd.command('ask <agent> <question...>')
    .description('Ask a specific agent a question (e.g., "poseidev agents ask security Is this auth safe?")')
    .action(async (agentType: string, questionParts: string[]) => {
      const question = questionParts.join(' ');
      const agent = AGENT_TYPES.find(t => t.type === agentType);

      if (!agent) {
        console.error(`  ${colors.error('✗')} Unknown agent: ${agentType}`);
        console.log(`  ${colors.muted('Available:')} ${AGENT_TYPES.map(a => a.type).join(', ')}`);
        return;
      }

      const spinner = createSpinner(`${agent.emoji} ${agent.name} is thinking...`);
      spinner.start();

      try {
        const ctx = getProjectContext();
        let projectContext = '';
        if (ctx) projectContext = readProjectFilesForContext(ctx.projectPath, 5, 10);

        const prompt = getDebatePrompt(question, agentType, projectContext);
        const result = await callWithFallback([
          { role: 'system', content: prompt },
          { role: 'user', content: question },
        ], { maxTokens: 2048 });

        spinner.stop();
        newline();
        debateMessage(agentType, result.content);
        newline();
      } catch (err: any) {
        spinner.fail(`Failed: ${err.message}`);
      }
    });

  return cmd;
}
