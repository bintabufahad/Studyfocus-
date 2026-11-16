export type CueType = 'sprint_end' | 'break_end' | 'reminder' | 'checkin';

export function playCueSound(type: CueType): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const sequences: Record<CueType, Array<{ freq: number; delay: number; dur: number; vol: number }>> = {
      sprint_end: [
        { freq: 523.25, delay: 0, dur: 0.7, vol: 0.09 },
        { freq: 659.25, delay: 0.14, dur: 0.8, vol: 0.09 },
        { freq: 783.99, delay: 0.28, dur: 1.1, vol: 0.08 },
      ],
      break_end: [
        { freq: 587.33, delay: 0, dur: 0.65, vol: 0.08 },
        { freq: 880.0, delay: 0.16, dur: 0.9, vol: 0.08 },
      ],
      reminder: [
        { freq: 440.0, delay: 0, dur: 0.45, vol: 0.06 },
        { freq: 554.37, delay: 0.14, dur: 0.5, vol: 0.05 },
      ],
      checkin: [
        { freq: 523.25, delay: 0, dur: 0.7, vol: 0.07 },
        { freq: 659.25, delay: 0.16, dur: 0.85, vol: 0.06 },
      ],
    };

    for (const note of sequences[type]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.delay);
      gain.gain.setValueAtTime(0.0001, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(note.vol, now + note.delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.dur + 0.05);
    }

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1800);
  } catch {
    // Ignore browser audio autoplay restrictions
  }
}
