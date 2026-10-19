import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';
import os from 'os';
import { statfsSync } from 'node:fs';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { classifyTaskComplexity, routeTaskToModel, requiresAdversarialApproval, INITIAL_MODEL_POOL } from './src/lib/router.ts';
import { evaluateAdversarialVerdict } from './src/lib/adversarial.ts';
import { AgentExecutionHarness, type ToolExecutionStep } from './src/server/harness.ts';
import { MemoryEvolutionEngine } from './src/server/memoryEvolution.ts';
import { WorkspaceStore } from './src/server/workspaceStore.ts';
import type { ReviewerCritique, SystemTelemetry, ModelMetadata, WebSocketClientEvent, WebSocketServerEvent, AgentId, AgentStatus, AdversarialReview } from './src/lib/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const isLoopbackHost = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const DATA_DIR = path.resolve(process.env.RAVANA_DATA_DIR || path.join(process.cwd(), '.ravana-data'));
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
]);

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (!allowedOrigins.has(origin)) return res.status(403).json({ error: 'Origin not allowed' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    return res.status(204).end();
  }
  next();
});

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'ravana-hud',
        },
      },
    })
  : null;

// State management on server
let isSystemFrozen = false;
let modelPool: ModelMetadata[] = INITIAL_MODEL_POOL.map((model) => ({ ...model, status: 'offline', latencyMs: 0, tokensUsedToday: 0 }));
let cumulativeTokensToday = 0;
let estimatedCostToday = 0;
const harness = new AgentExecutionHarness({
  dataDir: DATA_DIR,
  executionEnabled: isLoopbackHost && process.env.RAVANA_ENABLE_APPROVED_EXECUTION === 'true',
});
const pendingReviews = new Map<string, AdversarialReview>();
const memoryEvolution = new MemoryEvolutionEngine(DATA_DIR);
const workspaceStore = new WorkspaceStore(DATA_DIR);

function rememberReview(review: AdversarialReview): AdversarialReview {
  const now = Date.now();
  for (const [id, candidate] of pendingReviews) {
    if (now - candidate.timestamp > 15 * 60_000) pendingReviews.delete(id);
  }
  review.id = `rev_${randomUUID()}`;
  if (review.status === 'pending' && !review.hallucinationDetected) {
    if (pendingReviews.size >= 1000) pendingReviews.delete(pendingReviews.keys().next().value!);
    pendingReviews.set(review.id, review);
  }
  return review;
}

function broadcastToolSteps(steps: ToolExecutionStep[]): void {
  for (const step of steps) {
    broadcast({ type: 'thought_step', text: `[TOOL:${step.toolName}] ${step.status} in ${step.durationMs}ms`, highlight: step.toolName, timestamp: step.timestamp });
    broadcast({ type: 'terminal_line', lineType: step.status === 'success' ? 'output' : step.status === 'error' ? 'error' : 'warn', text: `[${step.toolName}] ${step.output.slice(0, 180)}` });
  }
}

// Realtime WebSocket & HUD Event Bus
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/live', maxPayload: 32 * 1024 });

const clients = new Set<WebSocket>();

function getClawBotsSnapshot() {
  return {
    type: 'claw_bots_sync',
    mode: 'PAPER' as const,
    execution: 'disabled' as const,
    profiles: [
      { id: '@claw/alpha', strategy: 'Trend momentum', status: 'idle — not configured' },
      { id: '@claw/beta', strategy: 'Volatility scanner', status: 'idle — not configured' },
      { id: '@claw/gamma', strategy: 'Risk monitor', status: 'idle — not configured' },
    ],
    portfolio: harness.getPortfolio(),
    timestamp: Date.now(),
  };
}



