import { readyDocuments, serverConfig } from '@/lib/cloudbase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!serverConfig().configured) return Response.json({ items: [], error: 'CloudBase 服务端未配置。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const items = await readyDocuments();
    return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[CLOUD] uploads API failed', error);
    return Response.json({ items: [], error: error instanceof Error ? error.message : '读取云相册失败。' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
