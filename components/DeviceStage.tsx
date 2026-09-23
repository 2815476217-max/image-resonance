'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { deviceCutout, devicePlaylist, trimDeviceBitmap, type DeviceItem } from '@/lib/deviceSource';
import { subjectFit } from '@/lib/subjectLayout';

const POLL_INTERVAL = 3000;
const MOTION_DURATION = 5000;
const EXIT_MS = 350, BLACK_MS = 250, ENTER_MS = 350;
const TRANSITION_MS = EXIT_MS + BLACK_MS + ENTER_MS;
type Prepared = { item: DeviceItem; image?: HTMLCanvasElement; video?: HTMLVideoElement; started: number; lastVideoTime?: number };
type Transition = { old: Prepared | null; next: Prepared; started: number; videoStarted: boolean };

async function prepareVideo(src: string, signal: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.loop = true;
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('云端视频加载超时')), 12000);
      const done = (error?: Error) => {
        clearTimeout(timer); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', cancelled);
        error ? reject(error) : resolve();
      };
      const ready = () => done();
      const failed = () => done(new Error('云端视频无法播放'));
      const cancelled = () => done(new DOMException('已取消', 'AbortError'));
      video.addEventListener('loadeddata', ready, { once: true }); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', cancelled, { once: true });
      video.load(); if (signal.aborted) cancelled();
    });
    await video.play(); video.pause(); video.currentTime = 0;
    return video;
  } catch (error) { video.pause(); video.removeAttribute('src'); video.load(); throw error; }
}
function releaseVideo(person: Prepared | null) {
  if (!person?.video) return;
  person.video.ontimeupdate = null; person.video.onended = null; person.video.pause(); person.video.removeAttribute('src'); person.video.load();
}
function newestFirst(a: DeviceItem, b: DeviceItem) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export default function DeviceStage() {
  const params = useSearchParams();
  const demo = params.get('demo') === 'true';
  const debug = params.get('debug') === 'true';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<Prepared | null>(null);
  const transition = useRef<Transition | null>(null);
  const [diagnostic, setDiagnostic] = useState({ currentId: '—', status: '启动中', sync: '—', latestId: '—', pendingId: '—', latestCreatedAt: '—' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    let stopped = false, frame = 0;
    let pollTimer: ReturnType<typeof setInterval>;
    let lastDebugAt = 0, syncing = false, switching = false;
    let pendingLatest: DeviceItem | null = null;
    const abort = new AbortController();
    const invalidIds = new Set<string>();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
      canvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
    };
    resize(); window.addEventListener('resize', resize);
    document.body.classList.add('display-body');
    canvas.parentElement?.requestFullscreen?.().catch(() => {});

    function draw(person: Prepared, alpha: number, now: number) {
      if (!context || !canvas || alpha <= 0) return;
      const { width, height } = canvas;
      const image = person.image, video = person.video;
      if (!image && (!video || video.readyState < 2)) return;
      if (image) {
        const fit = subjectFit(image.width, image.height, width, height);
        const phase = (now - person.started) % MOTION_DURATION / MOTION_DURATION * Math.PI * 2;
        const scale = 1 - .02 * Math.cos(phase);
        const floating = -6 * (1 - Math.cos(phase)) * (height / window.innerHeight);
        const rotation = -Math.cos(phase) * Math.PI / 180;
        context.save(); context.globalAlpha = alpha; context.translate(width / 2, height / 2 + floating);
        context.rotate(rotation); context.scale(scale, scale);
        context.drawImage(image, -image.width * fit / 2, -image.height * fit / 2, image.width * fit, image.height * fit);
        context.restore();
      } else if (video) {
        const mediaFit = Math.min(width / video.videoWidth, height / video.videoHeight);
        context.save(); context.globalAlpha = alpha;
        context.drawImage(video, (width - video.videoWidth * mediaFit) / 2, (height - video.videoHeight * mediaFit) / 2, video.videoWidth * mediaFit, video.videoHeight * mediaFit);
        context.restore();
      }
    }
    function render(now: number) {
      if (stopped || !canvas || !context) return;
      context.fillStyle = '#000000'; context.fillRect(0, 0, canvas.width, canvas.height);
      const change = transition.current;
      if (change) {
        const elapsed = now - change.started;
        if (elapsed >= EXIT_MS + BLACK_MS && !change.videoStarted) {
          change.videoStarted = true;
          if (change.next.video) void change.next.video.play().catch(error => console.warn('[DEVICE] video playback failed', error));
        }
        if (elapsed < EXIT_MS) { if (change.old) draw(change.old, 1 - elapsed / EXIT_MS, now); }
        else if (elapsed >= EXIT_MS + BLACK_MS && elapsed < TRANSITION_MS) draw(change.next, (elapsed - EXIT_MS - BLACK_MS) / ENTER_MS, now);
        else if (elapsed >= TRANSITION_MS) {
          releaseVideo(change.old); current.current = change.next; transition.current = null; draw(change.next, 1, now);
          setDiagnostic(prev => ({ ...prev, status: '播放最新影像', currentId: change.next.item.id, pendingId: pendingLatest?.id || '—' }));
        }
      } else if (current.current) draw(current.current, 1, now);
      if (debug && now - lastDebugAt >= 250) {
        lastDebugAt = now;
        setDiagnostic(prev => ({ ...prev, pendingId: pendingLatest?.id || '—' }));
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);

    async function prepare(item: DeviceItem): Promise<Prepared> {
      if (item.videoUrl) return { item, video: await prepareVideo(item.videoUrl, abort.signal), started: performance.now() };
      if (item.demo) {
        const bitmap = await deviceCutout(item, abort.signal);
        if (!bitmap) throw new Error('No playable demo media');
        try { return { item, image: trimDeviceBitmap(bitmap), started: performance.now() }; }
        finally { bitmap.close(); }
      }
      throw new Error('No playable video');
    }
    async function switchTo(item: DeviceItem): Promise<boolean> {
      if (switching || stopped || transition.current) return false;
      switching = true;
      try {
        setDiagnostic(prev => ({ ...prev, status: '正在准备最新影像' }));
        const next = await prepare(item);
        if (stopped) { releaseVideo(next); return false; }
        if (next.video) {
          next.lastVideoTime = 0;
          next.video.ontimeupdate = () => {
            const previous = next.lastVideoTime || 0;
            const now = next.video?.currentTime || 0;
            next.lastVideoTime = now;
            if (previous > .5 && now + .5 < previous) void onLoopBoundary(next);
          };
        }
        transition.current = { old: current.current, next, started: performance.now(), videoStarted: false };
        setDiagnostic(prev => ({ ...prev, status: '切换中' }));
        return true;
      } catch (error) {
        if (!stopped) {
          console.warn('[DEVICE] skipping invalid item:', item.id, error); invalidIds.add(item.id);
          setDiagnostic(prev => ({ ...prev, status: '最新影像无法播放' }));
        }
        return false;
      } finally { switching = false; }
    }
    async function onLoopBoundary(person: Prepared) {
      if (stopped || transition.current || current.current !== person) return;
      const pending = pendingLatest;
      if (pending && pending.id !== person.item.id) {
        pendingLatest = null;
        await switchTo(pending);
      }
    }

    async function sync() {
      if (syncing || stopped) return;
      syncing = true;
      try {
        if (process.env.NODE_ENV === 'development') console.info('[DEVICE] latest sync start');
        const items = await devicePlaylist(demo, abort.signal);
        if (stopped) return;
        const latestItem = items.filter(item => !invalidIds.has(item.id) && Boolean(item.videoUrl || item.demo)).sort(newestFirst)[0] || null;
        const activeId = transition.current?.next.item.id || current.current?.item.id || null;
        if (latestItem && activeId && latestItem.id !== activeId) pendingLatest = latestItem;
        else if (!latestItem || latestItem.id === activeId) pendingLatest = null;
        if (process.env.NODE_ENV === 'development') console.info('[DEVICE] latest item:', latestItem?.id || 'none');
        setDiagnostic(prev => ({ ...prev, latestId: latestItem?.id || '—', latestCreatedAt: latestItem?.createdAt || '—', pendingId: pendingLatest?.id || '—', sync: new Date().toLocaleTimeString('zh-CN'), status: latestItem ? prev.status : '暂无 ready 视频' }));
        if (latestItem && !current.current && !transition.current && !switching) await switchTo(latestItem);
      } catch (error) {
        if (!stopped) { console.error('[DEVICE] sync failed', error); setDiagnostic(prev => ({ ...prev, status: error instanceof Error ? error.message : '读取失败', sync: new Date().toLocaleTimeString('zh-CN') })); }
      } finally { syncing = false; }
    }
    if (process.env.NODE_ENV === 'development') console.info(demo ? '[DEVICE] using demo data' : '[DEVICE] using latest exhibition video');
    void sync(); pollTimer = setInterval(() => void sync(), POLL_INTERVAL);
    return () => {
      stopped = true; abort.abort(); clearInterval(pollTimer); cancelAnimationFrame(frame);
      releaseVideo(current.current); releaseVideo(transition.current?.next || null);
      window.removeEventListener('resize', resize); document.body.classList.remove('display-body');
    };
  }, [demo, debug]);

  return <main className="device-stage" aria-label="全息设备播放画面">
    <canvas ref={canvasRef} aria-hidden="true" />
    {debug && <output className="device-debug">{`latest cloud id: ${diagnostic.latestId}\ncurrent playing id: ${diagnostic.currentId}\npending latest id: ${diagnostic.pendingId}\nlast poll time: ${diagnostic.sync}\nlatest createdAt: ${diagnostic.latestCreatedAt}`}</output>}
  </main>;
}
