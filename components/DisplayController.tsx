'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useExhibitionPlaylist } from '@/hooks/useExhibitionPlaylist';
import type { UploadRecord } from '@/lib/cloudbase';
import EmptyExhibitionState from './EmptyExhibitionState';
import ExhibitionVideoPlayer from './ExhibitionVideoPlayer';
import TransitionLayer, { type TransitionPhase } from './TransitionLayer';

const TRANSITION_MS = 700;

export default function DisplayController() {
  const params = useSearchParams();
  const demo = params.get('demo') === 'true';
  const hologram = params.get('mode') === 'hologram';
  const playlist = useExhibitionPlaylist(demo);
  const stage = useRef<HTMLDivElement>(null);
  const switching = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [current, setCurrent] = useState<UploadRecord | null>(null);
  const [phase, setPhase] = useState<TransitionPhase>('enter');
  const [playbackToken, setPlaybackToken] = useState(0);
  const [cursor, setCursor] = useState(false);

  useEffect(() => {
    if (!current && playlist[0]) { setCurrent(playlist[0]); setPhase('enter'); setPlaybackToken(value => value + 1); }
    // 当云相册已经没有任何 ready 视频时，及时离开已删除的最后一条。
    if (current && playlist.length === 0 && !switching.current) {
      switching.current = true; setPhase('exit');
      transitionTimer.current = setTimeout(() => { setCurrent(null); switching.current = false; }, TRANSITION_MS);
    }
  }, [playlist, current]);

  const nextRecord = useMemo(() => {
    if (!playlist.length) return null;
    if (!current) return playlist[0];
    const index = playlist.findIndex(item => item.id === current.id);
    return index < 0 ? playlist[0] : playlist[(index + 1) % playlist.length];
  }, [playlist, current]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') { console.info('current video_url', current?.video_url ?? null); console.info(`[DISPLAY] current id: ${current?.id ?? 'none'}`); }
  }, [current?.video_url]);

  // 当前播放期间静默预取下一条，不挂载到可见舞台，也不会抢占播放。
  useEffect(() => {
    const src = nextRecord?.video_url;
    if (!src || src === current?.video_url) return;
    const video = document.createElement('video'); video.preload = 'auto'; video.muted = true; video.src = src; video.load();
    return () => { video.removeAttribute('src'); video.load(); };
  }, [nextRecord?.video_url, current?.video_url]);

  const advance = useCallback(() => {
    if (switching.current || !current) return;
    const index = playlist.findIndex(item => item.id === current.id);
    const next = playlist.length ? (index < 0 ? playlist[0] : playlist[(index + 1) % playlist.length]) : null;
    switching.current = true; setPhase('exit');
    transitionTimer.current = setTimeout(() => {
      setCurrent(next); setPlaybackToken(value => value + 1); setPhase('enter'); switching.current = false;
    }, TRANSITION_MS);
  }, [playlist, current]);

  useEffect(() => () => clearTimeout(transitionTimer.current), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const move = () => { setCursor(true); clearTimeout(timer); timer = setTimeout(() => setCursor(false), 2500); };
    window.addEventListener('mousemove', move); document.body.classList.add('display-body'); stage.current?.requestFullscreen?.().catch(() => {});
    return () => { clearTimeout(timer); window.removeEventListener('mousemove', move); document.body.classList.remove('display-body'); };
  }, []);
  const fullscreen = () => { if (!document.fullscreenElement) stage.current?.requestFullscreen?.().catch(() => {}); };

  return <div ref={stage} className={`display-stage ${cursor ? 'cursor-visible' : ''}`} onClick={fullscreen} data-playlist-size={playlist.length} data-current-id={current?.id ?? ''}>
    {!current || !current.video_url ? <EmptyExhibitionState /> : <TransitionLayer phase={phase}>
      <ExhibitionVideoPlayer
        key={`${current.id}-${playbackToken}`}
        src={current.video_url}
        hologram={hologram}
        onReady={() => setPhase('visible')}
        onEnded={advance}
        onError={advance}
      />
    </TransitionLayer>}
  </div>;
}
