import { createClient, type SupabaseClient } from '@supabase/supabase-js';
export const BUCKET = 'exhibition-images';
export const VIDEO_BUCKET = 'exhibition-videos';
export const CUTOUT_BUCKET = 'exhibition-cutouts';
export const MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export type UploadRecord = { id: string; image_url: string; video_url?: string | null; cutout_url?: string | null; created_at: string; status: string; type: 'image' | 'video' | 'cutout' };
let client: SupabaseClient | null = null;
export function isSupabaseConfigured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NODE_ENV === 'development') console.info('[Supabase client config]', { supabaseUrlExists: Boolean(url), anonKeyExists: Boolean(key) });
  if (!url || !key) throw new Error('尚未配置展览连接，请联系工作人员填写 Supabase 环境变量。');
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}
/** 云相册播放顺序集中在这里；以后切换倒序只需修改两个 ascending。 */
export async function fetchReadyUploads(signal?: AbortSignal): Promise<UploadRecord[]> {
  const pageSize = 1000, records: UploadRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = getSupabase().from('uploads').select('id,image_url,cutout_url,video_url,created_at,status,type').eq('status', 'ready').not('video_url', 'is', null).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + pageSize - 1).returns<UploadRecord[]>();
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    records.push(...(data ?? []));
    if (!data || data.length < pageSize) return records;
  }
}

/** 工作人员云相册：包含 processing / ready / failed，时间倒序。 */
export async function fetchAllUploads(signal?: AbortSignal): Promise<UploadRecord[]> {
  const pageSize = 1000, records: UploadRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = getSupabase().from('uploads').select('id,image_url,cutout_url,video_url,created_at,status,type').eq('status','ready').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + pageSize - 1).returns<UploadRecord[]>();
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(`uploads 查询失败：${error.message}`);
    records.push(...(data ?? []));
    if (!data || data.length < pageSize) return records;
  }
}

/** 兼容旧调用；新的展示队列使用 fetchReadyUploads。 */
export const recentUploads = fetchReadyUploads;



