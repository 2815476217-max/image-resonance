import Link from 'next/link';
import ParticleField from '@/components/ParticleField';

export default async function Home({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const demo = (await searchParams).demo === 'true';
  return <main className="memory-page home-page">
    <ParticleField variant="landscape" />
    <header className="upload-header"><span className="brand-mark" aria-hidden="true">◈</span><span>影像共振</span><span className="edition">A MEMORY IN LIGHT</span></header>
    <section className="home-content">
      <p className="eyebrow">一场关于光与记忆的相遇</p>
      <h1>让影像<br /><span>在光中浮现</span></h1>
      <p className="intro">上传你的瞬间，成为展览的一部分。<br />照片将在黑暗中，化为流动的记忆。</p>
      <div className="home-orbit"><ParticleField /><Link className="enter-link" href={demo ? '/upload?demo=true' : '/upload'}><span className="enter-icon" aria-hidden="true">＋</span><span>开始上传</span><span className="enter-caption">LEAVE A MOMENT</span></Link></div>
      <Link className="gallery-entry" href="/gallery">进入云相册 <span aria-hidden="true">↗</span></Link>
      <Link className="qr-entry" href="/qr">扫码上传 <span aria-hidden="true">↗</span></Link>
      <Link className="device-entry" href="/device">设备端预览 <span aria-hidden="true">↗</span></Link>
    </section>
    <footer className="upload-footer"><span>YOUR IMAGE, IN LIGHT.</span><span>每一个瞬间，都有回响</span></footer>
  </main>;
}
