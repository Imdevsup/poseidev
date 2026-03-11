import { Command } from 'commander';
import { colors, newline, panel, divider } from '../ui/display.js';
import { runAutoBuild } from '../build/autoBuildEngine.js';
import { getProjectContext } from '../project/projectManager.js';

export function buildCommand(): Command {
  const cmd = new Command('build')
    .description('Run the AI auto-build engine to generate a full project')
    .option('-n, --name <name>', 'Project name')
    .option('-r, --requirements <req>', 'Project requirements')
    .option('-s, --stack <stack>', 'Comma-separated tech stack')
    .option('-p, --path <path>', 'Output directory', process.cwd())
    .option('--phases <phases>', 'Comma-separated phases to run')
    .option('--no-debate', 'Disable agent debate mode')
    .option('--no-self-healing', 'Disable self-healing')
    .option('--dry-run', 'Preview without writing files')
    .action(async (opts) => {
      try {
        // Try to load from project config
        const ctx = getProjectContext(opts.path);

        if (!opts.requirements && !ctx?.requirements) {
          // Interactive requirements input
          const { default: inquirer } = await import('inquirer');
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: colors.primary('Project name:'),
              default: ctx?.name || 'my-project',
            },
            {
              type: 'editor',
              name: 'requirements',
              message: colors.primary('Describe what you want to build:'),
            },
            {
              type: 'checkbox',
              name: 'techStack',
              message: colors.primary('Tech stack:'),
              choices: [
                'React', 'Next.js', 'Vue', 'Svelte', 'Express', 'Fastify',
                'TypeScript', 'Python', 'Django', 'Flask', 'Prisma', 'MongoDB',
                'PostgreSQL', 'SQLite', 'Redis', 'Tailwind CSS', 'Docker',
              ],
              default: ctx?.techStack || ['React', 'TypeScript', 'Tailwind CSS'],
            },
          ]);

          opts.name = answers.name;
          opts.requirements = answers.requirements;
          opts.stack = answers.techStack.join(',');
        }

        await runAutoBuild({
          projectPath: opts.path,
          name: opts.name || ctx?.name,
          requirements: opts.requirements || ctx?.requirements,
          techStack: opts.stack ? opts.stack.split(',').map((s: string) => s.trim()) : ctx?.techStack,
          phases: opts.phases ? opts.phases.split(',').map((s: string) => s.trim()) : undefined,
          enableDebate: opts.debate !== false,
          enableSelfHealing: opts.selfHealing !== false,
          dryRun: opts.dryRun,
        });
      } catch (err: any) {
        console.error(`  ${colors.error('✗')} Build failed: ${err.message}`);
        process.exit(1);
      }
    });

  return cmd;
}
