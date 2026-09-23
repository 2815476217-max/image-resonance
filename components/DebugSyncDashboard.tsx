'use client';
import { useEffect, useState } from 'react';
import { fetchExhibitionHealth, fetchExhibitionItems, type ExhibitionItem, type Health } from '@/lib/cloudbase';

export default function DebugSyncDashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [latest, setLatest] = useState<ExhibitionItem | null>(null);
  const [error, setError] = useState('');
  const [refreshed, setRefreshed] = useState('—');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const status = await fetchExhibitionHealth();
        if (!stopped) setHealth(status);
        if (status.error) throw new Error(status.error);
        const items = await fetchExhibitionItems();
        if (!stopped) { setLatest(items.at(-1) || null); setError(''); }
      } catch (reason) {
        if (!stopped) { setError(reason instanceof Error ? reason.message : String(reason)); setLatest(null); }
      } finally {
        if (!stopped) { setRefreshed(new Date().toLocaleTimeString('zh-CN', { hour12: false })); timer = setTimeout(refresh, 3000); }
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  const rows = [
    ['CloudBase env configured', health === null ? '—' : String(health.cloudbaseConfigured)],
    ['database reachable', health === null ? '—' : String(health.databaseReachable)],
    ['storage reachable', health === null ? '—' : String(health.storageReachable)],
    ['uploads record count', health?.uploadsCount == null ? '—' : String(health.uploadsCount)],
    ['latest record id', latest?.id || '—'],
    ['latest status', latest?.status || '—'],
    ['imageUrl', latest?.imageUrl || '—'],
    ['cutoutUrl', latest?.cutoutUrl || '—'],
    ['videoUrl', latest?.videoUrl || '—'],
    ['last refresh time', refreshed],
  ];
  return <main style={{ minHeight: '100vh', background: '#080a0a', color: '#e0e8e8', padding: 'clamp(20px,5vw,60px)', fontFamily: 'ui-monospace,monospace' }}>
    <h1 style={{ fontSize: 20, fontWeight: 400 }}>CloudBase 同步诊断</h1>
    <p style={{ fontSize: 12, color: '#8ca0a0' }}>每 3 秒读取服务端展览 API；此页面不使用 demo 数据。</p>
    {error && <p role="alert" style={{ padding: 14, color: '#ffb9ae', border: '1px solid #864d47', overflowWrap: 'anywhere' }}>查询失败：{error}</p>}
    <dl style={{ marginTop: 26, display: 'grid', gap: 14 }}>
      {rows.map(([label, value]) => <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,240px) minmax(0,1fr)', gap: 12, borderBottom: '1px solid #263030', paddingBottom: 10, fontSize: 12 }}><dt style={{ color: '#839595' }}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>)}
    </dl>
  </main>;
}
