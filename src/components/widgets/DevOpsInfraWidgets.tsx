import React from 'react';
import { Activity, Cpu, HardDrive, Server, ShieldCheck, Wifi } from 'lucide-react';
import type { SystemTelemetry } from '../../lib/types.ts';

interface DevOpsInfraWidgetsProps { telemetry?: SystemTelemetry | null }

export const DevOpsInfraWidgets: React.FC<DevOpsInfraWidgetsProps> = ({ telemetry }) => {
  const metrics = [
    { label: 'Host CPU load', value: telemetry ? telemetry.cpuUsage + '%' : '—', icon: Cpu },
    { label: 'Host RAM used', value: telemetry ? telemetry.ramUsage + '%' : '—', icon: Activity },
    { label: 'Host disk used', value: telemetry ? telemetry.diskUsage + '%' : '—', icon: HardDrive },
    { label: 'RAVANA process heap', value: telemetry ? telemetry.heapUsageMb + ' MB' : '—', icon: Server },
    { label: 'WebSocket clients', value: telemetry ? String(telemetry.activeClients) : '—', icon: Wifi },
    { label: 'Circuit state', value: telemetry ? telemetry.circuitStatus : '—', icon: ShieldCheck },
  ];
  const unavailable = ['Docker inventory', 'Remote cluster metrics', 'CI run history', 'API gateway latency', 'Security scanner results'];

  return <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/25 bg-[#06101c]/90 p-4 font-mono text-xs">
    <header className="flex items-center gap-2 border-b border-cyan-500/20 pb-2"><Server className="h-4 w-4 text-cyan-400" /><strong className="text-cyan-200">DEVOPS & INFRA // CONNECTOR STATUS</strong><span className="ml-auto text-[9px] text-emerald-300">{telemetry ? 'LOCAL HOST CONNECTED' : 'BACKEND OFFLINE'}</span></header>
    <div className="grid gap-2 sm:grid-cols-3">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400"><Icon className="mr-1 inline h-3.5 w-3.5" />{label}</span><p className="mt-1 font-bold text-cyan-100">{value}</p></article>)}</div>
    <div className="rounded border border-slate-700 bg-slate-950/50 p-3"><strong className="text-slate-300">NOT CONNECTED</strong><p className="mt-1 text-[10px] text-slate-400">These integrations need their own configured backend adapters; no sample host or container status is shown.</p><ul className="mt-2 grid gap-1 sm:grid-cols-2">{unavailable.map((item) => <li key={item} className="text-[10px] text-amber-300">○ {item}</li>)}</ul></div>
  </section>;
};
