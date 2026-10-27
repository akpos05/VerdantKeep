// Everything visual: a 320x180 back buffer scaled up by whole numbers to the
// window, procedurally generated sprites and tiles, parallax, lighting, the
// pixel font and the HUD. Image files are optional overrides: if one is
// missing, the code-drawn version is used.
const VIEW_W = 320;
const VIEW_H = 180;

const PAL = {
  ink: '#140c1c',
  white: '#fff8f0',
  // Sky and distance
  sky: ['#120a24', '#1a0f32', '#26143f', '#36194c', '#4c2158', '#6a2c62', '#8e3c66', '#b25462', '#cf7360', '#e09468'],
  mount0: '#2c1f4a', mount1: '#3a2858', mount2: '#523a74', mountSnow: '#8a78a8',
  pine0: '#16223a', pine1: '#1d2e48', pine2: '#283e5a',
  // Forest
  leaf0: '#14281e', leaf1: '#22462c', leaf2: '#3a6e34', leaf3: '#6aa040', leaf4: '#a8d060',
  dirt0: '#24140f', dirt1: '#3e2618', dirt2: '#5c3a24', dirt3: '#7e5434',
  // Stone and castle
  stone0: '#1e1a28', stone1: '#363244', stone2: '#4e4a60', stone3: '#6e6a84', stone4: '#9c98b0',
  brick0: '#150f1a', brick1: '#2c2232', brick2: '#3e3046', brick3: '#56445c', brick4: '#74607a',
  back0: '#0e0a14', back1: '#17111e', back2: '#1f1828', back3: '#2a2134',
  wood0: '#2e1a10', wood1: '#4e2e18', wood2: '#76482a', wood3: '#a06a3c',
  // Fire and magic
  fire0: '#a8301a', fire1: '#e86a24', fire2: '#ffb03a', fire3: '#ffe88a', fire4: '#fffbe0',
  water0: '#142048', water1: '#203c78', water2: '#3a68a8', water3: '#8cc8ec',
  crimson0: '#4e0f22', crimson1: '#8a1e32', crimson2: '#c03a44',
  gold0: '#8a5a14', gold1: '#d09a2a', gold2: '#ffd860', gold3: '#fff6c0',
};

