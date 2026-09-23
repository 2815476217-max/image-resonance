import { generateVideoFromImage, supportedVideoMimeType } from './generateVideoFromImage';
import { removeBackground } from './removeBackground';

export type PendingCutout = { file: File; id: string; cutout?: Blob; video?: Blob; imageFileId?: string; cutoutFileId?: string; videoFileId?: string; imageUrl?: string; cutoutUrl?: string; videoUrl?: string; recordCreated?: boolean; saved?: boolean };
export function createPendingUpload(file: File): PendingCutout { return { file, id: crypto.randomUUID() }; }
type Step = (message: string) => void;
function checkAborted(signal?: AbortSignal) { if (signal?.aborted) throw new Error('处理已取消。'); }

/** 本地链路保持独立：真实抠图 PNG → 6 秒黑底 WebM。 */
export async function processCutoutVideo(pending: PendingCutout, onStep: Step, onPreview: (cutout: Blob) => void, signal?: AbortSignal) {
  checkAborted(signal); supportedVideoMimeType();
  if (!pending.cutout) {
    console.info('[LOCAL] background removal started');
    onStep('正在识别主体人物');
    pending.cutout = await removeBackground(pending.file, onStep, signal);
    console.info('[LOCAL] cutout generated', { bytes: pending.cutout.size, type: pending.cutout.type });
  }
  checkAborted(signal); onPreview(pending.cutout);
  if (!pending.video) {
    console.info('[LOCAL] black video generation started');
    pending.video = await generateVideoFromImage(pending.cutout, { signal, onProgress: progress => onStep(`正在生成黑底视频 · ${Math.round(progress * 100)}%`) });
    console.info('[LOCAL] black video generated', { bytes: pending.video.size, type: pending.video.type });
  }
  checkAborted(signal); return { cutout: pending.cutout, video: pending.video };
}

/** 云端失败不影响已经生成的本地预览；浏览器只发送已生成的三份文件。 */
export async function syncPersonCutout(pending: PendingCutout, onStep: Step, signal?: AbortSignal) {
  if (pending.saved) return { ok: true as const, pending };
  if (!pending.cutout || !pending.video) return { ok: false as const, error: '本地影像尚未生成。' };
  try {
    checkAborted(signal); onStep('正在同步到展览 · 上传影像');
    const form = new FormData();
    form.append('image', pending.file);
    form.append('cutout', new File([pending.cutout], `${pending.id}.png`, { type: 'image/png' }));
    form.append('video', new File([pending.video], `${pending.id}.webm`, { type: 'video/webm' }));
    const response = await fetch('/api/exhibition/upload', { method: 'POST', body: form, signal });
    const body = await response.json() as { success?: boolean; id?: string; imageUrl?: string; cutoutUrl?: string; videoUrl?: string; error?: string };
    if (!response.ok || !body.success || !body.id || !body.videoUrl) {
      return { ok: false as const, error: body.error || `云端同步失败：HTTP ${response.status}` };
    }
    pending.id = body.id; pending.imageUrl = body.imageUrl; pending.cutoutUrl = body.cutoutUrl; pending.videoUrl = body.videoUrl;
    pending.saved = true;
    console.info('[CLOUD] upload API success', { id: body.id });
    return { ok: true as const, pending };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : '云端连接失败。' };
  }
}

export async function uploadPersonCutout(pending: PendingCutout, onStep: Step, onPreview: (cutout: Blob) => void, signal?: AbortSignal) {
  await processCutoutVideo(pending, onStep, onPreview, signal);
  return syncPersonCutout(pending, onStep, signal);
}
