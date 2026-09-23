'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAllUploads, type UploadRecord } from '@/lib/cloudbase';

const REFRESH_MS = 3000;
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }); }

export default function GalleryDashboard() {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState('');
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    active.current?.abort(); const request = new AbortController(); active.current = request; setLoading(true);
    try {
      const next = await fetchAllUploads(request.signal);
      setRecords(next); setError(''); setLastSync(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      if (process.env.NODE_ENV === 'development') { console.info('gallery fetch result', next); console.info(`[GALLERY] records count: ${next.length}`); }
    } catch (reason) {
      if (!request.signal.aborted) { const message = reason instanceof Error ? reason.message : '云相册读取失败'; setError(message); console.error('[云相册同步失败]', reason); }
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, REFRESH_MS); return () => { clearInterval(timer); active.current?.abort(); }; }, [refresh]);
  return <main className="gallery-page">
    <header className="gallery-header">
      <div><p className="eyebrow">EXHIBITION CLOUD ALBUM</p><h1>云相册</h1><p>按上传时间倒序 · 每 3 秒自动刷新</p></div>
      <div className="gallery-actions"><span>{error ? '连接失败' : loading ? '同步中' : lastSync ? `已同步 ${lastSync}` : '同步中'}</span><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? '同步中…' : '刷新'}</button></div>
    </header>
    {error && <section className="gallery-error" role="alert"><strong>无法读取云相册</strong><span>{error}</span>{error.includes('服务端未配置') && <small>在 .env.local 填写服务端 CloudBase 环境 ID 和密钥对，然后重启开发服务。</small>}</section>}
    {!error && !loading && records.length === 0 && <p className="gallery-empty">uploads 集合目前没有记录。</p>}
    <section className="gallery-grid" aria-live="polite">
      {records.map(record => <article className="gallery-card" key={record.id}>
        <div className="gallery-media">
          <figure><span>原图</span><img src={record.image_url} alt="上传原图" loading="lazy" /></figure>
          <figure><span>抠图</span>{record.cutout_url ? <img src={record.cutout_url} alt="透明人物图" loading="lazy" /> : <div className="media-missing">尚未生成</div>}</figure>
        </div>
        <dl>
          <div><dt>status</dt><dd><b className={`status status-${record.status}`}>{record.status}</b></dd></div>
          <div><dt>createdAt</dt><dd>{formatTime(record.created_at)}</dd></div>
          <div><dt>video</dt><dd>{record.video_url ? '已生成' : '未生成'}</dd></div>
          <div><dt>videoFileId</dt><dd>{record.video_url ? <a href={record.video_url} target="_blank" rel="noreferrer">存在 · 打开视频</a> : '—'}</dd></div>
          <div><dt>id</dt><dd className="gallery-id">{record.id}</dd></div>
        </dl>
      </article>)}
    </section>
  </main>;
}
