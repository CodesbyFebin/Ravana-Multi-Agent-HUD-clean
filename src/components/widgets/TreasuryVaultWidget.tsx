import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';

type Portfolio = { mode: 'PAPER'; cashUsdc: number; positions: Record<string, { quantity: number; avgEntryPrice: number }>; tradeHistory: unknown[] };

export const TreasuryVaultWidget: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/portfolio');
      if (!response.ok) throw new Error();
      setPortfolio(await response.json() as Portfolio);
      setError('');
    } catch {
      setPortfolio(null);
      setError('Local paper portfolio unavailable. No vault value is inferred.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const positions = Object.entries(portfolio?.positions || {}).filter(([, position]) => position.quantity > 0);

  return <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-[#06101c]/90 p-4 font-mono text-xs text-cyan-100">
    <header className="flex items-center justify-between border-b border-cyan-500/20 pb-2"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-400" /><strong>PAPER TREASURY // PORTFOLIO VIEW</strong></div><button aria-label="Refresh paper treasury" onClick={() => void refresh()} className="rounded bg-slate-900 p-1 text-cyan-400"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></button></header>
    <div className="flex items-center justify-between rounded border border-cyan-500/20 bg-slate-950/80 p-4"><div><span className="text-[10px] uppercase text-slate-400">Simulated paper cash</span><div className="mt-1 flex items-center gap-2 text-xl font-bold text-cyan-200"><WalletCards className="h-5 w-5" />{portfolio ? '$' + portfolio.cashUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' USDC' : '—'}</div></div><span className="rounded border border-amber-500/30 px-2 py-1 text-[9px] text-amber-200">NO CUSTODY</span></div>
    <p className="text-[10px] text-slate-400">Paper-accounting only. There are no wallet transfers or automated profit sweeps.</p>
    {error && <p role="status" className="text-amber-300">{error}</p>}
    <div className="space-y-1"><strong className="text-cyan-300">OPEN SIMULATED POSITIONS</strong>{positions.length ? positions.map(([symbol, position]) => <div key={symbol} className="flex justify-between rounded bg-slate-950/70 p-2"><span>{symbol}</span><span>{position.quantity} @ {'$'}{position.avgEntryPrice.toLocaleString()}</span></div>) : <p className="py-2 text-slate-500">No open paper positions.</p>}</div>
    <p className="text-[10px] text-slate-500">Recorded paper orders: {portfolio?.tradeHistory.length ?? '—'}</p>
  </section>;
};
