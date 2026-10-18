import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock, ShieldCheck, Wrench } from 'lucide-react';

interface Status { status: string; geminiConfigured: boolean; uptimeSec: number; activeConnections: number }
const readOnlyTools = ['system_diagnostics', 'git_workspace_inspector', 'market_ticker_probe (BTC/ETH/SOL)', 'codebase_auditor'];
const notImplemented = ['External skill marketplace', 'Remote CI pipeline execution', 'Docker/Kubernetes control', 'Independent specialist worker processes'];

export const SkillsHarnessWidgets: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/status').then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: Status) => { if (active) setStatus(data); })
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, []);

  return <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/25 bg-[#06101c]/90 p-4 font-mono text-xs">
    <header className="flex items-center gap-2 border-b border-cyan-500/20 pb-2"><Wrench className="h-4 w-4 text-cyan-400" /><strong className="text-cyan-200">TOOLS & HARNESS // IMPLEMENTATION STATUS</strong><span className={status ? 'ml-auto text-emerald-300' : 'ml-auto text-amber-300'}>{status ? 'BACKEND ONLINE' : 'STATIC / OFFLINE'}</span></header>
    <div className="grid gap-3 md:grid-cols-2">
      <article className="rounded border border-emerald-500/20 bg-slate-950/70 p-3"><h3 className="flex items-center gap-2 font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Implemented read-only harness tools</h3><ul className="mt-2 space-y-1">{readOnlyTools.map((tool) => <li key={tool} className="text-slate-300">• {tool}</li>)}</ul></article>
      <article className="rounded border border-amber-500/20 bg-slate-950/70 p-3"><h3 className="flex items-center gap-2 font-bold text-amber-300"><Clock className="h-3.5 w-3.5" />Not connected in this build</h3><ul className="mt-2 space-y-1">{notImplemented.map((tool) => <li key={tool} className="text-slate-400">○ {tool}</li>)}</ul></article>
    </div>
    <div className="flex flex-wrap gap-4 rounded border border-cyan-500/20 bg-slate-950/70 p-3 text-slate-300"><span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-cyan-400" />Gemini key: {status ? status.geminiConfigured ? 'configured' : 'not configured' : 'unknown'}</span><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />Execution: opt-in, loopback-only, paper trades</span></div>
  </section>;
};
