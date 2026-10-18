import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';

interface PaperPortfolio {
  mode: 'PAPER';
  cashUsdc: number;
  positions: Record<string, { quantity: number; avgEntryPrice: number }>;
  tradeHistory: Array<{ id: string; timestamp: number; side: 'buy' | 'sell'; symbol: string; quantity: number; executionPrice: number; notionalUsdc: number }>;
}
interface Ticker { symbol: string; lastPrice: number; priceChangePercent24h: number; observedAt: number }

export const TradingFinanceWidgets: React.FC = () => {
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [portfolioResponse, marketResponse] = await Promise.all([
        fetch('/api/portfolio'),
        fetch('/api/market/tickers'),
      ]);
      if (!portfolioResponse.ok) throw new Error('Paper portfolio endpoint unavailable');
      setPortfolio(await portfolioResponse.json() as PaperPortfolio);
      if (marketResponse.ok) {
        const market = await marketResponse.json();
        setTickers(market.tickers || []);
      } else {
        setTickers([]);
      }
      setError('');
    } catch {
      setPortfolio(null);
      setTickers([]);
      setError('Local backend unavailable. No wallet balance, bot P&L, or market price is assumed.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const positions = Object.entries(portfolio?.positions || {}).filter(([, position]) => position.quantity > 0);
  const latestTrades = portfolio?.tradeHistory.slice(0, 6) || [];

  return <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/25 bg-[#06101c]/90 p-4 font-mono text-xs text-cyan-100">
    <header className="flex items-center justify-between border-b border-cyan-500/20 pb-2"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" /><strong>TRADING // READ-ONLY MARKET + PAPER PORTFOLIO</strong></div><button aria-label="Refresh trading view" onClick={() => void refresh()} className="rounded bg-slate-900 p-1 text-cyan-400"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></button></header>
    <p className="flex gap-2 rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[10px] text-amber-200"><ShieldCheck className="h-4 w-4 shrink-0" />Binance ticker data is public and read-only. Bot execution and live orders are disabled.</p>
    {error && <p role="status" className="text-amber-300">{error}</p>}
    <div className="grid gap-2 sm:grid-cols-3">{tickers.map((ticker) => <article key={ticker.symbol} className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"><span className="text-slate-400">{ticker.symbol.replace('USDT', '/USDT')}</span><p className="mt-1 text-base font-bold text-cyan-100">{Number.isFinite(ticker.lastPrice) ? '$' + ticker.lastPrice.toLocaleString() : '—'}</p><span className={ticker.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{ticker.priceChangePercent24h >= 0 ? '+' : ''}{ticker.priceChangePercent24h}% · 24h</span><p className="mt-1 text-[9px] text-slate-500">Observed {new Date(ticker.observedAt).toLocaleTimeString()}</p></article>)}</div>
    {tickers.length === 0 && !error && <p className="text-slate-500">Market feed not configured or not yet available.</p>}
    <div className="grid gap-2 sm:grid-cols-3"><div className="rounded bg-slate-950/70 p-3"><span className="text-slate-500">PAPER CASH</span><p className="mt-1 flex items-center gap-1 font-bold"><Wallet className="h-3.5 w-3.5" />{portfolio ? '$' + portfolio.cashUsdc.toLocaleString() + ' USDC' : '—'}</p></div><div className="rounded bg-slate-950/70 p-3"><span className="text-slate-500">OPEN PAPER POSITIONS</span><p className="mt-1 font-bold">{portfolio ? positions.length : '—'}</p></div><div className="rounded bg-slate-950/70 p-3"><span className="text-slate-500">RECORDED PAPER TRADES</span><p className="mt-1 font-bold">{portfolio ? portfolio.tradeHistory.length : '—'}</p></div></div>
    {positions.map(([symbol, position]) => <div key={symbol} className="flex justify-between rounded bg-slate-950/70 p-2"><span>{symbol}</span><span>{position.quantity} @ {'$'}{position.avgEntryPrice.toLocaleString()}</span></div>)}
    <div className="space-y-1"><strong className="text-cyan-300">RECENT PAPER TRADES</strong>{latestTrades.length ? latestTrades.map((trade) => <div key={trade.id} className="flex justify-between rounded bg-slate-950/70 p-2"><span>{trade.side.toUpperCase()} {trade.quantity} {trade.symbol}</span><span>{new Date(trade.timestamp).toLocaleString()} · {'$'}{trade.notionalUsdc.toFixed(2)}</span></div>) : <p className="py-2 text-slate-500">No paper trades recorded.</p>}</div>
  </section>;
};
