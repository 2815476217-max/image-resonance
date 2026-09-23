'use client';
import { useEffect, useRef, useState } from 'react';
import ParticleField, { type ParticleMood } from './ParticleField';

export default function ProcessingOverlay({ active, step, success, onPresenceChange }: {
  active: boolean; step: string; success: boolean; onPresenceChange: (present: boolean) => void;
}) {
  const [present, setPresent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [lastStep, setLastStep] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { if (active) setLastStep(step); }, [active, step]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    if (active) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      setPresent(true); onPresenceChange(true);
      frame = requestAnimationFrame(() => setVisible(true));
    } else {
      // Only completed work receives the final cue; errors return directly.
      timer = setTimeout(() => {
        setVisible(false);
        timer = setTimeout(() => {
          setPresent(false); onPresenceChange(false);
          if (previousFocus.current?.isConnected) previousFocus.current.focus();
        }, 850);
      }, success ? 650 : 0);
    }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [active, success, onPresenceChange]);
  useEffect(() => {
    if (!present) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; };
  }, [present]);
  if (!present) return null;
  const current = active ? step : lastStep;
  const phase: ParticleMood = !active && success ? 'success' : current.includes('识别') ? 'recognizing' : current.includes('去除') ? 'removing' : /黑底视频|同步/.test(current) ? 'preparing' : 'uploading';
  const stage = phase === 'success' || current.includes('同步') ? 5 : current.includes('黑底视频') ? 4 : current.includes('去除') ? 3 : current.includes('识别') ? 2 : 1;
  const captions = ['Reading image', 'Detecting subject', 'Removing background', 'Building black-stage video', 'Syncing to exhibition'];
  return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="正在处理照片" className={`processing-overlay ${visible ? 'is-visible' : ''}`} data-phase={phase}>
    <div className="processing-star-sea"><ParticleField variant="sea" mood={phase}/></div>
    <div className="processing-composition">
      <div className="processing-visual"><ParticleField variant="processing" mood={phase} /><span className="processing-core" aria-hidden="true" />{phase === 'removing' && <span className="processing-scan" aria-hidden="true" />}</div>
      <div className="processing-copy" role="status" aria-live="polite" aria-atomic="true"><p key={stage} className="processing-title">{!active && success ? 'Ready to emerge' : captions[stage - 1]}</p><div className="process-meter" aria-label={`处理阶段 ${stage} / 5`}><span>PROCESS {String(stage).padStart(2,'0')} / 05</span><div className="process-blocks" aria-hidden="true">{[1,2,3,4,5].map(n=><i key={n} className={n<=stage?'filled':''}/>)}</div></div><p className="processing-detail">{active && (current.includes('下载') || current.includes('黑底视频')) ? current : phase==='removing' ? 'Removing background' : !active && !success ? 'Please check the error message' : ''}</p></div>
    </div>
    <p className="processing-footnote">A MOMENT BECOMES A PRESENCE</p>
  </div>;
}
