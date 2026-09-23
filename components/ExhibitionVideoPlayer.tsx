'use client';
import { useEffect, useRef } from 'react';

type Props = { src: string; hologram?: boolean; onReady?: () => void; onEnded?: () => void; onError?: () => void };
/** 单条视频不 loop；结束事件交给播放队列。四面模式只监听主视频结束。 */
export default function ExhibitionVideoPlayer({ src, hologram = false, onReady, onEnded, onError }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onEnded, onError });
  useEffect(() => { callbacks.current = { onReady, onEnded, onError }; }, [onReady, onEnded, onError]);
  useEffect(() => {
    const videos = Array.from(root.current?.querySelectorAll('video') ?? []);
    let stopped = false, starting = false, began = false;
    const fail = () => { if (!stopped) callbacks.current.onError?.(); };
    const ended = () => { if (!stopped) callbacks.current.onEnded?.(); };
    const start = async () => {
      if (stopped || starting || !videos.every(video => video.readyState >= 2)) return;
      starting = true;
      try {
        videos.forEach(video => { video.currentTime = 0; video.muted = true; });
        await Promise.all(videos.map(video => video.play()));
        if (!stopped) { began = true; callbacks.current.onReady?.(); }
      } catch { fail(); }
    };
    videos.forEach((video, index) => {
      video.addEventListener('loadeddata', start); video.addEventListener('error', fail);
      if (index === 0) video.addEventListener('ended', ended);
      // React Strict Mode 会执行清理后重新运行 effect，需要恢复媒体源。
      if (video.getAttribute('src') !== src) { video.src = src; video.load(); }
    });
    void start();
    const timer = setInterval(() => {
      if (!began || stopped || videos.length < 2) return;
      const lead = videos[0];
      // 首尾附近避免因 loop 边界造成反复跳转。
      if (lead.currentTime < 0.15 || lead.duration - lead.currentTime < 0.15) return;
      videos.slice(1).forEach(video => { if (Math.abs(video.currentTime - lead.currentTime) > 0.08) video.currentTime = lead.currentTime; });
    }, 250);
    return () => {
      stopped = true; clearInterval(timer);
      videos.forEach((video, index) => {
        video.removeEventListener('loadeddata', start); video.removeEventListener('error', fail);
        if (index === 0) video.removeEventListener('ended', ended);
        video.pause(); video.removeAttribute('src'); video.load();
      });
    };
  }, [src, hologram]);
  const video = () => <video src={src} autoPlay muted playsInline preload="auto" controls={false} disablePictureInPicture aria-hidden="true" />;
  return hologram ? <div ref={root} className="hologram-layout video-layout">{['top','right','bottom','left'].map(side => <div className={`hologram-face face-${side}`} key={side}><div className="face-orientation"><div className="video-frame">{video()}</div></div></div>)}</div> : <div ref={root} className="single-frame single-video">{video()}</div>;
}

