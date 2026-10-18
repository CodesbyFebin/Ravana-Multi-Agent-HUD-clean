import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentId, AdversarialReview, AuditReceipt } from '../lib/types.ts';

const execFileAsync = promisify(execFile);
const ALLOWED_SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);

export interface ToolExecutionStep {
  stepIndex: number;
  toolName: string;
  agentId: AgentId;
  args: Record<string, unknown>;
  output: string;
  status: 'success' | 'blocked_requires_approval' | 'error';
  durationMs: number;
  timestamp: number;
}

export interface PortfolioState {
  mode: 'PAPER';
  cashUsdc: number;
  positions: Record<string, { quantity: number; avgEntryPrice: number }>;
  tradeHistory: Array<{
    id: string;
    timestamp: number;
    side: 'buy' | 'sell';
    symbol: string;
    quantity: number;
    executionPrice: number;
    notionalUsdc: number;
    reviewId: string;
  }>;
}

interface HarnessOptions {
  dataDir?: string;
  executionEnabled?: boolean;
  priceProvider?: (symbol: string) => Promise<number>;
}

const EMPTY_PORTFOLIO: PortfolioState = {
  mode: 'PAPER',
  cashUsdc: 50_000,
  positions: {},
  tradeHistory: [],
};

function hashReceipt(fields: Omit<AuditReceipt, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export class AgentExecutionHarness {
  private readonly dataDir: string;
  private readonly portfolioFile: string;
  private readonly auditFile: string;
  private readonly deploymentFile: string;
  private readonly executionEnabled: boolean;
  private readonly priceProvider: (symbol: string) => Promise<number>;
  private portfolio: PortfolioState;

  constructor(options: HarnessOptions = {}) {
    this.dataDir = options.dataDir || path.resolve(process.cwd(), '.ravana-data');
    this.portfolioFile = path.join(this.dataDir, 'portfolio.json');
    this.auditFile = path.join(this.dataDir, 'audit-receipts.jsonl');
    this.deploymentFile = path.join(this.dataDir, 'deployments.jsonl');
    this.executionEnabled = options.executionEnabled ?? false;
    this.priceProvider = options.priceProvider || this.fetchMarketPrice;
    this.portfolio = this.loadPortfolio();
  }

  private fetchMarketPrice = async (symbol: string): Promise<number> => {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Price provider returned HTTP ${response.status}`);
    const data = await response.json() as { price?: string };
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Price provider returned an invalid price');
    return price;
  };

  private loadPortfolio(): PortfolioState {
    fs.mkdirSync(this.dataDir, { recursive: true });
    try {
      const value = JSON.parse(fs.readFileSync(this.portfolioFile, 'utf8')) as PortfolioState;
      if (value.mode === 'PAPER' && Number.isFinite(value.cashUsdc) && value.positions && Array.isArray(value.tradeHistory)) {
        return value;
      }
    } catch {
      // Initialize a fresh paper portfolio when no valid state exists.
    }
    const initial = structuredClone(EMPTY_PORTFOLIO);
    this.savePortfolio(initial);
    return initial;
  }

  private savePortfolio(state = this.portfolio): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tempPath = `${this.portfolioFile}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, this.portfolioFile);
  }

  getPortfolio(): PortfolioState {
    return structuredClone(this.portfolio);
  }

  getAuditReceipts(): AuditReceipt[] {
    if (!fs.existsSync(this.auditFile)) return [];
    return fs.readFileSync(this.auditFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as AuditReceipt);
  }

  verifyLedger(): { valid: boolean; receiptCount: number; headHash: string } {
    let previousHash = '0'.repeat(64);
    let receiptCount = 0;
    try {
      for (const receipt of this.getAuditReceipts()) {
        const { hash, ...fields } = receipt;
        if (receipt.prevHash !== previousHash || hashReceipt(fields) !== hash) return { valid: false, receiptCount, headHash: previousHash };
        previousHash = hash;
        receiptCount += 1;
      }
      return { valid: true, receiptCount, headHash: previousHash };
    } catch {
      return { valid: false, receiptCount, headHash: previousHash };
    }
  }

  private successfulStep(toolName: string, agentId: AgentId, args: Record<string, unknown>, output: unknown, start: number): ToolExecutionStep {
    return {
      stepIndex: 1,
      toolName,
      agentId,
      args,
      output: JSON.stringify(output).slice(0, 4000),
      status: 'success',
      durationMs: Date.now() - start,
      timestamp: Date.now(),
    };
  }

  async runReadOnlyTool(toolName: string, args: Record<string, unknown>, agentId: AgentId): Promise<ToolExecutionStep> {
    const start = Date.now();
    try {
      let output: unknown;
      switch (toolName) {
        case 'system_diagnostics': {
          const memory = process.memoryUsage();
          output = {
            hostname: os.hostname(),
            platform: `${os.type()} ${os.release()} (${os.arch()})`,
            cpuCount: os.cpus().length,
            loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
            totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
            freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
            processHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
            processUptimeSec: Math.floor(process.uptime()),
          };
          break;
        }
        case 'git_workspace_inspector': {
          const run = async (argv: string[]) => {
            const result = await execFileAsync('git', argv, { cwd: process.cwd(), timeout: 3000, maxBuffer: 16_384 });
            return result.stdout.trim();
          };
          const [branch, status, log] = await Promise.all([
            run(['branch', '--show-current']).catch(() => 'unavailable'),
            run(['status', '--short']).catch(() => 'unavailable'),
            run(['log', '-n', '5', '--oneline']).catch(() => 'unavailable'),
          ]);
          output = { branch, modifiedFiles: status, recentCommits: log };
          break;
        }
        case 'market_ticker_probe': {
          const requested = String(args.symbol || 'BTCUSDT').toUpperCase().replaceAll('/', '');
          const symbol = ALLOWED_SYMBOLS.has(requested) ? requested : 'BTCUSDT';
          const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new Error(`Market data returned HTTP ${response.status}`);
          const ticker = await response.json() as Record<string, string>;
          output = {
            source: 'Binance public 24h ticker',
            symbol,
            lastPrice: Number(ticker.lastPrice),
            priceChangePercent24h: Number(ticker.priceChangePercent),
            high24h: Number(ticker.highPrice),
            low24h: Number(ticker.lowPrice),
            observedAt: Date.now(),
          };
          break;
        }
        case 'codebase_auditor': {
          const packagePath = path.resolve(process.cwd(), 'package.json');
          const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
            name?: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
          };
          const sourcePath = path.resolve(process.cwd(), 'src');
          output = {
            packageName: pkg.name,
            version: pkg.version,
            dependencyCount: Object.keys(pkg.dependencies || {}).length,
            devDependencyCount: Object.keys(pkg.devDependencies || {}).length,
            sourceEntries: fs.readdirSync(sourcePath).slice(0, 100),
          };
          break;
        }
        default:
          throw new Error(`Unknown read-only tool: ${toolName}`);
      }
      return this.successfulStep(toolName, agentId, args, output, start);
    } catch (error) {
      return {
        stepIndex: 1,
        toolName,
        agentId,
        args,
        output: `Tool error: ${error instanceof Error ? error.message : 'unknown error'}`,
        status: 'error',
        durationMs: Date.now() - start,
        timestamp: Date.now(),
      };
    }
  }

  async gatherGroundedToolTelemetry(prompt: string, agentId: AgentId): Promise<ToolExecutionStep[]> {
    const text = prompt.toLowerCase();
    const tools: Array<[string, Record<string, unknown>]> = [];
    if (agentId === 'devops' || /\b(server|cpu|memory|health|diagnostic)\b/.test(text)) {
      tools.push(['system_diagnostics', {}]);
    }
    if (agentId === 'coder' || agentId === 'pr_reviewer' || agentId === 'security' || /\b(git|code|repository|repo|cve|dependency)\b/.test(text)) {
      tools.push(['git_workspace_inspector', {}], ['codebase_auditor', {}]);
    }
    if (agentId === 'trader' || /\b(btc|eth|sol|market|ticker|price)\b/.test(text)) {
      const symbol = /\beth\b/.test(text) ? 'ETHUSDT' : /\bsol\b/.test(text) ? 'SOLUSDT' : 'BTCUSDT';
      tools.push(['market_ticker_probe', { symbol }]);
    }
    if (!tools.length) tools.push(['system_diagnostics', {}]);
    const steps = await Promise.all(tools.map(([name, args]) => this.runReadOnlyTool(name, args, agentId)));
    return steps.map((step, index) => ({ ...step, stepIndex: index + 1 }));
  }

  recordDecision(review: AdversarialReview, decision: 'approved' | 'rejected'): AuditReceipt {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const ledger = this.verifyLedger();
    if (!ledger.valid) throw new Error('Audit ledger integrity check failed; refusing to append');
    const fields: Omit<AuditReceipt, 'hash'> = {
      receiptId: `rcpt_${randomUUID()}`,
      timestamp: Date.now(),
      action: review.actionTitle,
      agent: review.proposedByAgent,
      modelsUsed: review.critiques.map((critique) => critique.modelId),
      debateTranscript: JSON.stringify(review.critiques).slice(0, 8000),
      verdict: review.recommendation,
      userDecision: decision,
      prevHash: ledger.headHash,
    };
    const receipt: AuditReceipt = { ...fields, hash: hashReceipt(fields) };
    fs.appendFileSync(this.auditFile, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', mode: 0o600 });
    return receipt;
  }

  async executeApprovedAction(review: AdversarialReview): Promise<ToolExecutionStep> {
    const start = Date.now();
    if (!this.executionEnabled) {
      return {
        stepIndex: 1, toolName: 'execution_disabled', agentId: review.proposedByAgent,
        args: { reviewId: review.id }, output: 'Approved execution is disabled by server configuration.',
        status: 'blocked_requires_approval', durationMs: 0, timestamp: Date.now(),
      };
    }
    if (review.status !== 'approved' || review.hallucinationDetected) {
      return {
        stepIndex: 1, toolName: 'execution_blocked', agentId: review.proposedByAgent,
        args: { reviewId: review.id }, output: 'Review must be approved and pass hallucination checks.',
        status: 'blocked_requires_approval', durationMs: 0, timestamp: Date.now(),
      };
    }

    try {
      if (review.actionType === 'execute_trade') {
        const match = review.actionTitle.match(/\b(buy|sell)\s+(\d+(?:\.\d{1,6})?)\s+(BTC|ETH|SOL)(?:USDT|\/USDT)?\b/i);
        if (!match) throw new Error('Paper trades require an explicit side, quantity, and BTC/ETH/SOL symbol in the approved title.');
        const side = match[1].toLowerCase() as 'buy' | 'sell';
        const quantity = Number(match[2]);
        const symbol = `${match[3].toUpperCase()}USDT`;
        const price = await this.priceProvider(symbol);
        if (!Number.isFinite(price) || price <= 0) throw new Error('Price provider returned an invalid quote.');
        const notional = Number((quantity * price).toFixed(2));
        if (notional > 5000) throw new Error('Paper trade exceeds the $5,000 notional limit.');
        const position = this.portfolio.positions[symbol] || { quantity: 0, avgEntryPrice: 0 };
        if (side === 'buy') {
          if (notional > this.portfolio.cashUsdc) throw new Error('Insufficient simulated paper cash.');
          const nextQuantity = position.quantity + quantity;
          const totalCost = position.quantity * position.avgEntryPrice + notional;
          this.portfolio.positions[symbol] = { quantity: Number(nextQuantity.toFixed(6)), avgEntryPrice: Number((totalCost / nextQuantity).toFixed(2)) };
          this.portfolio.cashUsdc = Number((this.portfolio.cashUsdc - notional).toFixed(2));
        } else {
          if (quantity > position.quantity) throw new Error('Paper position is too small for this sell.');
          this.portfolio.positions[symbol] = { quantity: Number((position.quantity - quantity).toFixed(6)), avgEntryPrice: position.avgEntryPrice };
          this.portfolio.cashUsdc = Number((this.portfolio.cashUsdc + notional).toFixed(2));
        }
        const trade = { id: `trd_${randomUUID()}`, timestamp: Date.now(), side, symbol, quantity, executionPrice: price, notionalUsdc: notional, reviewId: review.id };
        this.portfolio.tradeHistory.unshift(trade);
        this.savePortfolio();
        return this.successfulStep('execute_paper_trade', review.proposedByAgent, { side, symbol, quantity, price, mode: 'PAPER' }, { message: 'Paper trade recorded; no exchange order was sent.', trade, portfolio: this.portfolio }, start);
      }

      if (review.actionType === 'deploy') {
        fs.mkdirSync(this.dataDir, { recursive: true });
        const manifest = { id: `dep_${randomUUID()}`, reviewId: review.id, title: review.actionTitle, status: 'INTENT_RECORDED', actualDeploymentPerformed: false, timestamp: Date.now() };
        fs.appendFileSync(this.deploymentFile, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600 });
        return this.successfulStep('record_deployment_intent', review.proposedByAgent, { reviewId: review.id }, manifest, start);
      }

      if (review.actionType === 'shell_exec') {
        const title = review.actionTitle.toLowerCase();
        const command: [string, string[]] | null = title.includes('test') ? ['npm', ['test']]
          : title.includes('lint') ? ['npm', ['run', 'lint']]
          : title.includes('git status') ? ['git', ['status', '--short', '--branch']]
          : title.includes('git log') ? ['git', ['log', '-n', '5', '--oneline']]
          : title.includes('disk') ? ['df', ['-h', '.']]
          : title.includes('uptime') ? ['uptime', []]
          : null;
        if (!command) throw new Error('Only the fixed allowlisted operations are supported.');
        const { stdout, stderr } = await execFileAsync(command[0], command[1], {
          cwd: process.cwd(), timeout: 15_000, maxBuffer: 32_768,
        });
        return this.successfulStep('run_sandboxed_ops_command', review.proposedByAgent, { binary: command[0], args: command[1] }, (stdout || stderr || 'Command completed.').slice(0, 2000), start);
      }

      throw new Error(`No executor is registered for action type ${review.actionType}.`);
    } catch (error) {
      return {
        stepIndex: 1, toolName: 'approved_action_error', agentId: review.proposedByAgent,
        args: { reviewId: review.id },
        output: error instanceof Error ? error.message : 'Action failed',
        status: 'error', durationMs: Date.now() - start, timestamp: Date.now(),
      };
    }
  }
}
