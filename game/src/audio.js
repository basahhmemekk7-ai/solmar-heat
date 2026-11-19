// All sound is synthesized with WebAudio: three radio stations (a step sequencer playing
// chord stabs, bass and hats), an engine hum, sirens and one-shot effects. No audio files.
const STATIONS = [
  { name: 'SOLMAR FM 101.2', bpm: 96, wave: 'sawtooth', roots: [55, 65.41, 49, 58.27], bright: 0.5 },
  { name: 'BAY BEATS 88.4', bpm: 118, wave: 'square', roots: [61.74, 49, 55, 73.42], bright: 0.8 },
  { name: 'PALM DRIVE 104.7', bpm: 80, wave: 'triangle', roots: [43.65, 51.91, 58.27, 49], bright: 0.35 },
];

export function createAudio() {
  let ctx = null, master = null, musicBus = null, noiseBuf = null;
  let station = 0, muted = false, step = 0, nextStepTime = 0;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenOn = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master); engineOsc.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
      nextStepTime = ctx.currentTime + 0.05;
      return true;
    } catch { return false; }
  }

  function tone(freq, t0, dur, type, gain, dest, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(t0, dur, gain, freq) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // One sequencer step: bass on the beat, a chord stab, hats off-beat.
  function scheduleStep(st, t) {
    const bar = Math.floor(step / 16) % st.roots.length;
    const root = st.roots[bar];
    if (step % 4 === 0) tone(root, t, 0.32, 'sine', 0.5, musicBus);
    if (step % 4 === 2) tone(root * 1.5, t, 0.2, 'sine', 0.28, musicBus);
    if (step % 8 === 0) {
      [1, 1.25, 1.5].forEach((m) => tone(root * 4 * m, t, 0.5, st.wave, 0.05 * st.bright + 0.02, musicBus));
    }
    if (step % 2 === 1) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(hp); hp.connect(g); g.connect(musicBus);
      src.start(t); src.stop(t + 0.06);
    }
  }

  return {
    ensure,
    get stationName() { return STATIONS[station].name; },
    nextStation() { station = (station + 1) % STATIONS.length; step = 0; return STATIONS[station].name; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    setEngine(speed01, inCar) {
      if (!ctx) return;
      engineGain.gain.value = inCar ? 0.05 + speed01 * 0.1 : 0;
      engineOsc.frequency.value = 45 + speed01 * 130;
    },
    setSiren(on) {
      if (!ctx) return;
      sirenOn = on;
      sirenGain.gain.value = on ? 0.045 : 0;
    },
    shot() { if (ctx) { noise(ctx.currentTime, 0.12, 0.5, 3000); tone(180, ctx.currentTime, 0.08, 'square', 0.2, master, 60); } },
    punch() { if (ctx) { noise(ctx.currentTime, 0.09, 0.4, 500); tone(90, ctx.currentTime, 0.08, 'sine', 0.35, master, 45); } },
    crash() { if (ctx) { noise(ctx.currentTime, 0.25, 0.5, 900); tone(70, ctx.currentTime, 0.2, 'sine', 0.4, master, 35); } },
    blip() { if (ctx) tone(880, ctx.currentTime, 0.12, 'sine', 0.25, master); },
    coin() { if (!ctx) return; tone(1046, ctx.currentTime, 0.1, 'sine', 0.25, master); tone(1568, ctx.currentTime + 0.09, 0.18, 'sine', 0.25, master); },
    jingle() {
      if (!ctx) return;
      [523, 659, 784, 1046].forEach((f, i) => tone(f, ctx.currentTime + i * 0.11, 0.22, 'triangle', 0.3, master));
    },
    update() {
      if (!ctx) return;
      const st = STATIONS[station];
      const stepDur = 60 / st.bpm / 4;
      while (nextStepTime < ctx.currentTime + 0.15) {
        scheduleStep(st, nextStepTime);
        nextStepTime += stepDur;
        step = (step + 1) % 64;
      }
      if (sirenOn) sirenOsc.frequency.value = 700 + 260 * (0.5 + 0.5 * Math.sin(performance.now() / 280));
    },
  };
}