function broadcast(event: WebSocketServerEvent | Record<string, unknown>) {
  const json = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// Compute real-time server telemetry
function getRealTelemetry(): SystemTelemetry {
  const mem = process.memoryUsage();
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

  // CPU load average over 1 min or process CPU usage
  const cpus = os.cpus();
  const loadAvg = os.loadavg()[0];
  const cpuPct = Math.min(100, Math.max(0, Math.round((loadAvg / Math.max(1, cpus.length)) * 100)));
  let diskPct = 0;
  try {
    const disk = statfsSync(process.cwd());
    diskPct = Math.round(((disk.blocks - disk.bfree) / Math.max(1, disk.blocks)) * 100);
  } catch {
    diskPct = 0;
  }

  return {
    cpuUsage: cpuPct,
    ramUsage: ramPct,
    diskUsage: diskPct,
    networkSpeedMbps: 0,
    latencyMs: 0,
    heapUsageMb: heapMb,
    uptimeSec: Math.floor(process.uptime()),
    costTodayUsd: Number(estimatedCostToday.toFixed(3)),
    tokensPerHour: 0,
    activeClients: clients.size,
    circuitStatus: isSystemFrozen ? 'OPEN' : 'CLOSED',
    timestamp: Date.now(),
  };
}

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  clients.add(ws);

  // Send initial handshake with real telemetry and live model status
  const initialTelemetry = getRealTelemetry();
  ws.send(
    JSON.stringify({
      type: 'system_connected',
      message: 'RAVANA Neural Core Linked — Real-Time WebSocket Channel Active',
      timestamp: Date.now(),
      telemetry: initialTelemetry,
    })
  );

  ws.send(
    JSON.stringify({
      type: 'model_status',
      models: modelPool,
    })
  );

  ws.send(
    JSON.stringify({
      type: 'freeze_state',
      frozen: isSystemFrozen,
    })
  );
  ws.send(JSON.stringify(getClawBotsSnapshot()));

  ws.on('message', async (messageData) => {
    try {
      const parsed: WebSocketClientEvent = JSON.parse(messageData.toString());

      if (parsed.type === 'voice_amplitude') {
        broadcast({
          type: 'voice_amplitude',
          amplitude: parsed.amplitude || 0.1,
          state: parsed.state || 'listening',
        });
      } else if (parsed.type === 'voice_state') {
        broadcast({
          type: 'voice_state',
          state: parsed.state,
        });
      } else if (parsed.type === 'barge_in') {
        broadcast({
          type: 'barge_in',
          message: 'Barge-in detected: agent paused and listening',
        });
        broadcast({
          type: 'voice_state',
          state: 'listening',
        });
      } else if (parsed.type === 'freeze') {
        isSystemFrozen = parsed.frozen;
        broadcast({
          type: 'freeze_state',
          frozen: isSystemFrozen,
        });
        broadcast({
          type: 'terminal_line',
          lineType: isSystemFrozen ? 'warn' : 'success',
          text: isSystemFrozen
            ? '⊘ EMERGENCY KILL SWITCH ENGAGED: All autonomous agent routines frozen.'
            : '✓ RESUMED: Queen orchestrator back online. All systems nominal.',
        });
      } else if (parsed.type === 'user_command') {
        handleUserCommandWebSocket(parsed.prompt, parsed.agentId || 'queen', parsed.options || {});
      } else if (parsed.type === 'approval_decision') {
        if ((parsed.decision !== 'approved' && parsed.decision !== 'rejected') || typeof parsed.reviewId !== 'string') return;
        const review = pendingReviews.get(parsed.reviewId);
        if (!review || review.status !== 'pending' || review.hallucinationDetected || Date.now() - review.timestamp > 15 * 60_000) {
          broadcast({ type: 'terminal_line', lineType: 'error', text: '[ADVERSARIAL REVIEW] Unknown, expired, or blocked review; no action executed.' });
          return;
        }
        pendingReviews.delete(review.id); // Consume before any action to prevent replay.
        review.status = parsed.decision;
        review.userDecision = parsed.decision;
        review.userDecisionTime = Date.now();
        const receipt = harness.recordDecision(review, parsed.decision);
        review.receiptHash = receipt.hash;
        const executionStep = parsed.decision === 'approved' ? await harness.executeApprovedAction(review) : undefined;
        if (executionStep) {
          broadcast({ type: 'terminal_line', lineType: executionStep.status === 'success' ? 'success' : executionStep.status === 'error' ? 'error' : 'warn', text: `[TOOL:${executionStep.toolName}] ${executionStep.output.slice(0, 500)}` });
        }
        broadcast({ type: 'approval_decision', reviewId: review.id, decision: parsed.decision, receipt, executionStep });
      } else if (parsed.type === 'task_update') {
        broadcast({
          type: 'terminal_line',
          lineType: 'output',
          text: `[TASK SCHEDULER] Task ${parsed.taskId} state changed to: ${parsed.status.toUpperCase()}`,
        });
      }
    } catch (err: any) {
      console.warn('Malformed WebSocket message:', err.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Real-time user command execution pipeline over WebSocket
async function handleUserCommandWebSocket(
  prompt: string,
  agentId: AgentId = 'queen',
  options: Record<string, unknown> = {}
) {
  if (isSystemFrozen) {
    broadcast({
      type: 'terminal_line',
      lineType: 'warn',
      text: 'Command blocked: System is currently FROZEN via emergency kill switch.',
    });
    return;
  }

  // Step 1: Emit Thought Stream steps
  broadcast({
    type: 'thought_step',
    text: `Wake word acknowledged → Processing command: "${prompt.slice(0, 50)}..."`,
    highlight: prompt.slice(0, 30),
    timestamp: Date.now(),
  });

  broadcast({
    type: 'terminal_line',
    lineType: 'cmd',
    text: prompt,
  });

  // Step 2: Route task
  const routing = routeTaskToModel(prompt, (options.forceFreeMode as boolean) || false, modelPool);
  
  broadcast({
    type: 'thought_step',
    text: `Classified task complexity: ${routing.complexity} → Routing to ${routing.selectedModel}`,
    highlight: routing.selectedModel,
    timestamp: Date.now(),
  });

  broadcast({
    type: 'agent_status',
    agentId,
    status: 'thinking',
    currentTask: prompt.slice(0, 60),
  });

  // Step 3: Check if Adversarial Review is required
  if (routing.requiresAdversarialReview) {
    broadcast({
      type: 'thought_step',
      text: 'Structured risk review requested from the configured Gemini model.',
      highlight: 'Adversarial Review',
      timestamp: Date.now(),
    });

    broadcast({
      type: 'agent_status',
      agentId,
      status: 'debating',
      currentTask: `Adversarial debate: ${prompt.slice(0, 40)}`,
    });

    broadcast({
      type: 'terminal_line',
      lineType: 'error',
      text: '[APPROVAL GATE] Risky commands must use the server review endpoint; WebSocket execution is blocked.',
    });
    return;
  }

  // Step 4: Gather read-only, bounded tool observations before model execution.
  const toolSteps = await harness.gatherGroundedToolTelemetry(prompt, agentId);
  broadcastToolSteps(toolSteps);
  const toolContext = toolSteps.map((step) => `[Tool ${step.toolName} / ${step.status}] ${step.output}`).join('\n');

  // Standard model execution.
  try {
    let responseText = '';
    const chosenModel = options.useArgonThinking ? 'gemini-4-argon' : routing.selectedModel;
    if (!ai) throw new Error('Gemini backend is not configured; command was not executed.');

    {
      const config: Record<string, unknown> = {
        systemInstruction: `You are RAVANA, an advanced cyberpunk AI command centre orchestrator. You speak with high confidence, surgical precision, and authority. The active specialist is ${agentId.toUpperCase()}. Never hallucinate sources.`,
      };

      if (chosenModel.includes('argon')) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      if (options.useSearchGrounding) {
        config.tools = [{ googleSearch: {} }];
      } else if (options.useMapsGrounding) {
        config.tools = [{ googleMaps: {} }];
      }

      const modelStartedAt = Date.now();
      const res = await ai.models.generateContent({
        model: chosenModel.includes('argon') ? 'gemini-4-argon' : chosenModel.includes('flash-lite') ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash',
        contents: `${prompt}\n\n[Read-only server observations]\n${toolContext}`,
        config,
      });

      responseText = res.text || 'The model returned no text.';

      // Record provider-reported usage and measured request latency only.
      const usedTokens = Number(res.usageMetadata?.totalTokenCount || 0);
      cumulativeTokensToday += usedTokens;
      modelPool = modelPool.map((m) => m.id === chosenModel
        ? { ...m, status: 'online', tokensUsedToday: m.tokensUsedToday + usedTokens, latencyMs: Date.now() - modelStartedAt }
        : m
      );

      broadcast({
        type: 'model_status',
        models: modelPool,
      });
    }

    broadcast({
      type: 'thought_step',
        text: `Response generated via ${chosenModel}; read-only observations included where available`,
        highlight: 'Response',
        timestamp: Date.now(),
      });

      broadcast({
        type: 'terminal_line',
        lineType: 'success',
        text: `[${agentId.toUpperCase()}] ${responseText.slice(0, 160)}${responseText.length > 160 ? '...' : ''}`,
      });

    broadcast({
      type: 'command_response',
      prompt,
      text: responseText,
      agentId,
      modelUsed: chosenModel,
    });

    broadcast({
      type: 'agent_status',
      agentId,
      status: 'acting',
      currentTask: 'Output delivery',
    });

    setTimeout(() => {
      broadcast({
        type: 'agent_status',
        agentId,
        status: 'idle',
        currentTask: 'Standing by',
      });
      broadcast({
        type: 'voice_state',
        state: 'idle',
      });
    }, 2500);
  } catch (err: any) {
    broadcast({
      type: 'terminal_line',
      lineType: 'error',
      text: `Execution error: ${err.message}`,
    });
    broadcast({
      type: 'agent_status',
      agentId,
      status: 'idle',
      currentTask: 'Idle',
    });
  }
}

// Broadcast measured host telemetry every three seconds.
const telemetryTimer = setInterval(() => {
  if (clients.size === 0) return;

  // 1. Broadcast real system telemetry
  const telemetry = getRealTelemetry();
  broadcast({
    type: 'telemetry_update',
    telemetry,
  });

  broadcast({ type: 'model_status', models: modelPool });
}, 3000);
telemetryTimer.unref();

const clawSnapshotTimer = setInterval(() => broadcast(getClawBotsSnapshot()), 8000);
clawSnapshotTimer.unref();

// REST Endpoints
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ONLINE',
    systemName: 'RAVANA Queen Command Engine',
    geminiConfigured: !!ai,
    uptimeSec: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    activeConnections: clients.size,
    timestamp: Date.now(),
  });
});

// File-backed workspace endpoints are for the single-process local backend.
// GitHub Pages remains a static client and does not provide shared persistence.
app.get('/api/tasks', (_req: Request, res: Response) => {
  res.json({ mode: 'local_file_store', tasks: workspaceStore.listTasks() });
});

app.post('/api/tasks', (req: Request, res: Response) => {
  try {
    const task = workspaceStore.createTask(req.body);
    broadcast({ type: 'tasks_sync', tasks: workspaceStore.listTasks() });
    res.status(201).json({ mode: 'local_file_store', task });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid task' });
  }
});

app.patch('/api/tasks/:taskId', (req: Request, res: Response) => {
  try {
    const task = workspaceStore.updateTaskStatus(req.params.taskId, req.body?.status);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    broadcast({ type: 'tasks_sync', tasks: workspaceStore.listTasks() });
    res.json({ mode: 'local_file_store', task });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid task update' });
  }
});

app.get('/api/memories', (_req: Request, res: Response) => {
  res.json({ mode: 'local_file_store', memories: workspaceStore.listMemories() });
});

app.post('/api/memories', (req: Request, res: Response) => {
  try {
    const memory = workspaceStore.createMemory(req.body);
    broadcast({ type: 'memories_sync', memories: workspaceStore.listMemories() });
    res.status(201).json({ mode: 'local_file_store', memory });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid memory' });
  }
});

let marketTickerCache: { timestamp: number; tickers: Array<Record<string, unknown>> } | null = null;

app.get('/api/market/tickers', async (_req: Request, res: Response) => {
  if (marketTickerCache && Date.now() - marketTickerCache.timestamp < 15_000) {
    return res.json({ source: 'Binance public ticker API', ...marketTickerCache });
  }
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
    const results = await Promise.all(symbols.map((symbol) => harness.runReadOnlyTool('market_ticker_probe', { symbol }, 'trader')));
    const tickers = results.filter((result) => result.status === 'success').map((result) => JSON.parse(result.output) as Record<string, unknown>);
    if (tickers.length === 0) return res.status(502).json({ error: 'Market data provider unavailable' });
    marketTickerCache = { timestamp: Date.now(), tickers };
    return res.json({ source: 'Binance public ticker API', ...marketTickerCache });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Market data provider unavailable' });
  }
});

