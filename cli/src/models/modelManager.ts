import OpenAI from 'openai';
import { getConfig, getApiKey } from '../config/configManager.js';
import { colors, createSpinner } from '../ui/display.js';

// ─────────────────────────────────────────────
// Model Definitions
// ─────────────────────────────────────────────
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKeyId: string;
  baseUrl: string;
  maxTokens: number;
  description: string;
  strengths: string[];
  costPer1kTokens: number;
  speed: 'fast' | 'medium' | 'slow';
}

export const MODELS: Record<string, ModelConfig> = {
  'moonshotai/kimi-k2-instruct': {
    id: 'moonshotai/kimi-k2-instruct',
    name: 'Kimi K2 Instruct',
    provider: 'NVIDIA NIM',
    apiKeyId: 'nvidia-kimi',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    maxTokens: 16384,
    description: 'Best for agentic coding and complex tasks',
    strengths: ['coding', 'agentic', 'multi-step reasoning'],
    costPer1kTokens: 0,
    speed: 'fast',
  },
  'qwen/qwen3.5-397b-a17b': {
    id: 'qwen/qwen3.5-397b-a17b',
    name: 'Qwen 3.5 397B',
    provider: 'NVIDIA NIM',
    apiKeyId: 'nvidia-qwen',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    maxTokens: 16384,
    description: 'Massive MoE model for deep understanding',
    strengths: ['understanding', 'large context', 'generalist'],
    costPer1kTokens: 0,
    speed: 'medium',
  },
  'meta/llama-3.3-70b-instruct': {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'GLM 5.1',
    provider: 'NVIDIA NIM',
    apiKeyId: 'nvidia-glm5',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    maxTokens: 16384,
    description: 'Refined reasoning, sharper instruction-following, tighter code synthesis',
    strengths: ['coding', 'reasoning', 'instruction-following'],
    costPer1kTokens: 0,
    speed: 'fast',
  },
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    apiKeyId: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    maxTokens: 8192,
    description: 'DeepSeek flagship — frontier reasoning, deep code generation, long context',
    strengths: ['coding', 'reasoning', 'long-context'],
    costPer1kTokens: 0.0014,
    speed: 'fast',
  },
};

// Fallback priority order
const FALLBACK_CHAIN: string[] = [
  'moonshotai/kimi-k2-instruct',
  'qwen/qwen3.5-397b-a17b',
  'meta/llama-3.3-70b-instruct',
  'deepseek-chat',
];

// ─────────────────────────────────────────────
// Client Factory
// ─────────────────────────────────────────────
export function getClient(modelId: string): OpenAI {
  const model = MODELS[modelId];
  if (!model) {
    // Check custom providers
    const config = getConfig();
    const custom = config.get('apiKeys.custom') || [];
    const customProvider = custom.find((c: any) => c.name === modelId);
    if (customProvider) {
      return new OpenAI({ apiKey: customProvider.key, baseURL: customProvider.baseUrl });
    }
    throw new Error(`Unknown model: ${modelId}`);
  }

  const apiKey = getApiKey(model.apiKeyId);
  if (!apiKey) {
    throw new Error(`API key not configured for ${model.provider}. Run: poseidev config set-key ${model.apiKeyId} YOUR_KEY`);
  }

  return new OpenAI({ apiKey, baseURL: model.baseUrl });
}

