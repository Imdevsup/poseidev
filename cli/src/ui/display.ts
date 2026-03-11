import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import gradient from 'gradient-string';
import ora from 'ora';
import Table from 'cli-table3';

// ─────────────────────────────────────────────
// Color Palette — matches Poseidev dark theme
// ─────────────────────────────────────────────
export const colors = {
  primary: chalk.hex('#6C63FF'),         // Indigo
  secondary: chalk.hex('#00D2FF'),       // Cyan
  accent: chalk.hex('#FF6B6B'),          // Coral
  success: chalk.hex('#00E676'),         // Green
  warning: chalk.hex('#FFD600'),         // Amber
  error: chalk.hex('#FF5252'),           // Red
  muted: chalk.hex('#6B7280'),           // Gray
  info: chalk.hex('#42A5F5'),            // Blue
  purple: chalk.hex('#BB86FC'),          // Purple
  teal: chalk.hex('#64FFDA'),            // Teal
  orange: chalk.hex('#FF9100'),          // Orange
  pink: chalk.hex('#FF4081'),            // Pink
  dim: chalk.dim,
  bold: chalk.bold,
  italic: chalk.italic,
};

export const poseidevGradient = gradient(['#6C63FF', '#00D2FF', '#00E676']);
export const fireGradient = gradient(['#FF6B6B', '#FF9100', '#FFD600']);
export const cosmicGradient = gradient(['#BB86FC', '#6C63FF', '#00D2FF']);

// ─────────────────────────────────────────────
// Banner
// ─────────────────────────────────────────────
export async function displayBanner(): Promise<void> {
  const art = figlet.textSync('POSEIDEV', {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted',
  });

  console.log('');
  console.log(poseidevGradient(art));
  console.log('');
  console.log(
    chalk.gray('  ') +
    cosmicGradient('⚡ The AI-Powered CLI Code Editor') +
    chalk.gray('  │  ') +
    colors.muted('v1.0.0')
  );
  console.log(
    chalk.gray('  ') +
    colors.muted('Multi-Model Orchestration • Auto-Build • Agent Collaboration')
  );
  console.log('');
  console.log(colors.muted('  ─'.repeat(35)));
  console.log('');
}

// ─────────────────────────────────────────────
// Welcome screen for first-time users
// ─────────────────────────────────────────────
export function displayWelcome(): void {
  const content = [
    colors.warning('⚠  No API keys configured yet!'),
    '',
    `${colors.bold('Quick Setup:')}`,
    '',
    `  ${colors.primary('1.')} ${chalk.white('Get a free NVIDIA NIM API key:')}`,
    `     ${colors.secondary('https://build.nvidia.com')}`,
    '',
    `  ${colors.primary('2.')} ${chalk.white('Configure your key:')}`,
    `     ${colors.teal('poseidev config set-key nvidia-kimi YOUR_KEY')}`,
    '',
    `  ${colors.primary('3.')} ${chalk.white('Start building:')}`,
    `     ${colors.teal('poseidev chat')}  or  ${colors.teal('poseidev build')}`,
    '',
    colors.muted('  Supports: NVIDIA NIM (Kimi K2.5, GLM5, Qwen 3.5) • OpenAI • Custom endpoints'),
  ].join('\n');

  console.log(boxen(content, {
    padding: 1,
    margin: { top: 0, bottom: 1, left: 2, right: 2 },
    borderStyle: 'round',
    borderColor: '#6C63FF',
    title: '🚀 Welcome to Poseidev',
    titleAlignment: 'center',
  }));
}

// ─────────────────────────────────────────────
// Status Bar
// ─────────────────────────────────────────────
export function statusBar(opts: {
  model?: string;
  project?: string;
  tokens?: number;
  mode?: string;
}): void {
  const parts = [];

  if (opts.model) {
    parts.push(`${colors.primary('⚡')} ${colors.bold(opts.model)}`);
  }
  if (opts.project) {
    parts.push(`${colors.secondary('📂')} ${opts.project}`);
  }
  if (opts.tokens !== undefined) {
    parts.push(`${colors.muted('🔢')} ${opts.tokens.toLocaleString()} tokens`);
  }
  if (opts.mode) {
    parts.push(`${colors.purple('⚙')} ${opts.mode}`);
  }

  console.log(colors.muted('─'.repeat(70)));
  console.log(`  ${parts.join(chalk.gray('  │  '))}`);
  console.log(colors.muted('─'.repeat(70)));
}

// ─────────────────────────────────────────────
// Panels & Boxes
// ─────────────────────────────────────────────
export function panel(title: string, content: string, color: string = '#6C63FF'): void {
  console.log(boxen(content, {
    padding: 1,
    margin: { top: 0, bottom: 0, left: 2, right: 2 },
    borderStyle: 'round',
    borderColor: color,
    title: ` ${title} `,
    titleAlignment: 'left',
  }));
}

export function successPanel(title: string, content: string): void {
  panel(title, content, '#00E676');
}

export function errorPanel(title: string, content: string): void {
  panel(title, content, '#FF5252');
}

export function warningPanel(title: string, content: string): void {
  panel(title, content, '#FFD600');
}

export function infoPanel(title: string, content: string): void {
  panel(title, content, '#42A5F5');
}

// ─────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────
export function createTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers.map(h => colors.bold(colors.primary(h))),
    style: {
      head: [],
      border: ['gray'],
      compact: true,
    },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│',
    },
  });

  rows.forEach(row => table.push(row));
  return table.toString();
}

// ─────────────────────────────────────────────
// Spinners
// ─────────────────────────────────────────────
export function createSpinner(text: string) {
  return ora({
    text,
    color: 'cyan',
    spinner: 'dots12',
  });
}

