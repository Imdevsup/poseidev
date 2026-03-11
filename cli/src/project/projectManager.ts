import fs from 'fs';
import path from 'path';
import os from 'os';
import { colors, createSpinner } from '../ui/display.js';

export interface ProjectConfig {
  name: string;
  description: string;
  techStack: string[];
  requirements: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'paused' | 'completed';
  autoBuild: {
    lastRun?: number;
    phases: string[];
    debateMode: boolean;
  };
  agents: {
    enabled: string[];
  };
  analysis: {
    lastScan?: number;
    healthScore?: number;
  };
}

export interface ProjectContext {
  name: string;
  description: string;
  techStack: string[];
  requirements: string;
  fileCount: number;
  files: string[];
  projectPath: string;
}

const PROJECT_FILE = '.poseidev/project.json';
const PROJECTS_INDEX = path.join(os.homedir(), '.poseidev', 'projects.json');

// ─────────────────────────────────────────────
// Project Context (reads current directory)
// ─────────────────────────────────────────────
export function getProjectContext(projectPath?: string): ProjectContext | null {
  const dir = projectPath || process.cwd();
  const configPath = path.join(dir, PROJECT_FILE);

  if (!fs.existsSync(configPath)) {
    // Try to infer project from package.json
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const files = scanProjectFiles(dir);
        return {
          name: pkg.name || path.basename(dir),
          description: pkg.description || '',
          techStack: inferTechStack(dir),
          requirements: '',
          fileCount: files.length,
          files,
          projectPath: dir,
        };
      } catch { /* ignore */ }
    }
    return null;
  }

  try {
    const config: ProjectConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const files = scanProjectFiles(dir);
    return {
      name: config.name,
      description: config.description,
      techStack: config.techStack,
      requirements: config.requirements,
      fileCount: files.length,
      files,
      projectPath: dir,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Initialize a new project
// ─────────────────────────────────────────────
export async function initProject(opts: {
  name: string;
  description: string;
  techStack: string[];
  requirements: string;
  projectPath?: string;
}): Promise<string> {
  const dir = opts.projectPath || process.cwd();
  const configDir = path.join(dir, '.poseidev');
  const configPath = path.join(configDir, 'project.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config: ProjectConfig = {
    name: opts.name,
    description: opts.description,
    techStack: opts.techStack,
    requirements: opts.requirements,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
    autoBuild: {
      phases: ['architecture', 'schema', 'backend', 'frontend', 'integration', 'polish'],
      debateMode: true,
    },
    agents: {
      enabled: ['architect', 'coder', 'designer', 'security', 'tester', 'integrator'],
    },
    analysis: {},
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Create supporting dirs
  const dirs = [
    path.join(configDir, 'conversations'),
    path.join(configDir, 'builds'),
    path.join(configDir, 'analysis'),
    path.join(configDir, 'agents'),
    path.join(configDir, 'history'),
  ];
  dirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // Add to global project index
  addToProjectIndex(opts.name, dir);

  // Add .poseidev/ to .gitignore if present
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.poseidev/')) {
      fs.appendFileSync(gitignorePath, '\n# Poseidev CLI\n.poseidev/\n');
    }
  }

  return configPath;
}

// ─────────────────────────────────────────────
// Project Index (global list of all projects)
// ─────────────────────────────────────────────
function addToProjectIndex(name: string, projectPath: string): void {
  const dir = path.dirname(PROJECTS_INDEX);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let index: { name: string; path: string; lastAccessed: number }[] = [];
  if (fs.existsSync(PROJECTS_INDEX)) {
    try {
      index = JSON.parse(fs.readFileSync(PROJECTS_INDEX, 'utf-8'));
    } catch { /* empty */ }
  }

  const existing = index.findIndex(p => p.path === projectPath);
  if (existing >= 0) {
    index[existing] = { name, path: projectPath, lastAccessed: Date.now() };
  } else {
    index.push({ name, path: projectPath, lastAccessed: Date.now() });
  }

  fs.writeFileSync(PROJECTS_INDEX, JSON.stringify(index, null, 2));
}

export function listProjects(): { name: string; path: string; lastAccessed: number }[] {
  if (!fs.existsSync(PROJECTS_INDEX)) return [];
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_INDEX, 'utf-8'));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// File Scanning
// ─────────────────────────────────────────────
export function scanProjectFiles(dir: string, maxDepth: number = 5): string[] {
  const files: string[] = [];
  const ignorePatterns = [
    'node_modules', '.git', '.poseidev', 'dist', 'build', '.next',
    '__pycache__', '.venv', 'venv', '.env', 'coverage', '.cache',
  ];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (ignorePatterns.some(p => entry.name === p || entry.name.startsWith('.'))) continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else {
          files.push(path.relative(dir, fullPath));
        }
      }
    } catch { /* permission error */ }
  }

  walk(dir, 0);
  return files;
}

// ─────────────────────────────────────────────
// Tech Stack Inference
// ─────────────────────────────────────────────
export function inferTechStack(dir: string): string[] {
  const stack: string[] = [];

  const checks: [string, string][] = [
    ['package.json', 'Node.js'],
    ['tsconfig.json', 'TypeScript'],
    ['requirements.txt', 'Python'],
    ['Cargo.toml', 'Rust'],
    ['go.mod', 'Go'],
    ['pom.xml', 'Java'],
    ['Gemfile', 'Ruby'],
    ['composer.json', 'PHP'],
    ['pubspec.yaml', 'Flutter/Dart'],
    ['Dockerfile', 'Docker'],
    ['docker-compose.yml', 'Docker Compose'],
    ['next.config.js', 'Next.js'],
    ['next.config.mjs', 'Next.js'],
    ['vite.config.ts', 'Vite'],
    ['tailwind.config.js', 'Tailwind CSS'],
    ['tailwind.config.ts', 'Tailwind CSS'],
    ['.eslintrc.js', 'ESLint'],
    ['prisma/schema.prisma', 'Prisma'],
    ['convex', 'Convex'],
  ];

  checks.forEach(([file, tech]) => {
    if (fs.existsSync(path.join(dir, file))) {
      stack.push(tech);
    }
  });

  // Check package.json for frameworks
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps.react) stack.push('React');
      if (allDeps.vue) stack.push('Vue');
      if (allDeps.angular) stack.push('Angular');
      if (allDeps.svelte) stack.push('Svelte');
      if (allDeps.express) stack.push('Express');
      if (allDeps.fastify) stack.push('Fastify');
      if (allDeps.prisma) stack.push('Prisma');
      if (allDeps.mongoose) stack.push('MongoDB');
      if (allDeps['@supabase/supabase-js']) stack.push('Supabase');
      if (allDeps.firebase) stack.push('Firebase');
    } catch { /* ignore */ }
  }

  return [...new Set(stack)];
}

// ─────────────────────────────────────────────
// Read file content for AI context
// ─────────────────────────────────────────────
export function readProjectFilesForContext(dir: string, maxFiles: number = 20, maxSizeKB: number = 50): string {
  const files = scanProjectFiles(dir);
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.rb', '.css', '.html', '.json', '.md'];

  const relevant = files
    .filter(f => codeExts.some(ext => f.endsWith(ext)))
    .slice(0, maxFiles);

  let context = '';
  let totalSize = 0;

  for (const file of relevant) {
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > maxSizeKB * 1024) continue;
      if (totalSize + stat.size > maxSizeKB * 1024 * 5) break; // 250KB total cap

      const content = fs.readFileSync(fullPath, 'utf-8');
      context += `\n--- ${file} ---\n${content}\n`;
      totalSize += stat.size;
    } catch { /* skip */ }
  }

  return context;
}