// ─────────────────────────────────────────────
// Fallback Chain Call (ported from apiClients.ts)
// ─────────────────────────────────────────────
export async function callWithFallback(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: {
    temperature?: number;
    maxTokens?: number;
    preferredModel?: string;
    showProgress?: boolean;
  } = {}
): Promise<{ content: string; model: string; tokens: number }> {
  const { temperature = 0.7, maxTokens = 4096, preferredModel, showProgress = false } = options;

  // Build chain: preferred model first, then fallback order
  const chain = preferredModel
    ? [preferredModel, ...FALLBACK_CHAIN.filter(m => m !== preferredModel)]
    : [...FALLBACK_CHAIN];

  // Filter to only configured models
  const configuredChain = chain.filter(modelId => {
    const model = MODELS[modelId];
    if (!model) return false;
    const key = getApiKey(model.apiKeyId);
    return key.length > 0;
  });

  if (configuredChain.length === 0) {
    throw new Error(
      'No API keys configured! Run one of:\n' +
      '  poseidev config set-key nvidia-kimi YOUR_KEY\n' +
      '  poseidev config set-key deepseek YOUR_KEY'
    );
  }

  const spinner = showProgress ? createSpinner('Connecting to AI...') : null;
  spinner?.start();

  let lastError = '';

  for (const modelId of configuredChain) {
    try {
      const client = getClient(modelId);
      const modelConfig = MODELS[modelId];

      spinner?.start();
      if (spinner) spinner.text = `${colors.muted('Using')} ${colors.primary(modelConfig?.name || modelId)}...`;

      const response = await Promise.race([
        client.chat.completions.create({
          model: modelId,
          messages: messages as any,
          temperature,
          max_tokens: Math.min(maxTokens, modelConfig?.maxTokens || 4096),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 90s')), 90000)
        ),
      ]);

      const content = response?.choices?.[0]?.message?.content ?? '';
      const tokens = response?.usage?.total_tokens || 0;

      if (content && content.trim().length > 1) {
        spinner?.succeed(`${colors.success('✓')} Response from ${colors.primary(modelConfig?.name || modelId)} (${tokens} tokens)`);
        return { content, model: modelId, tokens };
      }

      lastError = 'Response too short';
      spinner?.warn(`${modelConfig?.name || modelId} returned insufficient content`);
    } catch (err: any) {
      lastError = err.message || 'Unknown error';

      if (lastError.includes('429') || lastError.includes('rate limit')) {
        spinner?.warn(`Rate limit on ${modelId}, trying next...`);
        continue;
      }
      if (lastError.includes('401') || lastError.includes('403') || lastError.includes('Unauthorized')) {
        spinner?.warn(`Auth failed for ${modelId}, trying next...`);
        continue;
      }
      if (lastError.includes('404') || lastError.includes('page not found')) {
        spinner?.warn(`Model ${modelId} not available (404), trying next...`);
        continue;
      }
      if (lastError.includes('timeout') || lastError.includes('Timeout')) {
        spinner?.warn(`Timeout on ${modelId}, trying next...`);
        continue;
      }

      continue;
    }
  }

  spinner?.fail('All models failed');
  throw new Error(`All AI models failed. Last error: ${lastError}`);
}

// ─────────────────────────────────────────────
// Stream Call (for interactive chat)
// ─────────────────────────────────────────────
export async function* streamCall(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number; modelId?: string } = {}
): AsyncGenerator<string, void, unknown> {
  const config = getConfig();
  const modelId = options.modelId || config.get('activeModel');
  const client = getClient(modelId);

  const stream = await client.chat.completions.create({
    model: modelId,
    messages: messages as any,
    temperature: options.temperature || config.get('temperature'),
    max_tokens: options.maxTokens || config.get('maxTokens'),
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

// ─────────────────────────────────────────────
// Model Info Helpers
// ─────────────────────────────────────────────
export function getActiveModel(): ModelConfig | undefined {
  const config = getConfig();
  const activeId = config.get('activeModel');
  return MODELS[activeId];
}

export function getAvailableModels(): (ModelConfig & { available: boolean })[] {
  return Object.values(MODELS).map(model => ({
    ...model,
    available: getApiKey(model.apiKeyId).length > 0,
  }));
}

export function setActiveModel(modelId: string): void {
  if (!MODELS[modelId]) {
    throw new Error(`Unknown model: ${modelId}. Available: ${Object.keys(MODELS).join(', ')}`);
  }
  const config = getConfig();
  config.set('activeModel', modelId);
}
