// Level data, tile collision and the hand-authored layout.
// The map is built in code from rectangles rather than ASCII art, which keeps
// the three zones easy to read and tweak:
//   forest  x   0..69   ground at row 22, tree platforms, first checkpoint
//   bridge  x  70..119  stone deck at row 20 over a river, crumbled gaps
//   castle  x 120..179  two storeys, a climb, a secret room and the altar
const TILE = 16;
const LEVEL_W = 180;
const LEVEL_H = 30;

// Foreground tiles (collision layer).
const T = {
  EMPTY: 0,
  DIRT: 1,
  STONE: 2,
  BRICK: 3,
  PLATFORM: 4, // one-way: solid from above only
  SPIKE: 5,
  WATER: 6, // decorative, animated; the river below the bridge is a pit
  FAKE: 7, // looks like brick, isn't solid: hides the relic room
};

// Background wall layer.
const B = { NONE: 0, CASTLE: 1, CASTLE_PILLAR: 2 };

// Props drawn behind entities. Never solid.
const D = {
  NONE: 0,
  GRASS: 1,
  FLOWER: 2,
  MUSHROOM: 3,
  TORCH: 4, // wall sconce, animated
  BANNER: 5, // pole banner, 3 tiles tall, animated
  HANGING_BANNER: 6, // hangs from ceiling, 2 tiles, animated
  CHAIN: 7,
  WINDOW: 8, // 2 tiles tall
  POST: 9,
  BRAZIER: 10, // fire bowl on a stand, animated
  ROCK: 11,
  BONES: 12,
  TREE: 13, // big background tree, drawn tall
};

const ZONE_BRIDGE_X = 70;
const ZONE_CASTLE_X = 120;

