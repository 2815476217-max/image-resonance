'use client';
import { useEffect, useState } from 'react';
import { fetchReadyUploads, type UploadRecord } from '@/lib/cloudbase';
import { localDemoRecord, readLocalDemoUploads } from '@/lib/localDemo';

export const PLAYLIST_POLL_MS = 3000;
const signature = (records: UploadRecord[]) => records.map(item => `${item.id}|${item.video_url}`).join('\n');

/** 每次同步都以云端 ready + video_url 结果为准，因此新增、失效和删除都会反映到队列。 */
export function useExhibitionPlaylist(demo: boolean) {
  const [playlist, setPlaylist] = useState<UploadRecord[]>([]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    const localUrls = new Map<string, UploadRecord>();
    async function loadDemo() {
      const entries = (await readLocalDemoUploads()).filter(entry => entry.video instanceof Blob);
      if (!entries.length) return [
        { id: 'demo-video-1', image_url: '/demo/demo-1.jpg', cutout_url: null, video_url: '/demo/demo-1.webm', created_at: '2024-01-01T00:00:00Z', status: 'ready', type: 'video' as const },
        { id: 'demo-video-2', image_url: '/demo/demo-2.jpg', cutout_url: null, video_url: '/demo/demo-2.webm', created_at: '2024-01-01T00:00:01Z', status: 'ready', type: 'video' as const },
      ];
      const active = new Set(entries.map(entry => entry.id));
      localUrls.forEach((record, id) => { if (!active.has(id)) { URL.revokeObjectURL(record.image_url); if (record.cutout_url) URL.revokeObjectURL(record.cutout_url); if (record.video_url) URL.revokeObjectURL(record.video_url); localUrls.delete(id); } });
      return entries.slice().sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(entry => {
        let record = localUrls.get(entry.id); if (!record) { record = localDemoRecord(entry); localUrls.set(entry.id, record); } return record;
      });
    }
    async function sync() {
      try {
        request = new AbortController();
        const timeout = setTimeout(() => request?.abort(), 12000);
        let next: UploadRecord[];
        try { next = demo ? await loadDemo() : await fetchReadyUploads(request.signal); }
        finally { clearTimeout(timeout); }
        if (!stopped) {
          if (process.env.NODE_ENV === 'development') {
            console.info('playlist fetch result', next);
            console.info('ready uploads count', next.length);
            console.info('current playlist ids', next.map(item => item.id));
            console.info('last sync time', new Date().toISOString());
            console.info(`[DISPLAY] playlist count: ${next.length}`);
          }
          setPlaylist(current => signature(current) === signature(next) ? current : next);
        }
      } catch (error) { if (!stopped) console.error('[播放队列同步失败，3 秒后重试]', error); }
      finally { if (!stopped) timer = setTimeout(sync, PLAYLIST_POLL_MS); }
    }
    void sync();
    return () => { stopped = true; request?.abort(); clearTimeout(timer); localUrls.forEach(record => { URL.revokeObjectURL(record.image_url); if (record.cutout_url) URL.revokeObjectURL(record.cutout_url); if (record.video_url) URL.revokeObjectURL(record.video_url); }); };
  }, [demo]);
  return playlist;
}
