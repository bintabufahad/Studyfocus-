import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number; // depth 0.15 (far) to 1.0 (near)
  vx: number;
  vy: number;
  radius: number;
  warmth: number; // 0 = cool indigo/silver, 1 = warm amber dust
  phase: number;
  twinkleSpeed: number;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const count = Math.min(95, Math.max(48, Math.floor((width * height) / 22000)));
    const particles: Particle[] = Array.from({ length: count }, () => {
      const z = 0.18 + Math.random() * 0.82;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        vx: (Math.random() - 0.5) * 0.14 * z,
        vy: (-0.05 - Math.random() * 0.14) * z,
        radius: 0.7 + z * 1.9,
        warmth: Math.random() > 0.62 ? 1 : 0,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.004 + Math.random() * 0.008,
      };
    });

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.targetX = (e.clientX / Math.max(1, width) - 0.5) * 28;
      pointer.targetY = (e.clientY / Math.max(1, height) - 0.5) * 20;
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let rafId = 0;

    const renderFrame = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Smooth pointer parallax easing
      pointer.x += (pointer.targetX - pointer.x) * 0.03;
      pointer.y += (pointer.targetY - pointer.y) * 0.03;

      // Subtle atmospheric night-sky radial gradients
      const skyGrad = ctx.createRadialGradient(
        width * 0.24,
        height * 0.22,
        40,
        width * 0.24,
        height * 0.22,
        Math.max(width, height) * 0.72
      );
      skyGrad.addColorStop(0, 'rgba(38, 49, 98, 0.22)');
      skyGrad.addColorStop(0.5, 'rgba(15, 20, 42, 0.08)');
      skyGrad.addColorStop(1, 'rgba(9, 11, 20, 0)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      const amberGrad = ctx.createRadialGradient(
        width * 0.78,
        height * 0.72,
        20,
        width * 0.78,
        height * 0.72,
        Math.max(width, height) * 0.5
      );
      amberGrad.addColorStop(0, 'rgba(245, 158, 11, 0.065)');
      amberGrad.addColorStop(1, 'rgba(9, 11, 20, 0)');
      ctx.fillStyle = amberGrad;
      ctx.fillRect(0, 0, width, height);

      for (const p of particles) {
        if (!prefersReducedMotion) {
          p.x += p.vx;
          p.y += p.vy;

          if (p.y < -20) {
            p.y = height + 20;
            p.x = Math.random() * width;
          }
          if (p.x < -20) p.x = width + 20;
          if (p.x > width + 20) p.x = -20;
        }

        const twinkle = prefersReducedMotion
          ? 0.7
          : 0.45 + 0.55 * Math.sin(time * p.twinkleSpeed + p.phase);

        const px = p.x - pointer.x * p.z;
        const py = p.y - pointer.y * p.z;

        const baseAlpha = (0.14 + p.z * 0.42) * twinkle;
        const r = p.radius;

        // Soft depth-of-field halo for closer or warmer motes
        if (p.z > 0.55) {
          const haloRadius = r * (p.warmth ? 5.2 : 4.2);
          const halo = ctx.createRadialGradient(px, py, 0, px, py, haloRadius);
          if (p.warmth) {
            halo.addColorStop(0, `rgba(251, 191, 36, ${baseAlpha * 0.42})`);
            halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
          } else {
            halo.addColorStop(0, `rgba(165, 180, 252, ${baseAlpha * 0.32})`);
            halo.addColorStop(1, 'rgba(165, 180, 252, 0)');
          }
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = p.warmth
          ? `rgba(253, 224, 148, ${baseAlpha})`
          : `rgba(216, 224, 255, ${baseAlpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
