import Link from 'next/link';
import ParticleField from '@/components/ParticleField';
import UploadQrCode from '@/components/UploadQrCode';

export default function QrPage() {
  return <main className="memory-page qr-page">
    <ParticleField variant="landscape" />
    <header className="upload-header"><Link className="brand-link" href="/"><span className="brand-mark" aria-hidden="true">◈</span><span>影像共振</span></Link><Link className="edition gallery-link" href="/gallery">进入云相册 <span aria-hidden="true">↗</span></Link></header>
    <section className="qr-content">
      <p className="eyebrow">成为展览的一部分</p>
      <h1>扫码留下你的影像</h1>
      <p className="intro">上传照片，成为展览的一部分</p>
      <div className="qr-orbit"><ParticleField variant="qr" /><div className="qr-orbit-content"><UploadQrCode /><p className="qr-label">扫码上传影像</p><p className="qr-hint">使用手机扫码，上传你的照片</p></div></div>
    </section>
  </main>;
}
