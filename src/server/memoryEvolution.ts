import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PortfolioState } from './harness.ts';

export interface EpisodicMemory {
  id: string;
  content: string;
  category: 'trade' | 'server';
  importance: number;
  tags: string[];
  timestamp: number;
  dayKey: string;
}

export class MemoryEvolutionEngine {
  private readonly filePath: string;
  private memories: EpisodicMemory[] = [];

  constructor(dataDir = path.resolve(process.cwd(), '.ravana-data')) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'episodic-memories.json');
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(parsed)) this.memories = parsed.slice(0, 5000) as EpisodicMemory[];
    } catch {
      this.memories = [];
    }
  }

  private persist(): void {
    const temp = this.filePath + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.memories, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }

  synthesizeDailyRoutine(portfolio: PortfolioState, dayKey: string): EpisodicMemory {
    const existing = this.memories.find((item) => item.dayKey === dayKey && item.tags.includes('daily-synthesis'));
    if (existing) return structuredClone(existing);
    const from = new Date(dayKey + 'T00:00:00.000Z').getTime();
    const to = from + 86_400_000;
    const trades = portfolio.tradeHistory.filter((trade) => trade.timestamp >= from && trade.timestamp < to);
    const buys = trades.filter((trade) => trade.side === 'buy').length;
    const sells = trades.length - buys;
    const item: EpisodicMemory = {
      id: 'mem_' + randomUUID(),
      content: 'UTC daily summary for ' + dayKey + ': ' + trades.length + ' paper trades (' + buys + ' buys, ' + sells + ' sells). Current paper cash snapshot: ' + portfolio.cashUsdc.toFixed(2) + ' USDC. No exchange orders or wallet transfers are performed.',
      category: trades.length ? 'trade' : 'server',
      importance: trades.length ? 6 : 3,
      tags: ['daily-synthesis', 'paper-mode', dayKey],
      timestamp: Date.now(),
      dayKey,
    };
    this.memories.unshift(item);
    this.memories = this.memories.slice(0, 5000);
    this.persist();
    return structuredClone(item);
  }

  search(q = '', category = '', date = ''): EpisodicMemory[] {
    const term = q.toLowerCase();
    return this.memories.filter((item) => {
      const textMatch = !term || item.content.toLowerCase().includes(term) || item.tags.some((tag) => tag.toLowerCase().includes(term));
      return textMatch && (!category || item.category === category) && (!date || item.dayKey === date);
    }).slice(0, 200).map((item) => structuredClone(item));
  }
}
