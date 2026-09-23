'use client';
import { useEffect, useRef, useState } from 'react';
import { IMAGE_TYPES, MAX_BYTES } from '@/lib/cloudbase';
import { createPendingUpload, processCutoutVideo, syncPersonCutout, type PendingCutout } from '@/lib/uploadToStorage';
import { saveLocalDemo } from '@/lib/localDemo';
import Link from 'next/link';
import ParticleField, { type ParticleMood } from './ParticleField';
import ProcessingOverlay from './ProcessingOverlay';
// 后续姓名、昵称、留言字段可在这里与 uploads 表一起扩展。
export default function UploadPanel() {
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const pending = useRef<PendingCutout | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [cutout, setCutout] = useState<Blob | null>(null);
  const [cutoutPreview, setCutoutPreview] = useState('');
  const [previewMode, setPreviewMode] = useState<'original' | 'cutout'>('original');
  const [localProcessingStatus, setLocalProcessingStatus] = useState<'idle'|'processing'|'ready'|'failed'>('idle');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'unavailable'|'idle'|'syncing'|'synced'|'failed'>('idle');
  useEffect(() => { setPreviewMode(cutout ? 'cutout' : 'original'); }, [cutout]);
  useEffect(() => { if (!cutout) { setCutoutPreview(''); return; } const url=URL.createObjectURL(cutout); setCutoutPreview(url); return () => URL.revokeObjectURL(url); }, [cutout]);
  const [busy, setBusy] = useState(false);
  const [processingPresent, setProcessingPresent] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState('');
  const [demo, setDemo] = useState(false);
  useEffect(() => { setDemo(new URLSearchParams(window.location.search).get('demo') === 'true'); }, []);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function selectFile(next?: File) {
    if (!next || lock.current) return;
    setMessage(''); setSuccess(false);
    if (!IMAGE_TYPES[next.type]) { setMessage('请选择 JPG、JPEG、PNG 或 WEBP 图片。'); return; }
    if (next.size > MAX_BYTES) { setMessage('图片不能超过 10 MB，请选择较小的图片。'); return; }
    console.info('[LOCAL] image selected', { name: next.name, type: next.type, bytes: next.size });
    pending.current = null; setCutout(null); setLocalProcessingStatus('idle'); setCloudSyncStatus('idle'); setFile(next);
  }
  async function upload() {
    if (!file || lock.current) return;
    lock.current = true; setBusy(true); setStep('正在读取照片…'); setMessage(''); setSuccess(false); setLocalProcessingStatus('processing');
    try {
      operation.current = new AbortController();
      // Paint the immersive stage before beginning model initialization.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (operation.current.signal.aborted) throw new Error('人物处理已取消。');
      if (pending.current?.file !== file) pending.current = createPendingUpload(file);
      const result = await processCutoutVideo(pending.current!, setStep, setCutout, operation.current.signal);
      setLocalProcessingStatus('ready'); setSuccess(true);
      if (demo) {
        setStep('正在同步到展览 · 保存本地 Demo');
        await saveLocalDemo(file, result.cutout, result.video);
        setCloudSyncStatus('unavailable');
        setMessage('影像已生成。同一浏览器打开 /display?demo=true 即可查看。');
      } else {
        setCloudSyncStatus('syncing');
        const cloudResult = await syncPersonCutout(pending.current!, setStep, operation.current.signal);
        if (cloudResult.ok) {
          setCloudSyncStatus('synced'); setMessage('影像已进入展览');
        } else {
          setCloudSyncStatus('failed');
          console.info('[CLOUD] sync failed:', cloudResult.error);
          setMessage('本地影像已生成，云端同步失败。');
        }
      }
    } catch (error) { setLocalProcessingStatus('failed'); console.error('[LOCAL] processing failed', error); setMessage(error instanceof Error ? error.message : '本地影像处理失败，请重试。'); }
    finally { lock.current = false; setBusy(false); setStep(''); }
  }
  const mood: ParticleMood = success ? 'success' : busy ? step.includes('同步') ? 'uploading' : step.includes('去除') ? 'removing' : step.includes('识别') ? 'recognizing' : 'preparing' : message ? 'error' : file ? 'selected' : 'idle';
  const stageLabels: Record<ParticleMood, string> = { idle: '让一个瞬间，留在光里', selected: '你的瞬间，已准备就绪', uploading: '正在同步到展览', recognizing: '正在识别主体人物', removing: '正在去除背景', preparing: '正在生成黑底影像', success: '影像即将在展览中呈现', error: '请检查提示后重试' };
  const showCutout = previewMode === 'cutout' && Boolean(cutoutPreview);
  return <main className="memory-page upload-page" data-stage={mood}>
    <ParticleField variant="landscape" />
    <div className="upload-content" inert={busy || processingPresent}>
    <header className="upload-header"><Link className="brand-link" href={demo ? '/?demo=true' : '/'} aria-label="返回影像共振首页"><span className="brand-mark" aria-hidden="true">◈</span><span>影像共振</span></Link><Link className="edition gallery-link" href="/gallery">进入云相册 <span aria-hidden="true">↗</span></Link></header>
    <section className="upload-panel">
      <p className="eyebrow">成为展览的一部分</p><h1>留下你的<span>一瞬影像</span></h1>
      <p className="intro">从一张照片，到黑暗中浮现的你。</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label="选择照片" disabled={busy} onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className={`interaction-orbit ${busy ? 'is-processing' : ''}`}>
        <ParticleField mood={mood} />
        <button className={`photo-selector ${preview ? 'has-preview' : ''} ${showCutout ? 'cutout-preview' : ''}`} aria-label={preview ? '更换照片' : '拍照 / 从相册选择照片'} disabled={busy} onClick={() => input.current?.click()}>
          {preview ? <>{showCutout ? <span className="cutout-stage"><img src={cutoutPreview} alt="抠图后的透明人物预览" /></span> : <img src={preview} alt="待上传照片预览" />}<span className="change-photo">{busy ? '正在提取影像' : '更换照片'}</span></> : <><span className="choose-icon" aria-hidden="true">＋</span><strong>拍照 / 从相册选择照片</strong></>}
        </button>
        {busy && <span className="scan-line" aria-hidden="true" />}
      </div>
      {cutoutPreview && <div className="preview-switch" role="group" aria-label="预览切换"><button aria-pressed={previewMode==='original'} onClick={() => setPreviewMode('original')}>原始照片</button><button aria-pressed={showCutout} onClick={() => setPreviewMode('cutout')}>透明人物</button></div>}
      <div className="stage-status" role="status" aria-live="polite"><span className={`stage-dot ${busy ? 'is-busy' : ''}`} aria-hidden="true" /><span>{success&&cloudSyncStatus!=='synced'?'本地影像已生成':stageLabels[mood]}</span></div>
      <p className="process-detail" aria-live="polite">{busy ? step || '正在准备处理…' : success && cloudSyncStatus === 'synced' ? '你的影像正在参与现场投影展示' : showCutout ? '背景已移除 · 人物将在展览中呈现' : 'JPG、PNG、WEBP · 最大 10 MB'}</p>
      <button className="upload-button" disabled={!file || busy || success} onClick={upload}><span className="upload-button-label">{busy ? 'PROCESSING IMAGE' : success ? cloudSyncStatus==='synced' ? '已上传到展览' : '本地影像已生成' : '上传到展览'}</span>{!busy && <span className="upload-button-arrow" aria-hidden="true">↗</span>}</button>
      <div className={`feedback ${success ? 'is-success' : ''}`} role={success ? 'status' : 'alert'} aria-live="polite">{message}</div>
      {success && <button className="again-button" onClick={() => { setFile(null); setCutout(null); pending.current = null; setSuccess(false); setMessage(''); setLocalProcessingStatus('idle'); }}>再上传一张</button>}
      <p className="privacy-note" data-local-status={localProcessingStatus} data-cloud-status={cloudSyncStatus}>{demo ? <>本地测试模式 · 不连接云端。<br />结果保存在当前浏览器，供 demo 展示读取。</> : cloudSyncStatus==='unavailable' ? <>本地预览模式<br />影像处理仍可正常完成，但不会同步到云相册。</> : <>照片会在浏览器中完成抠图和视频生成，<br />并公开用于本次展览。请选择你愿意分享的影像。</>}</p>
    </section>
    <footer className="upload-footer"><span>YOUR IMAGE, IN LIGHT.</span><span>扫码参与 · 即时呈现</span></footer>
    </div>
    <ProcessingOverlay active={busy} step={step} success={success} onPresenceChange={setProcessingPresent} />
    {/* 二维码入口：将公开部署地址 /upload 编码后印刷；不要使用 localhost。 */}
  </main>;
}



