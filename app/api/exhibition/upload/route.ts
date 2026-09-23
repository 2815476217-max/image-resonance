import { getCloudBaseServer, serverConfig, uploadServerFile } from '@/lib/cloudbase-server';

export const runtime = 'nodejs';
const imageTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function fail(message: string, status: number, code?: string) { return Response.json({ success: false, ...(code ? { code } : {}), error: message }, { status }); }

export async function POST(request: Request) {
  if (!serverConfig().configured) return fail('CloudBase 服务端未配置', 503, 'CLOUDBASE_NOT_CONFIGURED');
  let id = '';
  let recordCreated = false;
  try {
    const form = await request.formData();
    const image = form.get('image'), cutout = form.get('cutout'), video = form.get('video');
    if (!(image instanceof File) || !(cutout instanceof File) || !(video instanceof File)) return fail('缺少原图、透明 PNG 或黑底 WebM。', 400);
    const ext = imageTypes[image.type];
    if (!ext || image.size < 1 || image.size > 10 * 1024 * 1024) return fail('原图格式或大小不符合要求（JPG/PNG/WEBP，最多 10 MB）。', 400);
    if (cutout.type !== 'image/png' || cutout.size < 1 || cutout.size > 20 * 1024 * 1024) return fail('透明人物图必须是 20 MB 以内的 PNG。', 400);
    if (!video.type.startsWith('video/webm') || video.size < 1 || video.size > 80 * 1024 * 1024) return fail('黑底视频必须是 80 MB 以内的 WebM。', 400);
    const client = getCloudBaseServer();
    const collection = client.database().collection('uploads');
    id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const imageFileId = await uploadServerFile(`exhibition/images/${id}.${ext}`, image);
    console.info('[CLOUD] upload image success', id);
    const created = await collection.doc(id).set({ id, imageFileId, createdAt, status: 'processing' });
    if (created.code) throw new Error(`uploads 创建失败：${created.message || created.code}`);
    recordCreated = true;
    console.info('[CLOUD] uploads record created', id);
    const cutoutFileId = await uploadServerFile(`exhibition/cutouts/${id}.png`, cutout);
    console.info('[CLOUD] upload cutout success', id);
    const videoFileId = await uploadServerFile(`exhibition/videos/${id}.webm`, video);
    console.info('[CLOUD] upload video success', id);
    const imageUrl = `/api/exhibition/media/${id}/image`;
    const cutoutUrl = `/api/exhibition/media/${id}/cutout`;
    const videoUrl = `/api/exhibition/media/${id}/video`;
    const updated = await collection.doc(id).update({ imageFileId, cutoutFileId, videoFileId, imageUrl, cutoutUrl, videoUrl, status: 'ready' });
    if (updated.code || !updated.updated) throw new Error(`uploads ready 更新失败：${updated.message || updated.code || '没有记录被更新'}`);
    const check = await collection.doc(id).get();
    const row = check.data?.[0] as { status?: string; videoFileId?: string } | undefined;
    if (check.code || row?.status !== 'ready' || row.videoFileId !== videoFileId) throw new Error(`uploads 回读失败：${check.message || check.code || 'ready 记录未能验证'}`);
    console.info('[CLOUD] database record ready', id);
    return Response.json({ success: true, id, imageUrl, cutoutUrl, videoUrl });
  } catch (error) {
    console.error('[CLOUD] upload API failed', error);
    if (recordCreated) {
      try { await getCloudBaseServer().database().collection('uploads').doc(id).update({ status: 'failed' }); }
      catch (updateError) { console.error('[CLOUD] failed status update', updateError); }
    }
    return fail(error instanceof Error ? error.message : '云端同步失败。', 502);
  }
}
