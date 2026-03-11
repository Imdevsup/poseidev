import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { getConfig, setApiKey, listApiKeys } from './config/configManager.js';
import { callWithFallback, streamCall, getActiveModel, setActiveModel, getAvailableModels, MODELS } from './models/modelManager.js';
import { colors, statusBar, divider, panel, agentMessage, timestamp, cosmicGradient, newline, codeBlock } from './ui/display.js';
import { renderMarkdown } from './chat/markdownRenderer.js';
import { ConversationStore } from './chat/conversationStore.js';
import { getProjectContext } from './project/projectManager.js';
import { getSystemPrompt } from './prompts/promptEnhancer.js';
import { parseFileOperations, executeFileOperations, readFile, listFiles } from './files/fileOperations.js';

interface REPLOptions {
  model?: string;
  projectPath?: string;
  verbose?: boolean;
}

export async function startREPL(opts: REPLOptions): Promise<void> {
  const config = getConfig();
  const conversation = new ConversationStore();
  let totalTokens = 0;
  let processing = false;

  // Show status bar
  const activeModel = getActiveModel();
  const projectCtx = getProjectContext(opts.projectPath);

  statusBar({
    model: activeModel?.name || config.get('activeModel'),
    project: projectCtx?.name || 'No project',
    tokens: 0,
    mode: 'Chat',
  });

  newline();
  console.log(`  ${colors.muted('Quick Commands:')}`);
  console.log(`    ${colors.primary('/model')} ${colors.muted('Switch AI model')}     ${colors.primary('/key')} ${colors.muted('Manage API keys')}      ${colors.primary('/build')} ${colors.muted('Auto-build project')}`);
  console.log(`    ${colors.primary('/collab')} ${colors.muted('3-model collab')}     ${colors.primary('/read')}  ${colors.muted('View a file')}        ${colors.primary('/search')} ${colors.muted('Search files')}`);
  console.log(`    ${colors.primary('/create')} ${colors.muted('New file')}          ${colors.primary('/delete')} ${colors.muted('Remove file')}       ${colors.primary('/rename')} ${colors.muted('Rename file')}`);
  console.log(`    ${colors.primary('/agents')} ${colors.muted('AI agents')}         ${colors.primary('/analyze')} ${colors.muted('Code analysis')}    ${colors.primary('/help')} ${colors.muted('All commands')}`);
  newline();
  console.log(`  ${colors.muted('Type a message to chat, or use a command above.')} ${colors.muted('Press')} ${colors.primary('Ctrl+C')} ${colors.muted('to exit.')}`);
  newline();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${colors.primary('❯')} `,
    terminal: true,
  });

  function showPrompt() {
    processing = false;
    // Force-clear the line and show prompt — prevents readline corruption
    process.stdout.write('\r\x1b[K');
    rl.prompt(true);
  }

  rl.prompt();

  rl.on('line', (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (processing) {
      console.log(`  ${colors.muted('Still processing... please wait.')}`);
      return;
    }

    processing = true;

    // Safety: auto-reset processing flag after 60 seconds
    const safetyTimer = setTimeout(() => {
      if (processing) {
        processing = false;
        console.log(`\n  ${colors.warning('⚠')} Processing timeout — input unlocked.`);
        rl.prompt();
      }
    }, 60000);

    const resetAndPrompt = () => {
      clearTimeout(safetyTimer);
      showPrompt();
    };

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed, rl, config, conversation, opts)
        .then(() => resetAndPrompt())
        .catch((err) => {
          console.log(`  ${colors.error('✗')} ${err.message}`);
          resetAndPrompt();
        });
      return;
    }

    // Send to AI — but require API keys first
    if (!hasApiKeys(config)) {
      newline();
      console.log(`  ${colors.warning('⚠')} No API keys configured!`);
      console.log(`  ${colors.muted('Set one with:')} ${colors.primary('/key nvidia-kimi YOUR_API_KEY')}`);
      console.log(`  ${colors.muted('Get free keys at:')} ${colors.secondary('https://build.nvidia.com')}`);
      newline();
      resetAndPrompt();
      return;
    }

    handleAIMessage(trimmed, config, conversation, opts, totalTokens)
      .then((tokens) => {
        totalTokens = tokens;
        resetAndPrompt();
      })
      .catch((err) => {
        newline();
        console.log(`  ${colors.error('✗')} ${err.message}`);
        newline();
        resetAndPrompt();
      });
  });

  rl.on('close', () => {
    newline();
    console.log(colors.muted('  Goodbye! 👋'));
    process.exit(0);
  });
}

// ─────────────────────────────────────────────
// AI Message Handler (separated for clean async)
// ─────────────────────────────────────────────
async function handleAIMessage(
  message: string,
  config: ReturnType<typeof getConfig>,
  conversation: ConversationStore,
  opts: REPLOptions,
  totalTokens: number
): Promise<number> {
  try {
    const projectCtx = getProjectContext(opts.projectPath);
    const basePath = opts.projectPath || process.cwd();

    // Build the project file tree for the AI
    const fileTree = buildFileTree(basePath);

    // Pre-read all relevant files so the AI never needs to request them
    const preReadFiles = preReadProjectFiles(message, basePath);

    const fileToolPrompt = `

YOU ARE POSEIDEV — AN AUTONOMOUS AI CODE EDITOR WITH FULL FILE SYSTEM ACCESS.
You can create, edit, delete, and rename files. Do NOT ask the user to do it. YOU do it directly.

YOUR TOOLS (use these in your responses):

To CREATE a new file:
===CREATE: relative/path/to/file.ext===
full file content here
===END===

To EDIT an existing file (replaces entire file):
===EDIT: relative/path/to/file.ext===
full new file content
===END===

To DELETE a file:
===DELETE: relative/path/to/file.ext===
===END===

To RENAME/MOVE a file:
===RENAME: old/path.ext -> new/path.ext===
===END===

PROJECT STRUCTURE:
${fileTree}

${preReadFiles ? `FILE CONTENTS (pre-loaded for you):\n${preReadFiles}` : ''}

RULES:
- Use ===CREATE:=== or ===EDIT:=== blocks for ALL code output (NEVER use markdown code blocks for file content)
- Use RELATIVE paths from the project root
- Be proactive: if the user mentions a problem, look at the pre-loaded files above and fix them
- Give a brief explanation before any file operation blocks
- When just answering questions (no file changes), respond normally in markdown`;

    const systemPrompt = getSystemPrompt(config.get('experienceLevel'), projectCtx) + fileToolPrompt;

    conversation.addMessage('user', message);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversation.getMessages().map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    newline();

    // Simple spinner that doesn't corrupt readline (no ANSI cursor movement)
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIdx = 0;
    const spinnerInterval = setInterval(() => {
      process.stdout.write(`\r  ${colors.primary(frames[frameIdx++ % frames.length])} Thinking...`);
    }, 80);

    let fullResponse = '';
    try {
      const result = await callWithFallback(messages, {
        preferredModel: opts.model || config.get('activeModel'),
        maxTokens: 8192,
      });
      clearInterval(spinnerInterval);
      process.stdout.write('\r\x1b[K'); // Clear spinner line
      totalTokens += result.tokens;
      fullResponse = result.content;
    } catch (err: any) {
      clearInterval(spinnerInterval);
      process.stdout.write(`\r\x1b[K  ${colors.error('✗')} AI error: ${err.message}\n`);
      return totalTokens;
    }

    if (fullResponse) {
      conversation.addMessage('assistant', fullResponse);

      // Parse file operations from AI response
      const { operations, cleanResponse } = parseFileOperations(fullResponse);

      if (operations.length > 0) {
        // Show the explanation text (non-code parts only)
        const textOnly = stripCodeBlocks(cleanResponse);
        if (textOnly.trim()) {
          console.log(renderMarkdown(textOnly));
        }

        // Execute file operations with verification
        await executeFileOperations(operations, basePath, { autoApprove: false });
      } else {
        // No file ops — render as markdown
        console.log(renderMarkdown(fullResponse));
      }
    }

    newline();
    console.log(
      `  ${colors.muted(timestamp())}  ${colors.muted('│')}  ${colors.muted(`${totalTokens.toLocaleString()} total tokens`)}`
    );
    newline();

  } catch (err: any) {
    // Catch-all: guarantee we never crash the REPL
    newline();
    console.log(`  ${colors.error('✗')} Unexpected error: ${err.message}`);
    newline();
  }

  return totalTokens;
}

/**
 * Strip code blocks from markdown, leaving only explanatory text
 */
function stripCodeBlocks(text: string): string {
  let cleaned = text.replace(/===(?:CREATE|EDIT|DELETE|RENAME):[\s\S]*?===END===/g, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * Detect file references in user message and read their contents.
 * Looks for file paths like "src/index.ts", "./package.json", "app.js" etc.
 */
function detectAndReadFiles(message: string, basePath: string): string {
  const filePatterns = [
    // Explicit paths: src/index.ts, ./config.json, package.json
    /(?:^|\s)((?:\.\/|\.\.\/|[a-zA-Z][\w-]*\/)*[\w-]+\.(?:ts|tsx|js|jsx|json|py|rb|go|rs|java|c|cpp|h|hpp|css|scss|html|xml|yaml|yml|toml|md|txt|env|sh|bat|sql|prisma|graphql))/g,
  ];

  const files: Set<string> = new Set();

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      files.add(match[1].trim());
    }
  }

  if (files.size === 0) return '';

  const contents: string[] = [];
  for (const file of files) {
    const fullPath = path.resolve(basePath, file);
    // Security: stay within base path
    if (!fullPath.startsWith(path.resolve(basePath))) continue;

    try {
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        // Skip files larger than 50KB
        if (stat.size > 50000) {
          contents.push(`[${file}]: (${(stat.size / 1024).toFixed(1)} KB — too large to include)`);
          continue;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').length;
        contents.push(`[${file}] (${lines} lines):\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return contents.join('\n\n');
}

/**
 * Build a file tree string for the AI to see the project structure
 */
function buildFileTree(basePath: string, prefix: string = '', maxFiles: number = 100): string {
  const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv', 'coverage', '.poseidev']);
  const IGNORE_EXT = new Set(['.lock', '.log', '.map', '.min.js', '.min.css']);

  let count = 0;
  const lines: string[] = [];

  function walk(dir: string, indent: string) {
    if (count >= maxFiles) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.') || e.name === '.env.example')
        .filter(e => !IGNORE.has(e.name))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of entries) {
        if (count >= maxFiles) { lines.push(`${indent}  ... (truncated)`); return; }
        const relPath = path.relative(basePath, path.join(dir, entry.name));
        if (entry.isDirectory()) {
          lines.push(`${indent}📁 ${entry.name}/`);
          walk(path.join(dir, entry.name), indent + '  ');
        } else {
          const ext = path.extname(entry.name);
          if (IGNORE_EXT.has(ext)) continue;
          const stat = fs.statSync(path.join(dir, entry.name));
          const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(0)}KB` : `${stat.size}B`;
          lines.push(`${indent}📄 ${entry.name} (${size})`);
          count++;
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  walk(basePath, '');
  return lines.length > 0 ? lines.join('\n') : '(empty project)';
}

/**
 * Auto-read key project files for small projects so AI has immediate context
 */
function autoReadProjectFiles(basePath: string): string {
  // Only auto-read for small projects
  const KEY_FILES = ['package.json', 'tsconfig.json', 'README.md', '.env.example'];
  const KEY_ENTRY_NAMES = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'];

  // Count total files — skip if project is too large
  let totalFiles = 0;
  try {
    const countFiles = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (['node_modules', '.git', 'dist', '.next'].includes(e.name)) continue;
        if (e.isDirectory()) countFiles(path.join(dir, e.name));
        else totalFiles++;
        if (totalFiles > 30) return; // Too many — skip auto-read
      }
    };
    countFiles(basePath);
  } catch { return ''; }

  if (totalFiles > 30) return ''; // Only auto-read small projects

  const contents: string[] = [];
  let totalSize = 0;
  const MAX_AUTO_SIZE = 30000; // 30KB total auto-read budget

  // Read key config files
  for (const file of KEY_FILES) {
    const fullPath = path.join(basePath, file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (totalSize + content.length > MAX_AUTO_SIZE) break;
        totalSize += content.length;
        contents.push(`[${file}] (${content.split('\n').length} lines):\n\`\`\`\n${content}\n\`\`\``);
      } catch {}
    }
  }

  // Find and read entry point files (src/index.ts, index.js, etc.)
  const searchDirs = [basePath, path.join(basePath, 'src'), path.join(basePath, 'app')];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of KEY_ENTRY_NAMES) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (totalSize + content.length > MAX_AUTO_SIZE) break;
          totalSize += content.length;
          const rel = path.relative(basePath, fullPath);
          contents.push(`[${rel}] (${content.split('\n').length} lines):\n\`\`\`\n${content}\n\`\`\``);
        } catch {}
      }
    }
  }

  return contents.join('\n\n');
}

