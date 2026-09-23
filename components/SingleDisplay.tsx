export type ImageDisplayProps = { src: string; onReady?: () => void; onError?: () => void };
export default function SingleDisplay({ src, onReady, onError }: ImageDisplayProps) { return <div className="single-frame"><div className="image-motion"><img src={src} alt="" draggable={false} onLoad={onReady} onError={onError} /></div></div>; }
