import { fixWebmDuration } from '@fix-webm-duration/fix';
import { subjectFit } from './subjectLayout';
/** 浏览器端实时录制，优先支持桌面 Chrome/Edge。没有服务器编码或 AI。 */
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_DURATION_MS = 6000;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function supportedVideoMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' ||
      typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('此浏览器不支持生成视频，请使用新版 Chrome 或 Edge。');
  }
  const mime = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('此浏览器无法录制 WebM，请使用新版 Chrome 或 Edge。');
  return mime;
}

export async function generateVideoFromImage(
  file: Blob,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
): Promise<Blob> {
  const mimeType = supportedVideoMimeType();
  const { signal, onProgress } = options;
  if (signal?.aborted) throw new Error('视频生成已取消。');
  if (document.visibilityState === 'hidden') throw new Error('请保持上传页面在前台，再重新生成视频。');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH; canvas.height = VIDEO_HEIGHT;
  // 先缩小大照片，减少手机每一帧重新缩放高像素原图的开销。
  const prepared = document.createElement('canvas');
  let stream: MediaStream | undefined;
  try {
    let decodeTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([image.decode(), new Promise<never>((_, reject) => {
        decodeTimer = setTimeout(() => reject(new Error('图片解码超时，请换一张图片。')), 15000);
      })]);
    } finally { clearTimeout(decodeTimer); }
    if (signal?.aborted) throw new Error('视频生成已取消。');
    const ctx = canvas.getContext('2d', { alpha: false });
    const buffer = prepared.getContext('2d');
    if (!ctx || !buffer || !image.naturalWidth) throw new Error('无法读取图片或创建 Canvas。');
    // 即使输入 PNG 未预先裁边，也按非透明像素的真实边界确定主体大小。
    const source = document.createElement('canvas');
    source.width = image.naturalWidth; source.height = image.naturalHeight;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) throw new Error('无法读取透明人物图。');
    sourceContext.drawImage(image, 0, 0);
    const alpha = sourceContext.getImageData(0, 0, source.width, source.height).data;
    let left = source.width, top = source.height, right = -1, bottom = -1;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (alpha[(y * source.width + x) * 4 + 3] <= 1) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error('透明图没有可展示的人物。');
    const subjectWidth = right - left + 1, subjectHeight = bottom - top + 1;
    const fit = subjectFit(subjectWidth, subjectHeight, VIDEO_WIDTH, VIDEO_HEIGHT);
    prepared.width = Math.max(1, Math.round(subjectWidth * fit));
    prepared.height = Math.max(1, Math.round(subjectHeight * fit));
    if (process.env.NODE_ENV === 'development') console.info('[LOCAL] video subject layout', { width: prepared.width, height: prepared.height, heightRatio: prepared.height / VIDEO_HEIGHT });
    buffer.imageSmoothingEnabled = true; buffer.imageSmoothingQuality = 'high';
    buffer.drawImage(source, left, top, subjectWidth, subjectHeight, 0, 0, prepared.width, prepared.height);
    function draw(progress: number) {
      const phase = progress * Math.PI * 2;
      const scale = 1 - 0.02 * Math.cos(phase); // 0.98 → 1.02 → 0.98
      // 每帧先填纯黑，随后绘制完整透明人物；没有裁切、粒子或滤镜。
      ctx!.fillStyle = '#000000'; ctx!.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      ctx!.save();
      ctx!.translate(VIDEO_WIDTH / 2, VIDEO_HEIGHT / 2 - 6 * (1 - Math.cos(phase)));
      ctx!.rotate(Math.sin(phase) * Math.PI / 180); // ±1°
      ctx!.scale(scale, scale);
      ctx!.drawImage(prepared, -prepared.width / 2, -prepared.height / 2);
      ctx!.restore();
    }
    draw(0);
    stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    const blob = await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let frame = 0, bytes = 0, settled = false, started = 0, lastDraw = -Infinity;
      let stopTimer: ReturnType<typeof setTimeout>;
      let watchdog: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        cancelAnimationFrame(frame); clearTimeout(stopTimer); clearTimeout(watchdog);
        document.removeEventListener('visibilitychange', visibility);
        signal?.removeEventListener('abort', abort);
        recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; recorder.onstart = null;
        if (recorder.state !== 'inactive') recorder.stop();
        stream?.getTracks().forEach(track => track.stop());
      };
      const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error); };
      const abort = () => fail(new Error('视频生成已取消，请重新上传。'));
      const visibility = () => { if (document.hidden) fail(new Error('生成视频时页面切到了后台，请保持页面打开并点击重试。')); };
      const tick = (now: number) => {
        if (settled) return;
        const progress = Math.min((now - started) / VIDEO_DURATION_MS, 1);
        if (now - lastDraw >= 1000 / 30) { draw(progress); lastDraw = now; onProgress?.(progress); }
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      recorder.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes > MAX_VIDEO_BYTES) fail(new Error('生成的视频超过 50 MB，请换一张图片。'));
      };
      recorder.onerror = () => fail(new Error('浏览器视频编码失败，请关闭其他占用资源的页面后重试。'));
      recorder.onstop = () => {
        if (settled) return;
        if (!bytes) { fail(new Error('未生成有效视频，请使用 Chrome 重试。')); return; }
        settled = true;
        const result = new Blob(chunks, { type: 'video/webm' });
        cleanup(); onProgress?.(1); resolve(result);
      };
      recorder.onstart = () => {
        started = performance.now(); frame = requestAnimationFrame(tick);
        stopTimer = setTimeout(() => {
          cancelAnimationFrame(frame); draw(1);
          if (recorder.state === 'recording') recorder.stop();
        }, VIDEO_DURATION_MS);
      };
      document.addEventListener('visibilitychange', visibility);
      signal?.addEventListener('abort', abort, { once: true });
      watchdog = setTimeout(() => fail(new Error('视频录制超时，请使用 Chrome 保持页面在前台重试。')), 15000);
      try {
        if (signal?.aborted) { abort(); return; }
        recorder.start(250);
      } catch (error) { fail(error instanceof Error ? error : new Error('无法启动视频编码。')); }
    });
    if (signal?.aborted) throw new Error('视频生成已取消。');
    // MediaRecorder 的 WebM 默认缺少 Duration；补齐元数据，不重新编码。
    return await fixWebmDuration(blob, VIDEO_DURATION_MS, { logger: false });
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    URL.revokeObjectURL(url); image.src = ''; canvas.width = 0; prepared.width = 0;
  }
}


