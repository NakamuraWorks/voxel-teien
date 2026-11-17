// Synthesised ambience — wind, stream, birds by day, crickets at night, footsteps whose timbre
// follows the material underfoot, and a bell when you enter. The one exception is the music bed
// for the automatic modes (auto guide / orbit camera), which is a real recording.
import musicFile from './庭の静けさと.mp3';

const SURFACE_BANDS = {
  stone: 1500,
  gravel: 2300,
  sand: 900,
  wood: 720,
  soft: 430,
  none: 500
};

const BGM_LEVEL = 0.34;
const BGM_FADE_IN = 2.2;
const BGM_FADE_OUT = 1.4;

export function createAmbience() {
  let ctx = null;
  let master = null;
  let windGain = null;
  let waterGain = null;
  let noiseBuf = null;
  let muted = false;
  let started = false;
  let level = 1;
  let bgmEl = null;
  let bgmGain = null;
  let bgmVolume = BGM_LEVEL;
  let bgmOn = false;
  let bgmPause = 0;
  let birdTimer = 6;
  let cricketTimer = 0;
  const env = { water: 0, wind: 0.5, night: 0, day: 1 };

  function pinkNoise(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + white * 0.02) / 1.02;
      data[i] = last * 3.2 + white * 0.22;
    }
    return buffer;
  }

  function masterTarget() {
    return muted ? 0 : 0.9 * level;
  }

  function rampMaster(seconds) {
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(masterTarget(), now + seconds);
  }

  function start() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    started = true;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noiseBuf = pinkNoise(3.5);

    // Wind: filtered noise with two slow modulators.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    wind.connect(band).connect(windGain).connect(master);
    wind.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.061;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 190;
    lfo.connect(lfoAmt).connect(band.frequency);
    lfo.start();

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.037;
    const lfo2Amt = ctx.createGain();
    lfo2Amt.gain.value = 0.016;
    lfo2.connect(lfo2Amt).connect(windGain.gain);
    lfo2.start();

    // Stream / pond: separate band so proximity to the water can raise it.
    const flow = ctx.createBufferSource();
    flow.buffer = noiseBuf;
    flow.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 210;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1250;
    waterGain = ctx.createGain();
    waterGain.gain.value = 0;
    flow.connect(hp).connect(lp).connect(waterGain).connect(master);
    flow.start();

    // The music bed runs through its own gain so the guide modes can fade it in and out
    // without touching the garden, and so `M` silences it along with everything else.
    bgmEl = new Audio(musicFile);
    bgmEl.loop = true;
    bgmEl.preload = 'auto';
    bgmEl.volume = 1;
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.0001;
    ctx.createMediaElementSource(bgmEl).connect(bgmGain).connect(master);

    rampMaster(2.4);
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(next) {
    muted = next;
    rampMaster(0.35);
    return muted;
  }

  function setVolume(next) {
    level = Math.max(0, Math.min(1, next));
    rampMaster(0.14);
    return level;
  }

  function rampBgm(target, seconds) {
    const now = ctx.currentTime;
    bgmGain.gain.cancelScheduledValues(now);
    bgmGain.gain.setValueAtTime(Math.max(0.0001, bgmGain.gain.value), now);
    bgmGain.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + seconds);
  }

  function setBgm(active) {
    bgmOn = active;
    if (!bgmGain) return bgmOn;
    if (active) {
      clearTimeout(bgmPause);
      if (bgmEl.paused) {
        const played = bgmEl.play();
        if (played && played.catch) played.catch(() => {});
      }
      rampBgm(bgmVolume, BGM_FADE_IN);
    } else {
      rampBgm(0, BGM_FADE_OUT);
      clearTimeout(bgmPause);
      bgmPause = setTimeout(() => {
        if (!bgmOn && bgmEl && !bgmEl.paused) bgmEl.pause();
      }, BGM_FADE_OUT * 1000 + 150);
    }
    return bgmOn;
  }

  function setBgmVolume(next) {
    bgmVolume = Math.max(0, Math.min(1, next));
    if (bgmGain && bgmOn) rampBgm(bgmVolume, 0.18);
    return bgmVolume;
  }

  function burst({ duration, type, freq, q, peak, curve = 'exp', sweepTo = null }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const offset = Math.random() * (noiseBuf.duration - duration - 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(ctx.currentTime, offset);
    src.stop(ctx.currentTime + duration + 0.05);
  }

  function step(kind = 'step', surface = 'soft', strength = 0.7) {
    if (!started || muted) return;
    if (kind === 'splash') return splash(strength);
    const freq = SURFACE_BANDS[surface] || 500;
    burst({
      duration: surface === 'soft' ? 0.07 : 0.05,
      type: 'bandpass',
      freq: freq * (0.9 + Math.random() * 0.25),
      q: surface === 'gravel' ? 1.6 : 1.0,
      peak: 0.06 * strength * (surface === 'soft' ? 0.7 : 1)
    });
  }

  function splash(strength = 0.7) {
    if (!started || muted) return;
    burst({ duration: 0.26, type: 'lowpass', freq: 2200, q: 1.2, peak: 0.09 * strength, sweepTo: 320 });
  }

  function bird() {
    if (!started || muted) return;
    const now = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t0 = now + i * (0.09 + Math.random() * 0.06);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const base = 2100 + Math.random() * 1500;
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.linearRampToValueAtTime(base * (1.1 + Math.random() * 0.5), t0 + 0.04);
      osc.frequency.linearRampToValueAtTime(base * 0.82, t0 + 0.085);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.02, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    }
  }

  function cricket() {
    if (!started || muted) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t0 = now + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 4200 + Math.random() * 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.012, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.06);
    }
  }

  function bell() {
    if (!started || muted) return;
    const now = ctx.currentTime;
    for (const [mult, amp] of [
      [1, 0.12],
      [2.02, 0.06],
      [2.93, 0.032],
      [4.21, 0.018]
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 196 * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4.6);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 4.8);
    }
  }

  function tick(dt, next) {
    if (!started) return;
    Object.assign(env, next);
    const now = ctx.currentTime;
    windGain.gain.setTargetAtTime(0.018 + env.wind * 0.05, now, 0.6);
    waterGain.gain.setTargetAtTime(env.water * 0.11, now, 0.45);

    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 5 + Math.random() * 13;
      if (env.day > 0.35) bird();
    }
    cricketTimer -= dt;
    if (cricketTimer <= 0) {
      cricketTimer = 0.42 + Math.random() * 0.9;
      if (env.night > 0.4) cricket();
    }
  }

  return {
    start,
    resume,
    step,
    splash,
    bell,
    tick,
    setMuted,
    setVolume,
    setBgm,
    setBgmVolume,
    get muted() { return muted; },
    get started() { return started; },
    get volume() { return level; },
    get bgmActive() { return bgmOn; },
    get bgmVolume() { return bgmVolume; },
    // Read-out for the console handle and the automated smoke test.
    get bgmState() {
      return {
        wanted: bgmOn,
        playing: bgmEl ? !bgmEl.paused : false,
        readyState: bgmEl ? bgmEl.readyState : 0,
        currentTime: bgmEl ? Number(bgmEl.currentTime.toFixed(2)) : 0,
        error: bgmEl && bgmEl.error ? bgmEl.error.code : 0,
        volume: Number(bgmVolume.toFixed(3)),
        level: Number(level.toFixed(3))
      };
    }
  };
}
