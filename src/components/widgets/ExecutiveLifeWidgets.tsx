import React, { useEffect, useState } from 'react';
import { CheckCircle2, Pause, Play, RotateCcw, StickyNote, Timer } from 'lucide-react';

const NOTES_KEY = 'ravana_local_notes_v1';

export const ExecutiveLifeWidgets: React.FC = () => {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(NOTES_KEY);
      return saved ? JSON.parse(saved) as string[] : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => {
      if (value <= 1) { setRunning(false); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const saveNotes = (next: string[]) => {
    setNotes(next);
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch { /* Browser storage may be unavailable. */ }
  };
  const addNote = (event: React.FormEvent) => {
    event.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    saveNotes([text, ...notes].slice(0, 50));
    setNoteText('');
  };

  return <section className="grid gap-3 lg:grid-cols-2">
    <article className="rounded-xl border border-cyan-500/25 bg-[#06101c]/90 p-4 font-mono text-xs">
      <header className="flex items-center gap-2 border-b border-cyan-500/20 pb-2"><Timer className="h-4 w-4 text-cyan-400" /><strong className="text-cyan-200">FOCUS TIMER // LOCAL</strong></header>
      <p className="py-6 text-center font-orbitron text-4xl font-bold text-cyan-100">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p>
      <div className="flex justify-center gap-2"><button onClick={() => setRunning((value) => !value)} className="flex items-center gap-1 rounded bg-cyan-500 px-3 py-2 font-bold text-black">{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{running ? 'PAUSE' : 'START'}</button><button onClick={() => { setRunning(false); setSeconds(25 * 60); }} className="flex items-center gap-1 rounded border border-slate-700 px-3 py-2 text-slate-300"><RotateCcw className="h-3.5 w-3.5" />RESET</button></div>
      <p className="mt-3 text-center text-[10px] text-slate-500">Timer state stays in this browser tab. No calendar or notification integration is connected.</p>
    </article>
    <article className="rounded-xl border border-cyan-500/25 bg-[#06101c]/90 p-4 font-mono text-xs">
      <header className="flex items-center gap-2 border-b border-cyan-500/20 pb-2"><StickyNote className="h-4 w-4 text-cyan-400" /><strong className="text-cyan-200">SCRATCH NOTES // THIS BROWSER</strong></header>
      <form onSubmit={addNote} className="my-3 flex gap-2"><input value={noteText} onChange={(event) => setNoteText(event.target.value)} maxLength={500} placeholder="Add a private local note…" className="min-w-0 flex-1 rounded border border-cyan-500/30 bg-slate-950 px-2 py-2" /><button className="rounded bg-cyan-500 px-3 font-bold text-black">SAVE</button></form>
      <ul className="max-h-56 space-y-2 overflow-y-auto">{notes.map((note, index) => <li key={index} className="flex items-start justify-between gap-2 rounded bg-slate-950/70 p-2"><span>{note}</span><button aria-label="Delete note" onClick={() => saveNotes(notes.filter((_, i) => i !== index))} className="text-rose-300"><CheckCircle2 className="h-3.5 w-3.5" /></button></li>)}</ul>
      {!notes.length && <p className="py-4 text-center text-slate-500">No local notes saved.</p>}
      <p className="mt-2 text-[10px] text-slate-500">Notes use browser localStorage and are not shared with server memory.</p>
    </article>
  </section>;
};
