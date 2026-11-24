import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  ListVideo,
  Pause,
  Pencil,
  Play,
  Plus,
  Scissors,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { PlaylistItem, SharedVideoState, VideoPlaylistGroup } from '../types';

interface VideoPlaylistPanelProps {
  playlists: VideoPlaylistGroup[];
  activePlaylistId: string | null;
  playlist: PlaylistItem[];
  activeVideoId: string | null;
  trimIntroSeconds: number;
  trimOutroSeconds: number;
  inSharedRoom: boolean;
  watchTogether: boolean;
  remoteVideoState: SharedVideoState | null;
  onSelectPlaylist: (playlistId: string) => void;
  onCreatePlaylist: (title: string) => void;
  onRenamePlaylist: (playlistId: string, title: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onToggleWatchTogether: () => void;
  onSelectVideo: (videoId: string) => void;
  onAddVideo: (item: Omit<PlaylistItem, 'id' | 'addedAt'>) => void;
  onAddPlaylistBatch: (items: Array<Omit<PlaylistItem, 'id' | 'addedAt'>>) => void;
  onUpdateTrimSettings: (introSec: number, outroSec: number) => void;
  onRemoveVideo: (videoId: string) => void;
  onReorderVideo: (fromIndex: number, toIndex: number) => void;
  onBroadcastVideoSync: (state: Omit<SharedVideoState, 'updatedAt' | 'updatedBy'>) => void;
}

interface YTPlayerInstance {
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  loadPlaylist: (opts: { list: string; listType: 'playlist'; index?: number; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  nextVideo: () => void;
  previousVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          width?: string | number;
          height?: string | number;
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiLoadPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiLoadPromise) return ytApiLoadPromise;

  ytApiLoadPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    } else if (window.YT?.Player) {
      resolve();
    }
  });
  return ytApiLoadPromise;
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      return url.pathname.slice(1).split('/')[0] || null;
    }
    if (host.includes('youtube.com')) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'shorts') {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractYouTubePlaylistId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host.includes('youtube.com') || host === 'youtu.be') {
      const list = url.searchParams.get('list')?.trim();
      if (list && list.length >= 6) return list;
    }
  } catch {
    const m = rawUrl.match(/[?&]list=([A-Za-z0-9_-]{6,})/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function formatSecLabel(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function VideoPlaylistPanel({
  playlists,
  activePlaylistId,
  playlist,
  activeVideoId,
  trimIntroSeconds,
  trimOutroSeconds,
  inSharedRoom,
  watchTogether,
  remoteVideoState,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onToggleWatchTogether,
  onSelectVideo,
  onAddVideo,
  onAddPlaylistBatch,
  onUpdateTrimSettings,
  onRemoveVideo,
  onReorderVideo,
  onBroadcastVideoSync,
}: VideoPlaylistPanelProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isTrimOpen, setIsTrimOpen] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistTitle, setEditingPlaylistTitle] = useState('');

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const isRemoteUpdateRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const advanceGuardRef = useRef<number>(0);

  const activeLocalItem =
    playlist.find((v) => v.id === activeVideoId) ?? playlist[0] ?? null;
  const activeIdx = activeLocalItem
    ? playlist.findIndex((v) => v.id === activeLocalItem.id)
    : -1;

  const effectiveVideo =
    inSharedRoom && watchTogether && remoteVideoState
      ? {
          id: 'shared-sync',
          title: remoteVideoState.videoTitle,
          url: remoteVideoState.videoUrl,
          sourceType: remoteVideoState.sourceType,
          playlistId: extractYouTubePlaylistId(remoteVideoState.videoUrl) ?? undefined,
        }
      : activeLocalItem;

  const ytId =
    effectiveVideo && effectiveVideo.sourceType === 'youtube'
      ? extractYouTubeId(effectiveVideo.url)
      : null;
  const ytPlaylistId =
    effectiveVideo && effectiveVideo.sourceType === 'youtube_playlist'
      ? effectiveVideo.playlistId ?? extractYouTubePlaylistId(effectiveVideo.url)
      : null;
  const isYouTube = Boolean(ytId || ytPlaylistId);

  const trimIntroRef = useRef(trimIntroSeconds);
  trimIntroRef.current = trimIntroSeconds;
  const trimOutroRef = useRef(trimOutroSeconds);
  trimOutroRef.current = trimOutroSeconds;
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const effectiveSourceTypeRef = useRef(effectiveVideo?.sourceType ?? null);
  effectiveSourceTypeRef.current = effectiveVideo?.sourceType ?? null;

  const handlePickItem = useCallback(
    (item: PlaylistItem) => {
      onSelectVideo(item.id);
      setIsPlaying(true);
      setIsPlaylistOpen(false);
      if (inSharedRoom && watchTogether && item.sourceType !== 'local') {
        onBroadcastVideoSync({
          videoUrl: item.url,
          videoTitle: item.title,
          sourceType: item.sourceType,
          isPlaying: true,
          currentTime: 0,
        });
      }
    },
    [inSharedRoom, onBroadcastVideoSync, onSelectVideo, watchTogether]
  );

  const advanceToNextVideo = useCallback(() => {
    const now = Date.now();
    if (now - advanceGuardRef.current < 1200) return;
    advanceGuardRef.current = now;

    if (effectiveSourceTypeRef.current === 'youtube_playlist' && ytPlayerRef.current) {
      ytPlayerRef.current.nextVideo();
      return;
    }

    const list = playlistRef.current;
    const idx = activeIdxRef.current;
    if (list.length === 0 || idx === -1) return;
    if (idx + 1 < list.length) {
      const next = list[idx + 1];
      if (next) handlePickItem(next);
    } else {
      setIsPlaying(false);
    }
  }, [handlePickItem]);

  const advanceRef = useRef(advanceToNextVideo);
  advanceRef.current = advanceToNextVideo;

  // Initialize & drive YouTube IFrame Player API for seamless continuous playlist + intro/outro trim
  useEffect(() => {
    if (!isYouTube) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
      }
      return;
    }

    let cancelled = false;

    const mountOrUpdate = async () => {
      await loadYouTubeIframeApi();
      if (cancelled || !ytHostRef.current || !window.YT?.Player) return;

      const startSec = Math.max(0, trimIntroRef.current);

      if (!ytPlayerRef.current) {
        ytReadyRef.current = false;
        const container = ytHostRef.current;
        container.innerHTML = '';
        const mountEl = document.createElement('div');
        mountEl.className = 'h-full w-full';
        container.appendChild(mountEl);

        ytPlayerRef.current = new window.YT.Player(mountEl, {
          width: '100%',
          height: '100%',
          videoId: ytId ?? undefined,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            start: startSec,
            origin: window.location.origin,
            ...(ytPlaylistId && !ytId ? { listType: 'playlist', list: ytPlaylistId } : {}),
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              ytReadyRef.current = true;
              if (ytPlaylistId && !ytId) {
                e.target.loadPlaylist({
                  list: ytPlaylistId,
                  listType: 'playlist',
                  startSeconds: trimIntroRef.current,
                });
              } else if (ytId && startSec > 0) {
                e.target.seekTo(startSec, true);
              }
              e.target.playVideo();
              setIsPlaying(true);
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const PS = window.YT?.PlayerState;
              if (!PS) return;
              if (e.data === PS.PLAYING) {
                setIsPlaying(true);
                const cur = e.target.getCurrentTime();
                const intro = trimIntroRef.current;
                if (intro > 0 && cur < intro - 1.2) {
                  e.target.seekTo(intro, true);
                }
              } else if (e.data === PS.PAUSED) {
                setIsPlaying(false);
              } else if (e.data === PS.ENDED) {
                advanceRef.current();
              }
            },
          },
        });
      } else if (ytReadyRef.current) {
        if (ytPlaylistId && !ytId) {
          ytPlayerRef.current.loadPlaylist({
            list: ytPlaylistId,
            listType: 'playlist',
            startSeconds: startSec,
          });
        } else if (ytId) {
          ytPlayerRef.current.loadVideoById({
            videoId: ytId,
            startSeconds: startSec,
          });
        }
        setIsPlaying(true);
      }
    };

    void mountOrUpdate();

    return () => {
      cancelled = true;
    };
  }, [isYouTube, ytId, ytPlaylistId]);

  // Clean up YT player only when unmounting the VideoPlaylistPanel
  useEffect(() => {
    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
      }
    };
  }, []);

  // Poll YouTube currentTime vs duration to enforce Skip Outro cleanly & auto-advance seamlessly
  useEffect(() => {
    if (!isYouTube) return;
    const id = window.setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) return;
      try {
        const state = player.getPlayerState();
        if (state !== 1) return; // Only check while actively playing
        const duration = player.getDuration();
        const current = player.getCurrentTime();
        const outro = trimOutroRef.current;
        const intro = trimIntroRef.current;

        if (intro > 0 && current < intro - 1.5) {
          player.seekTo(intro, true);
          return;
        }

        if (outro > 0 && duration > intro + outro + 2 && current >= duration - outro) {
          advanceRef.current();
        }
      } catch {
        // Ignore transient YT API read errors
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [isYouTube]);

  // Apply remote playback state cleanly without re-emitting
  useEffect(() => {
    if (!inSharedRoom || !watchTogether || !remoteVideoState) return;
    isRemoteUpdateRef.current = true;
    setIsPlaying(remoteVideoState.isPlaying);

    if (remoteVideoState.sourceType === 'direct' && videoElRef.current) {
      const el = videoElRef.current;
      if (Math.abs(el.currentTime - remoteVideoState.currentTime) > 1.5) {
        el.currentTime = remoteVideoState.currentTime;
      }
      if (remoteVideoState.isPlaying) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    } else if (
      (remoteVideoState.sourceType === 'youtube' ||
        remoteVideoState.sourceType === 'youtube_playlist') &&
      ytPlayerRef.current &&
      ytReadyRef.current
    ) {
      if (remoteVideoState.isPlaying) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
    }

    const t = window.setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 250);
    return () => window.clearTimeout(t);
  }, [inSharedRoom, remoteVideoState, watchTogether]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = videoUrl.trim();
    if (!raw || isImportingPlaylist) return;
    setImportError(null);

    const listId = extractYouTubePlaylistId(raw);
    const singleYtId = extractYouTubeId(raw);

    // If URL contains a YouTube playlist (?list=...), import ALL videos cleanly so they play continuously as one video
    if (listId) {
      setIsImportingPlaylist(true);
      try {
        const res = await fetch(
          `/api/youtube/playlist?url=${encodeURIComponent(raw)}&listId=${encodeURIComponent(listId)}`
        );
        const data = (await res.json()) as {
          playlistTitle?: string;
          items?: Array<{
            videoId: string;
            title: string;
            url: string;
            durationSeconds?: number;
          }>;
          nativePlaylistFallback?: boolean;
          error?: string;
        };

        if (res.ok && data.items && data.items.length > 0) {
          const existingUrls = new Set(playlist.map((p) => p.url));
          const toAdd = data.items
            .filter((item) => !existingUrls.has(item.url))
            .map((item) => ({
              title: item.title,
              url: item.url,
              sourceType: 'youtube' as const,
              durationSeconds: item.durationSeconds,
            }));

          if (toAdd.length > 0) {
            onAddPlaylistBatch(toAdd);
            if (inSharedRoom && watchTogether) {
              onBroadcastVideoSync({
                videoUrl: toAdd[0].url,
                videoTitle: toAdd[0].title,
                sourceType: 'youtube',
                isPlaying: true,
                currentTime: trimIntroSeconds,
              });
            }
          } else {
            const firstMatch = playlist.find((p) =>
              data.items?.some((it) => it.url === p.url)
            );
            if (firstMatch) onSelectVideo(firstMatch.id);
          }
          setVideoUrl('');
          setVideoTitle('');
          setIsPlaylistOpen(false);
          setIsImportingPlaylist(false);
          return;
        }
      } catch {
        // Fall through to native playlist embed fallback if network extraction fails
      } finally {
        setIsImportingPlaylist(false);
      }

      // Native playlist fallback (or single video if ?v=... wasn't a multi-item list)
      if (!singleYtId) {
        const title = videoTitle.trim() || 'YouTube Study Playlist';
        onAddVideo({
          title,
          url: raw,
          sourceType: 'youtube_playlist',
          playlistId: listId,
        });
        if (inSharedRoom && watchTogether) {
          onBroadcastVideoSync({
            videoUrl: raw,
            videoTitle: title,
            sourceType: 'youtube_playlist',
            isPlaying: true,
            currentTime: trimIntroSeconds,
          });
        }
        setVideoUrl('');
        setVideoTitle('');
        setIsPlaylistOpen(false);
        return;
      }
    }

    const sourceType: PlaylistItem['sourceType'] = singleYtId ? 'youtube' : 'direct';
    const title =
      videoTitle.trim() ||
      (singleYtId
        ? 'YouTube Study Video'
        : raw.split('/').pop()?.split('?')[0] || 'Study Video');

    onAddVideo({ title, url: raw, sourceType });
    if (inSharedRoom && watchTogether) {
      onBroadcastVideoSync({
        videoUrl: raw,
        videoTitle: title,
        sourceType,
        isPlaying: true,
        currentTime: trimIntroSeconds,
      });
    }
    setVideoUrl('');
    setVideoTitle('');
    setIsPlaylistOpen(false);
  };

  const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    onAddVideo({
      title: file.name.replace(/\.[^/.]+$/, ''),
      url: blobUrl,
      sourceType: 'local',
    });
    e.target.value = '';
    setIsPlaylistOpen(false);
  };

  const togglePlayPause = () => {
    if (!effectiveVideo) return;
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    if (isYouTube && ytPlayerRef.current && ytReadyRef.current) {
      if (nextPlaying) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
    } else if (videoElRef.current) {
      if (nextPlaying) videoElRef.current.play().catch(() => {});
      else videoElRef.current.pause();
    }

    if (inSharedRoom && watchTogether && effectiveVideo.sourceType !== 'local') {
      onBroadcastVideoSync({
        videoUrl: effectiveVideo.url,
        videoTitle: effectiveVideo.title,
        sourceType: effectiveVideo.sourceType,
        isPlaying: nextPlaying,
        currentTime: videoElRef.current?.currentTime ?? 0,
      });
    }
  };

  const handleStepVideo = (delta: -1 | 1) => {
    if (effectiveVideo?.sourceType === 'youtube_playlist' && ytPlayerRef.current) {
      if (delta > 0) ytPlayerRef.current.nextVideo();
      else ytPlayerRef.current.previousVideo();
      return;
    }
    if (playlist.length < 2 || activeIdx === -1) return;
    const nextIdx = (activeIdx + delta + playlist.length) % playlist.length;
    const next = playlist[nextIdx];
    if (next) handlePickItem(next);
  };

  const introMin = Math.floor(trimIntroSeconds / 60);
  const introSec = trimIntroSeconds % 60;
  const outroMin = Math.floor(trimOutroSeconds / 60);
  const outroSec = trimOutroSeconds % 60;
  const hasTrim = trimIntroSeconds > 0 || trimOutroSeconds > 0;

  const activePlaylist =
    playlists.find((g) => g.id === activePlaylistId) ?? playlists[0] ?? null;

  const submitNewPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newPlaylistTitle.trim();
    if (!title) return;
    onCreatePlaylist(title);
    setNewPlaylistTitle('');
    setCreatingPlaylist(false);
  };

  const commitRenamePlaylist = (id: string) => {
    const clean = editingPlaylistTitle.trim();
    if (clean) {
      onRenamePlaylist(id, clean);
    }
    setEditingPlaylistId(null);
    setEditingPlaylistTitle('');
  };

  return (
    <section
      aria-label="Study Video Player and Playlist"
      className="glass-panel relative flex min-h-[430px] sm:min-h-[480px] lg:min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
    >
      {/* Slim Header: Quick Prev/Next + Title + Trim Intro/Outro + Playlist Drawer Toggle */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cyan-200/[0.08] px-3.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {(playlist.length > 1 || effectiveVideo?.sourceType === 'youtube_playlist') && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleStepVideo(-1)}
                title="Previous video"
                aria-label="Previous video"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-cyan-200/15 bg-cyan-400/[0.05] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStepVideo(1)}
                title="Next video"
                aria-label="Next video"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-cyan-200/15 bg-cyan-400/[0.05] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Film className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span className="truncate text-xs font-medium text-slate-100">
            {effectiveVideo ? effectiveVideo.title : 'No video selected'}
          </span>
          {activeIdx >= 0 && playlist.length > 0 && (
            <span className="font-mono-tabular shrink-0 text-[11px] text-slate-400">
              ({activeIdx + 1}/{playlist.length})
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {inSharedRoom && (
            <div className="flex items-center rounded-md border border-cyan-200/15 bg-[#040814]/85 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  if (!watchTogether) onToggleWatchTogether();
                }}
                className={`flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                  watchTogether
                    ? 'bio-glow-chip border'
                    : 'text-slate-400 hover:text-cyan-100'
                }`}
              >
                <Users className="h-3 w-3" />
                Together
              </button>
              <button
                type="button"
                onClick={() => {
                  if (watchTogether) onToggleWatchTogether();
                }}
                className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                  !watchTogether
                    ? 'bg-cyan-400/15 text-cyan-100'
                    : 'text-slate-400 hover:text-cyan-100'
                }`}
              >
                Separate
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsTrimOpen((v) => !v)}
            title="Automatically cut creator intro & outro for the active playlist"
            className={`flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
              isTrimOpen || hasTrim
                ? 'bio-glow-chip'
                : 'border-cyan-200/15 bg-cyan-400/[0.05] text-slate-200 hover:border-cyan-300/40'
            }`}
          >
            <Scissors className="h-3 w-3 text-amber-200" />
            {hasTrim
              ? `Trim ${formatSecLabel(trimIntroSeconds)} / ${formatSecLabel(trimOutroSeconds)}`
              : 'Skip Intro/Outro'}
          </button>

          {effectiveVideo && (
            <button
              type="button"
              onClick={togglePlayPause}
              className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-cyan-200/15 bg-cyan-400/[0.07] px-2 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/15"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPlaylistOpen((v) => !v)}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
              isPlaylistOpen
                ? 'bio-glow-chip'
                : 'border-cyan-200/15 bg-cyan-400/[0.05] text-slate-200 hover:border-cyan-300/40'
            }`}
          >
            <ListVideo className="h-3.5 w-3.5" />
            Videos ({playlist.length})
          </button>
        </div>
      </div>

      {/* Multi-Playlist Switcher Bar (Each playlist preserves its own videos and intro/outro trim rules) */}
      <div className="quiet-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-cyan-200/[0.08] bg-[#040917]/75 px-3 py-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Playlists
        </span>
        {playlists.map((pl) => {
          const active = pl.id === activePlaylist?.id;
          const plHasTrim = pl.trimIntroSeconds > 0 || pl.trimOutroSeconds > 0;
          return (
            <button
              key={pl.id}
              type="button"
              onClick={() => onSelectPlaylist(pl.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'border-cyan-300/45 bg-cyan-400/18 text-cyan-100'
                  : 'border-cyan-200/12 bg-cyan-400/[0.04] text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100'
              }`}
            >
              <span>{pl.title}</span>
              <span className="font-mono-tabular text-[10px] opacity-75">
                ({pl.items.length})
              </span>
              {plHasTrim && (
                <Scissors className="h-2.5 w-2.5 text-amber-200" aria-label="Has custom trim rule" />
              )}
            </button>
          );
        })}

        {creatingPlaylist ? (
          <form onSubmit={submitNewPlaylist} className="flex shrink-0 items-center gap-1">
            <input
              type="text"
              autoFocus
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              placeholder="Playlist name..."
              className="bio-input h-6 w-32 rounded px-2 text-[11px] placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!newPlaylistTitle.trim()}
              className="bio-btn-primary h-6 cursor-pointer rounded px-2 text-[10px] font-semibold disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingPlaylist(false);
                setNewPlaylistTitle('');
              }}
              aria-label="Cancel new playlist"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-slate-400 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingPlaylist(true)}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-dashed border-cyan-300/30 bg-cyan-400/[0.04] px-2 py-1 text-[11px] font-medium text-cyan-200 hover:border-cyan-300/55 hover:bg-cyan-400/12 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            New Playlist
          </button>
        )}
      </div>

      {/* Collapsible Manual Intro/Outro Trim Strip */}
      {isTrimOpen && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cyan-200/[0.09] bg-[#040E18]/85 px-3.5 py-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 text-slate-300">
              <span className="font-medium text-cyan-200">Cut Start:</span>
              <input
                type="number"
                min={0}
                max={120}
                aria-label="Skip intro minutes"
                value={introMin}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  onUpdateTrimSettings(
                    Math.max(0, Number(e.target.value) || 0) * 60 + introSec,
                    trimOutroSeconds
                  )
                }
                className="bio-input font-mono-tabular h-6 w-11 rounded px-1 text-center"
              />
              <span className="text-slate-400">m</span>
              <input
                type="number"
                min={0}
                max={59}
                aria-label="Skip intro seconds"
                value={introSec}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  onUpdateTrimSettings(
                    introMin * 60 + Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                    trimOutroSeconds
                  )
                }
                className="bio-input font-mono-tabular h-6 w-11 rounded px-1 text-center"
              />
              <span className="text-slate-400">s</span>
            </div>

            <div className="flex items-center gap-1 text-slate-300">
              <span className="font-medium text-amber-200">Cut End:</span>
              <input
                type="number"
                min={0}
                max={120}
                aria-label="Skip outro minutes"
                value={outroMin}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  onUpdateTrimSettings(
                    trimIntroSeconds,
                    Math.max(0, Number(e.target.value) || 0) * 60 + outroSec
                  )
                }
                className="bio-input font-mono-tabular h-6 w-11 rounded px-1 text-center"
              />
              <span className="text-slate-400">m</span>
              <input
                type="number"
                min={0}
                max={59}
                aria-label="Skip outro seconds"
                value={outroSec}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  onUpdateTrimSettings(
                    trimIntroSeconds,
                    outroMin * 60 + Math.max(0, Math.min(59, Number(e.target.value) || 0))
                  )
                }
                className="bio-input font-mono-tabular h-6 w-11 rounded px-1 text-center"
              />
              <span className="text-slate-400">s</span>
            </div>
          </div>

          <span className="text-[11px] text-slate-400">
            Rule saved specifically for{' '}
            <strong className="text-cyan-200">
              {activePlaylist?.title ?? 'this playlist'}
            </strong>
          </span>
        </div>
      )}

      {/* Full-Width & Full-Height Video Stage */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-black">
        {effectiveVideo ? (
          isYouTube ? (
            <div ref={ytHostRef} className="h-full w-full flex-1 bg-black" />
          ) : (
            <video
              ref={videoElRef}
              src={effectiveVideo.url}
              controls
              autoPlay
              onLoadedMetadata={() => {
                const el = videoElRef.current;
                if (el && trimIntroSeconds > 0 && el.currentTime < trimIntroSeconds) {
                  el.currentTime = trimIntroSeconds;
                }
              }}
              onTimeUpdate={() => {
                const el = videoElRef.current;
                if (!el || !el.duration || Number.isNaN(el.duration)) return;
                if (
                  trimOutroSeconds > 0 &&
                  el.duration > trimIntroSeconds + trimOutroSeconds + 2 &&
                  el.currentTime >= el.duration - trimOutroSeconds
                ) {
                  advanceToNextVideo();
                }
              }}
              onPlay={() => {
                setIsPlaying(true);
                if (
                  !isRemoteUpdateRef.current &&
                  inSharedRoom &&
                  watchTogether &&
                  effectiveVideo.sourceType !== 'local'
                ) {
                  onBroadcastVideoSync({
                    videoUrl: effectiveVideo.url,
                    videoTitle: effectiveVideo.title,
                    sourceType: effectiveVideo.sourceType,
                    isPlaying: true,
                    currentTime: videoElRef.current?.currentTime ?? 0,
                  });
                }
              }}
              onPause={() => {
                setIsPlaying(false);
                if (
                  !isRemoteUpdateRef.current &&
                  inSharedRoom &&
                  watchTogether &&
                  effectiveVideo.sourceType !== 'local'
                ) {
                  onBroadcastVideoSync({
                    videoUrl: effectiveVideo.url,
                    videoTitle: effectiveVideo.title,
                    sourceType: effectiveVideo.sourceType,
                    isPlaying: false,
                    currentTime: videoElRef.current?.currentTime ?? 0,
                  });
                }
              }}
              onEnded={() => advanceToNextVideo()}
              className="h-full w-full flex-1 object-contain"
            />
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-[#040711]/75 p-6 text-center">
            <Film className="mb-2.5 h-8 w-8 text-cyan-300/80" />
            <p className="font-display text-base font-medium text-slate-100">
              Paste a YouTube Video or Full Playlist Link
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              Paste any YouTube playlist URL and every video plays back-to-back automatically like one continuous video — and use Skip Intro/Outro above to trim repeated intros and endings.
            </p>

            <form
              onSubmit={handleAddSubmit}
              className="mt-4 flex w-full max-w-lg flex-wrap items-center gap-2"
            >
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste YouTube video, YouTube playlist URL, or MP4 link..."
                className="bio-input min-w-0 flex-1 rounded-lg px-3 py-2 text-xs placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!videoUrl.trim() || isImportingPlaylist}
                className="bio-btn-primary flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-semibold disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                {isImportingPlaylist ? 'Loading...' : 'Add & Play'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-cyan-400/[0.06] px-3 text-xs font-medium text-slate-200 hover:border-cyan-300/35 hover:text-cyan-100"
              >
                <Upload className="h-3.5 w-3.5" />
                Local File
              </button>
            </form>
            {importError && (
              <p className="mt-2 text-xs text-rose-300">{importError}</p>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleLocalFile}
          className="hidden"
        />

        {/* Slide-Over Playlist Drawer (Full width on mobile/tablet portrait so choosing videos is effortless) */}
        {isPlaylistOpen && (
          <aside
            aria-label="Manage Playlist"
            className="absolute inset-0 z-30 flex w-full flex-col border-l border-cyan-200/20 bg-[#050918]/98 shadow-2xl backdrop-blur-xl md:left-auto md:w-96"
          >
            <div className="flex items-center justify-between gap-2 border-b border-cyan-200/[0.1] px-3.5 py-2.5">
              {activePlaylist && editingPlaylistId === activePlaylist.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRenamePlaylist(activePlaylist.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={editingPlaylistTitle}
                    onChange={(e) => setEditingPlaylistTitle(e.target.value)}
                    className="bio-input h-7 min-w-0 flex-1 rounded px-2 text-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Save playlist name"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-cyan-400/20 text-cyan-100"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-display text-xs font-semibold text-slate-100">
                    {activePlaylist ? activePlaylist.title : 'Playlist'} ({playlist.length})
                  </span>
                  {activePlaylist && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlaylistId(activePlaylist.id);
                        setEditingPlaylistTitle(activePlaylist.title);
                      }}
                      title="Rename playlist"
                      aria-label="Rename playlist"
                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {activePlaylist && playlists.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeletePlaylist(activePlaylist.id)}
                      title="Delete this playlist"
                      aria-label="Delete this playlist"
                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-200"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsPlaylistOpen(false)}
                aria-label="Close playlist drawer"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-cyan-400/15 hover:text-cyan-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick playlist tabs inside drawer for mobile/tablet navigation */}
            {playlists.length > 1 && (
              <div className="quiet-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b border-cyan-200/[0.08] bg-[#030611]/70 px-3 py-1.5">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => onSelectPlaylist(pl.id)}
                    className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                      pl.id === activePlaylist?.id
                        ? 'bg-cyan-400/20 text-cyan-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {pl.title} ({pl.items.length})
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={handleAddSubmit}
              className="shrink-0 space-y-1.5 border-b border-cyan-200/[0.09] p-3"
            >
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Video title (optional for single links)"
                className="bio-input w-full rounded-md px-2.5 py-1.5 text-xs placeholder:text-slate-500"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="YouTube playlist / video or MP4 URL..."
                  className="bio-input min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-xs placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!videoUrl.trim() || isImportingPlaylist}
                  aria-label="Add video or playlist URL"
                  className="bio-btn-primary flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Load local video file"
                  aria-label="Load local video file"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-cyan-200/15 bg-cyan-400/[0.06] text-slate-300 hover:text-cyan-100"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
              </div>
              {isImportingPlaylist && (
                <p className="text-[11px] text-cyan-200">
                  Importing all videos from YouTube playlist...
                </p>
              )}
            </form>

            <div className="quiet-scroll min-h-0 flex-1 divide-y divide-cyan-200/[0.07] overflow-y-auto p-2">
              {playlist.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-slate-500">
                  No videos saved in this study card yet.
                </p>
              ) : (
                playlist.map((item, idx) => {
                  const isSelected = effectiveVideo?.url === item.url;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                        isSelected
                          ? 'bg-gradient-to-r from-cyan-400/15 to-amber-400/10'
                          : 'hover:bg-cyan-400/[0.05]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handlePickItem(item)}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <p
                          className={`truncate text-xs font-medium ${
                            isSelected ? 'text-cyan-100' : 'text-slate-200'
                          }`}
                        >
                          {idx + 1}. {item.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {item.sourceType === 'youtube_playlist'
                            ? 'YouTube Playlist'
                            : item.sourceType === 'youtube'
                              ? 'YouTube'
                              : item.sourceType === 'local'
                                ? 'Local file'
                                : 'Video link'}
                        </p>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onReorderVideo(idx, idx - 1)}
                          aria-label="Move video up"
                          className="cursor-pointer p-1 text-slate-500 hover:text-cyan-100 disabled:opacity-25"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === playlist.length - 1}
                          onClick={() => onReorderVideo(idx, idx + 1)}
                          aria-label="Move video down"
                          className="cursor-pointer p-1 text-slate-500 hover:text-cyan-100 disabled:opacity-25"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveVideo(item.id)}
                          aria-label="Remove video"
                          className="cursor-pointer p-1 text-slate-500 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
