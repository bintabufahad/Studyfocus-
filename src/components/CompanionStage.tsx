import { useState } from 'react';
import { Mic, MicOff, PhoneOff, RefreshCw, Send, Volume2 } from 'lucide-react';
import type { CompanionPose } from '../types';
import type { LiveVoiceStatus } from '../hooks/useLiveVoice';
import { LivingSoraAvatar } from './LivingSoraAvatar';

export type SoraPromptMode = 'onboarding' | 'checkin' | 'idle';

interface CompanionStageProps {
  pose: CompanionPose;
  caption: string;
  promptMode: SoraPromptMode;
  isSimulatingSpeech: boolean;
  isSendingReply: boolean;
  liveStatus: LiveVoiceStatus;
  liveMuted: boolean;
  isAssistantSpeaking: boolean;
  audioLevel: number;
  outputLevel: number;
  liveError: string | null;
  liveDraftUserText: string;
  liveDraftAssistantText: string;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onReconnectVoice: () => void;
  onToggleLiveMute: () => void;
  onReplyToSora: (text: string) => void;
  onQuickCheckInChoice: (minutes: number | null) => void;
}

export function CompanionStage({
  pose,
  caption,
  promptMode,
  isSimulatingSpeech,
  isSendingReply,
  liveStatus,
  liveMuted,
  isAssistantSpeaking,
  audioLevel,
  outputLevel,
  liveError,
  liveDraftUserText,
  liveDraftAssistantText,
  onStartVoice,
  onStopVoice,
  onReconnectVoice,
  onToggleLiveMute,
  onReplyToSora,
  onQuickCheckInChoice,
}: CompanionStageProps) {
  const [replyDraft, setReplyDraft] = useState('');

  const isSpeakingNow = isAssistantSpeaking || isSimulatingSpeech;
  const speechAmplitude = isAssistantSpeaking ? outputLevel : audioLevel;

  const displayCaption =
    liveDraftAssistantText ||
    (liveDraftUserText ? `You: "${liveDraftUserText}"` : caption);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyDraft.trim();
    if (!trimmed || isSendingReply) return;
    onReplyToSora(trimmed);
    setReplyDraft('');
  };

  return (
    <section
      aria-label="AI Companion Sora"
      className="glass-panel flex shrink-0 flex-col overflow-hidden rounded-xl"
    >
      {/* Living Animated & Lip-Syncing Companion */}
      <LivingSoraAvatar
        pose={pose}
        isSpeaking={isSpeakingNow}
        speechLevel={speechAmplitude}
        isListening={liveStatus === 'live' && !liveMuted && !isAssistantSpeaking}
        caption={displayCaption}
      />

      {/* Single-Voice Live Companion Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] bg-white/[0.02] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5 text-amber-300 shrink-0" />
          <span className="text-xs font-medium text-slate-300">Sora Voice</span>

          {liveStatus === 'live' && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
          )}
          {liveStatus === 'connecting' && (
            <span className="text-[11px] text-amber-300">Connecting...</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {liveStatus === 'live' || liveStatus === 'connecting' ? (
            <>
              <button
                type="button"
                onClick={onToggleLiveMute}
                className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  liveMuted
                    ? 'border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {liveMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                {liveMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={onReconnectVoice}
                title="Refresh voice connection"
                aria-label="Refresh voice connection"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onStopVoice}
                className="flex cursor-pointer items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-200 transition-colors hover:bg-rose-500/25 whitespace-nowrap shrink-0"
              >
                <PhoneOff className="h-3 w-3" />
                End
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartVoice}
              className="flex cursor-pointer items-center gap-1 rounded-md bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/25 whitespace-nowrap shrink-0"
            >
              <Mic className="h-3 w-3" />
              Talk Live
            </button>
          )}
        </div>
      </div>

      {/* Compact 1-Line Answer Strip & Quick Chips */}
      <div className="space-y-1.5 border-t border-white/[0.06] bg-[#090D1A]/80 px-3 py-2">
        {promptMode === 'onboarding' && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[10px] text-slate-400">Check-ins:</span>
            {[5, 10, 15, 25].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => onQuickCheckInChoice(mins)}
                className="font-mono-tabular cursor-pointer rounded border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200 hover:bg-amber-400/20"
              >
                Every {mins}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => onQuickCheckInChoice(null)}
              className="cursor-pointer rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
            >
              Off
            </button>
          </div>
        )}

        {promptMode === 'checkin' && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onReplyToSora('I finished my current task!')}
              disabled={isSendingReply}
              className="cursor-pointer rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-45"
            >
              Finished task
            </button>
            <button
              type="button"
              onClick={() => onReplyToSora('Still working on it, making progress')}
              disabled={isSendingReply}
              className="cursor-pointer rounded border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-45"
            >
              Still working
            </button>
            <button
              type="button"
              onClick={() => onReplyToSora('Feeling stuck—please break my current task into tiny steps')}
              disabled={isSendingReply}
              className="cursor-pointer rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-45"
            >
              Break it down
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <input
            type="text"
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder={
              promptMode === 'onboarding'
                ? "Tell Sora what to do & check-in mins..."
                : promptMode === 'checkin'
                  ? "Answer Sora to update your list..."
                  : "Tell Sora progress, tasks, or 'check every 10m'..."
            }
            className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#0B0F1E] px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!replyDraft.trim() || isSendingReply}
            aria-label="Send reply to Sora"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-amber-400 text-slate-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>

      {liveError && (
        <div className="border-t border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
          {liveError}
        </div>
      )}
    </section>
  );
}