/**
 * Pre-read relevant project files for AI context.
 * Keeps it lean — only files the user mentions + package.json.
 * Skips entirely for creation tasks to leave room for code generation.
 */
function preReadProjectFiles(message: string, basePath: string): string {
  // Skip pre-reading for creation/generation tasks — AI needs context room to write code
  const creationWords = /\b(create|build|make|generate|write|scaffold|init|new|setup|start)\b/i;
  if (creationWords.test(message) && !message.includes('/')) {
    // Only read package.json for creation tasks
    try {
      const pkgPath = path.join(basePath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        return `[package.json] (${content.split('\n').length} lines):\n\`\`\`json\n${content}\n\`\`\``;
      }
    } catch {}
    return '';
  }

  const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', 'coverage']);
  const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.go', '.rs', '.java', '.css', '.html', '.yaml', '.yml', '.toml', '.md', '.sql']);
  const MAX_TOTAL_SIZE = 15000; // 15KB budget — leave room for AI to generate code
  const MAX_FILES = 10;
  const MAX_PER_FILE = 8000; // 8KB per file max

  const readFiles: Map<string, string> = new Map();
  let totalSize = 0;

  function tryRead(relPath: string) {
    if (readFiles.has(relPath) || totalSize >= MAX_TOTAL_SIZE || readFiles.size >= MAX_FILES) return;
    const fullPath = path.resolve(basePath, relPath);
    if (!fullPath.startsWith(path.resolve(basePath))) return;
    try {
      if (!fs.existsSync(fullPath)) return;
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_PER_FILE || stat.size === 0) return;
      if (totalSize + stat.size > MAX_TOTAL_SIZE) return;
      const content = fs.readFileSync(fullPath, 'utf-8');
      readFiles.set(relPath, content);
      totalSize += stat.size;
    } catch {}
  }

  // 1. Read files explicitly mentioned in the user's message
  const filePattern = /(?:^|\s)((?:\.\/|\.\.\/|[a-zA-Z][\w-]*\/)*[\w.-]+\.(?:ts|tsx|js|jsx|json|py|go|rs|java|css|html|yaml|yml|toml|md|sql|sh|txt|env))/g;
  let match;
  while ((match = filePattern.exec(message)) !== null) {
    tryRead(match[1].trim());
  }

  // 2. Read package.json
  tryRead('package.json');

  // 3. For SMALL projects only (≤15 source files), read entry points
  try {
    let fileCount = 0;
    const sourceFiles: string[] = [];
    const scanDir = (dir: string) => {
      if (fileCount > 15) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
        if (e.isDirectory()) scanDir(path.join(dir, e.name));
        else {
          fileCount++;
          if (CODE_EXT.has(path.extname(e.name))) {
            sourceFiles.push(path.relative(basePath, path.join(dir, e.name)));
          }
        }
      }
    };
    scanDir(basePath);

    if (fileCount <= 15) {
      for (const f of sourceFiles) tryRead(f);
    }
  } catch {}

  if (readFiles.size === 0) return '';

  const parts: string[] = [];
  for (const [rel, content] of readFiles) {
    const ext = path.extname(rel).slice(1) || 'text';
    parts.push(`[${rel}] (${content.split('\n').length} lines):\n\`\`\`${ext}\n${content}\n\`\`\``);
  }

  return parts.join('\n\n');
}

