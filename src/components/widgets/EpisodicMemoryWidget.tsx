import React, { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, Search, Tag } from 'lucide-react';

type Memory = { id: string; content: string; category: string; importance: number; tags: string[]; timestamp: number; dayKey: string };

export const EpisodicMemoryWidget: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q = query, cat = category, day = date) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (cat) params.set('category', cat);
      if (day) params.set('date', day);
      const response = await fetch('/api/memory/search?' + params.toString());
      if (!response.ok) throw new Error();
      const result = await response.json();
      setMemories(result.memories || []);
      setTotal(result.totalResults || 0);
      setError('');
    } catch {
      setMemories([]);
      setTotal(0);
      setError('Memory search needs the local backend; GitHub Pages has no server memory store.');
    } finally { setLoading(false); }
  }, [query, category, date]);

  useEffect(() => { void search('', '', ''); }, [search]);

  return <section className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-[#06101c]/90 p-4 font-mono text-xs text-cyan-100">
    <header className="flex items-center justify-between border-b border-cyan-500/20 pb-2"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-cyan-400" /><strong>EPISODIC MEMORY // DAILY SYNTHESIS</strong></div><div className="flex items-center gap-2"><span className="rounded border border-cyan-500/30 px-2 py-0.5">RECORDS {total}</span><button aria-label="Refresh memory" onClick={() => void search()} className="rounded bg-slate-900 p-1 text-cyan-400"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></button></div></header>
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <div className="relative sm:col-span-2"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-cyan-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search trades, decisions, summaries" className="w-full rounded border border-cyan-500/30 bg-[#040c17] py-1.5 pl-7 pr-2" /></div>
      <select value={category} onChange={(event) => { setCategory(event.target.value); void search(query, event.target.value, date); }} className="rounded border border-cyan-500/30 bg-[#040c17] px-2 py-1.5"><option value="">All categories</option><option value="trade">Paper trading</option><option value="server">System routine</option></select>
      <input type="date" aria-label="Filter by date (UTC)" value={date} onChange={(event) => { setDate(event.target.value); void search(query, category, event.target.value); }} className="rounded border border-cyan-500/30 bg-[#040c17] px-2 py-1.5" />
      <button className="flex items-center justify-center gap-1 rounded bg-cyan-500 px-3 py-1.5 font-bold text-black sm:col-span-4"><Search className="h-3.5 w-3.5" />SEARCH</button>
    </form>
    {error && <p role="status" className="text-amber-300">{error}</p>}
    <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">{memories.length === 0 && !error && <p className="py-5 text-center text-slate-500">No stored memories match this search.</p>}
      {memories.map((memory) => <article key={memory.id} className="rounded border border-cyan-500/20 bg-slate-950/80 p-3"><div className="flex justify-between text-[10px]"><span className="rounded border border-cyan-500/30 px-1.5 py-0.5 uppercase">{memory.category}</span><span className="text-slate-400">{memory.dayKey} UTC</span></div><p className="mt-2 whitespace-pre-wrap leading-relaxed">{memory.content}</p><div className="mt-2 flex flex-wrap gap-1 text-[9px]"><Tag className="h-3 w-3 text-cyan-400" />{memory.tags.map((tag) => <span key={tag} className="rounded bg-slate-900 px-1.5 py-0.5">#{tag}</span>)}</div></article>)}
    </div>
  </section>;
};
