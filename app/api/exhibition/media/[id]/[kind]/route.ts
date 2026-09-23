import { getCloudBaseServer, getServerFileUrl } from '@/lib/cloudbase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const kinds = { image: { field: 'imageFileId', mime: 'image/jpeg' }, cutout: { field: 'cutoutFileId', mime: 'image/png' }, video: { field: 'videoFileId', mime: 'video/webm' } } as const;
export async function GET(request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id) || !(kind in kinds)) return new Response(null, { status: 404 });
  try {
    const config = kinds[kind as keyof typeof kinds];
    const result = await getCloudBaseServer().database().collection('uploads').doc(id).get();
    const doc = result.data?.[0] as Record<string, string> | undefined;
    if (result.code || doc?.status !== 'ready' || !doc[config.field]) return new Response(null, { status: 404 });
    const url = await getServerFileUrl(doc[config.field]);
    const range = request.headers.get('range');
    const upstream = await fetch(url, {
      headers: range ? { Range: range } : undefined,
      cache: 'no-store',
    });
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    const headers = new Headers({ 'Content-Type': upstream.headers.get('content-type') || config.mime, 'Cache-Control': 'private, max-age=60' });
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) { console.error('[CLOUD] media API failed', error); return new Response(null, { status: 502 }); }
}
