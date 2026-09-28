// Sound effects synthesized with WebAudio. No audio files.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastMove = 0;
  }

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  tone(freq, dur, { type = 'square', vol = 0.04, delay = 0, to = null } = {}) {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  seq(notes, step, opts) {
    notes.forEach((f, i) => this.tone(f, step * 1.6, { ...opts, delay: i * step }));
  }

  play(name, arg = 0) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'move': {
        const now = this.ctx.currentTime;
        if (now - this.lastMove < 0.03) return;
        this.lastMove = now;
        this.tone(200, 0.03, { type: 'triangle', vol: 0.03 });
        break;
      }
      case 'rotate': this.tone(330, 0.05, { type: 'triangle', vol: 0.04, to: 440 }); break;
      case 'hold': this.tone(300, 0.08, { type: 'triangle', vol: 0.05, to: 200 }); break;
      case 'lock': this.tone(120, 0.08, { type: 'sine', vol: 0.09 }); break;
      case 'hardDrop': this.tone(140, 0.12, { type: 'triangle', vol: 0.1, to: 50 }); break;
      case 'clear': this.seq([523, 659, 784, 1047, 1319].slice(0, Math.min(5, arg + 1)), 0.06, { type: 'square', vol: 0.035 }); break;
      case 'tspin': this.seq([440, 554, 659, 880], 0.06, { type: 'sawtooth', vol: 0.03 }); break;
      case 'pc': this.seq([523, 659, 784, 1047, 1319, 1568], 0.07, { type: 'triangle', vol: 0.06 }); break;
      case 'levelUp': this.seq([523, 784], 0.09, { type: 'square', vol: 0.035 }); break;
      case 'gameOver': this.seq([392, 330, 262, 196], 0.14, { type: 'triangle', vol: 0.07 }); break;
      case 'win': this.seq([523, 659, 784, 1047], 0.1, { type: 'triangle', vol: 0.07 }); break;
      default: break;
    }
  }
}
