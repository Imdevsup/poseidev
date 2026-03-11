import chalk from 'chalk';
import { colors } from '../ui/display.js';

/**
 * Render markdown to terminal-friendly colored output
 */
export function renderMarkdown(text: string): string {
  let result = text;

  // Code blocks with language  ```lang ... ```
  result = result.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang || 'text';
    const lines = code.trimEnd().split('\n');
    const header = `  ${colors.muted('┌──')} ${colors.primary(language)} ${colors.muted('──')}`;
    const footer = `  ${colors.muted('└' + '─'.repeat(50))}`;
    const body = lines.map((line: string) => `  ${colors.muted('│')} ${highlightCode(line, language)}`).join('\n');
    return `\n${header}\n${body}\n${footer}\n`;
  });

  // Inline code `code`
  result = result.replace(/`([^`]+)`/g, (_, code) => colors.teal(code));

  // Bold **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));

  // Italic *text*
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, text) => chalk.italic(text));

  // Headers
  result = result.replace(/^### (.+)$/gm, (_, text) => `\n  ${colors.primary('▸')} ${chalk.bold(text)}`);
  result = result.replace(/^## (.+)$/gm, (_, text) => `\n  ${colors.primary('■')} ${chalk.bold.underline(text)}`);
  result = result.replace(/^# (.+)$/gm, (_, text) => `\n  ${colors.primary('◆')} ${chalk.bold.underline(text)}`);

  // Bullet lists
  result = result.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, text) => {
    const depth = indent.length / 2;
    const bullet = depth === 0 ? colors.primary('•') : depth === 1 ? colors.secondary('◦') : colors.muted('▪');
    return `  ${'  '.repeat(depth)}${bullet} ${text}`;
  });

  // Numbered lists
  result = result.replace(/^(\s*)(\d+)\. (.+)$/gm, (_, indent, num, text) => {
    return `  ${indent}${colors.primary(num + '.')} ${text}`;
  });

  // Checkboxes
  result = result.replace(/^(\s*)- \[x\] (.+)$/gm, (_, indent, text) => {
    return `  ${indent}${colors.success('☑')} ${colors.muted(text)}`;
  });
  result = result.replace(/^(\s*)- \[ \] (.+)$/gm, (_, indent, text) => {
    return `  ${indent}${colors.muted('☐')} ${text}`;
  });

  // Blockquotes
  result = result.replace(/^> (.+)$/gm, (_, text) => {
    return `  ${colors.muted('│')} ${chalk.italic(text)}`;
  });

  // Horizontal rules
  result = result.replace(/^---+$/gm, () => colors.muted('  ' + '─'.repeat(50)));

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    return `${colors.secondary(text)} ${colors.muted(`(${url})`)}`;
  });

  // ✅ ❌ emoji coloring
  result = result.replace(/✅/g, colors.success('✅'));
  result = result.replace(/❌/g, colors.error('❌'));
  result = result.replace(/⚠️/g, colors.warning('⚠️'));

  // Indent all lines for consistent display
  return result.split('\n').map(line => {
    if (line.startsWith('  ')) return line;
    return `  ${line}`;
  }).join('\n');
}

/**
 * Basic syntax highlighting for code blocks
 */
function highlightCode(line: string, language: string): string {
  if (language === 'text' || language === 'plaintext') return line;

  let result = line;

  // Keywords (JS/TS)
  const keywords = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'interface', 'type', 'import', 'export', 'from', 'async', 'await',
    'try', 'catch', 'throw', 'new', 'this', 'super', 'extends', 'implements',
    'default', 'switch', 'case', 'break', 'continue', 'true', 'false', 'null',
    'undefined', 'typeof', 'instanceof', 'void', 'enum', 'abstract', 'static',
    'public', 'private', 'protected', 'readonly', 'as', 'in', 'of',
    'def', 'self', 'elif', 'elif', 'lambda', 'yield', 'with',  // Python
  ];

  // Color strings
  result = result.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, (match) =>
    colors.success(match)
  );

  // Color numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, colors.orange('$1'));

  // Color comments
  result = result.replace(/(\/\/.*)$/gm, (match) => colors.muted(match));
  result = result.replace(/(#.*)$/gm, (match) => colors.muted(match));

  // Color keywords
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'g');
    result = result.replace(regex, colors.purple('$1'));
  });

  return result;
}
