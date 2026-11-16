import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomParticipant, SharedVideoState, WorkspacePanelMode } from '../types';

interface UseStudyRoomOptions {
  roomId: string | null;
  clientId: string;
  userName: string;
  initialMode: WorkspacePanelMode;
  initialFocusing: boolean;
  onRemoteVideoSync?: (state: SharedVideoState) => void;
}

export function useStudyRoom({
  roomId,
  clientId,
  userName,
  initialMode,
  initialFocusing,
  onRemoteVideoSync,
}: UseStudyRoomOptions) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [sharedVideoState, setSharedVideoState] = useState<SharedVideoState | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantsRef = useRef<RoomParticipant[]>([]);
  participantsRef.current = participants;

  const userNameRef = useRef(userName);
  userNameRef.current = userName;
  const presenceRef = useRef({ mode: initialMode, isFocusing: initialFocusing });
  presenceRef.current = { mode: initialMode, isFocusing: initialFocusing };

  const callbacksRef = useRef({ onRemoteVideoSync });
  callbacksRef.current = { onRemoteVideoSync };

  const closePeerConnections = useCallback(() => {
    for (const pc of pcMapRef.current.values()) {
      pc.close();
    }
    pcMapRef.current.clear();
    setRemoteStream(null);
  }, []);

  const sendSignal = useCallback((targetClientId: string, signal: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'rtc:signal',
          targetClientId,
          signal,
        })
      );
    }
  }, []);

  const getOrCreatePeer = useCallback(
    (targetClientId: string) => {
      const existing = pcMapRef.current.get(targetClientId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(targetClientId, { candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
          setRemoteStream(e.streams[0]);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          pcMapRef.current.delete(targetClientId);
          setRemoteStream(null);
        }
      };

      pcMapRef.current.set(targetClientId, pc);
      return pc;
    },
    [sendSignal]
  );

  const sendOfferToPeer = useCallback(
    async (targetClientId: string, stream: MediaStream) => {
      try {
        const pc = getOrCreatePeer(targetClientId);
        for (const track of stream.getTracks()) {
          const alreadySending = pc
            .getSenders()
            .some((s) => s.track && s.track.id === track.id);
          if (!alreadySending) {
            pc.addTrack(track, stream);
          }
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(targetClientId, { sdp: pc.localDescription });
      } catch (err) {
        console.error('WebRTC offer error:', err);
      }
    },
    [getOrCreatePeer, sendSignal]
  );

  useEffect(() => {
    if (!roomId) {
      setStatus('disconnected');
      setParticipants([]);
      setSharedVideoState(null);
      closePeerConnections();
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        roomId: roomId.trim().toLowerCase(),
        clientId,
        name: userNameRef.current || 'Friend',
      });
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/room?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'room:presence',
            mode: presenceRef.current.mode,
            isFocusing: presenceRef.current.isFocusing,
            name: userNameRef.current || 'Friend',
          })
        );
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            participants?: RoomParticipant[];
            videoState?: SharedVideoState | null;
            fromClientId?: string;
            signal?: {
              sdp?: RTCSessionDescriptionInit;
              candidate?: RTCIceCandidateInit;
            };
          };

          if (msg.type === 'room:state') {
            const list = Array.isArray(msg.participants) ? msg.participants : [];
            setParticipants(list);

            // If we already have a live local camera and a new peer appeared without a PC yet, initiate offer
            if (localStreamRef.current) {
              for (const p of list) {
                if (p.clientId !== clientId && !pcMapRef.current.has(p.clientId)) {
                  void sendOfferToPeer(p.clientId, localStreamRef.current);
                }
              }
            }

            if (msg.videoState) {
              setSharedVideoState(msg.videoState);
              callbacksRef.current.onRemoteVideoSync?.(msg.videoState);
            }
          } else if (msg.type === 'video:sync' && msg.videoState) {
            setSharedVideoState(msg.videoState);
            callbacksRef.current.onRemoteVideoSync?.(msg.videoState);
          } else if (msg.type === 'rtc:signal' && msg.fromClientId && msg.signal) {
            const pc = getOrCreatePeer(msg.fromClientId);
            if (msg.signal.sdp) {
              const isOffer = msg.signal.sdp.type === 'offer';
              const polite = clientId > msg.fromClientId;
              if (isOffer && pc.signalingState !== 'stable') {
                if (!polite) return;
                await pc.setLocalDescription({ type: 'rollback' });
              }
              await pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
              if (isOffer) {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(msg.fromClientId, { sdp: pc.localDescription });
              }
            } else if (msg.signal.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
            }
          }
        } catch (err) {
          console.error('Room message error:', err);
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setStatus('disconnected');
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      closePeerConnections();
    };
  }, [clientId, closePeerConnections, getOrCreatePeer, roomId, sendOfferToPeer, sendSignal]);

  const sendPresence = useCallback((mode: WorkspacePanelMode, isFocusing: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'room:presence',
          mode,
          isFocusing,
          name: userNameRef.current || 'Friend',
        })
      );
    }
  }, []);

  const sendVideoSync = useCallback(
    (state: Omit<SharedVideoState, 'updatedAt' | 'updatedBy'>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'video:sync',
            videoState: state,
          })
        );
      }
    },
    []
  );

  // Completely stable callback identity so camera stream is never torn down on presence updates
  const attachLocalCamera = useCallback(
    async (stream: MediaStream | null) => {
      localStreamRef.current = stream;
      if (!stream) {
        closePeerConnections();
        return;
      }

      const peers = participantsRef.current.filter((p) => p.clientId !== clientId);
      for (const peer of peers) {
        await sendOfferToPeer(peer.clientId, stream);
      }
    },
    [clientId, closePeerConnections, sendOfferToPeer]
  );

  const remoteParticipants = useMemo(
    () => participants.filter((p) => p.clientId !== clientId),
    [clientId, participants]
  );

  return useMemo(
    () => ({
      status,
      participants,
      remoteParticipants,
      sharedVideoState,
      remoteStream,
      sendPresence,
      sendVideoSync,
      attachLocalCamera,
    }),
    [
      attachLocalCamera,
      participants,
      remoteParticipants,
      remoteStream,
      sendPresence,
      sendVideoSync,
      sharedVideoState,
      status,
    ]
  );
}
