import React, { useCallback, useEffect, useState } from 'react';
import { Bot, RefreshCw, ShieldCheck } from 'lucide-react';

type Portfolio = { mode: 'PAPER'; cashUsdc: number; positions: Record<string, { quantity: number; avgEntryPrice: number }>; tradeHistory: unknown[] };
type Snapshot = { mode: 'PAPER'; execution: 'disabled'; profiles: Array<{ id: string; strategy: string; status: string }>; portfolio: Portfolio; timestamp: number };

export const ClawBotsWidget: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/trading/claw-bots');
      if (!response.ok) throw new Error();
      setSnapshot(await response.json() as Snapshot);
      setError('');
    } catch {
      setSnapshot(null);
      setError('Backend unavailable. Static demo mode has no live bot state.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host + '/live');
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'claw_bots_sync') { setSnapshot(message); setError(''); }
      } catch { /* Other HUD event. */ }
    };
    const timer = window.setInterval(() => { if (ws.readyState !== WebSocket.OPEN) void refresh(); }, 12000);
    return () => { window.clearInterval(timer); ws.close(); };
  }, [refresh]);

  const profiles = snapshot?.profiles || [
    { id: '@claw/alpha', strategy: 'Trend momentum', status: 'not configured' },
    { id: '@claw/beta', strategy: 'Volatility scanner', status: 'not configured' },
    { id: '@claw/gamma', strategy: 'Risk monitor', status: 'not configured' },
  ];
  const positions = Object.entries(snapshot?.portfolio.positions || {}).filter(([, position]) => position.quantity > 0);

  return <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-[#06101c]/90 p-4 font-mono text-xs text-cyan-100">
    <header className="flex items-center justify-between border-b border-cyan-500/20 pb-2"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-400" /><strong>CLAW BOT PROFILES // PAPER MODE</strong></div><button aria-label="Refresh bot status" onClick={() => void refresh()} className="rounded bg-slate-900 p-1 text-cyan-400"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></button></header>
    <p className="flex gap-2 rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[10px] text-amber-200"><ShieldCheck className="h-4 w-4 shrink-0" />Display-only strategy profiles. Automated strategies and live exchange orders are disabled.</p>
    {error && <p role="status" className="text-amber-300">{error}</p>}
    <div className="grid gap-2 md:grid-cols-3">{profiles.map((profile) => <article key={profile.id} className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><div className="flex justify-between gap-2"><b className="text-cyan-200">{profile.id}</b><span className="text-[9px] uppercase text-slate-400">{profile.status}</span></div><p className="mt-2 text-slate-400">{profile.strategy}</p></article>)}</div>
    <div className="grid gap-2 sm:grid-cols-3"><div className="rounded bg-slate-950/70 p-3"><span className="text-slate-500">PAPER CASH</span><p className="mt-1 font-bold">{snapshot ? '$' + snapshot.portfolio.cashUsdc.toLocaleString() + ' USDC' : '—'}</p></div><div className="rounded bg-slate-950/70 p-3"><span className="text-slate-500">OPEN POSITIONS</span><p className="mt-1 font-bold">{snapshot ? positions.length : '—'}</p></div><div className="rounded bg-slate-950/70 p-3"><span className="text-slate-500">PAPER TRADES</span><p className="mt-1 font-bold">{snapshot ? snapshot.portfolio.tradeHistory.length : '—'}</p></div></div>
    {positions.map(([symbol, position]) => <div key={symbol} className="flex justify-between rounded bg-slate-950/70 p-2"><span>{symbol}</span><span>{position.quantity} @ {'$'}{position.avgEntryPrice.toLocaleString()}</span></div>)}
    <p className="text-[10px] text-slate-500">Shared paper portfolio · last update {snapshot ? new Date(snapshot.timestamp).toLocaleTimeString() : '—'}</p>
  </section>;
};
