/* Monopolyish — sound.
 *
 * Every effect is synthesised with an oscillator or a short noise buffer, so
 * the game keeps its "open index.html and play" promise: no audio files to
 * fetch, nothing to install, and it still works offline.
 *
 * Browsers refuse to start audio before the page has been interacted with, so
 * the context is created on the first click or keypress rather than at load.
 */

const SFX = {
  ctx: null,
  muted: false,
  _volume: 0.35,

  init() {
    try {
      this.muted = localStorage.getItem('monopolyish.muted') === '1';
    } catch (e) { /* private browsing: default to sound on */ }
    const wake = () => this._ensure();
    document.addEventListener('click', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
  },

  _ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { this.ctx = new Ctx(); } catch (e) { return null; }
    return this.ctx;
  },

  setMuted(muted) {
    this.muted = !!muted;
    try { localStorage.setItem('monopolyish.muted', this.muted ? '1' : '0'); } catch (e) {}
    return this.muted;
  },

  toggle() { return this.setMuted(!this.muted); },

  /* One note. `type` is an oscillator shape; the envelope is a plain
     attack-decay, which is all a blip needs. */
  _tone(freq, start, length, type = 'sine', gain = 1) {
    const ctx = this._ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const t0 = ctx.currentTime + start;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(this._volume * gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + length);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  },

  /* Filtered noise, for anything that rattles rather than rings. */
  _noise(start, length, cutoff = 1800, gain = 1) {
    const ctx = this._ensure();
    if (!ctx) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const t0 = ctx.currentTime + start;

    src.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    amp.gain.setValueAtTime(this._volume * gain, t0);

    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start(t0);
  },

  play(name) {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

    switch (name) {
      case 'dice':
        this._noise(0, 0.09, 2600, 0.7);
        this._noise(0.11, 0.08, 2200, 0.6);
        this._noise(0.2, 0.1, 1800, 0.5);
        break;
      case 'move':
        this._tone(520, 0, 0.05, 'triangle', 0.35);
        break;
      case 'money':
        this._tone(660, 0, 0.09, 'triangle');
        this._tone(880, 0.07, 0.13, 'triangle');
        break;
      case 'pay':
        this._tone(320, 0, 0.11, 'sawtooth', 0.6);
        this._tone(240, 0.09, 0.16, 'sawtooth', 0.5);
        break;
      case 'buy':
        this._tone(523, 0, 0.1, 'sine');
        this._tone(659, 0.08, 0.1, 'sine');
        this._tone(784, 0.16, 0.18, 'sine');
        break;
      case 'build':
        this._tone(440, 0, 0.05, 'square', 0.5);
        this._tone(620, 0.06, 0.07, 'square', 0.45);
        break;
      case 'card':
        this._noise(0, 0.16, 3600, 0.45);
        break;
      case 'jail':
        this._tone(180, 0, 0.32, 'square', 0.55);
        this._noise(0.02, 0.3, 900, 0.5);
        break;
      case 'auction':
        this._tone(700, 0, 0.06, 'square', 0.5);
        this._tone(700, 0.09, 0.06, 'square', 0.5);
        this._tone(940, 0.18, 0.14, 'square', 0.5);
        break;
      case 'trade':
        this._tone(587, 0, 0.09, 'triangle');
        this._tone(784, 0.08, 0.14, 'triangle');
        break;
      case 'error':
        this._tone(200, 0, 0.14, 'sawtooth', 0.55);
        break;
      case 'bankrupt':
        this._tone(400, 0, 0.16, 'sawtooth', 0.6);
        this._tone(300, 0.14, 0.18, 'sawtooth', 0.6);
        this._tone(200, 0.3, 0.34, 'sawtooth', 0.6);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.11, 0.26, 'triangle'));
        break;
      case 'chat':
        this._tone(880, 0, 0.05, 'sine', 0.5);
        break;
      default:
        break;
    }
  }
};

if (typeof document !== 'undefined' && document.addEventListener) {
  SFX.init();
}
