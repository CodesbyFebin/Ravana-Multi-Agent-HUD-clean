import type { TaskComplexity, RoutingDecision, ModelMetadata } from './types.ts';

export const INITIAL_MODEL_POOL: ModelMetadata[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google',
    role: 'General tasks and grounding',
    isFreeTier: false,
    costPer1k: 0,
    latencyMs: 0,
    tokensUsedToday: 0,
    status: 'offline',
    contextWindow: '1M tokens',
    capabilities: ['search_grounding', 'maps_grounding', 'fast_multimodal'],
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'Google',
    role: 'Complex reasoning',
    isFreeTier: false,
    costPer1k: 0,
    latencyMs: 0,
    tokensUsedToday: 0,
    status: 'offline',
    contextWindow: '1M tokens',
    capabilities: ['high_thinking', 'complex_math', 'code_synthesis'],
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    provider: 'Google',
    role: 'Fast classification and extraction',
    isFreeTier: false,
    costPer1k: 0,
    latencyMs: 0,
    tokensUsedToday: 0,
    status: 'offline',
    contextWindow: '1M tokens',
    capabilities: ['ultra_fast', 'classification', 'extraction'],
  },
];

export function classifyTaskComplexity(prompt: string): TaskComplexity {
  const p = prompt.toLowerCase();
  
  // Destructive / Action verbs
  if (
    p.includes('deploy') || 
    p.includes('execute trade') || 
    p.includes('buy ') || 
    p.includes('sell ') ||
    p.includes('delete') || 
    p.includes('drop database') ||
    p.includes('rm -rf') ||
    p.includes('shell') ||
    p.includes('restart server')
  ) {
    return 'Agentic';
  }

  // Coding tasks
  if (
    p.includes('code') || 
    p.includes('refactor') || 
    p.includes('bug') || 
    p.includes('function') || 
    p.includes('component') ||
    p.includes('pr ') || 
    p.includes('pull request') || 
    p.includes('typescript') || 
    p.includes('python') ||
    p.includes('git')
  ) {
    return 'Coding';
  }

  // Heavy reasoning or deep analysis
  if (
    p.includes('architecture') || 
    p.includes('strategy') || 
    p.includes('compare') || 
    p.includes('debate') || 
    p.includes('critique') || 
    p.includes('deep research') || 
    p.includes('forecast') ||
    p.length > 300
  ) {
    return 'Heavy';
  }

  // Trivial tasks: single calculation, time, greeting, ping
  if (
    p.includes('hello') || 
    p.includes('hey bro') || 
    p.includes('ping') || 
    p.includes('time') || 
    p.includes('calculate') ||
    p.length < 30
  ) {
    return 'Trivial';
  }

  if (p.includes('summarize') || p.includes('explain') || p.includes('what is') || p.includes('search')) {
    return 'Small';
  }

  return 'Medium';
}

export function requiresAdversarialApproval(prompt: string): boolean {
  const p = prompt.toLowerCase();
  const destructiveTriggers = [
    'deploy',
    'trade',
    'buy',
    'sell',
    'delete',
    'purge',
    'send email',
    'post to x',
    'post to linkedin',
    'shell exec',
    'rollback',
    'modify schema',
    'transfer'
  ];
  return destructiveTriggers.some(trigger => p.includes(trigger));
}

export function routeTaskToModel(
  prompt: string, 
  forceFreeMode: boolean = false, 
  availableModels: ModelMetadata[] = INITIAL_MODEL_POOL
): RoutingDecision {
  const complexity = classifyTaskComplexity(prompt);
  const requiresReview = requiresAdversarialApproval(prompt);
  const taskId = 'task_' + Math.random().toString(36).substring(2, 9);
  
  const selectedModel = forceFreeMode
    ? 'gemini-3.1-flash-lite'
    : complexity === 'Trivial'
      ? 'gemini-3.1-flash-lite'
      : complexity === 'Heavy' || complexity === 'Coding' || complexity === 'Agentic'
        ? 'gemini-4-argon'
        : 'gemini-3.8-flash';
  const fallbacks = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-4-argon']
    .filter((id) => id !== selectedModel);
  const reasoning = forceFreeMode
    ? 'Flash-Lite selected by the user; Gemini billing tier depends on the configured API key.'
    : 'Routed among the Gemini models supported by the current backend.';

  // Cost estimate based on expected tokens
  const estimatedTokens = complexity === 'Trivial' ? 50 : complexity === 'Small' ? 300 : complexity === 'Medium' ? 1200 : 3500;
  const modelMeta = availableModels.find(m => m.id === selectedModel);
  const cost = ((modelMeta?.costPer1k ?? 0) / 1000) * estimatedTokens;

  return {
    taskId,
    complexity,
    selectedModel,
    fallbackModels: fallbacks,
    requiresAdversarialReview: requiresReview,
    estimatedCostUsd: Number(cost.toFixed(5)),
    reasoning,
    isFreeTierEligible: modelMeta?.isFreeTier ?? false,
    timestamp: Date.now()
  };
}
