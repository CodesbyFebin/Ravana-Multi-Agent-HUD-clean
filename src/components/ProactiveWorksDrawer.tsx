import React from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  TrendingUp, 
  GitPullRequest, 
  Server, 
  Share2, 
  Mail, 
  BookOpen, 
  AlertTriangle 
} from 'lucide-react';
import { ProactiveSuggestion, AgentId } from '../lib/types.ts';
import { playSound } from '../lib/soundFx.ts';

interface ProactiveWorksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteWork: (work: ProactiveSuggestion) => void;
}

export const PROACTIVE_WORKS_CATALOG: ProactiveSuggestion[] = [];

export const ProactiveWorksDrawer: React.FC<ProactiveWorksDrawerProps> = ({
  isOpen,
  onClose,
  onExecuteWork,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 select-none">
      <div className="w-full max-w-md h-full bg-[#06101c] border-l border-cyan-500/40 shadow-2xl p-4 flex flex-col gap-3 font-mono text-xs text-cyan-100 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="font-orbitron font-bold text-sm text-cyan-200">
              LIVE SUGGESTIONS // CONNECTOR STATUS
            </span>
          </div>
          <button
            onClick={() => {
              playSound('beep');
              onClose();
            }}
            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-cyan-400/80">
          Live suggestions are unavailable because monitoring connectors are not configured. No background actions are running.
        </p>

        {/* Suggestion list */}
        <div className="flex flex-col gap-2.5 overflow-y-auto pr-1">
          {PROACTIVE_WORKS_CATALOG.length === 0 ? <p className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">No live suggestions are available. Connect a monitored service to populate this panel.</p> : PROACTIVE_WORKS_CATALOG.map((work) => (
            <div
              key={work.id}
              className="p-3 rounded-lg bg-[#081524] border border-cyan-500/20 hover:border-cyan-400/50 flex flex-col gap-2 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-100 text-[11px]">{work.title}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                    work.urgency === 'high'
                      ? 'bg-red-950 text-red-300 border border-red-500/30'
                      : work.urgency === 'medium'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  {work.urgency} URGENCY
                </span>
              </div>

              <p className="text-[10px] text-cyan-300/80 leading-relaxed">
                {work.summary}
              </p>

              <div className="flex items-center justify-between pt-1.5 border-t border-cyan-500/10 text-[9.5px]">
                <span className="text-cyan-500/70">AGENT: {work.agent.toUpperCase()}</span>

                <button
                  onClick={() => {
                    playSound('chirp');
                    onExecuteWork(work);
                    onClose();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black border border-cyan-400 font-bold transition-all cursor-pointer"
                >
                  <span>EXECUTE</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
