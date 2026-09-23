'use client';
import { useEffect, useRef } from 'react';

export type ParticleMood = 'idle' | 'selected' | 'uploading' | 'recognizing' | 'removing' | 'preparing' | 'success' | 'error';

/** Decorative only; photos, controls and status remain accessible HTML. */
export default function ParticleField({ variant = 'orbit', mood = 'idle' }: { variant?: 'landscape' | 'sea' | 'orbit' | 'qr' | 'processing'; mood?: ParticleMood }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ mood, changed: 0 });
  useEffect(() => { state.current = { mood, changed: performance.now() }; }, [mood]);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, frame = 0, last = 0, elapsed = 0, seed = 41;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const points = Array.from({ length: variant === 'processing' ? 2600 : variant === 'qr' ? 1600 : variant === 'orbit' ? 1300 : 1700 }, () => ({ x: random(), y: random(), z: random(), phase: random() * Math.PI * 2 }));
    let concentration = 1;
    function dot(x: number, y: number, alpha: number, size = .8, cool = false) {
      context!.fillStyle = cool ? `rgba(154,195,200,${alpha})` : `rgba(220,228,229,${alpha})`;
      context!.fillRect(x, y, size, size);
    }
    function draw(time: number) {
      context!.clearRect(0, 0, width, height);
      const t = motion.matches ? 0 : time / 1000, mobile = window.innerWidth < 600;
      const { mood: phase, changed } = state.current;
      const processing = ['uploading', 'recognizing', 'removing', 'preparing'].includes(phase);
      const pulse = phase === 'success' && !motion.matches ? Math.sin(Math.min(1, Math.max(0, (performance.now() - changed) / 1800)) * Math.PI) : 0;
      if (variant === 'processing') {
        const target = phase === 'recognizing' ? .91 : phase === 'preparing' ? 1.06 : 1;
        concentration += (target - concentration) * .025;
        const radius = Math.min(width, height) * .31 * concentration * (1 + Math.sin(t * Math.PI / 5) * .025 + pulse * .1);
        for (let i = 0; i < points.length; i += mobile ? 2 : 1) {
          const p = points[i], angle = p.x * Math.PI * 2 + t * .055;
          const cloud = (p.y - .5) * .32 + Math.sin(angle * 3 + t * .22) * .055 + Math.cos(angle * 5 - t * .16) * .025;
          const r = radius * (1 + cloud);
          dot(width / 2 + Math.cos(angle) * r, height / 2 + Math.sin(angle) * r * (.94 + .03 * Math.sin(t * .2)), (.15 + p.z * .52) * (.78 + .22 * Math.sin(t * .55 + p.phase)) * (1 - pulse * .4), .7 + p.z * .55, p.z < .2);
        }
        for (let i = 0; i < 140; i += mobile ? 2 : 1) { const p = points[i]; dot(p.x * width, (p.y * height + t * .6) % height, .07 + p.z * .13, .7); }
      } else if (variant === 'orbit' || variant === 'qr') {
        const qr = variant === 'qr';
        const radius = Math.min(width, height) * ((qr ? .44 : .38) + Math.sin(t * (qr ? .5 : .45)) * (qr ? .008 : .006) + pulse * .045);
        for (let i = 0; i < points.length; i += mobile ? 2 : 1) {
          const p = points[i], angle = p.x * Math.PI * 2 + t * (processing ? .09 : qr ? .035 : .025);
          const spread = (p.y - .5) * (qr ? .11 : phase === 'selected' || processing ? .085 : .14);
          const r = radius * (1 + spread + (qr ? .022 : .018) * Math.sin(angle * 3 + t * (qr ? .48 : .4) + p.phase));
          const alpha = qr
            ? (.22 + p.z * .58) * (.68 + .32 * Math.sin(t * .72 + p.phase))
            : (.18 + p.z * .52) * (.7 + .3 * Math.sin(t * .6 + p.phase));
          dot(width / 2 + Math.cos(angle) * r, height / 2 + Math.sin(angle) * r, alpha * (1 - pulse * .35), p.z > .95 ? (qr ? 1.65 : 1.5) : (qr ? .95 : .85), p.z < .17);
        }
        for (let i = 0; i < 70; i += mobile ? 2 : 1) { const p = points[i]; dot(p.x * width, (p.y * height + t * (1 + p.z)) % height, .08 + p.z * .15, .7); }
      } else {
        if (variant === 'sea') {
          for (let i = 0; i < 650; i += mobile ? 2 : 1) {
            const p = points[i];
            dot((p.x * width + t * (1 + p.z * 2)) % width, p.y * height + Math.sin(t * .15 + p.phase) * 3, (.06 + p.z * .22) * (.8 + .2 * Math.sin(t * .5 + p.phase)), .7 + p.z * .35, p.z < .2);
          }
        }
        for (let i = 0; i < (variant === 'sea' ? 0 : 130); i++) { const p = points[i]; dot(p.x * width, p.y * height, (.07 + p.z * .25) * (.7 + .3 * Math.sin(t * .35 + p.phase)), p.z > .97 ? 1.6 : .8); }
        for (let i = 130; i < points.length; i += mobile ? 3 : 1) {
          const p = points[i], x = p.x * width, depth = p.y * p.y;
          const horizon = height * .77 + Math.sin(p.x * 7 + t * .1) * height * .028;
          const y = horizon + depth * height * .22 + Math.sin(p.x * 12 + p.y * 5 + t * .15) * (8 + depth * 18);
          dot(x + Math.sin(t * .12 + p.phase) * 3, y, (.05 + depth * .17) * (.6 + p.z * .4), .65 + depth * .5, p.z < .25);
        }
      }
    }
    function tick(now: number) {
      if (document.hidden || motion.matches) { frame = 0; return; }
      if (now - last >= 1000 / 24) { elapsed += Math.min(now - last, 80); last = now; draw(elapsed); }
      frame = requestAnimationFrame(tick);
    }
    function resume() { cancelAnimationFrame(frame); frame = 0; draw(elapsed); if (!document.hidden && !motion.matches) { last = performance.now(); frame = requestAnimationFrame(tick); } }
    function resize() {
      const rect = element!.getBoundingClientRect(); width = rect.width; height = rect.height;
      const ratio = Math.min(devicePixelRatio || 1, 1.5); element!.width = Math.round(width * ratio); element!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0); draw(elapsed);
    }
    const observer = new ResizeObserver(resize); observer.observe(element);
    document.addEventListener('visibilitychange', resume); motion.addEventListener('change', resume);
    resize(); resume();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', resume); motion.removeEventListener('change', resume); };
  }, [variant]);
  return <canvas ref={canvas} className={`particle-field particle-${variant}`} aria-hidden="true" />;
}