/**
 * Check if at least one API key is configured
 */
function hasApiKeys(config: ReturnType<typeof getConfig>): boolean {
  return !!(
    config.get('apiKeys.nvidiaKimi') ||
    config.get('apiKeys.nvidiaGlm5') ||
    config.get('apiKeys.nvidiaQwen') ||
    config.get('apiKeys.openai') ||
    config.get('apiKeys.custom')
  );
}

// ─────────────────────────────────────────────
// Slash Command Handler
// ─────────────────────────────────────────────
async function handleSlashCommand(
  input: string,
  rl: ReturnType<typeof createInterface>,
  config: ReturnType<typeof getConfig>,
  conversation: ConversationStore,
  opts: REPLOptions
): Promise<void> {
  const [command, ...args] = input.slice(1).split(' ');

  switch (command) {
    case 'help':
    case 'h':
      showHelp();
      break;

    case 'model':
    case 'm':
    case 'switch': {
      if (args[0]) {
        try {
          setActiveModel(args[0]);
          opts.model = args[0];
          const model = MODELS[args[0]];
          console.log(`  ${colors.success('✓')} Model switched to ${colors.primary(model?.name || args[0])}`);
          if (model) console.log(`    ${colors.muted(model.description)}`);
        } catch (e: any) {
          console.log(`  ${colors.error('✗')} ${e.message}`);
          console.log(`  ${colors.muted('Available models:')}`);
          Object.values(MODELS).forEach(m => {
            console.log(`    ${colors.primary(m.id)} — ${m.name}`);
          });
        }
      } else {
        const models = getAvailableModels();
        newline();
        divider('Available Models — /model <id> to switch');
        models.forEach(m => {
          const status = m.available ? colors.success('●') : colors.error('○');
          const active = m.id === config.get('activeModel') ? colors.warning(' ← active') : '';
          console.log(`  ${status} ${colors.bold(m.name)} ${colors.muted(`(${m.id})`)}${active}`);
          console.log(`    ${colors.muted(m.description)}`);
        });
        newline();
        console.log(`  ${colors.muted('Switch:')} ${colors.primary('/model <model-id>')}`);
        console.log(`  ${colors.muted('Example:')} ${colors.primary('/model qwen/qwen3.5-397b-a17b')}`);
      }
      break;
    }

    case 'key':
    case 'keys':
    case 'apikey': {
      if (args[0] && args[1]) {
        // Set a key: /key nvidia-kimi <your-key>
        try {
          setApiKey(args[0], args[1]);
          console.log(`  ${colors.success('✓')} API key for ${colors.primary(args[0])} saved`);
        } catch (e: any) {
          console.log(`  ${colors.error('✗')} ${e.message}`);
        }
      } else {
        // Show keys
        const keys = listApiKeys();
        newline();
        divider('API Keys — /key <provider> <key> to set');
        keys.forEach(k => {
          const icon = k.configured ? colors.success('●') : colors.error('○');
          console.log(`  ${icon} ${k.provider.padEnd(15)} ${k.configured ? colors.muted(k.masked) : colors.muted('not set')}`);
        });
        newline();
        console.log(`  ${colors.muted('Set key:')} ${colors.primary('/key nvidia-kimi YOUR_KEY')}`);
        console.log(`  ${colors.muted('Set key:')} ${colors.primary('/key openai YOUR_KEY')}`);
      }
      break;
    }

    case 'build':
    case 'b':
      console.log(`  ${colors.info('ℹ')} Starting auto-build... Use ${colors.primary('poseidev build')} for full options.`);
      try {
        const { runAutoBuild } = await import('./build/autoBuildEngine.js');
        await runAutoBuild({ projectPath: process.cwd() });
      } catch (e: any) {
        console.log(`  ${colors.error('✗')} Build failed: ${e.message}`);
      }
      break;

    case 'collab':
    case 'collaborate': {
      if (args.length > 0) {
        try {
          const { runCollab } = await import('./collab/collabEngine.js');
          await runCollab(args.join(' '), opts.projectPath || process.cwd());
        } catch (e: any) {
          console.log(`  ${colors.error('✗')} Collab failed: ${e.message}`);
        }
      } else {
        console.log(`  ${colors.info('ℹ')} Usage: ${colors.primary('/collab <your task>')}`);
        console.log(`  ${colors.muted('  All 3 models work together: Architect → Engineer → Reviewer → Synthesis')}`);
        console.log(`  ${colors.muted('  Example:')} ${colors.primary('/collab build a REST API with Express and MongoDB')}`);
      }
      break;
    }

    case 'agents':
    case 'a':
      console.log(`  ${colors.info('ℹ')} Agent commands:`);
      console.log(`    ${colors.primary('poseidev agents debate "topic"')}  — Multi-agent debate`);
      console.log(`    ${colors.primary('poseidev agents review')}          — Multi-agent code review`);
      console.log(`    ${colors.primary('poseidev agents ask coder "?"')}   — Ask a specific agent`);
      break;

    case 'clear':
    case 'c':
      conversation.clear();
      console.clear();
      console.log(`  ${colors.success('✓')} Conversation cleared`);
      break;

    case 'save':
    case 's':
      conversation.save(args[0] || `conversation-${Date.now()}`);
      console.log(`  ${colors.success('✓')} Conversation saved`);
      break;

    case 'load':
    case 'l':
      if (args[0]) {
        conversation.load(args[0]);
        console.log(`  ${colors.success('✓')} Conversation loaded (${conversation.getMessages().length} messages)`);
      } else {
        console.log(`  ${colors.error('✗')} Usage: /load <conversation-id>`);
      }
      break;

    case 'context':
    case 'ctx':
      console.log(`  ${colors.info('ℹ')} Context: ${conversation.getMessages().length} messages in history`);
      console.log(`  ${colors.muted('Truncation at:')} ${config.get('maxConversationHistory')} messages`);
      break;

    case 'config':
      console.log(`  ${colors.muted('Config path:')} ${config.path}`);
      console.log(`  ${colors.muted('Model:')} ${config.get('activeModel')}`);
      console.log(`  ${colors.muted('Level:')} ${config.get('experienceLevel')}`);
      console.log(`  ${colors.muted('Tokens:')} ${config.get('maxTokens')}`);
      console.log(`  ${colors.muted('Temp:')} ${config.get('temperature')}`);
      console.log(`  ${colors.muted('Stream:')} ${config.get('streamResponses')}`);
      break;

    case 'project':
    case 'p': {
      const ctx = getProjectContext();
      if (ctx) {
        console.log(`  ${colors.secondary('📂')} ${colors.bold(ctx.name)}`);
        console.log(`  ${colors.muted('Stack:')} ${ctx.techStack.join(', ')}`);
        console.log(`  ${colors.muted('Files:')} ${ctx.fileCount}`);
      } else {
        console.log(`  ${colors.warning('⚠')} No project found. Run ${colors.primary('poseidev project init')}`);
      }
      break;
    }

    case 'analyze':
      console.log(`  ${colors.info('ℹ')} Analysis commands (run from terminal):`);
      console.log(`    ${colors.primary('poseidev analyze health')}       — Code health report`);
      console.log(`    ${colors.primary('poseidev analyze security')}     — Security scan`);
      console.log(`    ${colors.primary('poseidev analyze complexity')}   — Complexity analysis`);
      console.log(`    ${colors.primary('poseidev analyze deps')}         — Dependency analysis`);
      break;

    case 'exit':
    case 'quit':
    case 'q':
      rl.close();
      break;

    case 'tokens':
    case 't':
      console.log(`  ${colors.muted('Temperature:')} ${config.get('temperature')}`);
      console.log(`  ${colors.muted('Max tokens:')} ${config.get('maxTokens')}`);
      if (args[0] && args[1]) {
        if (args[0] === 'max') {
          config.set('maxTokens', parseInt(args[1]));
          console.log(`  ${colors.success('✓')} Max tokens set to ${args[1]}`);
        } else if (args[0] === 'temp') {
          config.set('temperature', parseFloat(args[1]));
          console.log(`  ${colors.success('✓')} Temperature set to ${args[1]}`);
        }
      }
      break;

    case 'level':
      if (args[0] && ['beginner', 'intermediate', 'expert'].includes(args[0])) {
        config.set('experienceLevel', args[0] as any);
        console.log(`  ${colors.success('✓')} Experience level set to ${colors.primary(args[0])}`);
      } else {
        console.log(`  ${colors.muted('Current:')} ${config.get('experienceLevel')}`);
        console.log(`  ${colors.muted('Usage:')} /level beginner|intermediate|expert`);
      }
      break;

    case 'stream':
      const streamVal = !config.get('streamResponses');
      config.set('streamResponses', streamVal);
      console.log(`  ${colors.success('✓')} Streaming ${streamVal ? 'enabled' : 'disabled'}`);
      break;

    case 'diff':
      console.log(`  ${colors.info('ℹ')} Use ${colors.primary('poseidev diff <file>')} to view file changes`);
      break;

    case 'search':
      if (args.length > 0) {
        console.log(`  ${colors.info('ℹ')} Searching for: ${args.join(' ')}...`);
        try {
          const { searchFiles } = await import('./search/searchEngine.js');
          await searchFiles(args.join(' '), process.cwd());
        } catch (e: any) {
          console.log(`  ${colors.error('✗')} ${e.message}`);
        }
      } else {
        console.log(`  ${colors.muted('Usage:')} /search <query>`);
      }
      break;

    case 'read':
    case 'cat': {
      if (args[0]) {
        const content = readFile(args[0], process.cwd());
        if (content) {
          codeBlock(content, args[0].split('.').pop() || 'text');
        } else {
          console.log(`  ${colors.error('✗')} File not found: ${args[0]}`);
        }
      } else {
        console.log(`  ${colors.muted('Usage:')} /read <filepath>`);
      }
      break;
    }

    case 'ls':
    case 'dir': {
      const dir = args[0] || '.';
      const entries = listFiles(dir, process.cwd());
      if (entries.length > 0) {
        newline();
        entries.forEach(e => console.log(`  ${e}`));
        newline();
      } else {
        console.log(`  ${colors.muted('Empty or not found:')} ${dir}`);
      }
      break;
    }

    case 'create': {
      if (args.length >= 1) {
        const { createFile } = await import('./files/fileOperations.js');
        createFile(args[0], '', process.cwd());
        console.log(`  ${colors.success('✓')} Created: ${args[0]}`);
      } else {
        console.log(`  ${colors.muted('Usage:')} /create <filepath>`);
      }
      break;
    }

    case 'delete':
    case 'rm': {
      if (args[0]) {
        const { deleteFile } = await import('./files/fileOperations.js');
        if (deleteFile(args[0], process.cwd())) {
          console.log(`  ${colors.success('✓')} Deleted: ${args[0]}`);
        } else {
          console.log(`  ${colors.error('✗')} File not found: ${args[0]}`);
        }
      } else {
        console.log(`  ${colors.muted('Usage:')} /delete <filepath>`);
      }
      break;
    }

    case 'rename':
    case 'mv': {
      if (args[0] && args[1]) {
        const { renameFile } = await import('./files/fileOperations.js');
        try {
          renameFile(args[0], args[1], process.cwd());
          console.log(`  ${colors.success('✓')} Renamed: ${args[0]} → ${args[1]}`);
        } catch (e: any) {
          console.log(`  ${colors.error('✗')} ${e.message}`);
        }
      } else {
        console.log(`  ${colors.muted('Usage:')} /rename <old> <new>`);
      }
      break;
    }

    default:
      console.log(`  ${colors.error('✗')} Unknown command: /${command}. Type ${colors.primary('/help')} for commands.`);
  }
}

