import React from 'react';
import { ExternalLink, Github, Globe, MessageSquare, Radio, Share2 } from 'lucide-react';

const connectors = [
  { name: 'GitHub issues and pull requests', icon: Github, status: 'Not connected' },
  { name: 'Slack channels and messages', icon: MessageSquare, status: 'Not connected' },
  { name: 'Social publishing and analytics', icon: Share2, status: 'Not connected' },
  { name: 'Threat intelligence feeds', icon: Radio, status: 'Not connected' },
  { name: 'Browser session and tabs', icon: Globe, status: 'Not connected' },
];

export const CommsIntelWidgets: React.FC = () => <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/25 bg-[#06101c]/90 p-4 font-mono text-xs">
  <header className="flex items-center gap-2 border-b border-cyan-500/20 pb-2"><MessageSquare className="h-4 w-4 text-cyan-400" /><strong className="text-cyan-200">COMMS & INTELLIGENCE // CONNECTORS</strong></header>
  <p className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-[10px] text-amber-200">This build has no credentials or adapters for communications, social accounts, browser history, or threat feeds. Sample messages and CVEs have been removed.</p>
  <div className="grid gap-2 sm:grid-cols-2">{connectors.map(({ name, icon: Icon, status }) => <article key={name} className="flex items-center justify-between rounded border border-slate-700 bg-slate-950/70 p-3"><span className="flex items-center gap-2 text-slate-300"><Icon className="h-4 w-4 text-slate-500" />{name}</span><span className="text-[9px] uppercase text-slate-500">{status}</span></article>)}</div>
  <p className="flex items-center gap-1 text-[10px] text-slate-500"><ExternalLink className="h-3 w-3" />Each provider requires a server-side connector, OAuth/token storage, and permission-scoped API access.</p>
</section>;
