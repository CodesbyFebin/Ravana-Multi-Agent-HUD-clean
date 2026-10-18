import React, { useEffect, useState } from 'react';
import { Check, Cpu, Palette, Server, Sliders, X } from 'lucide-react';
import { playSound } from '../lib/soundFx.ts';

export type RavanaTheme = 'cyan' | 'light' | 'matrix';

export interface SettingsPreferences {
  tradingPairs: string[];
  refreshIntervalSec: number;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: RavanaTheme;
  onChangeTheme: (theme: RavanaTheme) => void;
  preferences: SettingsPreferences;
  onSavePreferences: (preferences: SettingsPreferences) => void;
}

const THEMES: { id: RavanaTheme; label: string; detail: string }[] = [
  { id: 'cyan', label: 'DARK CYBERPUNK', detail: 'Neon cyan on deep navy' },
  { id: 'light', label: 'CLEAN LIGHT', detail: 'Light shell and readable panels' },
  { id: 'matrix', label: 'MATRIX HACKER', detail: 'Green terminal accents' },
];

export function SettingsPanel({
  isOpen,
  onClose,
  activeTheme,
  onChangeTheme,
  preferences,
  onSavePreferences,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<'providers' | 'widgets' | 'theme'>('providers');
  const [pairsText, setPairsText] = useState(preferences.tradingPairs.join(', '));
  const [interval, setInterval] = useState(String(preferences.refreshIntervalSec));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPairsText(preferences.tradingPairs.join(', '));
    setInterval(String(preferences.refreshIntervalSec));
  }, [preferences, isOpen]);

  if (!isOpen) return null;

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tradingPairs = pairsText
      .split(',')
      .map((pair) => pair.trim().toUpperCase())
      .filter(Boolean);
    const refreshIntervalSec = Number(interval);

    if (!Number.isInteger(refreshIntervalSec) || refreshIntervalSec < 1 || refreshIntervalSec > 30) return;
    if (tradingPairs.some((pair) => !/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/.test(pair))) return;

    onSavePreferences({ tradingPairs: [...new Set(tradingPairs)], refreshIntervalSec });
    playSound('approve');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-cyan-500/40 bg-[#06101c] p-5 text-cyan-100 shadow-2xl"
      >
        <header className="mb-4 flex items-center justify-between border-b border-cyan-500/20 pb-3">
          <h2 id="settings-title" className="flex items-center gap-2 font-orbitron text-sm font-bold">
            <Sliders aria-hidden="true" className="h-4 w-4 text-cyan-400" /> RAVANA SETTINGS
          </h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="rounded p-1 text-slate-300 hover:bg-slate-800">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Settings categories">
          {([
            ['providers', 'PROVIDERS', Cpu],
            ['widgets', 'WIDGETS', Server],
            ['theme', 'THEME', Palette],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded border px-3 py-2 text-[11px] font-bold ${tab === id ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </nav>

        {tab === 'providers' && (
          <div className="space-y-3 text-xs">
            <p className="text-cyan-200">Provider credentials are server-managed. This panel does not collect or save API keys in the browser.</p>
            <div className="rounded border border-cyan-500/20 bg-slate-950/60 p-3">
              <strong>Google Gemini</strong>
              <p className="mt-1 text-slate-400">Configure <code>GEMINI_API_KEY</code> in the server environment. The current backend does not expose a credential editor.</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-950/40 p-3 text-slate-400">
              OpenAI, Anthropic, DeepSeek, xAI, and Ollama settings are not wired to provider adapters yet.
            </div>
          </div>
        )}

        {tab === 'widgets' && (
          <form onSubmit={save} className="space-y-4 text-xs">
            <p className="text-amber-200">Saved locally as preferences only. The current widgets do not consume these values or connect market and infrastructure feeds.</p>
            <label className="block space-y-1">
              <span className="font-bold text-cyan-200">DISPLAYED MARKET PAIRS</span>
              <input value={pairsText} onChange={(event) => setPairsText(event.target.value)} className="w-full rounded border border-cyan-500/30 bg-slate-950 px-3 py-2 text-cyan-100" />
              <span className="block text-slate-400">Comma-separated symbols such as BTC/USDT, ETH/USDT.</span>
            </label>
            <label className="block space-y-1">
              <span className="font-bold text-cyan-200">PREFERRED REFRESH INTERVAL (SECONDS)</span>
              <input type="number" min={1} max={30} step={1} value={interval} onChange={(event) => setInterval(event.target.value)} className="block w-28 rounded border border-cyan-500/30 bg-slate-950 px-3 py-2 text-cyan-100" />
            </label>
            <button type="submit" className="flex items-center gap-2 rounded bg-cyan-500 px-4 py-2 font-bold text-slate-950">
              {saved ? <Check aria-hidden="true" className="h-4 w-4" /> : null}{saved ? 'SAVED' : 'SAVE PREFERENCES'}
            </button>
          </form>
        )}

        {tab === 'theme' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={activeTheme === theme.id}
                onClick={() => onChangeTheme(theme.id)}
                className={`rounded-lg border p-4 text-left ${activeTheme === theme.id ? 'border-cyan-300 bg-cyan-950/70' : 'border-slate-700 bg-slate-900'}`}
              >
                <span className={`mb-3 block h-5 w-5 rounded-full ${theme.id === 'light' ? 'bg-slate-100' : theme.id === 'matrix' ? 'bg-green-400' : 'bg-cyan-300'}`} />
                <strong className="block text-xs">{theme.label}</strong>
                <span className="mt-1 block text-[10px] text-slate-400">{theme.detail}</span>
              </button>
            ))}
          </div>
        )}

        <footer className="mt-5 flex justify-end border-t border-cyan-500/20 pt-3">
          <button type="button" onClick={onClose} className="rounded border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800">CLOSE</button>
        </footer>
      </section>
    </div>
  );
}
