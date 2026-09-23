import ParticleField from './ParticleField';

export default function EmptyExhibitionState() {
  return <div className="empty-exhibition" role="status" aria-live="polite">
    <div className="display-atmosphere"><ParticleField variant="landscape" /></div>
    <p>等待新的影像进入展览</p>
  </div>;
}
