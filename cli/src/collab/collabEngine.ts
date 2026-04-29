import { callWithFallback, MODELS, getAvailableModels } from '../models/modelManager.js';
import { colors, newline, divider, panel, createSpinner, cosmicGradient } from '../ui/display.js';
import { parseFileOperations, executeFileOperations } from '../files/fileOperations.js';
import { renderMarkdown } from '../chat/markdownRenderer.js';

/**
 * Multi-Model Collaboration Engine — Conferencing Mode
 * 
 * Models confer in rounds, each building on the previous models' input:
 *   Round 1: 🧠 Architect proposes design
 *   Round 2: ⚡ Engineer builds on Architect's plan, adds implementation details
 *   Round 3: 🔍 Reviewer critiques both, finds issues & improvements
 *   Round 4: 🧠 Architect incorporates all feedback → final plan
 *   Final:   ⚡ Engineer produces the code based on the agreed plan
 */

interface ModelRole {
  id: string;
  name: string;
  emoji: string;
  role: string;
  color: (s: string) => string;
}

interface RoundMessage {
  role: ModelRole;
  content: string;
  round: number;
  tokens: number;
}

export async function runCollab(
  prompt: string,
  basePath: string,
  options: { verbose?: boolean } = {}
): Promise<void> {
  const available = getAvailableModels().filter(m => m.available && m.provider === 'NVIDIA NIM');

  if (available.length < 2) {
    throw new Error('Collab requires at least 2 configured NVIDIA models. Run /key to set more keys.');
  }

  // Assign roles to available models
  const roles: ModelRole[] = [];
  const roleAssignments = [
    { id: 'moonshotai/kimi-k2-instruct', emoji: '🧠', role: 'Architect', color: colors.primary },
    { id: 'qwen/qwen3.5-397b-a17b', emoji: '⚡', role: 'Engineer', color: colors.warning },
    { id: 'meta/llama-3.3-70b-instruct', emoji: '🔍', role: 'Reviewer', color: colors.teal },
  ];

  for (const assign of roleAssignments) {
    const model = available.find(m => m.id === assign.id);
    if (model) {
      roles.push({ id: model.id, name: model.name, emoji: assign.emoji, role: assign.role, color: assign.color });
    }
  }

  // Fall back: if some models missing, assign available ones to remaining roles
  if (roles.length < 2) {
    for (const model of available) {
      if (!roles.find(r => r.id === model.id)) {
        const unassigned = roleAssignments.find(a => !roles.find(r => r.role === a.role));
        if (unassigned) {
          roles.push({ id: model.id, name: model.name, emoji: unassigned.emoji, role: unassigned.role, color: unassigned.color });
        }
      }
    }
  }

  const architect = roles.find(r => r.role === 'Architect') || roles[0];
  const engineer = roles.find(r => r.role === 'Engineer') || roles[1 % roles.length];
  const reviewer = roles.find(r => r.role === 'Reviewer') || roles[2 % roles.length];

  newline();
  console.log(cosmicGradient('  ━━━ Multi-Model Collaboration ━━━'));
  console.log(`  ${colors.muted('Models conferring in rounds, building on each other\'s input')}`);
  newline();
  roles.forEach(r => {
    console.log(`  ${r.emoji} ${r.color(r.role.padEnd(12))} ${colors.muted(r.name)}`);
  });
  newline();

  const conversation: RoundMessage[] = [];
  let totalTokens = 0;

  // ── Round 1: Architect proposes ──
  const r1 = await runRound(1, architect, prompt, [
    { role: 'system', content: `You are the ELITE SYSTEM ARCHITECT in a team of 3 world-class AI models. 
Your job is to propose an award-winning, genius-level high-level design, file structure, and technology stack. 
Be exceptionally specific about what files to create and their precise architectural purpose. 
Demand absolute perfection, extreme performance, and flawless "vibe coding" aesthetics. 
Keep it concise but profoundly brilliant — the Engineer and Reviewer rely on your foundation.` },
    { role: 'user', content: `Task: ${prompt}\n\nPropose your architecture and design. The Engineer will implement it, and the Reviewer will critique it. Aim for absolute perfection.` },
  ]);
  conversation.push(r1);
  totalTokens += r1.tokens;

  // ── Round 2: Engineer builds on Architect ──
  const r2 = await runRound(2, engineer, prompt, [
    { role: 'system', content: `You are the MASTER ENGINEER in a team of 3 world-class AI models. 
The Architect proposed a design. Your job is to build on it with genius-level implementation specifics, flawless code patterns, and aggressive optimization. 
Identify any weak points in the Architect's plan and ruthlessly improve them. 
Focus on extreme code quality, security, and breathtaking "vibe coding" execution.` },
    { role: 'user', content: `Task: ${prompt}\n\n${architect.emoji} Architect's proposal:\n${r1.content}\n\nBuild on this. Elevate it to a mastercraft level. What specific patterns, libraries, or structures will you use?` },
  ]);
  conversation.push(r2);
  totalTokens += r2.tokens;

  // ── Round 3: Reviewer critiques both ──
  const r3 = await runRound(3, reviewer, prompt, [
    { role: 'system', content: `You are the UNCOMPROMISING REVIEWER in a team of 3 world-class AI models. 
The Architect and Engineer proposed a design. Your job is to tear it apart and demand perfection. 
Find any security risks, lazy coding choices, scalability bottlenecks, or subpar aesthetics. 
If it is not an international award-winning design and flawlessly optimized code, reject their choices and provide the exact corrections needed.` },
    { role: 'user', content: `Task: ${prompt}\n\n${architect.emoji} Architect said:\n${r1.content}\n\n${engineer.emoji} Engineer added:\n${r2.content}\n\nReview this ruthlessly. What is wrong, lazy, or insecure? Demand perfection.` },
  ]);
  conversation.push(r3);
  totalTokens += r3.tokens;

  // ── Round 4: Architect incorporates feedback ──
  const r4 = await runRound(4, architect, prompt, [
    { role: 'system', content: `You are the ELITE SYSTEM ARCHITECT. 
Incorporate ALL the brilliant feedback from the Reviewer and Engineer into a final, flawless master plan. 
List the EXACT files to create with definitive, uncompromising instructions for the Engineer. 
The final output must represent the absolute pinnacle of software engineering and design.` },
    { role: 'user', content: `Original task: ${prompt}\n\nYour original plan:\n${r1.content}\n\n${engineer.emoji} Engineer:\n${r2.content}\n\n${reviewer.emoji} Reviewer:\n${r3.content}\n\nWrite the flawless FINAL master plan. List exact files to be created.` },
  ]);
  conversation.push(r4);
  totalTokens += r4.tokens;

  // ── Final: Engineer produces code ──
  divider('Final — Implementation');

  // Condense the plan to avoid exceeding context limits
  const condensedPlan = r4.content.length > 3000 ? r4.content.slice(0, 3000) + '\n...(plan condensed)' : r4.content;

  const finalMessages = [
    { role: 'system' as const, content: `You are an ELITE WORLD-CLASS CODE ENGINEER taking over execution.
Write the complete, pristine code files using this STRICT EXACT format for EACH file:

===CREATE: filepath===
full code here
===END===

CRITICAL RULES:
1. If you fail to use the ===CREATE: filepath=== format exactly, the system will crash. DO NOT USE MARKDOWN CODE BLOCKS for files.
2. Write absolutely complete, working, production-ready code.
3. NEVER use placeholders, // TODOs, or // implement later. Write every single line.
4. Your code must be genius-level, flawlessly optimized, beautifully formatted, and visually stunning.` },
    { role: 'user' as const, content: `EXECUTE the plan. Output EVERY file requested. Use the strict ===CREATE: filepath=== format:\n\n${condensedPlan}` },
  ];

  let finalContent = '';
  let finalTokens = 0;

  // Try each available model until one succeeds at writing code
  const modelsToTry = [engineer, architect, reviewer].filter(Boolean);
  
  for (const model of modelsToTry) {
    const spinner = createSpinner(`${model.emoji} ${model.color(model.role)} (${model.name}) writing code...`);
    spinner.start();

    try {
      const result = await callWithFallback(finalMessages, {
        preferredModel: model.id,
        maxTokens: 16384,
      });

      finalContent = result.content;
      finalTokens = result.tokens;
      
      const { operations: testOps } = parseFileOperations(finalContent);
      
      if (testOps.length > 0) {
        spinner.succeed(`${model.emoji} ${model.color('Code written')} ${colors.muted(`(${result.tokens} tokens, ${testOps.length} files)`)}`);
        break; // Success!
      } else {
        spinner.warn(`${model.emoji} ${model.name} responded but didn't use file format — trying next model...`);
        // Continue to next model
      }
    } catch (err: any) {
      spinner.fail(`${model.emoji} ${model.name} failed: ${err.message.slice(0, 50)}`);
      // Continue to next model
    }
  }

  totalTokens += finalTokens;

  // Parse and execute file operations
  const { operations } = parseFileOperations(finalContent);

  if (operations.length > 0) {
    await executeFileOperations(operations, basePath, { autoApprove: false });
  } else if (finalContent) {
    // Model wrote code but not in the right format — show it and explain
    newline();
    console.log(`  ${colors.warning('⚠')} Models responded but didn't format as files. Showing raw output:`);
    newline();
    console.log(renderMarkdown(finalContent));
  } else {
    // All models failed — show the agreed plan so user isn't left with nothing
    newline();
    console.log(`  ${colors.warning('⚠')} Code generation failed. Here's the agreed plan from the discussion:`);
    newline();
    console.log(renderMarkdown(r4.content));
  }

  // Summary
  newline();
  panel('📊 Collaboration Complete', [
    `${colors.bold('Rounds:')}       ${conversation.length} rounds of discussion + final implementation`,
    `${colors.bold('Models:')}       ${roles.map(r => `${r.emoji} ${r.role}`).join('  ')}`,
    `${colors.bold('Total tokens:')} ${totalTokens.toLocaleString()}`,
    `${colors.bold('Files:')}        ${operations.length > 0 ? `${operations.length} file(s) created` : 'see output above'}`,
  ].join('\n'), '#BB86FC');
  newline();
}

/**
 * Run a single round of the collaboration
 */
async function runRound(
  round: number,
  model: ModelRole,
  _task: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<RoundMessage> {
  divider(`Round ${round} — ${model.emoji} ${model.role}`);
  const spinner = createSpinner(`${model.emoji} ${model.color(model.role)} (${model.name}) thinking...`);
  spinner.start();

  try {
    const result = await callWithFallback(messages, {
      preferredModel: model.id,
      maxTokens: 4096,
    });

    spinner.succeed(`${model.emoji} ${model.color(model.role)} ${colors.muted(`(${result.tokens} tokens)`)}`);
    newline();

    // Show the response
    console.log(renderMarkdown(result.content));
    newline();

    return {
      role: model,
      content: result.content,
      round,
      tokens: result.tokens,
    };
  } catch (err: any) {
    spinner.fail(`${model.emoji} ${model.color(model.role)} failed: ${err.message}`);
    throw err;
  }
}