app.get('/api/trading/claw-bots', (_req: Request, res: Response) => {
  res.json(getClawBotsSnapshot());
});

app.get('/api/memory/search', (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';
  const category = typeof req.query.category === 'string' && ['trade', 'server'].includes(req.query.category) ? req.query.category : '';
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : '';
  const memories = memoryEvolution.search(q, category, date);
  res.json({ query: q, categoryFilter: category || 'all', dateFilter: date || null, totalResults: memories.length, memories });
});

app.get('/api/portfolio', (_req: Request, res: Response) => {
  res.json(harness.getPortfolio());
});

app.get('/api/receipts', (_req: Request, res: Response) => {
  res.json({ integrity: harness.verifyLedger(), receipts: harness.getAuditReceipts() });
});

app.post('/api/chat', async (req: Request, res: Response) => {
  let requestedAgentId: AgentId = 'queen';
  try {
    const {
      prompt,
      agentId = 'queen',
      preferredModel,
      useSearchGrounding = false,
      useMapsGrounding = false,
      userLocation,
      forceFreeMode = false,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const safeAgentId: AgentId = ['queen', 'coder', 'pr_reviewer', 'devops', 'trader', 'social', 'researcher', 'scheduler', 'security', 'comms'].includes(agentId) ? agentId as AgentId : 'queen';
    requestedAgentId = safeAgentId;
    broadcast({ type: 'agent_status', agentId: safeAgentId, status: 'thinking', currentTask: prompt.slice(0, 80) });
    const routingDecision = routeTaskToModel(prompt, forceFreeMode, modelPool);
    const toolSteps = await harness.gatherGroundedToolTelemetry(prompt, safeAgentId);
    broadcastToolSteps(toolSteps);
    const toolContext = toolSteps.map((step) => `[Tool ${step.toolName} / ${step.status}] ${step.output}`).join('\n');
    const supportedModelIds = new Set(['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-flash-lite']);
    const modelToUse = typeof preferredModel === 'string' && supportedModelIds.has(preferredModel) ? preferredModel : routingDecision.selectedModel;
    const isAdversarialRequired = requiresAdversarialApproval(prompt);

    if (!ai) {
      broadcast({ type: 'agent_status', agentId: safeAgentId, status: 'idle', currentTask: 'Backend model not configured' });
      return res.status(503).json({ error: 'Gemini backend is not configured; command was not executed.' });
    }

    let geminiModel = 'gemini-3.8-flash';
    const config: Record<string, unknown> = {
      systemInstruction: `You are RAVANA, an advanced cyberpunk AI command centre orchestrator. You speak with high confidence, surgical precision, and authority. The current active specialist is ${safeAgentId.toUpperCase()}. Never hallucinate sources.`,
    };

    if (modelToUse.includes('argon')) {
      geminiModel = 'gemini-4-argon';
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (modelToUse.includes('flash-lite')) {
      geminiModel = 'gemini-3.1-flash-lite';
    } else {
      geminiModel = 'gemini-3.8-flash';
    }

    if (useSearchGrounding && !useMapsGrounding) {
      config.tools = [{ googleSearch: {} }];
    } else if (useMapsGrounding) {
      config.tools = [{ googleMaps: {} }];
      if (userLocation && userLocation.latitude && userLocation.longitude) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: Number(userLocation.latitude),
              longitude: Number(userLocation.longitude),
            },
          },
        };
      }
    }

    broadcast({
      type: 'thought_step',
      text: `Direct REST query dispatched to ${geminiModel}`,
      timestamp: Date.now(),
    });

    const modelRequestStartedAt = Date.now();
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: `${prompt}\n\n[Read-only server observations]\n${toolContext}`,
      config,
    });

    const usedTokens = Number(response.usageMetadata?.totalTokenCount || 0);
    cumulativeTokensToday += usedTokens;
    modelPool = modelPool.map((model) => model.id === modelToUse
      ? { ...model, status: 'online', latencyMs: Date.now() - modelRequestStartedAt, tokensUsedToday: model.tokensUsedToday + usedTokens }
      : model
    );
    broadcast({ type: 'model_status', models: modelPool });

    const text = response.text || 'Command processed without text output.';
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    broadcast({ type: 'agent_status', agentId: safeAgentId, status: 'acting', currentTask: 'Delivering model response' });
    setTimeout(() => broadcast({ type: 'agent_status', agentId: safeAgentId, status: 'idle', currentTask: 'Standing by' }), 2000);
    res.json({
      text,
      modelUsed: geminiModel,
      routing: routingDecision,
      requiresApproval: isAdversarialRequired,
      groundingChunks,
    });
  } catch (error: any) {
    broadcast({ type: 'agent_status', agentId: requestedAgentId, status: 'idle', currentTask: 'Request failed' });
    res.status(500).json({
      error: error.message || 'Error processing AI command',
    });
  }
});

