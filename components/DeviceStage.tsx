'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { deviceCutout, fetchDeviceItems, trimDeviceBitmap, type DeviceItem } from '@/lib/deviceSource';
import { subjectFit } from '@/lib/subjectLayout';

const POLL_INTERVAL = 3000;
const MOTION_DURATION = 5000;
type Prepared = { item: DeviceItem; image?: HTMLCanvasElement; video?: HTMLVideoElement; started: number };

async function prepareVideo(src: string, signal: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.loop = false;
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
  person.video.onended = null; person.video.pause(); person.video.removeAttribute('src'); person.video.load();
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
  const [diagnostic, setDiagnostic] = useState({ currentId: '—', status: '启动中', sync: '—', latestId: '—', latestCreatedAt: '—' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    let stopped = false, frame = 0;
    let pollTimer: ReturnType<typeof setInterval>;
    let syncing = false;
    let switchVersion = 0;
    let requestedId: string | null = null;
    const abort = new AbortController();

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
      if (current.current) draw(current.current, 1, now);
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
    async function switchImmediately(item: DeviceItem): Promise<boolean> {
      const version = ++switchVersion;
      requestedId = item.id;
      try {
        setDiagnostic(prev => ({ ...prev, status: '正在准备最新影像' }));
        const next = await prepare(item);
        if (stopped || version !== switchVersion) { releaseVideo(next); return false; }
        if (next.video) {
          next.video.onended = () => {
            const video = next.video;
            if (!video || current.current !== next) return;
            video.pause();
            if (Number.isFinite(video.duration) && video.duration > 0.05) {
              video.currentTime = Math.max(0, video.duration - 0.04);
            }
            setDiagnostic(prev => ({ ...prev, status: '停留在最新影像' }));
          };
        }
        const old = current.current;
        current.current = next;
        requestedId = null;
        releaseVideo(old);
        if (next.video) {
          next.video.currentTime = 0;
          await next.video.play().catch(error => console.warn('[DEVICE] video playback failed', error));
        }
        setDiagnostic(prev => ({ ...prev, status: '播放最新影像', currentId: item.id }));
        return true;
      } catch (error) {
        if (version === switchVersion) requestedId = null;
        if (!stopped) {
          console.warn('[DEVICE] latest item cannot play:', item.id, error);
          setDiagnostic(prev => ({ ...prev, status: '最新影像无法播放' }));
        }
        return false;
      }
    }

    async function sync() {
      if (syncing || stopped) return;
      syncing = true;
      try {
        if (process.env.NODE_ENV === 'development') console.info('[DEVICE] latest sync start');
        const items = await fetchDeviceItems(demo, abort.signal);
        if (stopped) return;
        const latestItem = items.filter(item => Boolean(item.videoUrl || item.demo)).sort(newestFirst)[0] || null;
        const activeId = current.current?.item.id || null;
        if (process.env.NODE_ENV === 'development') console.info('[DEVICE] latest item:', latestItem?.id || 'none');
        setDiagnostic(prev => ({ ...prev, latestId: latestItem?.id || '—', latestCreatedAt: latestItem?.createdAt || '—', sync: new Date().toLocaleTimeString('zh-CN'), status: latestItem ? prev.status : '暂无 ready 视频' }));
        if (latestItem && latestItem.id !== activeId && latestItem.id !== requestedId) {
          void switchImmediately(latestItem);
        }
      } catch (error) {
        if (!stopped) { console.error('[DEVICE] sync failed', error); setDiagnostic(prev => ({ ...prev, status: error instanceof Error ? error.message : '读取失败', sync: new Date().toLocaleTimeString('zh-CN') })); }
      } finally { syncing = false; }
    }
    if (process.env.NODE_ENV === 'development') console.info(demo ? '[DEVICE] using demo data' : '[DEVICE] using latest exhibition video');
    void sync(); pollTimer = setInterval(() => void sync(), POLL_INTERVAL);
    return () => {
      stopped = true; abort.abort(); clearInterval(pollTimer); cancelAnimationFrame(frame);
      switchVersion += 1; releaseVideo(current.current);
      window.removeEventListener('resize', resize); document.body.classList.remove('display-body');
    };
  }, [demo, debug]);

  return <main className="device-stage" aria-label="全息设备播放画面">
    <canvas ref={canvasRef} aria-hidden="true" />
    {debug && <output className="device-debug">{`latest cloud id: ${diagnostic.latestId}\ncurrent playing id: ${diagnostic.currentId}\nlast poll time: ${diagnostic.sync}\nlatest createdAt: ${diagnostic.latestCreatedAt}\nstate: ${diagnostic.status}`}</output>}
  </main>;
}