const Renderer = (() => {
  const display = document.getElementById('screen');
  const dctx = display.getContext('2d');
  const buffer = document.createElement('canvas');
  buffer.width = VIEW_W;
  buffer.height = VIEW_H;
  const ctx = buffer.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let scale = 1;
  function resize() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
    scale = s;
    display.width = VIEW_W * s;
    display.height = VIEW_H * s;
    dctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Generation helpers -------------------------------------------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return [c, x];
  }

  const rgbCache = {};
  function rgb(hex) {
    if (rgbCache[hex]) return rgbCache[hex];
    const n = parseInt(hex.slice(1), 16);
    return (rgbCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }

  // Build a canvas pixel by pixel. fn returns a hex colour or null.
  function pixGen(w, h, fn) {
    const [c, x] = makeCanvas(w, h);
    const img = x.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const col = fn(px, py);
        if (!col) continue;
        const [r, g, b] = rgb(col);
        const i = (py * w + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function fromGrid(rows, pal) {
    return pixGen(rows[0].length, rows.length, (x, y) => pal[rows[y][x]] || null);
  }

  function flip(src) {
    const [c, x] = makeCanvas(src.width, src.height);
    x.translate(src.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0);
    return c;
  }

  function silhouette(src, color) {
    const [c, x] = makeCanvas(src.width, src.height);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, src.width, src.height);
    return c;
  }

  // Sprite with flipped and white-flash variants: {r, l, rw, lw}.
  function sprite(src) {
    const w = silhouette(src, '#ffffff');
    return { r: src, l: flip(src), rw: w, lw: flip(w), w: src.width, h: src.height };
  }

  // ---- Character sprites --------------------------------------------------
  const PLAYER_PAL = {
    k: PAL.ink, c: '#3f7a52', g: '#24452f', s: '#f0bc8c', e: '#2a1408',
    b: '#7a5236', B: '#45301f', y: '#e8b440', m: '#c8d0dc',
  };
  const P_TOP = [
    '......kkkk......',
    '.....kcccck.....',
    '....kcccccck....',
    '....kccgssk.....',
    '....kcgsesk.....',
    '....kcgsssk.....',
    '...kccckkk......',
    '..kcccbbbbk.....',
    '..kccbbyybbk....',
    '..kccbbbbsk.....',
    '..kcckbbbbk.....',
    '...kckBBBBk.....',
  ];
  const P_TOP_ATTACK = P_TOP.slice();
  P_TOP_ATTACK[8] = '..kccbbyybbsk...';
  P_TOP_ATTACK[9] = '..kccbbbbbk.....';
  const P_LEGS = {
    idle: ['....kBBkBBk.....', '....kbbkbbk.....', '....kbbkbbk.....', '...kkkk.kkkk....'],
    runA: ['....kBBkBBk.....', '...kbbk.kbbk....', '..kbbk...kbbk...', '..kkk.....kkk...'],
    runB: ['....kBBBBk......', '.....kbbk.......', '.....kbbk.......', '.....kkkk.......'],
    runC: ['....kBBkBBk.....', '....kbbkbbk.....', '...kbbk.kbbk....', '...kkk...kkk....'],
    runD: ['....kBBBBk......', '.....kbbk.......', '.....kbbk.......', '.....kkkk.......'],
    jump: ['....kBBkBBk.....', '....kbbkbbk.....', '....kkk.kkk.....', '................'],
    fall: ['....kBBkBBk.....', '...kbbk.kbbk....', '...kbk...kbk....', '...kk.....kk....'],
  };
  const playerFrames = {};
  for (const name in P_LEGS) {
    playerFrames[name] = sprite(fromGrid(P_TOP.concat(P_LEGS[name]), PLAYER_PAL));
    playerFrames[name + 'Atk'] = sprite(fromGrid(P_TOP_ATTACK.concat(P_LEGS[name]), PLAYER_PAL));
  }

  // Optional painted walk cycle: a 64x16 sheet of four 16x16 frames. It
  // replaces runA-runD (and their attack variants; the sword is drawn on top
  // separately). If the file is missing or the wrong size, the code-drawn
  // frames above stay in use.
  const HERO_WALK = ['runA', 'runB', 'runC', 'runD'];
  const heroWalk = new Image();
  heroWalk.onload = () => {
    if (heroWalk.width !== 64 || heroWalk.height !== 16) return;
    HERO_WALK.forEach((name, i) => {
      const [c, x] = makeCanvas(16, 16);
      x.drawImage(heroWalk, i * 16, 0, 16, 16, 0, 0, 16, 16);
      playerFrames[name] = playerFrames[name + 'Atk'] = sprite(c);
    });
  };
  heroWalk.src = 'assets/hero_walk.png';

  // The sword, drawn at a few angles with a pixel line so it stays crisp.
  function bladeSprite(angle) {
    const size = 32;
    const cx = 16;
    const cy = 16;
    const len = 15;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const px = -dy;
    const py = dx;
    return pixGen(size, size, (x, y) => {
      const rx = x + 0.5 - cx;
      const ry = y + 0.5 - cy;
      const along = rx * dx + ry * dy;
      const across = rx * px + ry * py;
      if (along >= 3 && along <= len && Math.abs(across) < 1.1) {
        if (along > len - 2 && Math.abs(across) > 0.6) return null;
        return across > 0.2 ? '#7a86a0' : along > len - 4 ? PAL.white : '#d8e0ec';
      }
      if (along >= 2 && along < 3 && Math.abs(across) < 3) return PAL.gold1; // guard
      if (along >= -1 && along < 2 && Math.abs(across) < 0.8) return PAL.wood1; // grip
      if (along >= -2.5 && along < -1 && Math.abs(across) < 1.2) return PAL.gold2; // pommel
      return null;
    });
  }
  const swordAngles = [-2.2, -1.4, -0.6, 0, 0.6, 1.1];
  const swords = swordAngles.map((a) => sprite(bladeSprite(a)));

  // Slash crescent frames, generated pixel by pixel.
  function slashSprite(frame) {
    const w = 40;
    const h = 36;
    const cx = 10;
    const cy = 18;
    const spanStart = -1.5 + frame * 0.15;
    const spanEnd = 1.3;
    return pixGen(w, h, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (a < spanStart || a > spanEnd) return null;
      const t = (a - spanStart) / (spanEnd - spanStart); // 0 tail .. 1 head
      const thick = 2 + t * (7 - frame * 2);
      const outer = 22 - frame;
      if (r > outer || r < outer - thick) return null;
      const edge = outer - r;
      if (edge < 1.2) return frame === 2 ? '#78a8e8' : PAL.white;
      return t > 0.55 ? '#c8ecff' : t > 0.25 ? '#78a8e8' : '#3a58b0';
    });
  }
  const slashes = [0, 1, 2].map((f) => sprite(slashSprite(f)));

  const SLIME_PAL = { k: PAL.ink, g: '#5cc068', G: '#2e7a4a', w: '#d0f8b8' };
  const slimeBase = fromGrid([
    '................',
    '.....kkkkkk.....',
    '...kkggggggkk...',
    '..kgwwgggggggk..',
    '.kgwggggggggggk.',
    '.kggggkggkgggGk.',
    '.kggggkggkgggGk.',
    'kggggggggggGGGGk',
    'kgggggggggGGGGGk',
    'kGgggggggGGGGGGk',
    '.kGGGGGGGGGGGGk.',
    '..kkkkkkkkkkkk..',
  ], SLIME_PAL);
  const slime = sprite(slimeBase);

  const SKEL_PAL = { k: PAL.ink, w: '#ddd4bc', W: '#9a9280', r: '#ff4a30', o: '#8a5a30' };
  const SKEL_ROWS = [
    '......kkkk......',
    '.....kwwwwk.....',
    '....kwwwwwwk....',
    '....kwwwkrwk....',
    '....kwwwwwwk.o..',
    '.....kwkwkwk..o.',
    '......kkkkk...o.',
    '....kkwwwwkk..o.',
    '...kwkwkwkwwwwo.',
    '...kWkkkkkWk..o.',
    '....kwWwWwk...o.',
    '.....kwwwk...o..',
    '.....kkkkk......',
    '.....kwkwk......',
    '.....kWkWk......',
    '.....kwkwk......',
    '.....kwkwk......',
    '....kwk.kwk.....',
    '....kkk.kkk.....',
    '................',
  ];
  function skeletonSprite(aiming) {
    const base = fromGrid(SKEL_ROWS, SKEL_PAL);
    const x = base.getContext('2d');
    x.fillStyle = '#c8c0a8';
    if (aiming) {
      // Bowstring pulled back to the hand, plus an arrow on the string.
      x.fillRect(14, 5, 1, 1);
      x.fillRect(13, 6, 1, 1);
      x.fillRect(12, 7, 1, 1);
      x.fillRect(12, 9, 1, 1);
      x.fillRect(13, 10, 1, 1);
      x.fillStyle = PAL.wood2;
      x.fillRect(9, 8, 7, 1);
      x.fillStyle = PAL.stone4;
      x.fillRect(15, 8, 1, 1);
      x.fillStyle = '#ffd0a0';
      x.fillRect(9, 3, 1, 1); // eye blazes while aiming
    } else {
      x.fillRect(13, 5, 1, 6);
    }
    return base;
  }
  const skeleton = sprite(skeletonSprite(false));
  const skeletonAim = sprite(skeletonSprite(true));

  const arrow = sprite(fromGrid([
    'r.r.........',
    '.rrwwwwwwwmM',
    'r.r.........',
  ], { r: PAL.crimson2, w: PAL.wood2, m: PAL.stone4, M: PAL.white }));

  function wispFrame(f) {
    return pixGen(18, 18, (x, y) => {
      const dy = y + 0.5 - 11;
      const wob = Math.sin(dy * 0.9 + f * 1.6) * Math.max(0, -dy) * 0.18;
      const dx = x + 0.5 - 9 - wob;
      const R = dy >= 0 ? 5.6 : Math.max(0, 5.6 + dy * 0.62);
      if (R <= 0) return null;
      const d = Math.hypot(dx, dy * (dy < 0 ? 0.55 : 1)) / R;
      if (d > 1) return null;
      if ((x === 7 || x === 10) && y === 11) return '#1a1048';
      if (d < 0.38) return PAL.white;
      if (d < 0.6) return '#b0f0ff';
      if (d < 0.82) return '#5aa8f0';
      return '#4a3ec0';
    });
  }
  const wisp = [0, 1, 2, 3].map((f) => sprite(wispFrame(f)));

  // ---- Pickups ------------------------------------------------------------
  const GEM_COLORS = [
    { name: 'ruby', w: '#fff0f0', l: '#ff8a9a', L: '#e8304a', D: '#8a1030', glow: '#ff5070' },
    { name: 'emerald', w: '#f0fff0', l: '#9af0a0', L: '#30c060', D: '#106a38', glow: '#60f090' },
    { name: 'sapphire', w: '#f0f8ff', l: '#9ad0ff', L: '#3a7ae8', D: '#1a3a8a', glow: '#70b0ff' },
    { name: 'amethyst', w: '#fff0ff', l: '#e0a8ff', L: '#a050e0', D: '#5a2088', glow: '#d080ff' },
  ];
  const gemSprites = GEM_COLORS.map((c) => fromGrid([
    '..kkkk..',
    '.kwlLLk.',
    'kwlLLDDk',
    'kLLLDDDk',
    '.kLDDDk.',
    '..kDDk..',
    '...kk...',
  ], { k: PAL.ink, w: c.w, l: c.l, L: c.L, D: c.D }));

  const HEART_ROWS = [
    '.kk...kk.',
    'kwRk.kRRk',
    'kwRRkRRDk',
    'kRRRRRRDk',
    '.kRRRRDk.',
    '..kRRDk..',
    '...kDk...',
    '....k....',
  ];
  const heartFull = fromGrid(HEART_ROWS, { k: PAL.ink, w: '#ffd0d8', R: '#e83850', D: '#901830' });
  const heartEmpty = fromGrid(HEART_ROWS, { k: PAL.ink, w: '#4a2a3a', R: '#33202c', D: '#251621' });

  const relic = fromGrid([
    '............',
    '.kkkkkkkkkk.',
    '.kYwyyyyyyk.',
    '.kYwyyrryOk.',
    '..kYyyyyOk..',
    '...kYyyOk...',
    '....kyOk....',
    '.....kk.....',
    '.....yO.....',
    '....kyOk....',
    '...kYyyOk...',
    '..kkkkkkkk..',
  ], { k: PAL.ink, Y: PAL.gold3, y: PAL.gold1, O: PAL.gold0, w: '#ffffff', r: '#e83050' });

  // Checkpoint shrine: a carved stone obelisk with a fire bowl.
  function shrineSprite(lit) {
    const [c, x] = makeCanvas(16, 26);
    const f = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    f(PAL.ink, 1, 21, 14, 5);
    f(PAL.stone2, 2, 22, 12, 3);
    f(PAL.stone3, 2, 22, 12, 1);
    f(PAL.ink, 3, 8, 10, 14);
    f(PAL.stone2, 4, 9, 8, 12);
    f(PAL.stone3, 4, 9, 2, 12);
    f(PAL.stone1, 11, 9, 1, 12);
    // Rune
    const rune = lit ? '#9ae8ff' : PAL.stone1;
    f(rune, 7, 11, 2, 1);
    f(rune, 6, 12, 1, 4);
    f(rune, 9, 12, 1, 4);
    f(rune, 7, 16, 2, 1);
    f(rune, 7, 18, 2, 2);
    // Bowl
    f(PAL.ink, 1, 4, 14, 5);
    f(PAL.stone3, 2, 5, 12, 2);
    f(PAL.stone2, 3, 7, 10, 1);
    f(PAL.stone4, 2, 5, 12, 1);
    f(lit ? '#2a4a88' : PAL.stone0, 3, 5, 10, 1);
    return c;
  }
  const shrineDark = shrineSprite(false);
  const shrineLit = shrineSprite(true);

  // The goal altar with a floating crown.
  function altarSprite() {
    const [c, x] = makeCanvas(32, 24);
    const f = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    f(PAL.ink, 2, 18, 28, 6);
    f(PAL.stone2, 3, 19, 26, 4);
    f(PAL.stone4, 3, 19, 26, 1);
    f(PAL.ink, 7, 8, 18, 11);
    f(PAL.stone2, 8, 9, 16, 9);
    f(PAL.stone3, 8, 9, 3, 9);
    f(PAL.crimson1, 12, 9, 8, 9);
    f(PAL.crimson2, 12, 9, 2, 9);
    f(PAL.gold1, 15, 12, 2, 3);
    f(PAL.ink, 4, 4, 24, 5);
    f(PAL.stone3, 5, 5, 22, 3);
    f(PAL.stone4, 5, 5, 22, 1);
    return c;
  }
  const altar = altarSprite();
  const crown = fromGrid([
    'k.k..k..k.k',
    'kyk.kyk.kyk',
    'kyykyykyyyk',
    'kYyyyryyyOk',
    'kYyryyyryOk',
    'kkkkkkkkkkk',
  ], { k: PAL.ink, Y: PAL.gold3, y: PAL.gold2, O: PAL.gold1, r: '#e83050' });

  // ---- Fire ---------------------------------------------------------------
  function flameFrame(f, blue) {
    const cols = blue
      ? ['#ffffff', '#c8f4ff', '#58b8f8', '#2a5ac8']
      : [PAL.fire4, PAL.fire3, PAL.fire2, PAL.fire1, PAL.fire0];
    return pixGen(8, 12, (x, y) => {
      const t = (11 - y) / 11; // 0 at base, 1 at tip
      const sway = Math.sin(y * 1.2 + f * 1.9) * t * 1.2;
      const dx = Math.abs(x + 0.5 - 4 - sway);
      const R = 3.6 * (1 - t * t) * (0.85 + 0.15 * Math.sin(f * 2.3 + y));
      if (R <= 0.3 || dx > R) return null;
      const d = dx / R + t * 0.7;
      if (d < 0.45) return cols[0];
      if (d < 0.75) return cols[1];
      if (d < 1.05) return cols[2];
      return cols[3];
    });
  }
  const flames = [0, 1, 2, 3, 4, 5].map((f) => flameFrame(f, false));
  const blueFlames = [0, 1, 2, 3, 4, 5].map((f) => flameFrame(f, true));

  // ---- Tiles --------------------------------------------------------------
  const VARIANTS = 4;
  const dirtTiles = [];
  const grassCaps = [];
  const stoneTiles = [];
  const brickTiles = [];
  const backTiles = [];
  for (let v = 0; v < VARIANTS; v++) {
    dirtTiles.push(pixGen(16, 16, (x, y) => {
      const r = tileHash(x, y, v + 11);
      const blob = tileHash(x >> 2, y >> 2, v + 31);
      if (blob > 0.88 && r > 0.3) return r > 0.8 ? PAL.stone3 : PAL.stone2; // pebble
      if (r < 0.1) return PAL.dirt0;
      if (r < 0.22 || blob < 0.15) return PAL.dirt2;
      return PAL.dirt1;
    }));
    grassCaps.push(pixGen(16, 9, (x, y) => {
      const depth = 4 + Math.floor(tileHash(x, 1, v + 51) * 3);
      if (y < 2) {
        const blade = tileHash(x, 0, v + 61);
        if (y === 1 && blade > 0.5) return PAL.leaf3;
        if (y === 0 && blade > 0.8) return PAL.leaf4;
        return null;
      }
      const yy = y - 2;
      if (yy === 0) return PAL.leaf4;
      if (yy === 1) return tileHash(x, y, v) > 0.3 ? PAL.leaf3 : PAL.leaf4;
      if (yy < depth - 1) return tileHash(x, y, v + 3) > 0.25 ? PAL.leaf2 : PAL.leaf3;
      if (yy === depth - 1) return PAL.leaf1;
      if (yy === depth) return tileHash(x, y, v + 4) > 0.5 ? PAL.leaf0 : null;
      return null;
    }));
    stoneTiles.push(pixGen(16, 16, (x, y) => {
      const course = y < 8 ? 0 : 1;
      const split = course === 0 ? (v % 2 ? 4 : 12) : (v % 2 ? 10 : 6);
      const ly = y % 8;
      if (ly === 7 || x === split) return PAL.stone0;
      if (ly === 0 || x === split + 1) return PAL.stone3;
      const crack = tileHash(x, y, v + 71);
      if (crack > 0.97) return PAL.stone0;
      if (crack > 0.85) return PAL.stone1;
      if (crack < 0.08) return PAL.stone3;
      return PAL.stone2;
    }));
    brickTiles.push(pixGen(16, 16, (x, y) => {
      const course = y >> 2;
      const off = (course + v) % 2 ? 4 : 0;
      const lx = (x + off) % 8;
      const ly = y % 4;
      if (ly === 3 || lx === 7) return PAL.brick0;
      if (ly === 0 && lx < 6) return PAL.brick3;
      const r = tileHash(x, y, v + 81);
      if (r > 0.93) return PAL.brick1;
      if (r < 0.05) return PAL.brick4;
      return PAL.brick2;
    }));
    backTiles.push(pixGen(16, 16, (x, y) => {
      const course = y >> 3;
      const off = (course + v) % 2 ? 8 : 0;
      const lx = (x + off) % 16;
      const ly = y % 8;
      if (ly === 7 || lx === 15) return PAL.back0;
      if (ly === 0) return PAL.back3;
      return tileHash(x, y, v + 91) > 0.9 ? PAL.back1 : PAL.back2;
    }));
  }
  const pillarTile = pixGen(16, 16, (x, y) => {
    if (x < 2 || x > 13) return null;
    if (x === 2 || x === 13) return PAL.back0;
    if (x === 3 || x === 4) return PAL.brick2;
    if (x === 12) return PAL.back1;
    if (y % 16 === 15) return PAL.back1;
    return x < 7 ? PAL.brick1 : PAL.back3;
  });
  const spikeTile = pixGen(16, 16, (x, y) => {
    if (y < 7) return null;
    if (y >= 14) return y === 14 ? PAL.stone3 : PAL.stone1;
    const local = x % 5 + 0.5 - 2.5;
    const cx = x % 5;
    if (x >= 15) return null;
    const half = ((y - 7) / 7) * 2.6;
    if (Math.abs(local) > half) return null;
    if (y === 7 || y === 8) return PAL.white;
    return local < 0 ? PAL.stone4 : cx === 2 ? PAL.stone3 : PAL.stone2;
  });
  const plankTile = pixGen(16, 16, (x, y) => {
    if (y === 0) return PAL.wood3;
    if (y < 4) return tileHash(x, y, 5) > 0.8 ? PAL.wood1 : PAL.wood2;
    if (y === 4) return PAL.wood0;
    if (y < 8 && (x === 2 || x === 13)) return PAL.wood0; // brackets
    if (y < 7 && (x === 3 || x === 12)) return PAL.wood1;
    return null;
  });
  const ledgeTile = pixGen(16, 16, (x, y) => {
    if (y === 0) return PAL.stone4;
    if (y < 4) return tileHash(x, y, 9) > 0.85 ? PAL.stone1 : PAL.stone3;
    if (y === 4) return PAL.stone0;
    if (y === 5 && x > 2 && x < 13) return PAL.stone1;
    if (y === 6 && x > 5 && x < 10) return PAL.stone0;
    return null;
  });

  // ---- Static props -------------------------------------------------------
  function drawTree(x, tx, ty) {
    // A tall background tree, darkened so it reads as depth, not terrain.
    const baseX = tx * TILE + 8;
    const baseY = (ty + 1) * TILE;
    const h = 96 + Math.floor(tileHash(tx, ty, 3) * 40);
    for (let y = 0; y < h; y++) {
      const w = 10 + Math.floor(Math.max(0, 14 - y) * 0.5);
      const left = baseX - (w >> 1);
      x.fillStyle = '#1c1420';
      x.fillRect(left, baseY - y, w, 1);
      x.fillStyle = '#2c2030';
      x.fillRect(left + 2, baseY - y, 2, 1);
      if (tileHash(tx, y, 4) > 0.8) {
        x.fillStyle = '#130e16';
        x.fillRect(left + 5, baseY - y, 2, 1);
      }
    }
    // Roots
    x.fillStyle = '#1c1420';
    x.fillRect(baseX - 9, baseY - 3, 4, 3);
    x.fillRect(baseX + 5, baseY - 2, 5, 2);
    // Canopy of overlapping leaf blobs.
    const blobs = 9;
    for (let i = 0; i < blobs; i++) {
      const bx = baseX + Math.round((tileHash(tx, i, 21) - 0.5) * 50);
      const by = baseY - h + Math.round(tileHash(tx, i, 22) * 34) - 6;
      const r = 12 + Math.floor(tileHash(tx, i, 23) * 10);
      for (let yy = -r; yy <= r; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          const d = Math.hypot(xx, yy);
          if (d > r) continue;
          const shade = yy < -r * 0.3 && xx < r * 0.3 ? '#1e3a30' : yy > r * 0.4 ? '#0e1c1a' : '#162c26';
          x.fillStyle = d > r - 1.2 && tileHash(xx + bx, yy + by, 9) > 0.5 ? '#0c1614' : shade;
          x.fillRect(bx + xx, by + yy, 1, 1);
        }
      }
    }
  }

  function drawStaticDeco(x, d, px, py, tx, ty) {
    const f = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(px + a, py + b, w, h); };
    const r = tileHash(tx, ty, 13);
    switch (d) {
      case D.GRASS: {
        const n = 3 + Math.floor(r * 4);
        for (let i = 0; i < n; i++) {
          const gx = Math.floor(tileHash(tx, i, ty) * 15);
          const gh = 2 + Math.floor(tileHash(i, tx, ty) * 4);
          f(i % 2 ? PAL.leaf3 : PAL.leaf2, gx, 16 - gh, 1, gh);
          f(PAL.leaf4, gx, 16 - gh, 1, 1);
        }
        break;
      }
      case D.FLOWER: {
        const fx = 3 + Math.floor(r * 9);
        const petal = ['#e86a8a', '#f0d060', '#a07ae8', '#f8f0f0'][Math.floor(r * 37) % 4];
        f(PAL.leaf2, fx, 10, 1, 6);
        f(PAL.leaf3, fx + 1, 13, 1, 1);
        f(petal, fx - 1, 8, 3, 3);
        f(PAL.fire3, fx, 9, 1, 1);
        break;
      }
      case D.MUSHROOM: {
        const mx = 4 + Math.floor(r * 6);
        f('#d8e8e0', mx + 2, 11, 2, 5);
        f(PAL.ink, mx - 1, 9, 8, 3);
        f('#3ac8b8', mx, 8, 6, 3);
        f('#a8fff0', mx + 1, 8, 2, 1);
        f('#e8fff8', mx + 4, 9, 1, 1);
        f('#1a7a78', mx, 10, 6, 1);
        break;
      }
      case D.ROCK:
        f(PAL.ink, 1, 9, 14, 7);
        f(PAL.stone2, 2, 10, 12, 6);
        f(PAL.stone3, 3, 10, 6, 2);
        f(PAL.leaf2, 2, 9, 5, 1);
        break;
      case D.BONES:
        f('#c8c0a8', 2, 14, 9, 1);
        f('#c8c0a8', 9, 13, 2, 3);
        f('#d8d0b8', 11, 11, 4, 4);
        f(PAL.ink, 12, 12, 1, 1);
        f(PAL.ink, 14, 12, 1, 1);
        break;
      case D.POST:
        f(PAL.ink, 4, 2, 8, 14);
        f(PAL.stone2, 5, 3, 6, 13);
        f(PAL.stone3, 5, 3, 2, 13);
        f(PAL.stone4, 4, 2, 8, 1);
        f(PAL.stone1, 5, 8, 6, 1);
        break;
      case D.CHAIN:
        for (let y = 0; y < 16; y += 4) {
          f(PAL.stone1, 7, y, 3, 3);
          f(PAL.stone3, 7, y, 1, 2);
          f(PAL.back0, 8, y + 1, 1, 1);
        }
        break;
      case D.WINDOW: {
        // Tall arched window, two tiles high, with moonlit glass.
        f(PAL.back0, 2, 0, 12, 32);
        for (let y = 0; y < 30; y++) {
          const inset = y < 4 ? [3, 2, 1, 1][y] : 0;
          f(y < 12 ? '#3a4a88' : '#2a3870', 3 + inset, 1 + y, 10 - inset * 2, 1);
        }
        f('#6a7ac0', 4, 5, 2, 10);
        f('#8aa0e0', 4, 5, 1, 4);
        f(PAL.back1, 7, 1, 2, 30);
        f(PAL.back1, 3, 15, 10, 2);
        f(PAL.brick3, 1, 30, 14, 2);
        break;
      }
      default:
        break;
    }
  }

  // ---- World pre-render ---------------------------------------------------
  let world = null; // static layer, the size of the whole level
  let worldCtx = null;

  function buildWorld(level) {
    [world, worldCtx] = makeCanvas(level.pxW, level.pxH);
    const x = worldCtx;

    // Background walls.
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const b = level.getBack(tx, ty);
        if (b === B.NONE) continue;
        x.drawImage(backTiles[Math.floor(tileHash(tx, ty, 1) * VARIANTS)], tx * TILE, ty * TILE);
        if (b === B.CASTLE_PILLAR) x.drawImage(pillarTile, tx * TILE, ty * TILE);
      }
    }
    // Background trees first so everything else overlaps them.
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        if (level.getDeco(tx, ty) === D.TREE) drawTree(x, tx, ty);
      }
    }
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const d = level.getDeco(tx, ty);
        if (d !== D.NONE && d !== D.TREE) drawStaticDeco(x, d, tx * TILE, ty * TILE, tx, ty);
      }
    }

    // Solid tiles with simple auto-tiling: edges, grass caps, depth shading.
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const t = level.get(tx, ty);
        const px = tx * TILE;
        const py = ty * TILE;
        const v = Math.floor(tileHash(tx, ty, 2) * VARIANTS);
        const solid = (a, b) => level.isSolid(a, b);
        const open = (a, b) => !solid(a, b);

        if (t === T.PLATFORM) {
          x.drawImage(level.zoneAt(px) === 'bridge' ? ledgeTile : plankTile, px, py);
          continue;
        }
        if (t === T.SPIKE) {
          x.drawImage(spikeTile, px, py);
          continue;
        }
        if (t !== T.DIRT && t !== T.STONE && t !== T.BRICK) continue;

        const img = t === T.DIRT ? dirtTiles[v] : t === T.STONE ? stoneTiles[v] : brickTiles[v];
        x.drawImage(img, px, py);

        // Depth darkening: the further from open air above, the darker.
        let depth = 0;
        while (depth < 5 && solid(tx, ty - depth - 1)) depth++;
        if (depth > 0) {
          x.fillStyle = `rgba(8,4,14,${Math.min(0.55, depth * 0.11)})`;
          x.fillRect(px, py, TILE, TILE);
        }

        const edge = t === T.DIRT ? PAL.dirt0 : t === T.STONE ? PAL.stone0 : PAL.brick0;
        x.fillStyle = PAL.ink;
        if (open(tx - 1, ty)) x.fillRect(px, py, 1, TILE);
        if (open(tx + 1, ty)) x.fillRect(px + TILE - 1, py, 1, TILE);
        if (open(tx, ty + 1)) x.fillRect(px, py + TILE - 1, TILE, 1);
        x.fillStyle = edge;
        if (open(tx - 1, ty)) x.fillRect(px + 1, py, 1, TILE);
        if (open(tx + 1, ty)) x.fillRect(px + TILE - 2, py, 1, TILE);
        if (open(tx, ty + 1)) x.fillRect(px, py + TILE - 2, TILE, 1);

        if (open(tx, ty - 1)) {
          if (t === T.DIRT) {
            x.drawImage(grassCaps[v], px, py - 2);
            // Drape grass over open sides a little.
            x.fillStyle = PAL.leaf2;
            if (open(tx - 1, ty)) x.fillRect(px, py, 1, 4 + (v % 3));
            if (open(tx + 1, ty)) x.fillRect(px + TILE - 1, py, 1, 3 + (v % 2));
          } else {
            x.fillStyle = PAL.ink;
            x.fillRect(px, py, TILE, 1);
            x.fillStyle = t === T.STONE ? PAL.stone4 : PAL.brick4;
            x.fillRect(px, py + 1, TILE, 1);
            if (t === T.STONE && tileHash(tx, ty, 41) > 0.55) {
              // Moss on exposed bridge stone.
              x.fillStyle = PAL.leaf2;
              const mx = Math.floor(tileHash(tx, ty, 42) * 10);
              x.fillRect(px + mx, py + 1, 4, 1);
              x.fillRect(px + mx + 1, py + 2, 2, 1);
            }
          }
        }
      }
    }
  }

  // ---- Parallax layers ----------------------------------------------------
  const LAYER_W = 480;

  const skyLayer = (() => {
    const bands = PAL.sky.length;
    const bandH = VIEW_H / bands;
    return pixGen(VIEW_W, VIEW_H, (x, y) => {
      const f = y / bandH;
      let i = Math.floor(f);
      const frac = f - i;
      // Ordered dither at each band boundary.
      if (frac > 0.72 && i < bands - 1 && (x + y) % 2 === 0) i++;
      if (frac > 0.86 && i < bands - 1) i = Math.min(bands - 1, Math.floor(f) + 1);
      // Stars in the upper sky.
      if (y < 90 && tileHash(x, y, 77) > 0.996 - (90 - y) * 0.00002) {
        return tileHash(x, y, 78) > 0.5 ? '#fff8e8' : '#b8a8e0';
      }
      return PAL.sky[i];
    });
  })();

  const moon = pixGen(28, 28, (x, y) => {
    const d = Math.hypot(x - 13.5, y - 13.5);
    if (d > 12) return d < 13.5 && (x + y) % 2 === 0 ? '#d8b8c8' : null;
    const crater = tileHash(x >> 2, y >> 2, 5) > 0.75;
    if (x + y > 34 && d > 8) return '#c8a8b8';
    return crater ? '#e8d0d0' : '#fff0e8';
  });

  const mountainLayer = (() => {
    const h = VIEW_H;
    const heights = [];
    for (let x = 0; x < LAYER_W; x++) {
      const t = (x / LAYER_W) * Math.PI * 2;
      heights.push(
        92 + Math.sin(t * 2) * 18 + Math.sin(t * 5 + 1) * 10 + Math.sin(t * 11 + 2) * 5 + Math.sin(t * 23) * 2,
      );
    }
    return pixGen(LAYER_W, h, (x, y) => {
      const top = heights[x];
      if (y < top) {
        // A distant castle silhouette on one peak.
        const cx = x - 300;
        if (cx >= 0 && cx < 26) {
          const towerTop = cx < 5 ? top - 22 : cx > 20 ? top - 18 : top - 10 - (cx % 6 < 2 ? 3 : 0);
          if (y >= towerTop) return y === Math.floor(top - 15) && cx === 2 ? '#e8a060' : PAL.mount0;
        }
        return null;
      }
      const slope = heights[(x + 1) % LAYER_W] - heights[x];
      const depth = y - top;
      if (depth < 3 && top < 80) return PAL.mountSnow;
      if (slope > 0.3 && depth < 14) return PAL.mount2;
      if (depth < 20) return PAL.mount1;
      return PAL.mount0;
    });
  })();

  const forestLayer = (() => {
    const [c, x] = makeCanvas(LAYER_W, VIEW_H);
    const pine = (cx, baseY, h, col, hi) => {
      for (let y = 0; y < h; y++) {
        const tier = (y % 10) / 10;
        const w = Math.max(1, Math.floor((y / h) * 12 * (0.6 + tier * 0.6)));
        for (const ox of [-LAYER_W, 0, LAYER_W]) {
          x.fillStyle = col;
          x.fillRect(cx - w + ox, baseY - h + y, w * 2 + 1, 1);
          x.fillStyle = hi;
          x.fillRect(cx - w + ox, baseY - h + y, 1, 1);
        }
      }
      x.fillStyle = col;
      x.fillRect(cx - 1, baseY, 3, 4);
    };
    for (let i = 0; i < 26; i++) {
      const cx = Math.floor(tileHash(i, 1, 100) * LAYER_W);
      pine(cx, 128, 40 + Math.floor(tileHash(i, 2, 100) * 30), PAL.pine1, PAL.pine2);
    }
    x.fillStyle = PAL.pine1;
    x.fillRect(0, 130, LAYER_W, VIEW_H - 130);
    for (let i = 0; i < 30; i++) {
      const cx = Math.floor(tileHash(i, 3, 100) * LAYER_W);
      pine(cx, 142, 34 + Math.floor(tileHash(i, 4, 100) * 26), PAL.pine0, PAL.pine1);
    }
    x.fillStyle = PAL.pine0;
    x.fillRect(0, 144, LAYER_W, VIEW_H - 144);
    // Mist band.
    for (let y = 118; y < 140; y++) {
      x.fillStyle = `rgba(200,150,190,${0.05 * (1 - Math.abs(y - 129) / 11)})`;
      x.fillRect(0, y, LAYER_W, 1);
    }
    return c;
  })();

  const FOLIAGE_W = 640;
  const foliageLayer = (() => {
    const [c, x] = makeCanvas(FOLIAGE_W, VIEW_H);
    const blob = (bx, by, r) => {
      for (let yy = -r; yy <= r; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          const d = Math.hypot(xx, yy);
          if (d > r) continue;
          x.fillStyle = d > r - 1.5 && yy < 0 ? '#1a3024' : '#08100c';
          x.fillRect((bx + xx + FOLIAGE_W) % FOLIAGE_W, by + yy, 1, 1);
        }
      }
    };
    // Bushes along the bottom, in clumps with gaps between.
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor(tileHash(i, 5, 200) * FOLIAGE_W);
      for (let j = 0; j < 5; j++) {
        blob(cx + j * 9 - 18, VIEW_H - 2 + Math.floor(tileHash(i, j, 201) * 6), 8 + Math.floor(tileHash(i, j, 202) * 8));
      }
    }
    // Leaves hanging from the top.
    for (let i = 0; i < 7; i++) {
      const cx = Math.floor(tileHash(i, 6, 203) * FOLIAGE_W);
      for (let j = 0; j < 4; j++) blob(cx + j * 8, -6 + Math.floor(tileHash(i, j, 204) * 8), 6 + (j % 3) * 3);
      const len = 14 + Math.floor(tileHash(i, 7, 205) * 26);
      for (let y = 0; y < len; y++) {
        x.fillStyle = '#08100c';
        x.fillRect(cx + 12 + Math.round(Math.sin(y * 0.3) * 1.5), y, 1, 1);
        if (y % 5 === 2) x.fillRect(cx + 13 + Math.round(Math.sin(y * 0.3) * 1.5), y, 2, 1);
      }
    }
    return c;
  })();

  // ---- Lighting and vignette ----------------------------------------------
  const [lightCanvas, lightCtx] = makeCanvas(VIEW_W / 2, VIEW_H / 2);
  const [vignette, vctx] = makeCanvas(VIEW_W, VIEW_H);
  (() => {
    const g = vctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.38, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    g.addColorStop(0, 'rgba(8,4,16,0)');
    g.addColorStop(1, 'rgba(8,4,16,0.62)');
    vctx.fillStyle = g;
    vctx.fillRect(0, 0, VIEW_W, VIEW_H);
  })();

  // ---- Pixel font (5x7) ---------------------------------------------------
  const FONT = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], '.': [0, 0, 0, 0, 0, 12, 12],
    ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16],
    x: [0, 0, 17, 10, 4, 10, 17], "'": [4, 4, 8, 0, 0, 0, 0], ',': [0, 0, 0, 0, 12, 4, 8],
    '?': [14, 17, 1, 2, 4, 0, 4], '+': [0, 4, 4, 31, 4, 4, 0],
  };

  function textWidth(str, s = 1) {
    return str.length * 6 * s - s;
  }

  function glyphs(str, x, y, color, s) {
    ctx.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const g = FONT[str[i]] || FONT[str[i].toUpperCase()] || FONT['?'];
      for (let row = 0; row < 7; row++) {
        const bits = g[row];
        if (!bits) continue;
        for (let col = 0; col < 5; col++) {
          if (bits & (16 >> col)) ctx.fillRect(x + (i * 6 + col) * s, y + row * s, s, s);
        }
      }
    }
  }

  // opts: color, shadow (colour or false), align ('left'|'center'|'right'),
  // scale, alpha, under (second colour for the lower half: a cheap gradient)
  function text(str, x, y, opts = {}) {
    const s = opts.scale || 1;
    const w = textWidth(str, s);
    let left = Math.round(x);
    if (opts.align === 'center') left = Math.round(x - w / 2);
    else if (opts.align === 'right') left = Math.round(x - w);
    const top = Math.round(y);
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.shadow !== false) {
      glyphs(str, left + s, top + s, opts.shadow || PAL.ink, s);
      if (s > 1) glyphs(str, left, top + s, opts.shadow || PAL.ink, s);
    }
    glyphs(str, left, top, opts.color || PAL.white, s);
    if (opts.under) {
      ctx.beginPath();
      ctx.rect(left - 1, top + Math.ceil(3.5 * s), w + 2, 4 * s);
      ctx.clip();
      glyphs(str, left, top, opts.under, s);
    }
    ctx.restore();
  }

  // ---- Public drawing API ---------------------------------------------------
  const sprites = {
    player: playerFrames, swords, slashes, slime, skeleton, skeletonAim, arrow, wisp,
    gems: gemSprites, gemColors: GEM_COLORS, heartFull, heartEmpty, relic,
    shrineDark, shrineLit, altar, crown, flames, blueFlames,
  };

  // Draws a sprite variant in world space (the world transform is active).
  function draw(img, x, y) {
    ctx.drawImage(img, Math.round(x), Math.round(y));
  }

  // Bottom-centre anchored draw with squash and stretch.
  function drawScaled(img, cx, bottom, sx, sy) {
    const w = Math.max(1, Math.round(img.width * sx));
    const h = Math.max(1, Math.round(img.height * sy));
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(bottom - h), w, h);
  }

  function beginWorld(cam) {
    ctx.setTransform(1, 0, 0, 1, -Math.round(cam.x), -Math.round(cam.y));
  }

  function endWorld() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawBackground(cam) {
    ctx.drawImage(skyLayer, 0, 0);
    ctx.drawImage(moon, 236, 22 - Math.round(cam.y * 0.02));
    // Moon glow.
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(250, 36, 6, 250, 36, 60);
    g.addColorStop(0, 'rgba(120,70,90,0.35)');
    g.addColorStop(1, 'rgba(120,70,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(180, 0, 140, 110);
    ctx.globalCompositeOperation = 'source-over';

    const tile = (img, w, factor, yOff) => {
      const ox = -Math.round(cam.x * factor) % w;
      const y = Math.round(yOff);
      for (let x = ox - w; x < VIEW_W; x += w) {
        if (x + w > 0) ctx.drawImage(img, x, y);
      }
    };
    const ref = 250; // camera y where layers sit at their designed height
    const my = (ref - cam.y) * 0.06;
    tile(mountainLayer, LAYER_W, 0.06, my);
    if (my < 0) {
      ctx.fillStyle = PAL.mount0;
      ctx.fillRect(0, VIEW_H + Math.round(my), VIEW_W, -Math.round(my) + 1);
    }
    const fy = (ref - cam.y) * 0.22;
    tile(forestLayer, LAYER_W, 0.25, fy);
    if (fy < 0) {
      ctx.fillStyle = PAL.pine0;
      ctx.fillRect(0, VIEW_H + Math.round(fy), VIEW_W, -Math.round(fy) + 1);
    }
  }

  function drawStaticWorld(cam) {
    const sx = Math.round(cam.x);
    const sy = Math.round(cam.y);
    ctx.drawImage(world, sx, sy, VIEW_W, VIEW_H, sx, sy, VIEW_W, VIEW_H);
  }

  // Cloth hung from its top edge, rippling row by row.
  function drawCloth(px, py, w, h, t, amp, phase) {
    for (let r = 0; r < h; r++) {
      const k = r / h;
      const off = Math.round(Math.sin(t * 0.07 + r * 0.32 + phase) * amp * k);
      const left = px + off;
      const y = py + r;
      // Swallowtail: the bottom rows split into two tails around a notch.
      const cut = r > h - 6 ? r - (h - 6) : 0;
      const mid = w >> 1;
      const segs = cut ? [[0, mid - cut + 1], [mid + cut - 1, w]] : [[0, w]];
      for (const [a, b] of segs) {
        if (b - a <= 0) continue;
        ctx.fillStyle = PAL.ink;
        ctx.fillRect(left + a - 1, y, b - a + 2, 1);
        ctx.fillStyle = (r + Math.floor(t * 0.05)) % 9 === 0 ? PAL.crimson2 : PAL.crimson1;
        ctx.fillRect(left + a, y, b - a, 1);
      }
      ctx.fillStyle = PAL.gold1;
      ctx.fillRect(left, y, 1, 1);
      ctx.fillRect(left + w - 1, y, 1, 1);
      ctx.fillStyle = PAL.crimson0;
      if (!cut) ctx.fillRect(left + w - 3, y, 1, 1);
      // Crest
      if (r > 5 && r < 12) {
        ctx.fillStyle = PAL.gold2;
        const cw = r < 8 ? 2 : r < 10 ? 4 : 2;
        ctx.fillRect(left + mid - (cw >> 1), y, cw, 1);
      }
    }
  }

  // Animated props behind entities: torches, braziers, banners.
  function drawAnimatedBack(cam, level, time) {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 2);
    const tx1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE) + 2);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE) - 3);
    const ty1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE) + 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const d = level.getDeco(tx, ty);
        const px = tx * TILE;
        const py = ty * TILE;
        const seed = tileHash(tx, ty, 99) * 100;
        if (d === D.TORCH) {
          ctx.fillStyle = PAL.ink;
          ctx.fillRect(px + 5, py + 9, 6, 4);
          ctx.fillRect(px + 7, py + 12, 2, 4);
          ctx.fillStyle = PAL.wood2;
          ctx.fillRect(px + 6, py + 9, 4, 3);
          ctx.fillStyle = PAL.stone3;
          ctx.fillRect(px + 6, py + 12, 4, 1);
          const f = flames[Math.floor(time * 0.25 + seed) % flames.length];
          ctx.drawImage(f, px + 4, py - 2);
        } else if (d === D.BRAZIER) {
          ctx.fillStyle = PAL.ink;
          ctx.fillRect(px + 2, py + 6, 12, 5);
          ctx.fillRect(px + 6, py + 10, 4, 6);
          ctx.fillRect(px + 4, py + 15, 8, 1);
          ctx.fillStyle = PAL.stone3;
          ctx.fillRect(px + 3, py + 7, 10, 2);
          ctx.fillStyle = PAL.stone2;
          ctx.fillRect(px + 4, py + 9, 8, 1);
          ctx.fillRect(px + 7, py + 10, 2, 5);
          ctx.fillStyle = PAL.fire1;
          ctx.fillRect(px + 4, py + 6, 8, 1);
          const f = flames[Math.floor(time * 0.28 + seed) % flames.length];
          ctx.drawImage(f, px + 4, py - 6);
          ctx.drawImage(flames[Math.floor(time * 0.22 + seed + 3) % flames.length], px + 2, py - 3);
          ctx.drawImage(flames[Math.floor(time * 0.3 + seed + 1) % flames.length], px + 6, py - 3);
        } else if (d === D.BANNER) {
          // Pole from the top of this tile down to the deck.
          ctx.fillStyle = PAL.ink;
          ctx.fillRect(px + 2, py - 2, 3, 48);
          ctx.fillStyle = PAL.wood2;
          ctx.fillRect(px + 3, py - 1, 1, 47);
          ctx.fillStyle = PAL.gold2;
          ctx.fillRect(px + 2, py - 4, 3, 2);
          ctx.fillStyle = PAL.ink;
          ctx.fillRect(px + 4, py + 1, 11, 2);
          drawCloth(px + 5, py + 3, 9, 22, time, 2.5, seed);
        } else if (d === D.HANGING_BANNER) {
          ctx.fillStyle = PAL.ink;
          ctx.fillRect(px + 1, py, 14, 2);
          ctx.fillStyle = PAL.gold1;
          ctx.fillRect(px + 2, py, 12, 1);
          drawCloth(px + 3, py + 2, 10, 26, time, 1.5, seed);
        } else if (d === D.MUSHROOM && Math.sin(time * 0.05 + seed) > 0.6) {
          ctx.fillStyle = '#c8fff8';
          ctx.fillRect(px + 5 + Math.floor((seed % 1) * 6), py + 8, 1, 1);
        }
      }
    }
  }

  // Things drawn over entities: water and the false wall.
  function drawWorldFront(cam, level, time, fakeAlpha) {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const tx1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const ty1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE) + 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = level.get(tx, ty);
        const px = tx * TILE;
        const py = ty * TILE;
        if (t === T.WATER) {
          const surface = level.get(tx, ty - 1) !== T.WATER;
          ctx.fillStyle = 'rgba(32,60,120,0.72)';
          ctx.fillRect(px, py + (surface ? 3 : 0), TILE, surface ? 13 : 16);
          // Shimmer streaks drift sideways.
          for (let i = 0; i < 3; i++) {
            const sx = Math.floor((tileHash(tx, ty, i) * 16 + time * 0.2 * (i + 1)) % 16);
            const sy = 5 + i * 4;
            if (Math.sin(time * 0.06 + i + tx) > -0.2) {
              ctx.fillStyle = i === 0 ? 'rgba(140,200,236,0.7)' : 'rgba(58,104,168,0.9)';
              ctx.fillRect(px + sx, py + sy, 3, 1);
            }
          }
          if (surface) {
            for (let x = 0; x < TILE; x++) {
              const wy = Math.round(Math.sin((px + x) * 0.35 + time * 0.08) * 1.2 + 2);
              ctx.fillStyle = (px + x + Math.floor(time * 0.15)) % 7 === 0 ? PAL.white : PAL.water3;
              ctx.fillRect(px + x, py + wy, 1, 1);
              ctx.fillStyle = 'rgba(32,60,120,0.72)';
              ctx.fillRect(px + x, py + wy + 1, 1, 3 - wy + 1);
            }
          }
        } else if (t === T.FAKE && fakeAlpha > 0.01) {
          ctx.globalAlpha = fakeAlpha;
          ctx.drawImage(brickTiles[Math.floor(tileHash(tx, ty, 2) * VARIANTS)], px, py);
          // A barely-visible crack is the only clue.
          if (ty === 7 && tx === 128) {
            ctx.fillStyle = PAL.brick0;
            ctx.fillRect(px + 3, py + 4, 1, 3);
            ctx.fillRect(px + 4, py + 7, 1, 2);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function drawForeground(cam, amount) {
    if (amount <= 0.01) return;
    ctx.globalAlpha = amount;
    const ox = -Math.round(cam.x * 1.35) % FOLIAGE_W;
    const oy = Math.round((250 - cam.y) * 0.15);
    for (let x = ox - FOLIAGE_W; x < VIEW_W; x += FOLIAGE_W) {
      if (x + FOLIAGE_W > 0) ctx.drawImage(foliageLayer, x, Math.max(0, oy));
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(alpha) {
    // World transform is active.
    let glowOn = false;
    for (const p of Particles.pool) {
      if (!p.alive) continue;
      if (p.glow !== glowOn) {
        glowOn = p.glow;
        ctx.globalCompositeOperation = glowOn ? 'lighter' : 'source-over';
      }
      const k = 1 - p.life / p.maxLife; // 0 new .. 1 dead
      ctx.fillStyle = p.colors ? p.colors[Math.min(p.colors.length - 1, Math.floor(k * p.colors.length))] : p.color;
      const s = p.shrink ? Math.max(1, Math.round(p.size * (1 - k))) : p.size;
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Darkness with holes punched out at each light, rendered at half
  // resolution so the falloff steps in chunky 2px bands.
  function drawLighting(cam, lights, darkness, time) {
    if (darkness > 0.01) {
      lightCtx.globalCompositeOperation = 'source-over';
      lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
      lightCtx.fillStyle = `rgba(10,5,22,${darkness})`;
      lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
      lightCtx.globalCompositeOperation = 'destination-out';
      for (const l of lights) {
        const x = (l.x - cam.x) / 2;
        const y = (l.y - cam.y) / 2;
        const r = l.r * flickerScale(l, time) / 2;
        if (x < -r || x > VIEW_W / 2 + r || y < -r || y > VIEW_H / 2 + r) continue;
        const g = lightCtx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lightCtx.fillStyle = g;
        lightCtx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.drawImage(lightCanvas, 0, 0, VIEW_W, VIEW_H);
    }
    // Additive colour glow on top.
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const x = l.x - cam.x;
      const y = l.y - cam.y;
      const r = l.r * 0.7 * flickerScale(l, time);
      if (x < -r || x > VIEW_W + r || y < -r || y > VIEW_H + r) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = (l.intensity || 0.22) * (0.5 + darkness);
      g.addColorStop(0, `rgba(${l.color},${a})`);
      g.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function flickerScale(l, time) {
    if (l.flicker < 0) return 1;
    return 1 + Math.sin(time * 0.3 + l.flicker) * 0.06 + Math.sin(time * 0.71 + l.flicker * 2) * 0.04;
  }

  function drawVignette() {
    ctx.drawImage(vignette, 0, 0);
  }

  function drawHUD(state) {
    const { hp, maxHp, gems, totalGems, relic: hasRelic, muted, time, hurtFlash, gemPulse, score, scorePulse } = state;
    for (let i = 0; i < maxHp; i++) {
      const full = i < hp;
      // The last remaining heart beats when health is low.
      const beat = full && hp === 1 && Math.sin(time * 0.25) > 0.3 ? -1 : 0;
      ctx.drawImage(full ? heartFull : heartEmpty, 6 + i * 11, 6 + beat);
    }
    if (hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,60,80,${hurtFlash * 0.25})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const gy = 17;
    const bounce = gemPulse > 0 ? -Math.round(Math.sin(gemPulse * Math.PI) * 2) : 0;
    ctx.drawImage(gemSprites[Math.floor(time / 30) % 4], 6, gy + 1 + bounce);
    text('x' + String(gems).padStart(2, '0'), 16, gy + 1, { color: gemPulse > 0 ? PAL.gold3 : PAL.white });
    text('/' + totalGems, 16 + textWidth('x00') + 2, gy + 1, { color: '#8a7aa0' });
    if (hasRelic) {
      ctx.drawImage(relic, VIEW_W - 18, 5);
    }
    if (muted) text('MUTE', VIEW_W - (hasRelic ? 22 : 6), 7, { align: 'right', color: '#8a7aa0' });
    // Score sits under the relic/mute row, right-aligned.
    text('SCORE ' + String(score).padStart(3, '0'), VIEW_W - 6, gy + 1, {
      align: 'right', color: scorePulse > 0 ? PAL.gold3 : PAL.white,
    });
  }

  function clear(color = '#000') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function fade(alpha, color = '8,4,16') {
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(${color},${Math.min(1, alpha)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function present() {
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(buffer, 0, 0, VIEW_W * scale, VIEW_H * scale);
  }

  return {
    ctx, sprites, PAL, buildWorld, beginWorld, endWorld, draw, drawScaled,
    drawBackground, drawStaticWorld, drawAnimatedBack, drawWorldFront, drawForeground,
    drawParticles, drawLighting, drawVignette, drawHUD, text, textWidth, clear, fade, present,
  };
})();
