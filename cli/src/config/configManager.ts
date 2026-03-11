import Conf from 'conf';
import chalk from 'chalk';
import { colors } from '../ui/display.js';

// ─────────────────────────────────────────────
// Config Schema
// ─────────────────────────────────────────────
export interface PoseidevConfig {
  apiKeys: {
    nvidiaKimi: string;
    nvidiaGlm5: string;
    nvidiaQwen: string;
    openai: string;
    anthropic: string;
    google: string;
    custom: { name: string; key: string; baseUrl: string }[];
  };
  activeModel: string;
  experienceLevel: 'beginner' | 'intermediate' | 'expert';
  theme: 'dark' | 'light' | 'cosmic' | 'hacker';
  editor: string;
  autoSave: boolean;
  maxTokens: number;
  temperature: number;
  streamResponses: boolean;
  showTokenUsage: boolean;
  maxConversationHistory: number;
  autoBuild: {
    enableDebateMode: boolean;
    enableSelfHealing: boolean;
    maxRetries: number;
    defaultPhases: string[];
  };
  agents: {
    enableMultiAgent: boolean;
    defaultAgents: string[];
    debateRounds: number;
  };
  codeAnalysis: {
    autoScan: boolean;
    securityLevel: 'basic' | 'standard' | 'strict';
    enableCostTracking: boolean;
  };
  display: {
    showBanner: boolean;
    compactMode: boolean;
    syntaxHighlighting: boolean;
    maxCodeLines: number;
  };
  telemetry: boolean;
}

const defaults: PoseidevConfig = {
  apiKeys: {
    nvidiaKimi: '',
    nvidiaGlm5: '',
    nvidiaQwen: '',
    openai: '',
    anthropic: '',
    google: '',
    custom: [],
  },
  activeModel: 'moonshotai/kimi-k2-instruct',
  experienceLevel: 'intermediate',
  theme: 'cosmic',
  editor: process.env.EDITOR || 'code',
  autoSave: true,
  maxTokens: 4096,
  temperature: 0.7,
  streamResponses: true,
  showTokenUsage: true,
  maxConversationHistory: 50,
  autoBuild: {
    enableDebateMode: true,
    enableSelfHealing: true,
    maxRetries: 3,
    defaultPhases: ['architecture', 'schema', 'backend', 'frontend', 'integration', 'polish'],
  },
  agents: {
    enableMultiAgent: true,
    defaultAgents: ['architect', 'coder', 'designer', 'security', 'tester', 'integrator'],
    debateRounds: 2,
  },
  codeAnalysis: {
    autoScan: true,
    securityLevel: 'standard',
    enableCostTracking: true,
  },
  display: {
    showBanner: true,
    compactMode: false,
    syntaxHighlighting: true,
    maxCodeLines: 100,
  },
  telemetry: false,
};

let configInstance: Conf<PoseidevConfig> | null = null;

export function getConfig(): Conf<PoseidevConfig> {
  if (!configInstance) {
    configInstance = new Conf<PoseidevConfig>({
      projectName: 'poseidev',
      defaults,
      schema: {
        activeModel: { type: 'string' },
        experienceLevel: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'expert'],
        },
        theme: {
          type: 'string',
          enum: ['dark', 'light', 'cosmic', 'hacker'],
        },
        maxTokens: { type: 'number', minimum: 256, maximum: 32768 },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
      } as any,
    });
  }
  return configInstance;
}

// ─────────────────────────────────────────────
// API Key helpers
// ─────────────────────────────────────────────
const KEY_MAP: Record<string, string> = {
  'nvidia-kimi': 'apiKeys.nvidiaKimi',
  'nvidia-glm5': 'apiKeys.nvidiaGlm5',
  'nvidia-qwen': 'apiKeys.nvidiaQwen',
  'openai': 'apiKeys.openai',
  'anthropic': 'apiKeys.anthropic',
  'google': 'apiKeys.google',
};

export function setApiKey(provider: string, key: string): void {
  const config = getConfig();
  const path = KEY_MAP[provider.toLowerCase()];
  if (!path) {
    throw new Error(`Unknown provider: ${provider}. Use: ${Object.keys(KEY_MAP).join(', ')}`);
  }
  config.set(path as any, key);
}

export function getApiKey(provider: string): string {
  const config = getConfig();
  const path = KEY_MAP[provider.toLowerCase()];
  if (!path) return '';
  return (config.get as any)(path) || '';
}

export function listApiKeys(): { provider: string; configured: boolean; masked: string }[] {
  const config = getConfig();
  return Object.entries(KEY_MAP).map(([provider, path]) => {
    const key = (config.get as any)(path) || '';
    return {
      provider,
      configured: key.length > 0,
      masked: key ? key.slice(0, 8) + '...' + key.slice(-4) : chalk.gray('not set'),
    };
  });
}

export function getAvailableProviders(): string[] {
  return Object.entries(KEY_MAP)
    .filter(([, path]) => {
      const config = getConfig();
      return ((config.get as any)(path) || '').length > 0;
    })
    .map(([provider]) => provider);
}

// ─────────────────────────────────────────────
// Custom Provider Management
// ─────────────────────────────────────────────
export function addCustomProvider(name: string, key: string, baseUrl: string): void {
  const config = getConfig();
  const custom = config.get('apiKeys.custom') || [];
  const existing = custom.findIndex((c: any) => c.name === name);
  if (existing >= 0) {
    custom[existing] = { name, key, baseUrl };
  } else {
    custom.push({ name, key, baseUrl });
  }
  config.set('apiKeys.custom', custom);
}

export function removeCustomProvider(name: string): void {
  const config = getConfig();
  const custom = config.get('apiKeys.custom') || [];
  config.set('apiKeys.custom', custom.filter((c: any) => c.name !== name));
}

export function getConfigPath(): string {
  return getConfig().path;
}
