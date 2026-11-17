import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number; // Depth factor 0.28 (distant) to 1.0 (foreground)
  vx: number;
  vy: number;
  baseRadius: number;
  tone: number; // 0 = cyan, 0.55 = teal/seafoam, 1 = warm gold
  phase: number;
  pulseSpeed: number;
  wanderFreq: number;
}

interface BokehOrb {
  nx: number; // normalized 0..1 base x
  ny: number; // normalized 0..1 base y
  radiusScale: number;
  alpha: number;
  isGold: boolean;
  driftSpeed: number;
  phase: number;
}

interface WaveRibbon {
  yStartRatio: number;
  yEndRatio: number;
  amp1: number;
  amp2: number;
  freq1: number;
  freq2: number;
  phase: number;
  speed: number;
  width: number;
  alpha: number;
  isGold: boolean;
  sparkOffset: number;
}

function parseRgbTriplet(raw: string, fallback: [number, number, number]): [number, number, number] {
  const parts = raw
    .split(',')
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 255);
  return parts.length === 3 ? [parts[0], parts[1], parts[2]] : fallback;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Read theme palette from index.html CSS custom properties
    const styles = getComputedStyle(document.documentElement);
    const RGB_CYAN = parseRgbTriplet(styles.getPropertyValue('--fp-cyan-rgb'), [78, 235, 255]);
    const RGB_TEAL = parseRgbTriplet(styles.getPropertyValue('--fp-teal-rgb'), [56, 217, 198]);
    const RGB_GOLD = parseRgbTriplet(styles.getPropertyValue('--fp-gold-rgb'), [251, 198, 78]);
    const bgDeep = styles.getPropertyValue('--fp-bg-deep').trim() || '#02080f';
    const bgMid = styles.getPropertyValue('--fp-bg-mid').trim() || '#061b26';

    const sampleParticleColor = (tone: number): readonly [number, number, number] => {
      if (tone < 0.5) return RGB_CYAN;
      if (tone < 0.72) return RGB_TEAL;
      return RGB_GOLD;
    };

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const sizeCanvas = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    const pointer = {
      x: width * 0.5,
      y: height * 0.48,
      smoothX: width * 0.5,
      smoothY: height * 0.48,
      active: false,
      energy: 0,
    };

    // Soft depth-of-field bokeh orbs (subtle, natural out-of-focus background lights)
    const bokehOrbs: BokehOrb[] = [
      { nx: 0.08, ny: 0.14, radiusScale: 0.055, alpha: 0.11, isGold: false, driftSpeed: 0.00028, phase: 0.4 },
      { nx: 0.17, ny: 0.24, radiusScale: 0.042, alpha: 0.09, isGold: false, driftSpeed: 0.00034, phase: 1.5 },
      { nx: 0.26, ny: 0.17, radiusScale: 0.064, alpha: 0.075, isGold: false, driftSpeed: 0.00022, phase: 2.3 },
      { nx: 0.12, ny: 0.42, radiusScale: 0.048, alpha: 0.07, isGold: false, driftSpeed: 0.00031, phase: 3.1 },
      { nx: 0.42, ny: 0.16, radiusScale: 0.038, alpha: 0.07, isGold: false, driftSpeed: 0.00029, phase: 4.0 },
      { nx: 0.62, ny: 0.14, radiusScale: 0.05, alpha: 0.08, isGold: false, driftSpeed: 0.00025, phase: 4.8 },
      { nx: 0.78, ny: 0.22, radiusScale: 0.045, alpha: 0.085, isGold: true, driftSpeed: 0.0003, phase: 5.4 },
      { nx: 0.22, ny: 0.84, radiusScale: 0.055, alpha: 0.08, isGold: false, driftSpeed: 0.00027, phase: 1.1 },
      { nx: 0.45, ny: 0.88, radiusScale: 0.062, alpha: 0.075, isGold: false, driftSpeed: 0.00024, phase: 2.8 },
      { nx: 0.68, ny: 0.84, radiusScale: 0.052, alpha: 0.075, isGold: true, driftSpeed: 0.00029, phase: 3.7 },
      { nx: 0.88, ny: 0.76, radiusScale: 0.058, alpha: 0.09, isGold: false, driftSpeed: 0.00026, phase: 5.9 },
    ];

    // Sweeping bioluminescent cyan & gold wave ribbons crossing diagonally
    const ribbons: WaveRibbon[] = Array.from({ length: 18 }, (_, idx) => {
      const t = idx / 17;
      const isGold = idx % 3 === 1;
      return {
        yStartRatio: 0.98 - t * 0.48 + (idx % 2 === 0 ? 0.04 : -0.03),
        yEndRatio: 0.02 + t * 0.46 + (idx % 3 === 0 ? -0.04 : 0.03),
        amp1: 42 + (idx % 5) * 18,
        amp2: 24 + (idx % 4) * 14,
        freq1: 1.55 + (idx % 3) * 0.28,
        freq2: 2.7 + (idx % 4) * 0.35,
        phase: idx * 0.52,
        speed: 0.00032 + (idx % 4) * 0.00009,
        width: isGold ? 1.35 + (idx % 2) * 0.55 : 1.15 + (idx % 3) * 0.55,
        alpha: isGold ? 0.22 + (idx % 3) * 0.05 : 0.2 + (idx % 3) * 0.055,
        isGold,
        sparkOffset: (idx * 0.17) % 1,
      };
    });

    // Interactive constellation particle network
    const count = Math.min(92, Math.max(48, Math.floor((width * height) / 17000)));
    const linkDistance = Math.min(188, Math.max(125, Math.round(width * 0.13)));
    const mouseRadius = 225;

    const particles: Particle[] = Array.from({ length: count }, (_, idx) => {
      const z = 0.28 + Math.random() * 0.72;
      const angle = (idx / count) * Math.PI * 2 + Math.random();
      const speed = (0.16 + Math.random() * 0.22) * z;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseRadius: 1.05 + z * 2.05,
        tone: Math.random(),
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.0017 + Math.random() * 0.0021,
        wanderFreq: 0.00042 + Math.random() * 0.0005,
      };
    });

    const onResize = () => {
      sizeCanvas();
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);

    let rafId = 0;

    const renderFrame = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.1;
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.1;
      pointer.energy += ((pointer.active ? 1 : 0) - pointer.energy) * 0.05;

      // 1. Deep midnight oceanic atmospheric base
      const baseBg = ctx.createRadialGradient(
        width * 0.56,
        height * 0.44,
        20,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      baseBg.addColorStop(0, bgMid);
      baseBg.addColorStop(0.55, '#04121c');
      baseBg.addColorStop(1, bgDeep);
      ctx.fillStyle = baseBg;
      ctx.fillRect(0, 0, width, height);

      // Ambient cyan & warm gold horizon glows
      const cyanBloom = ctx.createRadialGradient(
        width * 0.24,
        height * 0.25,
        20,
        width * 0.24,
        height * 0.25,
        Math.max(width, height) * 0.65
      );
      cyanBloom.addColorStop(0, `rgba(${RGB_CYAN[0]}, ${RGB_CYAN[1]}, ${RGB_CYAN[2]}, 0.15)`);
      cyanBloom.addColorStop(0.45, `rgba(${RGB_TEAL[0]}, ${RGB_TEAL[1]}, ${RGB_TEAL[2]}, 0.06)`);
      cyanBloom.addColorStop(1, 'rgba(2, 8, 15, 0)');
      ctx.fillStyle = cyanBloom;
      ctx.fillRect(0, 0, width, height);

      const goldBloom = ctx.createRadialGradient(
        width * 0.72,
        height * 0.58,
        20,
        width * 0.72,
        height * 0.58,
        Math.max(width, height) * 0.55
      );
      goldBloom.addColorStop(0, `rgba(${RGB_GOLD[0]}, ${RGB_GOLD[1]}, ${RGB_GOLD[2]}, 0.12)`);
      goldBloom.addColorStop(0.5, `rgba(${RGB_GOLD[0]}, ${RGB_GOLD[1]}, ${RGB_GOLD[2]}, 0.04)`);
      goldBloom.addColorStop(1, 'rgba(2, 8, 15, 0)');
      ctx.fillStyle = goldBloom;
      ctx.fillRect(0, 0, width, height);

      // 2. Soft defocused bokeh depth-of-field orbs
      for (const orb of bokehOrbs) {
        const driftX = prefersReducedMotion ? 0 : Math.sin(time * orb.driftSpeed + orb.phase) * 26;
        const driftY = prefersReducedMotion ? 0 : Math.cos(time * orb.driftSpeed * 0.85 + orb.phase) * 18;
        const ox = orb.nx * width + driftX;
        const oy = orb.ny * height + driftY;
        const r = Math.min(width, height) * orb.radiusScale;
        const col = orb.isGold ? RGB_GOLD : RGB_CYAN;

        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        grad.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${orb.alpha})`);
        grad.addColorStop(0.55, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${orb.alpha * 0.45})`);
        grad.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Sweeping bioluminescent cyan & gold wave ribbons
      const segments = 32;
      for (const ribbon of ribbons) {
        const col = ribbon.isGold ? RGB_GOLD : RGB_CYAN;
        const tOffset = prefersReducedMotion ? 0 : time * ribbon.speed;
        const ptsX: number[] = [];
        const ptsY: number[] = [];

        for (let s = 0; s <= segments; s++) {
          const u = s / segments;
          const x = -width * 0.06 + u * (width * 1.12);
          const baseY = height * (ribbon.yStartRatio + (ribbon.yEndRatio - ribbon.yStartRatio) * u);
          const wave =
            Math.sin(u * Math.PI * ribbon.freq1 + ribbon.phase + tOffset) * ribbon.amp1 +
            Math.cos(u * Math.PI * ribbon.freq2 - ribbon.phase * 0.7 + tOffset * 0.8) * ribbon.amp2;
          let y = baseY + wave * Math.sin(u * Math.PI * 0.85 + 0.25);

          // Gentle organic cursor warp when pointer passes over the light waves
          if (pointer.energy > 0.02) {
            const dx = x - pointer.smoothX;
            const dy = y - pointer.smoothY;
            const d = Math.hypot(dx, dy);
            if (d < mouseRadius * 1.1) {
              const push = (1 - d / (mouseRadius * 1.1)) * 26 * pointer.energy;
              y += dy >= 0 ? push : -push;
            }
          }

          ptsX.push(x);
          ptsY.push(y);
        }

        // Soft outer light bloom pass
        ctx.beginPath();
        ctx.moveTo(ptsX[0], ptsY[0]);
        for (let s = 1; s < ptsX.length - 1; s++) {
          const xc = (ptsX[s] + ptsX[s + 1]) * 0.5;
          const yc = (ptsY[s] + ptsY[s + 1]) * 0.5;
          ctx.quadraticCurveTo(ptsX[s], ptsY[s], xc, yc);
        }
        ctx.lineTo(ptsX[ptsX.length - 1], ptsY[ptsY.length - 1]);
        ctx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${ribbon.alpha * 0.24})`;
        ctx.lineWidth = ribbon.width * 4.5;
        ctx.stroke();

        // Crisp inner glowing strand pass
        ctx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${ribbon.alpha})`;
        ctx.lineWidth = ribbon.width;
        ctx.stroke();

        // Bright bioluminescent bead traveling gently along each ribbon
        const sparkPos = prefersReducedMotion
          ? ribbon.sparkOffset
          : (ribbon.sparkOffset + time * 0.000045) % 1;
        const idxFloat = sparkPos * (ptsX.length - 1);
        const idx0 = Math.floor(idxFloat);
        const idx1 = Math.min(ptsX.length - 1, idx0 + 1);
        const frac = idxFloat - idx0;
        const sx = ptsX[idx0] + (ptsX[idx1] - ptsX[idx0]) * frac;
        const sy = ptsY[idx0] + (ptsY[idx1] - ptsY[idx0]) * frac;

        const sparkGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
        sparkGlow.addColorStop(0, `rgba(255, 255, 255, ${ribbon.alpha * 2.2})`);
        sparkGlow.addColorStop(0.35, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${ribbon.alpha * 1.4})`);
        sparkGlow.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
        ctx.fillStyle = sparkGlow;
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // Interactive pointer bioluminescent aura
      if (pointer.energy > 0.02) {
        const cursorAura = ctx.createRadialGradient(
          pointer.smoothX,
          pointer.smoothY,
          0,
          pointer.smoothX,
          pointer.smoothY,
          mouseRadius * 1.15
        );
        cursorAura.addColorStop(0, `rgba(${RGB_CYAN[0]}, ${RGB_CYAN[1]}, ${RGB_CYAN[2]}, ${0.13 * pointer.energy})`);
        cursorAura.addColorStop(0.5, `rgba(${RGB_GOLD[0]}, ${RGB_GOLD[1]}, ${RGB_GOLD[2]}, ${0.05 * pointer.energy})`);
        cursorAura.addColorStop(1, 'rgba(2, 8, 15, 0)');
        ctx.fillStyle = cursorAura;
        ctx.fillRect(0, 0, width, height);
      }

      // 4. Update living organism particle motion & gentle mouse attraction/swirl
      for (const p of particles) {
        if (!prefersReducedMotion) {
          const wanderAngle = time * p.wanderFreq + p.phase;
          p.vx += Math.cos(wanderAngle) * 0.0042 * p.z;
          p.vy += Math.sin(wanderAngle * 0.9) * 0.0042 * p.z;

          if (pointer.energy > 0.02) {
            const dx = pointer.smoothX - p.x;
            const dy = pointer.smoothY - p.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < mouseRadius * mouseRadius && distSq > 4) {
              const dist = Math.sqrt(distSq);
              const pull = (1 - dist / mouseRadius) * 0.028 * pointer.energy * p.z;
              if (dist > 44) {
                p.vx += (dx / dist) * pull;
                p.vy += (dy / dist) * pull;
              } else {
                p.vx -= (dx / dist) * pull * 1.35;
                p.vy -= (dy / dist) * pull * 1.35;
              }
              p.vx += (-dy / dist) * pull * 0.42;
              p.vy += (dx / dist) * pull * 0.42;
            }
          }

          p.vx *= 0.985;
          p.vy *= 0.985;
          const speed = Math.hypot(p.vx, p.vy);
          const maxSpeed = 0.68 * p.z + 0.14;
          if (speed > maxSpeed) {
            p.vx = (p.vx / speed) * maxSpeed;
            p.vy = (p.vy / speed) * maxSpeed;
          } else if (speed < 0.075 * p.z) {
            p.vx += Math.cos(wanderAngle) * 0.014;
            p.vy += Math.sin(wanderAngle) * 0.014;
          }

          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -30) p.x = width + 30;
          if (p.x > width + 30) p.x = -30;
          if (p.y < -30) p.y = height + 30;
          if (p.y > height + 30) p.y = -30;
        }
      }

      // 5. Draw interactive constellation network filaments
      ctx.lineWidth = 0.95;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        const colA = sampleParticleColor(a.tone);

        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= linkDistance * linkDistance) continue;

          const dist = Math.sqrt(distSq);
          const proximity = 1 - dist / linkDistance;
          const depthAlpha = (a.z + b.z) * 0.5;

          let cursorBoost = 0;
          if (pointer.energy > 0.02) {
            const mx = (a.x + b.x) * 0.5 - pointer.smoothX;
            const my = (a.y + b.y) * 0.5 - pointer.smoothY;
            const mDist = Math.hypot(mx, my);
            if (mDist < mouseRadius) {
              cursorBoost = (1 - mDist / mouseRadius) * 0.36 * pointer.energy;
            }
          }

          const alpha = Math.min(0.65, proximity * proximity * 0.3 * depthAlpha + cursorBoost);
          if (alpha < 0.014) continue;

          const colB = sampleParticleColor(b.tone);
          const lineGrad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          lineGrad.addColorStop(0, `rgba(${colA[0]}, ${colA[1]}, ${colA[2]}, ${alpha})`);
          lineGrad.addColorStop(1, `rgba(${colB[0]}, ${colB[1]}, ${colB[2]}, ${alpha})`);

          ctx.strokeStyle = lineGrad;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        if (pointer.energy > 0.05) {
          const mdx = pointer.smoothX - a.x;
          const mdy = pointer.smoothY - a.y;
          const mDistSq = mdx * mdx + mdy * mdy;
          const cursorReach = mouseRadius * 0.85;
          if (mDistSq < cursorReach * cursorReach) {
            const mDist = Math.sqrt(mDistSq);
            const mAlpha = (1 - mDist / cursorReach) * 0.44 * pointer.energy * a.z;
            const synGrad = ctx.createLinearGradient(a.x, a.y, pointer.smoothX, pointer.smoothY);
            synGrad.addColorStop(0, `rgba(${colA[0]}, ${colA[1]}, ${colA[2]}, ${mAlpha})`);
            synGrad.addColorStop(1, `rgba(${RGB_GOLD[0]}, ${RGB_GOLD[1]}, ${RGB_GOLD[2]}, ${mAlpha * 0.7})`);
            ctx.strokeStyle = synGrad;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.smoothX, pointer.smoothY);
            ctx.stroke();
          }
        }
      }

      // 6. Draw bioluminescent particle cores & glowing halos
      for (const p of particles) {
        const col = sampleParticleColor(p.tone);
        const pulse = prefersReducedMotion
          ? 0.82
          : 0.6 + 0.4 * Math.sin(time * p.pulseSpeed + p.phase);

        let mouseGlow = 0;
        if (pointer.energy > 0.02) {
          const mDist = Math.hypot(pointer.smoothX - p.x, pointer.smoothY - p.y);
          if (mDist < mouseRadius) {
            mouseGlow = (1 - mDist / mouseRadius) * 0.55 * pointer.energy;
          }
        }

        const alpha = Math.min(0.96, (0.38 + p.z * 0.48) * pulse + mouseGlow * 0.55);
        const r = p.baseRadius * (1 + mouseGlow * 0.42);
        const haloRadius = r * (4.6 + mouseGlow * 3.2);

        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloRadius);
        halo.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.48})`);
        halo.addColorStop(0.55, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.14})`);
        halo.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(248, 252, 255, ${Math.min(0.95, alpha * 0.88)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.42, 0, Math.PI * 2);
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
      window.removeEventListener('pointerleave', onPointerLeave);
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
