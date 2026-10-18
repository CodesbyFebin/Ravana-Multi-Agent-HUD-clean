import React, { useState } from 'react';
import { Cpu, HardDrive, Radio, Server, TrendingUp, Wifi } from 'lucide-react';
import type { SystemTelemetry, TradeEvent } from '../lib/types.ts';

interface TradingServerWidgetProps {
  telemetry?: SystemTelemetry | null;
  trades?: TradeEvent[];
}

export const TradingServerWidget: React.FC<TradingServerWidgetProps> = ({ telemetry, trades = [] }) => {
  const [activeTab, setActiveTab] = useState<'trading' | 'server'>('server');
  const value = (number: number | undefined, suffix = '') => number == null || number <= 0 ? 'N/A' : number + suffix;
  const uptime = telemetry
    ? Math.floor(telemetry.uptimeSec / 3600) + 'h ' + Math.floor((telemetry.uptimeSec % 3600) / 60) + 'm'
    : 'Waiting for backend';

  return <section className="flex flex-col gap-3 font-mono text-xs">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 pb-2">
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('server')} className={activeTab === 'server' ? 'rounded border border-cyan-400 bg-cyan-500/20 px-2 py-1 text-cyan-200' : 'rounded border border-slate-700 px-2 py-1 text-slate-400'}><Server className="mr-1 inline h-3.5 w-3.5" />LOCAL SERVER</button>
        <button onClick={() => setActiveTab('trading')} className={activeTab === 'trading' ? 'rounded border border-cyan-400 bg-cyan-500/20 px-2 py-1 text-cyan-200' : 'rounded border border-slate-700 px-2 py-1 text-slate-400'}><TrendingUp className="mr-1 inline h-3.5 w-3.5" />MARKET EVENTS</button>
      </div>
      <span className={telemetry ? 'text-emerald-400' : 'text-amber-300'}><Radio className="mr-1 inline h-3 w-3" />{telemetry ? 'BACKEND TELEMETRY' : 'BACKEND OFFLINE'}</span>
    </header>
    {activeTab === 'server' ? (
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400"><Cpu className="mr-1 inline h-3 w-3" />HOST CPU LOAD</span><p className="mt-1 font-bold text-cyan-100">{telemetry ? telemetry.cpuUsage + '%' : '—'}</p></div>
        <div className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400"><HardDrive className="mr-1 inline h-3 w-3" />HOST RAM</span><p className="mt-1 font-bold text-cyan-100">{telemetry ? telemetry.ramUsage + '%' : '—'}</p></div>
        <div className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400"><Wifi className="mr-1 inline h-3 w-3" />NETWORK LATENCY</span><p className="mt-1 font-bold text-cyan-100">{telemetry ? value(telemetry.latencyMs, ' ms') : '—'}</p></div>
        <div className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400">DISK USAGE</span><p className="mt-1 font-bold text-cyan-100">{telemetry ? telemetry.diskUsage + '%' : '—'}</p></div>
        <div className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400">PROCESS HEAP</span><p className="mt-1 font-bold text-cyan-100">{telemetry ? telemetry.heapUsageMb + ' MB' : '—'}</p></div>
        <div className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400">PROCESS UPTIME</span><p className="mt-1 font-bold text-cyan-100">{uptime}</p></div>
        <p className="text-[10px] text-slate-500 sm:col-span-3">Metrics describe the RAVANA Node process host only. External clusters and proxies are not connected.</p>
      </div>
    ) : (
      <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">
        <strong>NO EXECUTED EXCHANGE TRADES</strong>
        <p className="mt-1 text-[10px] text-amber-100/80">The current backend is paper-only. Random trade ticks were removed. Read-only Binance quotes and approved paper orders appear in the Trading panel.</p>
        {trades.length > 0 && <p className="mt-2 text-[10px]">Received {trades.length} genuine trade event(s).</p>}
      </div>
    )}
  </section>;
};
