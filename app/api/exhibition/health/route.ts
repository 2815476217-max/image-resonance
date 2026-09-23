import { healthStatus } from '@/lib/cloudbase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json(await healthStatus(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ cloudbaseConfigured: false, databaseReachable: false, storageReachable: false, uploadsCount: null, error: error instanceof Error ? error.message : '检查失败。' }, { headers: { 'Cache-Control': 'no-store' } }); }
}