// Deterministic per-tile noise so the map looks identical every run.
function tileHash(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Level {
  constructor() {
    const n = LEVEL_W * LEVEL_H;
    this.w = LEVEL_W;
    this.h = LEVEL_H;
    this.pxW = LEVEL_W * TILE;
    this.pxH = LEVEL_H * TILE;
    this.tiles = new Uint8Array(n);
    this.back = new Uint8Array(n);
    this.deco = new Uint8Array(n);
    this.spawns = [];
    this.lights = []; // static light sources: {x, y, r, color, flicker}
    this.build();
    this.collectLights();
  }

  idx(x, y) {
    return y * LEVEL_W + x;
  }

  get(x, y) {
    if (x < 0 || x >= LEVEL_W) return T.BRICK; // world edges are walls
    if (y < 0 || y >= LEVEL_H) return T.EMPTY; // open sky / bottomless below
    return this.tiles[this.idx(x, y)];
  }

  getBack(x, y) {
    if (x < 0 || x >= LEVEL_W || y < 0 || y >= LEVEL_H) return B.NONE;
    return this.back[this.idx(x, y)];
  }

  getDeco(x, y) {
    if (x < 0 || x >= LEVEL_W || y < 0 || y >= LEVEL_H) return D.NONE;
    return this.deco[this.idx(x, y)];
  }

  isSolid(x, y) {
    const t = this.get(x, y);
    return t === T.DIRT || t === T.STONE || t === T.BRICK;
  }

  isSolidAt(px, py) {
    return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  zoneAt(px) {
    const tx = px / TILE;
    if (tx < ZONE_BRIDGE_X) return 'forest';
    if (tx < ZONE_CASTLE_X) return 'bridge';
    return 'castle';
  }

  // Axis-separated AABB movement against the tile grid. Bodies never move
  // more than a tile per step, so checking only the leading edge is enough.
  // Returns which sides were blocked.
  move(b) {
    const res = { left: false, right: false, top: false, bottom: false };

    b.x += b.vx;
    const ty0 = Math.floor(b.y / TILE);
    const ty1 = Math.floor((b.y + b.h - 0.001) / TILE);
    if (b.vx > 0) {
      const tx = Math.floor((b.x + b.w - 0.001) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (this.isSolid(tx, ty)) {
          b.x = tx * TILE - b.w;
          b.vx = 0;
          res.right = true;
          break;
        }
      }
    } else if (b.vx < 0) {
      const tx = Math.floor(b.x / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (this.isSolid(tx, ty)) {
          b.x = (tx + 1) * TILE;
          b.vx = 0;
          res.left = true;
          break;
        }
      }
    }

    const prevBottom = b.y + b.h;
    b.y += b.vy;
    const tx0 = Math.floor(b.x / TILE);
    const tx1 = Math.floor((b.x + b.w - 0.001) / TILE);
    if (b.vy > 0) {
      const ty = Math.floor((b.y + b.h - 0.001) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.get(tx, ty);
        const oneWay = t === T.PLATFORM && !b.dropThrough && prevBottom <= ty * TILE + 0.01;
        if (this.isSolid(tx, ty) || oneWay) {
          b.y = ty * TILE - b.h;
          b.vy = 0;
          res.bottom = true;
          break;
        }
      }
    } else if (b.vy < 0) {
      const ty = Math.floor(b.y / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.isSolid(tx, ty)) {
          b.y = (ty + 1) * TILE;
          b.vy = 0;
          res.top = true;
          break;
        }
      }
    }
    return res;
  }

  // True if the body is standing on something (used for coyote time etc).
  groundBelow(b) {
    const ty = Math.floor((b.y + b.h + 0.5) / TILE);
    const tx0 = Math.floor(b.x / TILE);
    const tx1 = Math.floor((b.x + b.w - 0.001) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (this.isSolid(tx, ty)) return true;
      if (this.get(tx, ty) === T.PLATFORM && Math.abs(b.y + b.h - ty * TILE) < 0.5) return true;
    }
    return false;
  }

  // Spikes only hurt in their lower 9px, a little inset, so grazing the tips
  // feels fair.
  touchesSpike(b) {
    const tx0 = Math.floor(b.x / TILE);
    const tx1 = Math.floor((b.x + b.w - 0.001) / TILE);
    const ty0 = Math.floor(b.y / TILE);
    const ty1 = Math.floor((b.y + b.h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.get(tx, ty) !== T.SPIKE) continue;
        const sx = tx * TILE + 2;
        const sy = ty * TILE + 7;
        if (b.x < sx + 12 && b.x + b.w > sx && b.y < sy + 9 && b.y + b.h > sy) return true;
      }
    }
    return false;
  }

  // True when the box overlaps any fake-wall tile (so the wall can fade out).
  overlapsFake(b) {
    const tx0 = Math.floor((b.x - 8) / TILE);
    const tx1 = Math.floor((b.x + b.w + 8) / TILE);
    const ty0 = Math.floor(b.y / TILE);
    const ty1 = Math.floor((b.y + b.h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) if (this.get(tx, ty) === T.FAKE) return true;
    }
    return false;
  }

  // ---- Construction helpers ----------------------------------------------
  fill(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && x < LEVEL_W && y >= 0 && y < LEVEL_H) this.tiles[this.idx(x, y)] = t;
      }
    }
  }

  fillBack(x0, y0, x1, y1, b) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.back[this.idx(x, y)] = b;
    }
  }

  put(x, y, d) {
    this.deco[this.idx(x, y)] = d;
  }

  // `row` is the tile row the thing stands on.
  spawn(type, tx, row, extra) {
    this.spawns.push(Object.assign({ type, tx, row }, extra));
  }

  gems(list) {
    for (const [tx, ty] of list) this.spawns.push({ type: 'gem', tx, ty });
  }

  build() {
    const { DIRT, STONE, BRICK, PLATFORM, SPIKE, WATER, FAKE, EMPTY } = T;

    // ===== Enchanted forest =====
    this.fill(0, 22, 49, 29, DIRT);
    // Gentle hill.
    this.fill(12, 21, 19, 21, DIRT);
    this.fill(15, 20, 19, 20, DIRT);
    // Spike pit, 3 tiles wide.
    this.fill(24, 22, 26, 23, EMPTY);
    this.fill(24, 23, 26, 23, SPIKE);
    // Tree-branch platforms for a bit of vertical exploration.
    this.fill(29, 19, 32, 19, PLATFORM);
    this.fill(34, 16, 37, 16, PLATFORM);
    this.fill(29, 13, 32, 13, PLATFORM);
    // A four-tile cliff: impossible without the double jump from checkpoint 1.
    this.fill(50, 18, 69, 29, DIRT);
    // Pond on the plateau.
    this.fill(56, 18, 59, 19, WATER);

    this.spawn('checkpoint', 44, 22);
    this.spawn('slime', 21, 22);
    this.spawn('slime', 40, 22);
    this.spawn('wisp', 61, 14);
    this.spawn('slime', 65, 18);
    this.gems([
      [8, 20], [10, 20], [13, 19], [17, 17], [24, 19], [25, 18], [26, 19],
      [30, 17], [31, 17], [35, 14], [36, 14], [30, 11], [31, 11],
      [40, 20], [47, 20], [53, 15], [55, 15], [57, 16], [58, 16], [63, 16], [67, 16],
    ]);
    this.spawn('heart', 32, 12);

    for (const tx of [5, 21, 33, 46, 62]) this.put(tx, tx > 49 ? 17 : 21, D.TREE);
    this.put(52, 17, D.ROCK);
    this.put(66, 17, D.MUSHROOM);

    // ===== Ruined stone bridge =====
    this.fill(70, 20, 119, 21, STONE);
    // Crumbled sections of the deck.
    this.fill(80, 20, 82, 21, EMPTY);
    this.fill(92, 20, 94, 21, EMPTY);
    this.fill(104, 20, 106, 21, EMPTY);
    // Pillars down into the river.
    for (const px of [74, 87, 99, 112]) this.fill(px, 22, px + 1, 28, STONE);
    this.fill(70, 29, 119, 29, WATER);
    // Broken upper arches, reachable with the double jump.
    this.fill(83, 16, 85, 16, PLATFORM);
    this.fill(96, 15, 99, 15, PLATFORM);
    this.fill(108, 16, 110, 16, PLATFORM);

    this.spawn('checkpoint', 97, 20);
    this.spawn('slime', 77, 20);
    this.spawn('skeleton', 86, 20);
    this.spawn('wisp', 95, 13);
    this.spawn('skeleton', 102, 20);
    this.spawn('skeleton', 116, 20);
    this.gems([
      [72, 18], [77, 18], [78, 18], [81, 17], [84, 14], [85, 14], [90, 18], [93, 17],
      [97, 13], [98, 13], [103, 18], [105, 17], [109, 14], [110, 14], [114, 18],
    ]);
    this.spawn('heart', 108, 15);

    for (const x of [71, 84, 96, 109, 118]) this.put(x, 19, D.POST);
    for (const x of [73, 90, 101, 115]) this.put(x, 19, D.BRAZIER);
    for (const x of [78, 100, 111]) this.put(x, 17, D.BANNER);
    this.put(89, 19, D.BONES);

    // ===== Castle interior =====
    // Background wall over the whole castle.
    this.fillBack(120, 0, 179, 29, B.CASTLE);
    for (const px of [126, 139, 153, 167]) this.fillBack(px, 4, px, 29, B.CASTLE_PILLAR);
    // Facade with a doorway at deck height.
    this.fill(120, 0, 121, 16, BRICK);
    this.fill(120, 20, 134, 29, BRICK);
    // Ceiling and far wall.
    this.fill(122, 0, 179, 3, BRICK);
    this.fill(178, 0, 179, 29, BRICK);
    // Lower hall: floor A, a bottomless crumble, floor B with spikes.
    this.fill(135, 25, 140, 29, BRICK);
    this.fill(144, 25, 177, 29, BRICK);
    this.fill(149, 24, 151, 24, SPIKE);
    // Upper corridors on either side of the climbing shaft.
    this.fill(122, 10, 149, 11, BRICK);
    this.fill(162, 10, 177, 11, BRICK);
    // The climb.
    this.fill(151, 22, 154, 22, PLATFORM);
    this.fill(156, 19, 159, 19, PLATFORM);
    this.fill(151, 16, 154, 16, PLATFORM);
    this.fill(150, 13, 152, 13, PLATFORM);
    this.fill(156, 13, 159, 13, PLATFORM);
    // Spikes along the right corridor.
    this.fill(167, 9, 168, 9, SPIKE);
    // The secret: a false wall at the far end of the left corridor.
    this.fill(128, 4, 129, 9, FAKE);

    this.spawn('checkpoint', 146, 25);
    this.spawn('skeleton', 131, 20);
    this.spawn('slime', 138, 25);
    this.spawn('slime', 158, 25);
    this.spawn('wisp', 156, 17);
    this.spawn('skeleton', 141, 10);
    this.spawn('wisp', 135, 6);
    this.spawn('skeleton', 172, 10);
    this.spawn('skeleton', 173, 25);
    this.spawn('slime', 166, 25);
    this.spawn('goal', 175, 10);
    this.spawn('relic', 124, 9);
    this.gems([
      [124, 18], [127, 18], [130, 18], [137, 23], [142, 21], [143, 21],
      [152, 20], [157, 17], [152, 14], [158, 11], [134, 8], [137, 8], [145, 8],
      [164, 8], [170, 7], [163, 22], [169, 22], [176, 22],
    ]);
    this.spawn('heart', 147, 7);
    this.spawn('heart', 175, 23);

    for (const [x, y] of [[123, 15], [132, 15], [136, 21], [147, 21], [161, 21], [171, 21],
      [133, 6], [144, 6], [165, 6], [175, 6], [123, 6]]) this.put(x, y, D.TORCH);
    for (const [x, y] of [[129, 13], [143, 15], [163, 14], [174, 14]]) this.put(x, y, D.WINDOW);
    for (const x of [131, 140, 170]) this.put(x, 4, D.HANGING_BANNER);
    for (let y = 4; y <= 8; y++) this.put(155, y, D.CHAIN);
    for (let y = 4; y <= 11; y++) this.put(160, y, D.CHAIN);
    this.put(125, 9, D.BONES);
    this.put(158, 24, D.BONES);

    // Scatter grass and flowers on exposed forest dirt.
    for (let x = 0; x < ZONE_BRIDGE_X; x++) {
      for (let y = 1; y < LEVEL_H; y++) {
        if (this.get(x, y) !== DIRT || this.get(x, y - 1) !== EMPTY) continue;
        if (this.getDeco(x, y - 1) !== D.NONE) continue;
        const r = tileHash(x, y, 7);
        if (r < 0.45) this.put(x, y - 1, D.GRASS);
        else if (r < 0.58) this.put(x, y - 1, D.FLOWER);
        else if (r < 0.63) this.put(x, y - 1, D.MUSHROOM);
      }
    }
  }

  collectLights() {
    for (let y = 0; y < LEVEL_H; y++) {
      for (let x = 0; x < LEVEL_W; x++) {
        const d = this.deco[this.idx(x, y)];
        if (d === D.TORCH) {
          this.lights.push({ x: x * TILE + 8, y: y * TILE + 4, r: 64, color: '255,150,60', flicker: tileHash(x, y) * 10 });
        } else if (d === D.BRAZIER) {
          this.lights.push({ x: x * TILE + 8, y: y * TILE + 2, r: 72, color: '255,140,50', flicker: tileHash(x, y) * 10 });
        } else if (d === D.WINDOW) {
          this.lights.push({ x: x * TILE + 8, y: y * TILE + 16, r: 40, color: '140,170,255', flicker: -1 });
        }
      }
    }
  }
}