export function phaseSpinner(phase: number, total: number, name: string) {
  return ora({
    text: `${colors.primary(`[${phase}/${total}]`)} ${name}`,
    color: 'cyan',
    spinner: 'dots12',
    prefixText: '  ',
  });
}

// ─────────────────────────────────────────────
// Progress Display
// ─────────────────────────────────────────────
export function progressBar(current: number, total: number, width: number = 30): string {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  const bar = colors.primary('█'.repeat(filled)) + colors.muted('░'.repeat(empty));
  const pctStr = percentage === 100
    ? colors.success(`${percentage}%`)
    : colors.primary(`${percentage}%`);

  return `  ${bar} ${pctStr}`;
}

// ─────────────────────────────────────────────
// Agent Display
// ─────────────────────────────────────────────
export const agentColors: Record<string, (str: string) => string> = {
  architect: colors.primary,
  coder: colors.secondary,
  designer: colors.pink,
  security: colors.accent,
  tester: colors.warning,
  integrator: colors.teal,
  ux: colors.purple,
  performance: colors.orange,
  system: colors.muted,
};

export const agentEmoji: Record<string, string> = {
  architect: '🏗️',
  coder: '💻',
  designer: '🎨',
  security: '🔒',
  tester: '🧪',
  integrator: '🔌',
  ux: '✨',
  performance: '⚡',
  system: '⚙️',
};

export function agentMessage(agentType: string, message: string): void {
  const colorFn = agentColors[agentType] || colors.muted;
  const emoji = agentEmoji[agentType] || '🤖';
  const name = agentType.charAt(0).toUpperCase() + agentType.slice(1);

  console.log(`  ${emoji} ${colorFn(chalk.bold(`[${name}]`))} ${message}`);
}

export function debateMessage(agentType: string, message: string): void {
  const colorFn = agentColors[agentType] || colors.muted;
  const emoji = agentEmoji[agentType] || '🤖';
  const name = agentType.charAt(0).toUpperCase() + agentType.slice(1);

  console.log(boxen(message, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 3, right: 3 },
    borderStyle: 'round',
    borderColor: agentType === 'architect' ? '#6C63FF' :
      agentType === 'security' ? '#FF6B6B' :
        agentType === 'tester' ? '#FFD600' :
          agentType === 'coder' ? '#00D2FF' : '#6B7280',
    title: ` ${emoji} ${name} `,
    titleAlignment: 'left',
  }));
}

// ─────────────────────────────────────────────
// Section Dividers
// ─────────────────────────────────────────────
export function divider(title?: string): void {
  if (title) {
    const line = colors.muted('─'.repeat(5));
    console.log(`\n  ${line} ${colors.bold(title)} ${line}\n`);
  } else {
    console.log(colors.muted('\n  ' + '─'.repeat(50) + '\n'));
  }
}

export function newline(): void {
  console.log('');
}

// ─────────────────────────────────────────────
// Phase Headers
// ─────────────────────────────────────────────
export function phaseHeader(phase: number, total: number, title: string, emoji: string): void {
  console.log('');
  console.log(
    `  ${cosmicGradient(`━━━ Phase ${phase}/${total} ━━━`)}  ${emoji} ${colors.bold(title)}`
  );
  console.log('');
}

// ─────────────────────────────────────────────
// Key-Value Display
// ─────────────────────────────────────────────
export function keyValue(items: [string, string][]): void {
  const maxKeyLen = Math.max(...items.map(([k]) => k.length));
  items.forEach(([key, value]) => {
    console.log(`  ${colors.muted(key.padEnd(maxKeyLen + 2))} ${value}`);
  });
}

// ─────────────────────────────────────────────
// File Tree Display
// ─────────────────────────────────────────────
export function fileTree(files: { path: string; status?: string }[]): void {
  files.forEach((file, i) => {
    const isLast = i === files.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    const statusIcon = file.status === 'created' ? colors.success('✓') :
      file.status === 'modified' ? colors.warning('~') :
        file.status === 'deleted' ? colors.error('✗') : ' ';

    console.log(`  ${colors.muted(prefix)}${statusIcon} ${file.path}`);
  });
}

// ─────────────────────────────────────────────
// Code Block Display
// ─────────────────────────────────────────────
export function codeBlock(code: string, language: string = 'typescript'): void {
  const lines = code.split('\n');
  const maxLineNum = String(lines.length).length;

  console.log(colors.muted(`  ┌${'─'.repeat(60)}`));
  console.log(colors.muted(`  │ `) + colors.primary(language));
  console.log(colors.muted(`  ├${'─'.repeat(60)}`));

  lines.forEach((line, i) => {
    const lineNum = colors.muted(String(i + 1).padStart(maxLineNum, ' '));
    console.log(`  ${colors.muted('│')} ${lineNum} ${colors.muted('│')} ${line}`);
  });

  console.log(colors.muted(`  └${'─'.repeat(60)}`));
}

// ─────────────────────────────────────────────
// Confirmation Prompt Helper
// ─────────────────────────────────────────────
export async function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const msg = colors.primary(message) + colors.muted(' (Y/n) ');
    process.stdout.write(`  ${msg}`);
    
    const onData = (data: Buffer) => {
      const input = data.toString().trim().toLowerCase();
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      console.log(''); // newline after answer
      resolve(input !== 'n' && input !== 'no');
    };

    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', onData);
  });
}

// ─────────────────────────────────────────────
// Timestamp
// ─────────────────────────────────────────────
export function timestamp(): string {
  return colors.muted(new Date().toLocaleTimeString());
}
