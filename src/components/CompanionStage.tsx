import { Mic, MicOff, PhoneOff, RefreshCw, Volume2 } from 'lucide-react';
import type { CompanionPose } from '../types';
import type { LiveVoiceStatus } from '../hooks/useLiveVoice';
import { LivingSoraAvatar } from './LivingSoraAvatar';

interface CompanionStageProps {
  pose: CompanionPose;
  caption: string;
  isSimulatingSpeech: boolean;
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
}

export function CompanionStage({
  pose,
  caption,
  isSimulatingSpeech,
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
}: CompanionStageProps) {
  const isSpeakingNow = isAssistantSpeaking || isSimulatingSpeech;
  const speechAmplitude = isAssistantSpeaking ? outputLevel : audioLevel;

  const displayCaption =
    liveDraftAssistantText ||
    (liveDraftUserText ? `You: "${liveDraftUserText}"` : caption);

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

      {/* Single-Row Live Voice Companion Controls (Chat box & check-in chips removed to maximize camera) */}
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

      {liveError && (
        <div className="border-t border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
          {liveError}
        </div>
      )}
    </section>
  );
}
