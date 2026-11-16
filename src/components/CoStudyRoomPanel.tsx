import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleDot,
  Copy,
  FlipHorizontal2,
  Link2,
  LogOut,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Square,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import type { RoomParticipant } from '../types';

interface CoStudyRoomPanelProps {
  roomId: string | null;
  shareUrl: string | null;
  roomStatus: 'disconnected' | 'connecting' | 'connected';
  remoteParticipants: RoomParticipant[];
  remoteStream: MediaStream | null;
  onCreateAndCopyInvite: () => Promise<{ url: string; copied: boolean }>;
  onJoinRoomInput: (codeOrUrl: string) => void;
  onLeaveRoom: () => void;
  onCameraStreamChange: (stream: MediaStream | null) => void;
  onRecordingSaved: (clip: {
    blobUrl: string;
    durationSeconds: number;
    recordedAt: number;
  }) => void;
}

function formatSeconds(total: number): string {
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function fallbackCopyText(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CoStudyRoomPanel({
  roomId,
  shareUrl,
  roomStatus,
  remoteParticipants,
  remoteStream,
  onCreateAndCopyInvite,
  onJoinRoomInput,
  onLeaveRoom,
  onCameraStreamChange,
  onRecordingSaved,
}: CoStudyRoomPanelProps) {
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);

  const onCameraChangeRef = useRef(onCameraStreamChange);
  onCameraChangeRef.current = onCameraStreamChange;

  const [cameraOn, setCameraOn] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [mirrored, setMirrored] = useState(true);
  const [fillFrame, setFillFrame] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinDraft, setJoinDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (peerVideoRef.current) {
      peerVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const stopStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (selfVideoRef.current) {
      selfVideoRef.current.srcObject = null;
    }
    onCameraChangeRef.current(null);
    setCameraOn(false);
    setIsRecording(false);
    setRecordSeconds(0);
  }, []);

  const stopStreamRef = useRef(stopStream);
  stopStreamRef.current = stopStream;

  // Only stop camera on genuine component unmount
  useEffect(() => {
    return () => stopStreamRef.current();
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;

      for (const audioTrack of stream.getAudioTracks()) {
        audioTrack.enabled = !micMuted;
      }

      if (selfVideoRef.current) {
        selfVideoRef.current.srcObject = stream;
      }
      onCameraChangeRef.current(stream);
      setCameraOn(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Camera permission is needed for self-view accountability.';
      setError(message);
      setCameraOn(false);
    }
  }, [micMuted]);

  const toggleCamera = () => {
    if (cameraOn) stopStream();
    else startCamera();
  };

  const toggleMic = () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    if (streamRef.current) {
      for (const track of streamRef.current.getAudioTracks()) {
        track.enabled = !nextMuted;
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    if (!streamRef.current) {
      await startCamera();
    }

    const activeStream = streamRef.current;
    if (!activeStream) return;

    try {
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(activeStream, { mimeType });
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecordSeconds(0);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const blobUrl = URL.createObjectURL(blob);
          const durationSeconds = Math.max(
            1,
            Math.round((Date.now() - recordStartRef.current) / 1000)
          );
          onRecordingSaved({ blobUrl, durationSeconds, recordedAt: Date.now() });
        }
        setIsRecording(false);
        setRecordSeconds(0);
      };

      recorder.start(1000);
      setIsRecording(true);
    } catch {
      setError('Session recording is not supported in this browser.');
    }
  };

  const handleShareClick = async () => {
    const result = await onCreateAndCopyInvite();
    setCopyState(result.copied ? 'copied' : 'manual');
    setShowJoinInput(false);
    window.setTimeout(() => setCopyState('idle'), 2600);
  };

  const handleCopyShareField = async () => {
    if (!shareUrl) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      ok = true;
    } catch {
      ok = fallbackCopyText(shareUrl);
    }
    setCopyState(ok ? 'copied' : 'manual');
    window.setTimeout(() => setCopyState('idle'), 2400);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinDraft.trim();
    if (!trimmed) return;
    onJoinRoomInput(trimmed);
    setJoinDraft('');
    setShowJoinInput(false);
  };

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  return (
    <section
      aria-label="Self-View Camera and Friend Study Room"
      className="glass-panel flex min-h-[250px] flex-1 flex-col overflow-hidden rounded-xl"
    >
      {/* Top Bar: Share Friend Link + Join + Camera Controls */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-white/[0.07] px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="h-3.5 w-3.5 text-amber-300 shrink-0" />
          <span className="truncate text-xs font-medium text-slate-200">
            {roomId
              ? remoteParticipants.length > 0
                ? `${remoteParticipants.map((p) => p.name).join(', ')} joined`
                : roomStatus === 'connected'
                  ? `Room ${roomId.toUpperCase()}`
                  : 'Connecting...'
              : 'Camera & Co-Study'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleShareClick}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-400/20 whitespace-nowrap"
          >
            {copyState === 'copied' ? (
              <Check className="h-3 w-3" />
            ) : (
              <Link2 className="h-3 w-3" />
            )}
            {copyState === 'copied' ? 'Copied' : roomId ? 'Invite' : 'Share Link'}
          </button>

          {!roomId && (
            <button
              type="button"
              onClick={() => setShowJoinInput((v) => !v)}
              className={`h-7 cursor-pointer rounded-md border px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
                showJoinInput
                  ? 'border-amber-400/35 bg-amber-400/15 text-amber-200'
                  : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10'
              }`}
            >
              Join
            </button>
          )}

          {roomId && (
            <button
              type="button"
              onClick={onLeaveRoom}
              title="Leave shared room"
              aria-label="Leave shared room"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/[0.08] text-slate-400 hover:bg-rose-500/15 hover:text-rose-200"
            >
              <LogOut className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setMirrored((m) => !m)}
            title="Flip camera view"
            aria-label="Flip camera view"
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
              mirrored
                ? 'border-white/15 bg-white/10 text-slate-100'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400'
            }`}
          >
            <FlipHorizontal2 className="h-3 w-3" />
          </button>

          <button
            type="button"
            onClick={() => setFillFrame((f) => !f)}
            title={fillFrame ? 'Show full camera frame (Fit)' : 'Zoom to fill frame (Fill)'}
            aria-label={fillFrame ? 'Show full camera frame' : 'Zoom to fill frame'}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
              !fillFrame
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400'
            }`}
          >
            {fillFrame ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={toggleMic}
            title={micMuted ? 'Unmute mic' : 'Mute mic'}
            aria-label={micMuted ? 'Unmute mic' : 'Mute mic'}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
              !micMuted
                ? 'border-amber-400/35 bg-amber-400/15 text-amber-200'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400'
            }`}
          >
            {micMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={toggleCamera}
            className={`flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
              cameraOn
                ? 'border-white/15 bg-white/10 text-slate-100'
                : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10'
            }`}
          >
            {cameraOn ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
            {cameraOn ? 'On' : 'Cam'}
          </button>

          <button
            type="button"
            onClick={toggleRecording}
            className={`flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
              isRecording
                ? 'border-rose-400/40 bg-rose-500/20 text-rose-200'
                : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="h-2.5 w-2.5 fill-current" />
                <span className="font-mono-tabular">{formatSeconds(recordSeconds)}</span>
              </>
            ) : (
              <>
                <CircleDot className="h-3 w-3 text-rose-400" />
                <span>Rec</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Visible Shareable Link + Code Bar (or Join Input) */}
      {roomId && shareUrl ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.07] bg-[#0B0F1E]/90 px-3 py-1.5">
          <span className="font-mono-tabular shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
            {roomId.toUpperCase()}
          </span>
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Shareable friend invite link"
            className="min-w-0 flex-1 rounded border border-white/[0.08] bg-[#080B16] px-2 py-0.5 text-[11px] text-slate-300 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCopyShareField}
            title="Copy invite link"
            aria-label="Copy invite link"
            className="flex h-6 cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] font-medium text-slate-200 hover:bg-white/10 shrink-0"
          >
            {copyState === 'copied' ? (
              <Check className="h-3 w-3 text-emerald-300" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            Copy
          </button>
        </div>
      ) : (
        showJoinInput && (
          <form
            onSubmit={handleJoinSubmit}
            className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.07] bg-[#0B0F1E]/90 px-3 py-1.5"
          >
            <input
              type="text"
              autoFocus
              value={joinDraft}
              onChange={(e) => setJoinDraft(e.target.value)}
              placeholder="Paste friend's room code or invite link..."
              className="min-w-0 flex-1 rounded border border-white/10 bg-[#080B16] px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!joinDraft.trim()}
              className="h-6 cursor-pointer rounded bg-amber-400 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
            >
              Join
            </button>
          </form>
        )
      )}

      {/* Camera / Friend Co-Study Viewport */}
      <div className="relative min-h-[200px] flex-1 overflow-hidden bg-[#070A14]">
        {/* Self-view video (Fit by default so full face & head stay uncropped) */}
        <video
          ref={selfVideoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full transition-opacity duration-300 ${
            fillFrame ? 'object-cover' : 'object-contain'
          } ${cameraOn ? 'opacity-100' : 'opacity-0'} ${mirrored ? '-scale-x-100' : ''}`}
        />

        {/* Remote friend live camera picture-in-picture if active */}
        {remoteStream && (
          <div className="absolute bottom-2.5 right-2.5 h-24 w-36 overflow-hidden rounded-lg border border-amber-400/40 bg-black shadow-lg">
            <video
              ref={peerVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Empty / Presence state when camera is paused */}
        {!cameraOn && !remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            {remoteParticipants.length > 0 ? (
              <div className="space-y-1.5">
                {remoteParticipants.map((friend) => (
                  <div
                    key={friend.clientId}
                    className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2 text-xs text-emerald-100"
                  >
                    <span className="font-semibold">{friend.name}</span>
                    <span className="mx-1.5 text-emerald-300/70">·</span>
                    <span>
                      {friend.mode === 'video' ? 'In Video Mode' : 'In Focus Mode'}
                      {friend.isFocusing ? ' · Timer running' : ''}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  Each of you keeps your own private Focus Plan. Switch to Video &amp; Playlist to watch together.
                </p>
              </div>
            ) : (
              <>
                <VideoOff className="mb-1.5 h-5 w-5 text-slate-500" />
                <p className="text-xs font-medium text-slate-300">
                  {roomId
                    ? `Share code ${roomId.toUpperCase()} or the link above with your friend`
                    : 'Turn on your camera or share a link with a friend'}
                </p>
                <p className="mt-1 max-w-xs text-[11px] text-slate-500">
                  Friends keep their own private Focus Mode page while studying beside you.
                </p>
              </>
            )}
          </div>
        )}

        {isRecording && (
          <div className="absolute left-3 top-2.5 flex items-center gap-2 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-rose-200 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>REC</span>
            <span className="font-mono-tabular text-rose-100">
              {formatSeconds(recordSeconds)}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 border-t border-rose-500/20 bg-rose-500/10 px-3.5 py-1.5 text-xs text-rose-200">
          {error}
        </div>
      )}
    </section>
  );
}
