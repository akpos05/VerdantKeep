// Chiptune SFX and music, synthesized live with WebAudio. Nothing is loaded
// from disk. The AudioContext is created lazily on the first key press,
// because browsers block audio until the user interacts with the page.
const Sound = (() => {
  let ctx = null;
  let master, sfxBus, musicBus, noiseBuffer;
  let muted = false;

  const MASTER_VOLUME = 0.5;
  const SFX_VOLUME = 0.9;
  const MUSIC_VOLUME = 0.32;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_VOLUME;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(master);

    // One second of white noise, reused by every percussive sound.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // A single oscillator voice with a pitch sweep and a short decay envelope.
  function tone(type, f0, f1, dur, vol, delay = 0, bus = sfxBus) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterType, f0, f1 = f0, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  const sfx = {
    jump() {
      tone('square', 240, 520, 0.12, 0.18);
    },
    doubleJump() {
      tone('square', 420, 880, 0.1, 0.15);
      tone('triangle', 840, 1320, 0.12, 0.12, 0.03);
    },
    land() {
      noise(0.07, 0.25, 'lowpass', 600, 150);
    },
    swing() {
      noise(0.12, 0.3, 'bandpass', 3200, 900);
      tone('triangle', 900, 260, 0.09, 0.08);
    },
    hit() {
      tone('square', 220, 55, 0.14, 0.22);
      noise(0.1, 0.35, 'lowpass', 2400, 300);
    },
    parry() {
      tone('square', 1760, 1700, 0.08, 0.12);
      tone('square', 2640, 2600, 0.12, 0.08, 0.02);
    },
    enemyDie() {
      noise(0.3, 0.35, 'lowpass', 3000, 120);
      tone('square', 330, 40, 0.28, 0.18);
    },
    gem() {
      tone('square', 1318, 1318, 0.06, 0.12);
      tone('square', 1976, 1976, 0.12, 0.12, 0.06);
    },
    heart() {
      [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.12, 0.2, i * 0.05));
    },
    hurt() {
      tone('sawtooth', 420, 90, 0.28, 0.18);
      noise(0.18, 0.3, 'lowpass', 1500, 200);
    },
    arrow() {
      noise(0.08, 0.18, 'highpass', 2500, 5000);
      tone('triangle', 700, 500, 0.06, 0.06);
    },
    bowDraw() {
      tone('triangle', 180, 260, 0.2, 0.06);
    },
    slimeHop() {
      tone('sine', 160, 380, 0.1, 0.15);
    },
    checkpoint() {
      [392, 523, 659, 784, 1047].forEach((f, i) => {
        tone('triangle', f, f, 0.25, 0.22, i * 0.07);
        tone('square', f * 2, f * 2, 0.08, 0.05, i * 0.07);
      });
    },
    relic() {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
        tone('square', f, f, 0.18, 0.12, i * 0.09);
        tone('triangle', f / 2, f / 2, 0.22, 0.18, i * 0.09);
      });
    },
    victory() {
      [392, 494, 587, 784, 587, 784, 988, 1175].forEach((f, i) => {
        tone('square', f, f, 0.22, 0.12, i * 0.12);
        tone('triangle', f / 2, f / 2, 0.3, 0.2, i * 0.12);
      });
    },
    gameOver() {
      [392, 370, 349, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.4, 0.2, i * 0.22));
    },
    select() {
      tone('square', 660, 660, 0.06, 0.12);
      tone('square', 990, 990, 0.12, 0.12, 0.07);
    },
    pause() {
      tone('square', 880, 440, 0.1, 0.1);
    },
  };

  // ---- Music --------------------------------------------------------------
  // A little A-minor adventure loop. Each step is an eighth note; 0 = rest.
  // Notes are MIDI numbers.
  const BPM = 132;
  const STEP = 60 / BPM / 2;
  const LEAD = [
    69, 0, 72, 76, 74, 72, 71, 72, 69, 0, 64, 0, 67, 69, 71, 0,
    72, 0, 71, 69, 71, 72, 74, 0, 76, 0, 74, 72, 71, 0, 0, 0,
    69, 0, 72, 76, 79, 77, 76, 74, 72, 0, 74, 76, 77, 76, 74, 72,
    71, 0, 72, 74, 76, 0, 71, 0, 69, 0, 0, 0, 0, 0, 64, 68,
  ];
  const BASS = [
    45, 0, 45, 0, 52, 0, 45, 0, 41, 0, 41, 0, 48, 0, 41, 0,
    43, 0, 43, 0, 50, 0, 43, 0, 40, 0, 40, 0, 47, 0, 44, 0,
    45, 0, 45, 0, 52, 0, 45, 0, 41, 0, 41, 0, 48, 0, 41, 0,
    43, 0, 43, 0, 50, 0, 43, 0, 45, 0, 52, 0, 45, 0, 40, 0,
  ];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  let musicOn = false;
  let musicTimer = null;
  let nextStepTime = 0;
  let step = 0;

  function scheduleNote(n, time, type, vol, len) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
    g.gain.setValueAtTime(vol * 0.7, time + len * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    osc.connect(g);
    g.connect(musicBus);
    osc.start(time);
    osc.stop(time + len + 0.02);
  }

  function scheduler() {
    while (nextStepTime < ctx.currentTime + 0.15) {
      const i = step % LEAD.length;
      if (LEAD[i]) scheduleNote(LEAD[i], nextStepTime, 'square', 0.07, STEP * 0.9);
      if (BASS[i]) scheduleNote(BASS[i], nextStepTime, 'triangle', 0.18, STEP * 1.6);
      // Soft off-beat hat keeps it moving.
      if (i % 2 === 1) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.03, nextStepTime);
        g.gain.exponentialRampToValueAtTime(0.0001, nextStepTime + 0.04);
        src.connect(f);
        f.connect(g);
        g.connect(musicBus);
        src.start(nextStepTime, Math.random() * 0.5);
        src.stop(nextStepTime + 0.05);
      }
      nextStepTime += STEP;
      step++;
    }
  }

  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    step = 0;
    nextStepTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduler, 25);
  }

  function stopMusic() {
    musicOn = false;
    clearInterval(musicTimer);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
    return muted;
  }

  return {
    init,
    play(name) {
      if (ctx && !muted && sfx[name]) sfx[name]();
    },
    startMusic,
    stopMusic,
    toggleMute,
    isMuted: () => muted,
  };
})();
