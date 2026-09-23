import { fetchExhibitionItems } from './cloudbase';

export type DeviceItem = { id: string; createdAt: string; imageUrl: string; cutoutUrl?: string | null; videoUrl?: string | null; demo?: boolean };

/** 正式模式只读取与 gallery 相同的站内 API，并只保留可播放的 ready 视频。 */
export async function fetchDeviceItems(demo: boolean, signal: AbortSignal): Promise<DeviceItem[]> {
  if (demo) return [{ id: 'demo-person-1', createdAt: '', imageUrl: '/demo/person-1.png', cutoutUrl: '/demo/person-1.png', demo: true }];
  const records = await fetchExhibitionItems(signal);
  return records.filter(item => item.status === 'ready' && Boolean(item.videoUrl)).map(item => {
    const media = (kind: string) => `/api/exhibition/media/${encodeURIComponent(item.id)}/${kind}`;
    return { id: item.id, createdAt: item.createdAt,
      imageUrl: item.imageUrl ? media('image') : '',
      cutoutUrl: item.cutoutUrl ? media('cutout') : null,
      videoUrl: item.videoUrl ? media('video') : null };
  });
}

/** 视频无法播放时，仅依次读取云端抠图和原图；单条失败不终止设备端。 */
export async function deviceCutout(item: DeviceItem, signal: AbortSignal): Promise<ImageBitmap | null> {
  if (signal.aborted) throw new DOMException('已取消', 'AbortError');
  for (const [kind, url] of [['cutout', item.cutoutUrl], ['image', item.imageUrl]] as const) {
    if (!url) continue;
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      if (signal.aborted) { bitmap.close(); throw new DOMException('已取消', 'AbortError'); }
      return bitmap;
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn(`[DEVICE] ${kind} fetch failed:`, item.id, error);
    }
  }
  return null;
}

/** 对 alpha 真正非透明的主体取边界；在设备端独立处理，不更改原视频算法。 */
export function trimDeviceBitmap(bitmap: ImageBitmap): HTMLCanvasElement {
  const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('设备端无法读取透明人物图。');
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  let left = source.width, top = source.height, right = -1, bottom = -1;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    if (pixels[(y * source.width + x) * 4 + 3] <= 2) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('透明图没有可展示的人物。');
  const pad = Math.max(3, Math.round(Math.max(right - left + 1, bottom - top + 1) * .02));
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(source.width - 1, right + pad); bottom = Math.min(source.height - 1, bottom + pad);
  const trimmed = document.createElement('canvas'); trimmed.width = right - left + 1; trimmed.height = bottom - top + 1;
  trimmed.getContext('2d')!.drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed;
}