function showHelp(): void {
  const sections = [
    { title: 'Chat & AI', cmds: [
      ['/help, /h', 'Show this help'],
      ['/model, /m [id]', 'List or switch AI models'],
      ['/key [provider] [key]', 'View or set API keys'],
      ['/tokens, /t [max|temp] [val]', 'Token/temperature settings'],
      ['/level [lvl]', 'Set experience level'],
      ['/stream', 'Toggle streaming on/off'],
      ['/context, /ctx', 'Show context info'],
      ['/config', 'Show active config'],
    ]},
    { title: 'Files', cmds: [
      ['/read, /cat <file>', 'Read and display a file'],
      ['/ls, /dir [path]', 'List files in directory'],
      ['/create <file>', 'Create a new empty file'],
      ['/delete, /rm <file>', 'Delete a file'],
      ['/rename, /mv <old> <new>', 'Rename or move a file'],
      ['/search <query>', 'Search project files'],
    ]},
    { title: 'Tools', cmds: [
      ['/collab <task>', 'All 3 models collaborate on a task'],
      ['/build, /b', 'Start auto-build engine'],
      ['/agents, /a', 'Agent system info'],
      ['/project, /p', 'Show project info'],
      ['/analyze', 'Run code analysis'],
    ]},
    { title: 'Session', cmds: [
      ['/clear, /c', 'Clear conversation'],
      ['/save, /s [name]', 'Save conversation'],
      ['/load, /l <id>', 'Load conversation'],
      ['/exit, /q', 'Exit Poseidev'],
    ]},
  ];

  newline();
  for (const section of sections) {
    divider(section.title);
    section.cmds.forEach(([cmd, desc]) => {
      console.log(`  ${colors.primary(cmd!.padEnd(32))} ${colors.muted(desc!)}`);
    });
    newline();
  }
  console.log(`  ${colors.muted('💡 Just type naturally — the AI can create, edit, delete, and rename files for you!')}`);
  newline();
}
