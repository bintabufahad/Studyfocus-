import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Film,
  ListVideo,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { PlaylistItem, SharedVideoState } from '../types';

interface VideoPlaylistPanelProps {
  playlist: PlaylistItem[];
  activeVideoId: string | null;
  inSharedRoom: boolean;
  watchTogether: boolean;
  remoteVideoState: SharedVideoState | null;
  onToggleWatchTogether: () => void;
  onSelectVideo: (videoId: string) => void;
  onAddVideo: (item: Omit<PlaylistItem, 'id' | 'addedAt'>) => void;
  onRemoveVideo: (videoId: string) => void;
  onReorderVideo: (fromIndex: number, toIndex: number) => void;
  onBroadcastVideoSync: (state: Omit<SharedVideoState, 'updatedAt' | 'updatedBy'>) => void;
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.replace(/^www\./, '');
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

export function VideoPlaylistPanel({
  playlist,
  activeVideoId,
  inSharedRoom,
  watchTogether,
  remoteVideoState,
  onToggleWatchTogether,
  onSelectVideo,
  onAddVideo,
  onRemoveVideo,
  onReorderVideo,
  onBroadcastVideoSync,
}: VideoPlaylistPanelProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeLocalItem =
    playlist.find((v) => v.id === activeVideoId) ?? playlist[0] ?? null;
  const activeIdx = activeLocalItem
    ? playlist.findIndex((v) => v.id === activeLocalItem.id)
    : -1;

  // When Watch Together is active and friend synced a video, display the synced stream
  const effectiveVideo =
    inSharedRoom && watchTogether && remoteVideoState
      ? {
          id: 'shared-sync',
          title: remoteVideoState.videoTitle,
          url: remoteVideoState.videoUrl,
          sourceType: remoteVideoState.sourceType,
        }
      : activeLocalItem;

  const ytId =
    effectiveVideo && effectiveVideo.sourceType === 'youtube'
      ? extractYouTubeId(effectiveVideo.url)
      : null;

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
    } else if (remoteVideoState.sourceType === 'youtube' && iframeRef.current?.contentWindow) {
      const cmd = remoteVideoState.isPlaying ? 'playVideo' : 'pauseVideo';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: cmd, args: '' }),
        '*'
      );
    }

    const t = window.setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 250);
    return () => window.clearTimeout(t);
  }, [inSharedRoom, remoteVideoState, watchTogether]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = videoUrl.trim();
    if (!raw) return;

    const yt = extractYouTubeId(raw);
    const sourceType: PlaylistItem['sourceType'] = yt ? 'youtube' : 'direct';
    const title =
      videoTitle.trim() ||
      (yt ? 'YouTube Study Video' : raw.split('/').pop()?.split('?')[0] || 'Study Video');

    onAddVideo({ title, url: raw, sourceType });
    if (inSharedRoom && watchTogether) {
      onBroadcastVideoSync({
        videoUrl: raw,
        videoTitle: title,
        sourceType,
        isPlaying: true,
        currentTime: 0,
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

  const handlePickItem = (item: PlaylistItem) => {
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
  };

  const togglePlayPause = () => {
    if (!effectiveVideo) return;
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    if (effectiveVideo.sourceType === 'youtube' && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: nextPlaying ? 'playVideo' : 'pauseVideo',
          args: '',
        }),
        '*'
      );
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
    if (playlist.length < 2 || activeIdx === -1) return;
    const nextIdx = (activeIdx + delta + playlist.length) % playlist.length;
    const next = playlist[nextIdx];
    if (next) handlePickItem(next);
  };

  return (
    <section
      aria-label="Study Video Player and Playlist"
      className="glass-panel relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
    >
      {/* Slim Single-Row Header: Quick Prev/Next + Title + Drawer Toggle (Zero Wasted Sidebar Space) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {playlist.length > 1 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => handleStepVideo(-1)}
                title="Previous video"
                aria-label="Previous video"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStepVideo(1)}
                title="Next video"
                aria-label="Next video"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Film className="h-3.5 w-3.5 text-amber-300 shrink-0" />
          <span className="truncate text-xs font-medium text-slate-100">
            {effectiveVideo ? effectiveVideo.title : 'No video selected'}
          </span>
          {activeIdx >= 0 && playlist.length > 0 && (
            <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
              ({activeIdx + 1}/{playlist.length})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {inSharedRoom && (
            <div className="flex items-center rounded-md border border-white/[0.08] bg-[#090C18] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  if (!watchTogether) onToggleWatchTogether();
                }}
                className={`flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                  watchTogether
                    ? 'bg-amber-400/20 text-amber-200'
                    : 'text-slate-400 hover:text-slate-200'
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
                    ? 'bg-white/10 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Separate
              </button>
            </div>
          )}

          {effectiveVideo && (
            <button
              type="button"
              onClick={togglePlayPause}
              className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-slate-100 hover:bg-white/10"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPlaylistOpen((v) => !v)}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              isPlaylistOpen
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10'
            }`}
          >
            <ListVideo className="h-3.5 w-3.5" />
            Playlist ({playlist.length})
          </button>
        </div>
      </div>

      {/* Full-Width & Full-Height Video Stage */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-black">
        {effectiveVideo ? (
          ytId ? (
            <iframe
              ref={iframeRef}
              title={effectiveVideo.title}
              src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1&rel=0`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full flex-1 border-0"
            />
          ) : (
            <video
              ref={videoElRef}
              src={effectiveVideo.url}
              controls
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
              onEnded={() => handleStepVideo(1)}
              className="h-full w-full flex-1 object-contain"
            />
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-[#090C18] p-6 text-center">
            <Film className="mb-2.5 h-8 w-8 text-amber-300/75" />
            <p className="font-display text-base font-medium text-slate-100">
              Add a study video to play full-screen here
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              Paste a YouTube or video URL, or load a local video file. Your playlist stays tucked cleanly behind the Playlist button so the video gets maximum space.
            </p>

            <form
              onSubmit={handleAddSubmit}
              className="mt-4 flex w-full max-w-lg flex-wrap items-center gap-2"
            >
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste YouTube or MP4 URL..."
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0B0F1E] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!videoUrl.trim()}
                className="flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-amber-400 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Add &amp; Play
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-slate-200 hover:bg-white/10"
              >
                <Upload className="h-3.5 w-3.5" />
                Local File
              </button>
            </form>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleLocalFile}
          className="hidden"
        />

        {/* Slide-Over Playlist Drawer (Only Visible When Toggled) */}
        {isPlaylistOpen && (
          <aside
            aria-label="Manage Playlist"
            className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-full flex-col border-l border-white/15 bg-[#090C18]/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2.5">
              <span className="font-display text-xs font-semibold text-slate-100">
                Session Playlist ({playlist.length})
              </span>
              <button
                type="button"
                onClick={() => setIsPlaylistOpen(false)}
                aria-label="Close playlist drawer"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form
              onSubmit={handleAddSubmit}
              className="shrink-0 space-y-1.5 border-b border-white/[0.08] p-3"
            >
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Video title (optional)"
                className="w-full rounded-md border border-white/[0.08] bg-[#0B0F1E] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="YouTube or MP4 URL..."
                  className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#0B0F1E] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!videoUrl.trim()}
                  aria-label="Add video URL to playlist"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-40 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Load local video file"
                  aria-label="Load local video file"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>

            <div className="quiet-scroll min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto p-2">
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
                        isSelected ? 'bg-amber-400/15' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handlePickItem(item)}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <p
                          className={`truncate text-xs font-medium ${
                            isSelected ? 'text-amber-200' : 'text-slate-200'
                          }`}
                        >
                          {idx + 1}. {item.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {item.sourceType === 'youtube'
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
                          className="cursor-pointer p-1 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === playlist.length - 1}
                          onClick={() => onReorderVideo(idx, idx + 1)}
                          aria-label="Move video down"
                          className="cursor-pointer p-1 text-slate-500 hover:text-slate-200 disabled:opacity-25"
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
