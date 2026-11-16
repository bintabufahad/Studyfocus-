import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface LiveToolAction {
  name: string;
  args: Record<string, unknown>;
}

interface UseLiveVoiceOptions {
  userName?: string;
  cardTitle?: string;
  onReady?: (isReconnect: boolean) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onToolAction?: (action: LiveToolAction) => void;
  onTurnComplete?: () => void;
}

function downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000 || sourceRate <= 0) return input;
  const ratio = sourceRate / 16000;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[Math.min(idx, input.length - 1)];
    const s1 = input[Math.min(idx + 1, input.length - 1)];
    result[i] = s0 + (s1 - s0) * frac;
  }
  return result;
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 0x8000;
  }
  return float32;
}

export function useLiveVoice(options: UseLiveVoiceOptions = {}) {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef(false);
  const wantLiveRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const callbacksRef = useRef(options);

  callbacksRef.current = options;

  // Real-time output audio amplitude meter for lip-sync animation + stuck-source guard
  useEffect(() => {
    if (!isAssistantSpeaking) {
      setOutputLevel(0);
      return;
    }

    let rafId = 0;
    const dataArray = new Uint8Array(64);

    const sample = () => {
      const ctx = outputCtxRef.current;
      if (ctx && activeSourcesRef.current.size > 0 && ctx.currentTime > nextStartTimeRef.current + 0.6) {
        activeSourcesRef.current.clear();
        setIsAssistantSpeaking(false);
        return;
      }

      const analyser = outputAnalyserRef.current;
      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setOutputLevel(Math.min(1, rms * 5.2));
      }
      rafId = window.requestAnimationFrame(sample);
    };

    rafId = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(rafId);
  }, [isAssistantSpeaking]);

  const clearScheduledAudio = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsAssistantSpeaking(false);
    setOutputLevel(0);
  }, []);

  const stopVoice = useCallback(() => {
    wantLiveRef.current = false;
    hasConnectedOnceRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;

    clearScheduledAudio();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputAnalyserRef.current) {
      outputAnalyserRef.current.disconnect();
      outputAnalyserRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    setAudioLevel(0);
    setOutputLevel(0);
    setIsAssistantSpeaking(false);
    setStatus('idle');
  }, [clearScheduledAudio]);

  const playPcmChunk = useCallback((base64Data: string) => {
    const ctx = outputCtxRef.current;
    const analyser = outputAnalyserRef.current;
    if (!ctx || !analyser) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const samples = base64Pcm16ToFloat32(base64Data);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    const now = ctx.currentTime;
    const startTime = Math.max(now + 0.01, nextStartTimeRef.current);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    setIsAssistantSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsAssistantSpeaking(false);
      }
    };

    source.start(startTime);
  }, []);

  const openLiveSocket = useCallback(() => {
    if (!wantLiveRef.current) return;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      userName: callbacksRef.current.userName || 'Friend',
      cardTitle: callbacksRef.current.cardTitle || 'Study Session',
    });
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/live?${params.toString()}`);
    wsRef.current = ws;

    const scheduleReconnect = () => {
      if (!wantLiveRef.current) return;
      if (reconnectTimerRef.current) return;
      if (reconnectAttemptsRef.current >= 10) {
        setErrorMessage('Live voice disconnected. Tap Talk Live to reconnect.');
        setStatus('error');
        return;
      }
      reconnectAttemptsRef.current += 1;
      setStatus('connecting');
      const delay = Math.min(3000, reconnectAttemptsRef.current * 600);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        openLiveSocket();
      }, delay);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          data?: string;
          text?: string;
          message?: string;
          name?: string;
          args?: Record<string, unknown>;
        };

        if (msg.type === 'ready') {
          const isReconnect = hasConnectedOnceRef.current;
          hasConnectedOnceRef.current = true;
          reconnectAttemptsRef.current = 0;
          setErrorMessage(null);
          setStatus('live');
          callbacksRef.current.onReady?.(isReconnect);
        } else if (msg.type === 'audio' && msg.data) {
          playPcmChunk(msg.data);
        } else if (msg.type === 'interrupted') {
          clearScheduledAudio();
        } else if (msg.type === 'input_transcript' && msg.text) {
          callbacksRef.current.onInputTranscript?.(msg.text);
        } else if (msg.type === 'output_transcript' && msg.text) {
          callbacksRef.current.onOutputTranscript?.(msg.text);
        } else if (msg.type === 'tool_action' && msg.name) {
          callbacksRef.current.onToolAction?.({
            name: msg.name,
            args: msg.args ?? {},
          });
        } else if (msg.type === 'turn_complete') {
          callbacksRef.current.onTurnComplete?.();
        } else if (msg.type === 'go_away' || msg.type === 'closed') {
          // Live session rotated or closed upstream: seamlessly open a fresh session
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          try {
            ws.close();
          } catch {
            // Ignore
          }
          scheduleReconnect();
        } else if (msg.type === 'error') {
          setErrorMessage(msg.message ?? 'Voice connection interrupted.');
          if (wantLiveRef.current && reconnectAttemptsRef.current < 10) {
            scheduleReconnect();
          } else {
            setStatus('error');
          }
        }
      } catch (err) {
        console.error('Failed to handle Live WS message:', err);
      }
    };

    ws.onerror = () => {
      if (!wantLiveRef.current) return;
      setErrorMessage('Voice connection interrupted — reconnecting...');
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (wantLiveRef.current) {
        scheduleReconnect();
      } else {
        setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      }
    };
  }, [clearScheduledAudio, playPcmChunk]);

  const startVoice = useCallback(async () => {
    if (status === 'connecting' || status === 'live') return;
    setErrorMessage(null);
    setStatus('connecting');
    wantLiveRef.current = true;
    hasConnectedOnceRef.current = false;
    reconnectAttemptsRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume().catch(() => {});
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume().catch(() => {});
      }

      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.connect(outputCtx.destination);

      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      outputAnalyserRef.current = analyser;
      nextStartTimeRef.current = outputCtx.currentTime;

      openLiveSocket();

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      sourceNodeRef.current = source;
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        const channel = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < channel.length; i += 4) {
          sum += channel[i] * channel[i];
        }
        const rms = Math.sqrt(sum / (channel.length / 4));
        setAudioLevel(isMutedRef.current ? 0 : Math.min(1, rms * 6));

        if (isMutedRef.current) return;
        const currentWs = wsRef.current;
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          const pcm16k = downsampleTo16k(channel, inputCtx.sampleRate);
          const base64 = float32ToBase64Pcm16(pcm16k);
          currentWs.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Microphone access is required for Live Voice.';
      wantLiveRef.current = false;
      setErrorMessage(message);
      stopVoice();
      setStatus('error');
    }
  }, [openLiveSocket, status, stopVoice]);

  const toggleMute = useCallback(() => {
    if (inputCtxRef.current?.state === 'suspended') {
      inputCtxRef.current.resume().catch(() => {});
    }
    if (outputCtxRef.current?.state === 'suspended') {
      outputCtxRef.current.resume().catch(() => {});
    }

    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      const currentWs = wsRef.current;
      if (next && currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type: 'audio_stream_end' }));
      }
      return next;
    });
  }, []);

  const sendTextPrompt = useCallback((text: string): boolean => {
    const currentWs = wsRef.current;
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
      currentWs.send(JSON.stringify({ type: 'text', text }));
      return true;
    }
    return false;
  }, []);

  const reconnectLive = useCallback(() => {
    if (!wantLiveRef.current) return;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setStatus('connecting');
    openLiveSocket();
  }, [openLiveSocket]);

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  return {
    status,
    isMuted,
    isAssistantSpeaking,
    audioLevel,
    outputLevel,
    errorMessage,
    startVoice,
    stopVoice,
    toggleMute,
    sendTextPrompt,
    reconnectLive,
  };
}
