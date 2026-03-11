import { Command } from 'commander';
import path from 'path';
import { colors, newline, divider, panel, createTable, createSpinner, successPanel } from '../ui/display.js';
import { initProject, listProjects, getProjectContext, scanProjectFiles, inferTechStack } from '../project/projectManager.js';

export function projectCommand(): Command {
  const cmd = new Command('project')
    .description('Manage Poseidev projects');

  // ── init ──
  cmd.command('init')
    .description('Initialize a new Poseidev project')
    .option('-n, --name <name>', 'Project name')
    .option('-d, --description <desc>', 'Project description')
    .option('-s, --stack <stack>', 'Comma-separated tech stack')
    .option('-r, --requirements <req>', 'Project requirements')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (opts) => {
      let name = opts.name;
      let description = opts.description;
      let techStack = opts.stack ? opts.stack.split(',').map((s: string) => s.trim()) : [];
      let requirements = opts.requirements || '';

      if (!name || !description) {
        const { default: inquirer } = await import('inquirer');

        // Auto-detect tech stack
        const detected = inferTechStack(opts.path);

        const answers = await inquirer.prompt([
          ...(name ? [] : [{
            type: 'input',
            name: 'name',
            message: colors.primary('Project name:'),
            default: path.basename(opts.path),
          }]),
          ...(description ? [] : [{
            type: 'input',
            name: 'description',
            message: colors.primary('Description:'),
          }]),
          ...(techStack.length > 0 ? [] : [{
            type: 'checkbox',
            name: 'techStack',
            message: colors.primary('Tech stack:'),
            choices: [
              'React', 'Next.js', 'Vue', 'Svelte', 'Angular',
              'Express', 'Fastify', 'Hono', 'Django', 'Flask', 'FastAPI',
              'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go',
              'Prisma', 'Drizzle', 'MongoDB', 'PostgreSQL', 'SQLite', 'Redis',
              'Tailwind CSS', 'Docker', 'GraphQL', 'tRPC',
            ],
            default: detected,
          }]),
          {
            type: 'editor',
            name: 'requirements',
            message: colors.primary('Project requirements (opens editor):'),
          },
        ]);

        name = name || answers.name;
        description = description || answers.description;
        techStack = techStack.length > 0 ? techStack : answers.techStack;
        requirements = requirements || answers.requirements;
      }

      const spinner = createSpinner('Initializing project...');
      spinner.start();

      const configPath = await initProject({
        name, description, techStack, requirements,
        projectPath: opts.path,
      });

      spinner.succeed('Project initialized!');
      newline();
      successPanel('🚀 Project Created', [
        `${colors.bold('Name:')}        ${name}`,
        `${colors.bold('Path:')}        ${opts.path}`,
        `${colors.bold('Config:')}      ${configPath}`,
        `${colors.bold('Tech Stack:')}  ${techStack.join(', ')}`,
        '',
        `${colors.muted('Next steps:')}`,
        `  ${colors.primary('poseidev chat')}   — Chat with AI about your project`,
        `  ${colors.primary('poseidev build')}  — Generate code with auto-build`,
      ].join('\n'));
      newline();
    });

  // ── list ──
  cmd.command('list')
    .alias('ls')
    .description('List all Poseidev projects')
    .action(() => {
      const projects = listProjects();
      if (projects.length === 0) {
        console.log(`  ${colors.muted('No projects yet.')} Run ${colors.primary('poseidev project init')} to create one.`);
        return;
      }

      newline();
      divider('Projects');
      const rows = projects.map(p => [
        p.name,
        p.path,
        new Date(p.lastAccessed).toLocaleDateString(),
      ]);
      console.log(createTable(['Name', 'Path', 'Last Accessed'], rows));
      newline();
    });

  // ── status ──
  cmd.command('status')
    .alias('info')
    .description('Show current project status')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action((opts) => {
      const ctx = getProjectContext(opts.path);
      if (!ctx) {
        console.log(`  ${colors.warning('⚠')} No project found at ${opts.path}`);
        console.log(`  ${colors.muted('Run:')} ${colors.primary('poseidev project init')}`);
        return;
      }

      const extensions: Record<string, number> = {};
      ctx.files.forEach(f => {
        const ext = path.extname(f) || 'other';
        extensions[ext] = (extensions[ext] || 0) + 1;
      });

      newline();
      panel(`📂 ${ctx.name}`, [
        `${colors.bold('Description:')} ${ctx.description || colors.muted('none')}`,
        `${colors.bold('Tech Stack:')}  ${ctx.techStack.join(', ') || colors.muted('auto-detected')}`,
        `${colors.bold('Total Files:')} ${ctx.fileCount}`,
        `${colors.bold('Path:')}        ${ctx.projectPath}`,
        '',
        `${colors.bold('File types:')}`,
        ...Object.entries(extensions)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([ext, count]) => `  ${ext.padEnd(10)} ${count} files`),
      ].join('\n'));
      newline();
    });

  // ── scan ──
  cmd.command('scan')
    .description('Scan project structure')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('-d, --depth <depth>', 'Max scan depth', '3')
    .action((opts) => {
      const files = scanProjectFiles(opts.path, parseInt(opts.depth));
      const stack = inferTechStack(opts.path);

      newline();
      divider('Project Scan');
      console.log(`  ${colors.bold('Files found:')} ${files.length}`);
      console.log(`  ${colors.bold('Detected stack:')} ${stack.join(', ') || 'Unknown'}`);
      newline();

      // Show tree
      const dirs = new Set<string>();
      files.forEach(f => {
        const parts = f.split(/[/\\]/);
        if (parts.length > 1) dirs.add(parts[0]);
      });

      console.log(`  ${colors.primary(path.basename(opts.path))}/`);
      [...dirs].sort().forEach((dir, i) => {
        const count = files.filter(f => f.startsWith(dir)).length;
        const isLast = i === dirs.size - 1;
        const prefix = isLast ? '└── ' : '├── ';
        console.log(`  ${colors.muted(prefix)}${colors.secondary(dir)}/ ${colors.muted(`(${count} files)`)}`);
      });
      newline();
    });

  return cmd;
}
