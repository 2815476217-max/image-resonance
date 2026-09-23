/** 浏览器侧只认识站内 API；CloudBase SDK 和凭证只在 cloudbase-server.ts。 */
export const MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export type UploadRecord = {
  id: string; image_url: string; cutout_url: string | null; video_url: string | null;
  imageFileId?: string; cutoutFileId?: string; videoFileId?: string;
  created_at: string; status: string; type: 'video' | 'cutout' | 'image';
};
export type ExhibitionItem = {
  id: string; imageUrl: string; cutoutUrl: string | null; videoUrl: string | null;
  createdAt: string; status: 'ready';
};
export type Health = {
  cloudbaseConfigured: boolean; databaseReachable: boolean; storageReachable: boolean;
  uploadsCount: number | null; error?: string;
};

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `展览接口响应失败：${response.status}`);
  return body;
}
export async function fetchExhibitionItems(signal?: AbortSignal): Promise<ExhibitionItem[]> {
  const response = await fetch('/api/exhibition/uploads', { signal, cache: 'no-store' });
  const body = await responseJson<{ items: ExhibitionItem[] }>(response);
  return body.items;
}
export async function fetchExhibitionHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/exhibition/health', { signal, cache: 'no-store' });
  return responseJson<Health>(response);
}
function toRecord(item: ExhibitionItem): UploadRecord {
  return { id: item.id, image_url: item.imageUrl, cutout_url: item.cutoutUrl,
    video_url: item.videoUrl, created_at: item.createdAt, status: item.status, type: 'video' };
}
export async function fetchAllUploads(signal?: AbortSignal): Promise<UploadRecord[]> {
  return (await fetchExhibitionItems(signal)).slice().reverse().map(toRecord);
}
export async function fetchReadyUploads(signal?: AbortSignal): Promise<UploadRecord[]> {
  return (await fetchExhibitionItems(signal)).filter(item => Boolean(item.videoUrl)).map(toRecord);
}