app.post('/api/adversarial-review', async (req: Request, res: Response) => {
  try {
    const { actionTitle, actionType, details, agent = 'queen' } = req.body;
    if (!actionTitle) return res.status(400).json({ error: 'actionTitle is required' });
    if (!ai) return res.status(503).json({ error: 'Review service is not configured; approval fails closed.' });

    if (ai) {
      const debatePrompt = `You are the RAVANA Anti-Hallucination Firewall and Adversarial Review Council.
Analyze the following proposed action:
Action: ${actionTitle} (${actionType})
Details: ${details || 'Execution requested by user'}
Proposed by Agent: ${agent}

One Gemini model is evaluating the action from three structured perspectives. These perspectives are not independent model votes and must not be described as multi-model consensus:
1. Proponent (advocating for operational progress, CI/CD speed, execution feasibility)
2. Security & Risk Critic (advocating for defensive posture, failure blast radius, rollback safety)
3. Fact & Grounding Auditor (ruthlessly checking for hallucinated assumptions, unverified endpoints, or missing context)

Respond in JSON format conforming to this schema:
{
  "critiques": [
    {
      "modelId": "gemini-3.8-flash",
      "modelName": "Gemini (self-review: proponent)",
      "role": "proponent",
      "verdict": "FOR",
      "confidence": 88,
      "risks": ["string"],
      "hallucinationFlags": [],
      "arguments": ["string"],
      "evidence": ["string"]
    },
    {
      "modelId": "gemini-3.8-flash",
      "modelName": "Gemini (self-review: security critic)",
      "role": "security_critic",
      "verdict": "FOR" or "NEEDS_CHANGES" or "AGAINST",
      "confidence": 82,
      "risks": ["string"],
      "hallucinationFlags": [],
      "arguments": ["string"],
      "evidence": ["string"]
    },
    {
      "modelId": "gemini-3.8-flash",
      "modelName": "Gemini (self-review: fact auditor)",
      "role": "fact_auditor",
      "verdict": "FOR" or "AGAINST",
      "confidence": 95,
      "risks": ["string"],
      "hallucinationFlags": ["list any hallucinated assumptions or empty if verified"],
      "arguments": ["string"],
      "evidence": ["string"]
    }
  ]
}`;

      try {
        const reviewResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: debatePrompt,
          config: { responseMimeType: 'application/json' },
        });

        const parsed = JSON.parse(reviewResponse.text || '{}');
        const critiques: ReviewerCritique[] = parsed.critiques || [];

        if (critiques.length >= 2) {
          const evalResult = evaluateAdversarialVerdict(critiques);
          const review = rememberReview({
            id: 'pending',
            actionTitle,
            actionType,
            details,
            proposedByAgent: agent,
            consensusScore: evalResult.consensusScore,
            status: evalResult.hallucinationDetected ? ('blocked_hallucination' as const) : ('pending' as const),
            recommendation: evalResult.recommendation,
            critiques,
            hallucinationDetected: evalResult.hallucinationDetected,
            forArguments: critiques.flatMap((c) =>
              c.arguments.filter((_: string, idx: number) => idx % 2 === 0)
            ),
            againstArguments: critiques.flatMap((c) => c.risks),
            timestamp: Date.now(),
          } as AdversarialReview);

          broadcast({
            type: 'approval_request',
            review,
          });

          return res.json(review);
        }
      } catch (e) {
        console.warn('AI adversarial parse failed, falling back', e);
      }
    }

    return res.status(502).json({ error: 'Risk review failed; approval fails closed.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    if (!ai) {
      return res.json({ available: false, message: 'Gemini API key not configured' });
    }

    const ttsResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [{ text: text.slice(0, 400), speechMetadata: { style: 'Crisp, authoritative sci-fi AI assistant' } }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName as any } },
        },
      },
    });

    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      res.json({ available: true, mimeType: 'audio/wav', audioBase64: base64Audio });
    } else {
      res.json({ available: false });
    }
  } catch {
    res.json({ available: false });
  }
});

function scheduleDailyMemorySynthesis(): void {
  const now = new Date();
  const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const timer = setTimeout(() => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    try {
      memoryEvolution.synthesizeDailyRoutine(harness.getPortfolio(), yesterday);
      console.log('[RAVANA MEMORY] Paper activity summary synthesized for', yesterday);
    } catch (error) {
      console.warn('[RAVANA MEMORY] Synthesis failed:', error instanceof Error ? error.message : 'unknown error');
    }
    scheduleDailyMemorySynthesis();
  }, Math.max(1000, nextUtcMidnight.getTime() - now.getTime()));
  timer.unref();
}
scheduleDailyMemorySynthesis();

async function startServer() {
  if (!isLoopbackHost) {
    console.error('[RAVANA] Refusing to bind beyond loopback: this prototype has no user authentication for a public API.');
    process.exitCode = 1;
    return;
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[RAVANA] Core Command Centre online at http://${HOST}:${PORT}`);
  });
}

startServer();
