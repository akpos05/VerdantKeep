// Pooled particle system. Each particle is a tiny pixel rect with
// velocity, gravity, drag and a lifetime; the renderer draws them.
// `glow` particles are drawn additively for embers, sparks and magic.
const Particles = (() => {
  const MAX = 900;
  const pool = [];
  for (let i = 0; i < MAX; i++) pool.push({ alive: false });
  let cursor = 0;

  function spawn(p) {
    // Ring-buffer reuse: if the pool is full the oldest particle is recycled.
    const o = pool[cursor];
    cursor = (cursor + 1) % MAX;
    o.alive = true;
    o.x = p.x;
    o.y = p.y;
    o.px = p.x;
    o.py = p.y;
    o.vx = p.vx || 0;
    o.vy = p.vy || 0;
    o.gravity = p.gravity || 0;
    o.drag = p.drag === undefined ? 1 : p.drag;
    o.life = o.maxLife = p.life || 30;
    o.size = p.size || 1;
    o.shrink = !!p.shrink;
    o.color = p.color || '#fff';
    o.colors = p.colors || null; // optional palette to fade through
    o.glow = !!p.glow;
    o.sway = p.sway || 0;
    o.swayPhase = Math.random() * Math.PI * 2;
    o.collide = !!p.collide;
    return o;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function update(level) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.px = p.x;
      p.py = p.y;
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      if (p.sway) p.x += Math.sin(p.life * 0.08 + p.swayPhase) * p.sway;
      p.y += p.vy;
      if (p.collide && level && level.isSolidAt(p.x, p.y)) {
        p.y = p.py;
        p.vy *= -0.35;
        p.vx *= 0.6;
      }
      if (--p.life <= 0) p.alive = false;
    }
  }

  function clear() {
    for (const p of pool) p.alive = false;
  }

  // ---- Presets ------------------------------------------------------------
  const presets = {
    jumpDust(x, y) {
      for (let i = 0; i < 6; i++) {
        spawn({
          x: x + rand(-4, 4), y, vx: rand(-0.8, 0.8), vy: rand(-0.6, -0.1),
          drag: 0.9, life: rand(14, 22), size: 2, shrink: true,
          colors: ['#e8dcc0', '#b8a888', '#7a6e5e'],
        });
      }
    },
    landDust(x, y, strength) {
      const n = 4 + Math.round(strength * 6);
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1;
        spawn({
          x: x + dir * rand(0, 4), y, vx: dir * rand(0.4, 1.4 + strength), vy: rand(-0.7, -0.1),
          drag: 0.88, life: rand(14, 26), size: 2, shrink: true,
          colors: ['#e8dcc0', '#b8a888', '#7a6e5e'],
        });
      }
    },
    runDust(x, y, dir) {
      spawn({
        x, y, vx: -dir * rand(0.2, 0.6), vy: rand(-0.4, -0.1), drag: 0.9,
        life: rand(10, 16), size: 1 + (Math.random() < 0.5 ? 1 : 0),
        colors: ['#d8ccb0', '#9a8c74'],
      });
    },
    doubleJumpRing(x, y) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        spawn({
          x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 0.7 + 0.5, drag: 0.88,
          life: rand(14, 20), size: 1, glow: true,
          colors: ['#ffffff', '#9fe8ff', '#4a7ad8'],
        });
      }
    },
    swordTrail(x, y, dir) {
      for (let i = 0; i < 5; i++) {
        spawn({
          x: x + rand(-6, 6), y: y + rand(-8, 8), vx: dir * rand(0.6, 1.8), vy: rand(-0.6, 0.6),
          drag: 0.86, life: rand(8, 14), size: 1, glow: true,
          colors: ['#ffffff', '#c8f0ff', '#78a8e8'],
        });
      }
    },
    hitSpark(x, y, dir) {
      for (let i = 0; i < 12; i++) {
        const a = rand(-1.1, 1.1) + (dir < 0 ? Math.PI : 0);
        const s = rand(1.5, 4);
        spawn({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.82,
          life: rand(8, 16), size: Math.random() < 0.3 ? 2 : 1, glow: true,
          colors: ['#ffffff', '#fff0a0', '#ff9a30', '#c84020'],
        });
      }
    },
    deathBurst(x, y, colors, count = 26) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.8, 3.2);
        spawn({
          x: x + rand(-4, 4), y: y + rand(-4, 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2,
          gravity: 0.12, drag: 0.94, life: rand(24, 44), size: Math.random() < 0.4 ? 2 : 1,
          color: pick(colors), collide: true,
        });
      }
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        spawn({
          x, y, vx: Math.cos(a) * rand(1, 2.5), vy: Math.sin(a) * rand(1, 2.5), drag: 0.9,
          life: rand(10, 20), size: 1, glow: true, colors: ['#ffffff', '#ffe8a0', '#ff8030'],
        });
      }
    },
    gemSparkle(x, y, color) {
      spawn({
        x: x + rand(-5, 5), y: y + rand(-5, 5), vy: rand(-0.4, -0.1), life: rand(16, 28),
        size: 1, glow: true, colors: ['#ffffff', color],
      });
    },
    gemCollect(x, y, color) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        spawn({
          x, y, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8, drag: 0.86,
          life: rand(14, 22), size: 1, glow: true, colors: ['#ffffff', color, color],
        });
      }
    },
    heal(x, y) {
      for (let i = 0; i < 16; i++) {
        spawn({
          x: x + rand(-8, 8), y: y + rand(-6, 8), vy: rand(-1.2, -0.4), drag: 0.96,
          life: rand(20, 36), size: Math.random() < 0.3 ? 2 : 1, glow: true,
          colors: ['#ffffff', '#ff9ab0', '#e83850'],
        });
      }
    },
    checkpointFlame(x, y) {
      for (let i = 0; i < 40; i++) {
        const a = rand(-Math.PI, 0);
        const s = rand(0.5, 2.8);
        spawn({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.93,
          life: rand(26, 50), size: Math.random() < 0.4 ? 2 : 1, glow: true,
          colors: ['#ffffff', '#a8f0ff', '#48a8f0', '#2848a8'],
        });
      }
    },
    relicBurst(x, y) {
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.5, 3.5);
        spawn({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.94,
          life: rand(30, 60), size: Math.random() < 0.4 ? 2 : 1, glow: true,
          colors: ['#ffffff', '#fff2a0', '#f0b030', '#c06818'],
        });
      }
    },
    torchSpark(x, y) {
      spawn({
        x: x + rand(-1.5, 1.5), y, vx: rand(-0.15, 0.15), vy: rand(-0.9, -0.4), drag: 0.98,
        life: rand(18, 34), size: 1, glow: true, colors: ['#fff0b0', '#ffa030', '#c84818'],
      });
    },
    wispTrail(x, y) {
      spawn({
        x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-0.2, 0.2), vy: rand(-0.5, -0.1),
        life: rand(14, 26), size: Math.random() < 0.3 ? 2 : 1, shrink: true, glow: true,
        colors: ['#ffffff', '#a8e8ff', '#5a6ad8', '#3a2a88'],
      });
    },
    ember(x, y) {
      spawn({
        x, y, vx: rand(-0.2, 0.3), vy: rand(-0.5, -0.15), drag: 1, life: rand(120, 220),
        size: 1, glow: true, sway: 0.25, colors: ['#ffe0a0', '#ff9030', '#d04818', '#601808'],
      });
    },
    leaf(x, y) {
      spawn({
        x, y, vx: rand(-0.5, -0.1), vy: rand(0.2, 0.45), drag: 1, life: rand(200, 320),
        size: Math.random() < 0.5 ? 2 : 1, sway: 0.5,
        color: pick(['#7aa848', '#c8a038', '#d06830', '#4e8a3a']),
      });
    },
    firefly(x, y) {
      spawn({
        x, y, vx: rand(-0.15, 0.15), vy: rand(-0.15, 0.15), drag: 1, life: rand(100, 180),
        size: 1, glow: true, sway: 0.3, colors: ['#203018', '#e8ff90', '#c8f060', '#203018'],
      });
    },
    arrowBreak(x, y) {
      for (let i = 0; i < 6; i++) {
        spawn({
          x, y, vx: rand(-1.5, 1.5), vy: rand(-2, -0.5), gravity: 0.15, life: rand(20, 30),
          size: 1, color: pick(['#8a5a30', '#c8c0a8', '#5a3a20']), collide: true,
        });
      }
    },
    splash(x, y) {
      for (let i = 0; i < 18; i++) {
        spawn({
          x: x + rand(-6, 6), y, vx: rand(-1.4, 1.4), vy: rand(-3.5, -1), gravity: 0.18,
          life: rand(20, 34), size: Math.random() < 0.4 ? 2 : 1,
          colors: ['#e8f8ff', '#88c8e8', '#3a78a8'],
        });
      }
    },
  };

  return Object.assign({ pool, spawn, update, clear, rand }, presets);
})();
