// Game loop, state machine, camera, pickups and the glue between systems.
// Updates run at a fixed 60Hz; rendering interpolates between the last two
// updates so motion stays smooth on any refresh rate.

// ---- Pickups and world objects -------------------------------------------
class Gem {
  constructor(x, y, colorIndex) {
    this.x = x;
    this.y = y;
    this.color = colorIndex;
    this.t = Math.floor(Math.random() * 200);
    this.dead = false;
  }

  update(game) {
    this.t++;
    const p = game.player;
    const dx = p.cx - this.x;
    const dy = p.y + 7 - this.y;
    const d = Math.hypot(dx, dy);
    // Gentle magnet so near-misses still count.
    if (d < 26 && !p.dead) {
      this.x += (dx / d) * 1.6;
      this.y += (dy / d) * 1.6;
    }
    if (d < 10 && !p.dead) {
      this.dead = true;
      game.collectGem(this);
    }
    if (this.t % 40 === 0) Particles.gemSparkle(this.x, this.y, Renderer.sprites.gemColors[this.color].glow);
  }

  draw() {
    const img = Renderer.sprites.gems[this.color];
    const spin = Math.cos(this.t * 0.05);
    const sx = Math.max(0.25, Math.abs(spin));
    const bob = Math.round(Math.sin(this.t * 0.06) * 1.5);
    Renderer.drawScaled(img, this.x, this.y + 4 + bob, sx, 1);
  }
}

class HeartPickup {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.t = 0;
    this.vy = 0;
    this.dead = false;
    this.dropped = false;
  }

  update(game) {
    this.t++;
    if (this.dropped) {
      // Dropped hearts pop up and fall to the floor.
      this.vy = Math.min(this.vy + 0.2, 3);
      this.y += this.vy;
      if (game.level.isSolidAt(this.x, this.y + 5)) {
        this.y = Math.floor((this.y + 5) / TILE) * TILE - 5;
        this.vy = 0;
      }
      if (this.t > 600) this.dead = true;
    }
    const p = game.player;
    if (!p.dead && Math.abs(p.cx - this.x) < 10 && Math.abs(p.y + 7 - this.y) < 12) {
      this.dead = true;
      game.collectHeart(this);
    }
  }

  draw() {
    if (this.dropped && this.t > 480 && this.t % 6 < 3) return;
    const bob = Math.round(Math.sin(this.t * 0.08) * 1.5);
    const pulse = 1 + Math.max(0, Math.sin(this.t * 0.12)) * 0.12;
    Renderer.drawScaled(Renderer.sprites.heartFull, this.x, this.y + 4 + bob, pulse, pulse);
  }
}

class Relic {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.t = 0;
    this.dead = false;
  }

  update(game) {
    this.t++;
    const p = game.player;
    if (!p.dead && Math.abs(p.cx - this.x) < 11 && Math.abs(p.y + 7 - this.y) < 14) {
      this.dead = true;
      game.collectRelic(this);
    }
    if (this.t % 12 === 0) Particles.gemSparkle(this.x, this.y, '#ffd860');
  }

  draw() {
    const bob = Math.round(Math.sin(this.t * 0.05) * 2);
    Renderer.draw(Renderer.sprites.relic, this.x - 6, this.y - 6 + bob);
  }

  light() {
    return { x: this.x, y: this.y, r: 50, color: '255,200,90', flicker: -1, intensity: 0.4 };
  }
}

class Checkpoint {
  constructor(x, floorY, index) {
    this.x = x; // centre
    this.y = floorY;
    this.index = index;
    this.active = false;
    this.t = 0;
  }

  update(game) {
    this.t++;
    const p = game.player;
    if (!this.active && !p.dead && Math.abs(p.cx - this.x) < 12 && p.bottom > this.y - 30 && p.y < this.y) {
      game.activateCheckpoint(this);
    }
    if (this.active && this.t % 5 === 0) {
      Particles.spawn({
        x: this.x + Particles.rand(-3, 3), y: this.y - 24, vy: Particles.rand(-0.8, -0.3), life: 24,
        glow: true, colors: ['#ffffff', '#a8f0ff', '#48a8f0'],
      });
    }
  }

  draw() {
    const S = Renderer.sprites;
    Renderer.draw(this.active ? S.shrineLit : S.shrineDark, this.x - 8, this.y - 26);
    if (this.active) {
      const f = S.blueFlames[Math.floor(this.t / 4) % S.blueFlames.length];
      Renderer.draw(f, this.x - 4, this.y - 33);
    }
  }

  light() {
    return this.active ? { x: this.x, y: this.y - 26, r: 70, color: '90,170,255', flicker: this.index, intensity: 0.35 } : null;
  }
}

class Goal {
  constructor(x, floorY) {
    this.x = x;
    this.y = floorY;
    this.t = 0;
    this.reached = false;
  }

  update(game) {
    this.t++;
    const p = game.player;
    if (!this.reached && !p.dead && Math.abs(p.cx - this.x) < 18 && p.bottom > this.y - 40) {
      this.reached = true;
      game.reachGoal(this);
    }
    if (this.t % 8 === 0) Particles.gemSparkle(this.x, this.crownY(), '#ffd860');
  }

  crownY() {
    return this.y - 38 + Math.sin(this.t * 0.04) * 3;
  }

  draw() {
    const S = Renderer.sprites;
    Renderer.draw(S.altar, this.x - 16, this.y - 24);
    if (!this.reached) Renderer.draw(S.crown, this.x - 5, Math.round(this.crownY()) - 3);
  }

  light() {
    return { x: this.x, y: this.crownY(), r: 80, color: '255,190,80', flicker: 3, intensity: 0.45 };
  }
}

// ---- Game -------------------------------------------------------------------
const STEP_MS = 1000 / 60;

const Game = {
  state: 'title',
  stateTime: 0,
  time: 0,
  level: null,
  player: null,

  init() {
    this.level = new Level();
    Renderer.buildWorld(this.level);
    this.cam = { x: 0, y: 250, prevX: 0, prevY: 250, look: 0 };
    this.newGame();
    this.state = 'title';
    this.fadeIn = 1;

    Input.onPress((a) => {
      if (a === 'mute') {
        Sound.init();
        Sound.toggleMute();
      }
    });
  },

  newGame() {
    const L = this.level;
    this.enemies = [];
    this.arrows = [];
    this.pickups = [];
    this.checkpoints = [];
    this.goal = null;
    this.totalGems = 0;
    let cpIndex = 0;
    for (const s of L.spawns) {
      const px = s.tx * TILE + TILE / 2;
      if (s.type === 'gem') {
        this.pickups.push(new Gem(px, s.ty * TILE + 8, Math.floor(tileHash(s.tx, s.ty, 3) * 4)));
        this.totalGems++;
      } else if (s.type === 'heart') {
        this.pickups.push(new HeartPickup(px, s.row * TILE + 8));
      } else if (s.type === 'relic') {
        this.pickups.push(new Relic(px, s.row * TILE + 8));
      } else if (s.type === 'checkpoint') {
        this.checkpoints.push(new Checkpoint(px, s.row * TILE, cpIndex++));
      } else if (s.type === 'goal') {
        this.goal = new Goal(px, s.row * TILE);
      } else {
        const e = createEnemy(s);
        if (e) this.enemies.push(e);
      }
    }
    this.spawnPoint = { x: 3 * TILE, y: 22 * TILE };
    this.player = new Player(this.spawnPoint.x, this.spawnPoint.y - 14);
    this.gems = 0;
    this.hasRelic = false;
    this.deaths = 0;
    this.kills = 0;
    this.playTime = 0;
    this.freeze = 0;
    this.shakeMag = 0;
    this.hurtFlash = 0;
    this.gemPulse = 0;
    this.fakeAlpha = 1;
    this.messages = [];
    this.respawnTimer = 0;
    Particles.clear();
    this.snapCamera();
  },

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  },

  // ---- Juice hooks used by entities ----
  shake(px) {
    this.shakeMag = Math.max(this.shakeMag, px);
  },

  hitstop(frames) {
    this.freeze = Math.max(this.freeze, frames);
  },

  message(title, sub = '', frames = 150) {
    this.messages = [{ title, sub, t: 0, frames }];
  },

  // ---- Events ----
  collectGem(gem) {
    this.gems++;
    this.gemPulse = 1;
    Particles.gemCollect(gem.x, gem.y, Renderer.sprites.gemColors[gem.color].glow);
    Sound.play('gem');
  },

  collectHeart(h) {
    this.player.hp = Math.min(PLAYER.MAX_HP, this.player.hp + 1);
    Particles.heal(h.x, h.y);
    Sound.play('heart');
  },

  collectRelic(r) {
    this.hasRelic = true;
    Particles.relicBurst(r.x, r.y);
    Sound.play('relic');
    this.shake(4);
    this.hitstop(8);
    this.message('THE EMBER CHALICE', 'A HIDDEN RELIC IS YOURS', 200);
  },

  activateCheckpoint(cp) {
    for (const c of this.checkpoints) if (c.index < cp.index) c.active = true;
    cp.active = true;
    this.spawnPoint = { x: cp.x - this.player.w / 2, y: cp.y };
    this.player.hp = Math.max(this.player.hp, Math.min(PLAYER.MAX_HP, this.player.hp + 1));
    Particles.checkpointFlame(cp.x, cp.y - 26);
    Sound.play('checkpoint');
    this.shake(2);
    if (!this.player.canDoubleJump) {
      this.player.canDoubleJump = true;
      this.message('DOUBLE JUMP UNLOCKED', 'PRESS JUMP AGAIN IN MIDAIR', 220);
    } else {
      this.message('SHRINE KINDLED', '', 110);
    }
  },

  onEnemyKilled(e) {
    this.kills++;
    if (this.player.hp < PLAYER.MAX_HP && Math.random() < 0.22) {
      const h = new HeartPickup(e.cx, e.cy);
      h.dropped = true;
      h.vy = -2.5;
      this.pickups.push(h);
    }
  },

  playerDied() {
    const p = this.player;
    p.dead = true;
    Particles.deathBurst(p.cx, p.y + 7, ['#3f7a52', '#24452f', '#f0bc8c', '#7a5236', '#ffffff'], 40);
    this.shake(8);
    this.hitstop(10);
    Sound.stopMusic();
    this.setState('dying');
  },

  fellInPit() {
    const p = this.player;
    if (this.level.zoneAt(p.cx) === 'bridge') {
      Particles.splash(p.cx, (LEVEL_H - 1) * TILE + 3);
    }
    p.hp -= 1;
    this.deaths++;
    this.hurtFlash = 1;
    Sound.play('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      this.playerDied();
      return;
    }
    p.dead = true; // hide while the screen fades
    this.respawnTimer = 50;
  },

  respawn() {
    const p = this.player;
    p.reset(this.spawnPoint.x, this.spawnPoint.y - p.h);
    p.invuln = 60;
    this.arrows = [];
    this.snapCamera();
  },

  reachGoal(goal) {
    Particles.relicBurst(goal.x, goal.crownY());
    Sound.play('victory');
    Sound.stopMusic();
    this.shake(5);
    this.hitstop(12);
    this.setState('victory');
  },

  // ---- Camera ----
  cameraTarget() {
    const p = this.player;
    return {
      x: p.cx + this.cam.look - VIEW_W / 2,
      y: p.y + p.h / 2 - VIEW_H * 0.56,
    };
  },

  clampCamera(c) {
    c.x = Math.max(0, Math.min(this.level.pxW - VIEW_W, c.x));
    c.y = Math.max(0, Math.min(this.level.pxH - VIEW_H, c.y));
  },

  snapCamera() {
    this.cam.look = 0;
    const t = this.cameraTarget();
    this.cam.x = t.x;
    this.cam.y = t.y;
    this.clampCamera(this.cam);
    this.cam.prevX = this.cam.x;
    this.cam.prevY = this.cam.y;
  },

  updateCamera() {
    const c = this.cam;
    const p = this.player;
    c.prevX = c.x;
    c.prevY = c.y;
    // Look ahead in the direction of travel.
    const lookTarget = p.vx * 26 + p.facing * 10;
    c.look += (lookTarget - c.look) * 0.04;
    const t = this.cameraTarget();
    c.x += (t.x - c.x) * 0.1;
    // Follow faster when falling so the player never drops off-screen.
    const ky = p.vy > 3 ? 0.2 : p.grounded ? 0.08 : 0.05;
    c.y += (t.y - c.y) * ky;
    this.clampCamera(c);
  },

  // ---- Zone blending ----
  zoneMix(px) {
    // Returns 0 (forest) .. 1 (bridge) .. 2 (castle), blended over 8 tiles.
    const tx = px / TILE;
    const ramp = (edge) => Math.max(0, Math.min(1, (tx - edge + 4) / 8));
    return ramp(ZONE_BRIDGE_X) + ramp(ZONE_CASTLE_X);
  },

  darknessAt(px) {
    const z = this.zoneMix(px);
    return z <= 1 ? 0.2 + z * 0.1 : 0.3 + (z - 1) * 0.42;
  },

  foliageAt(px) {
    const z = this.zoneMix(px);
    return z <= 1 ? 1 - z * 0.4 : 0.6 * (2 - z);
  },

  // ---- Update ----
  update() {
    this.time++;
    this.stateTime++;
    if (Input.pressed('start') || Input.pressed('jump') || Input.pressed('attack')) Sound.init();

    switch (this.state) {
      case 'title':
        this.updateTitle();
        break;
      case 'playing':
        if (Input.pressed('pause')) {
          Sound.play('pause');
          this.setState('paused');
          return;
        }
        this.updatePlay();
        break;
      case 'paused':
        if (Input.pressed('pause') || Input.pressed('start')) {
          Sound.play('pause');
          this.state = 'playing';
        }
        break;
      case 'dying':
        this.updateWorld(false);
        if (this.stateTime === 40) Sound.play('gameOver');
        if (this.stateTime > 110) this.setState('gameover');
        break;
      case 'gameover':
        Particles.update(this.level);
        if (this.stateTime > 40 && Input.pressed('start')) this.startGame();
        break;
      case 'victory':
        this.updateWorld(false);
        if (this.stateTime > 90 && Input.pressed('start')) this.startGame();
        break;
    }
  },

  startGame() {
    Sound.init();
    Sound.play('select');
    this.newGame();
    this.player.canDoubleJump = false;
    this.setState('playing');
    this.fadeIn = 1;
    Sound.startMusic();
    this.message('THE EMBERWOOD', 'FIND THE CROWN IN THE RUINED KEEP', 180);
  },

  updateTitle() {
    // Slow pan across the forest behind the title.
    const span = (ZONE_BRIDGE_X - 4) * TILE - VIEW_W;
    this.cam.prevX = this.cam.x;
    this.cam.prevY = this.cam.y;
    this.cam.x = (Math.sin(this.time * 0.0012) * 0.5 + 0.5) * span;
    this.cam.y = 22 * TILE - VIEW_H + 24;
    this.ambient();
    Particles.update(this.level);
    if (Input.pressed('start')) this.startGame();
  },

  updatePlay() {
    this.playTime++;
    if (this.respawnTimer > 0) {
      this.respawnTimer--;
      if (this.respawnTimer === 25) this.respawn();
      Particles.update(this.level);
      this.updateCamera();
      return;
    }
    this.updateWorld(true);
  },

  // One fixed step of the world. `live` is false during death/victory
  // sequences where the player shouldn't act.
  updateWorld(live) {
    if (this.shakeMag > 0) this.shakeMag = this.shakeMag < 0.3 ? 0 : this.shakeMag * 0.86;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - 0.06);
    if (this.gemPulse > 0) this.gemPulse = Math.max(0, this.gemPulse - 0.08);
    for (const m of this.messages) m.t++;
    this.messages = this.messages.filter((m) => m.t < m.frames);

    // Hitstop: freeze everything for a few frames so hits land with weight.
    if (this.freeze > 0) {
      this.freeze--;
      this.cam.prevX = this.cam.x;
      this.cam.prevY = this.cam.y;
      const p = this.player;
      p.prevX = p.x;
      p.prevY = p.y;
      for (const e of this.enemies) {
        e.prevX = e.x;
        e.prevY = e.y;
      }
      return;
    }

    const p = this.player;
    const L = this.level;
    if (live && !p.dead) {
      p.update(this);
      if (p.y > L.pxH + 8 || (L.zoneAt(p.cx) === 'bridge' && p.bottom > (LEVEL_H - 1) * TILE + 6)) {
        this.fellInPit();
      }
    } else {
      p.prevX = p.x;
      p.prevY = p.y;
    }

    const cx = this.cam.x + VIEW_W / 2;
    const cy = this.cam.y + VIEW_H / 2;
    for (const e of this.enemies) {
      if (Math.abs(e.cx - cx) < 360 && Math.abs(e.cy - cy) < 240) e.update(this);
      else {
        e.prevX = e.x;
        e.prevY = e.y;
      }
    }
    for (const a of this.arrows) a.update(this);
    for (const k of this.pickups) k.update(this);
    for (const c of this.checkpoints) c.update(this);
    if (this.goal) this.goal.update(this);

    if (live && !p.dead) this.resolveCombat();

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.arrows = this.arrows.filter((a) => !a.dead);
    this.pickups = this.pickups.filter((k) => !k.dead);

    // The false wall fades while the player is inside or touching it.
    const inSecret = p.y < 10 * TILE && p.cx < 130 * TILE && p.cx > ZONE_CASTLE_X * TILE;
    const target = L.overlapsFake(p) || inSecret ? 0.12 : 1;
    this.fakeAlpha += (target - this.fakeAlpha) * 0.1;

    this.ambient();
    Particles.update(L);
    this.updateCamera();
  },

  resolveCombat() {
    const p = this.player;
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    if (p.attackActive()) {
      const box = p.attackBox();
      let landed = false;
      for (const e of this.enemies) {
        if (e.dead || p.hitThisSwing.has(e) || !overlap(box, e)) continue;
        p.hitThisSwing.add(e);
        e.hurt(this, PLAYER.ATTACK_DAMAGE, p.facing);
        landed = true;
      }
      for (const a of this.arrows) {
        if (!a.friendly && overlap(box, a)) a.parry(this);
      }
      if (landed) {
        Sound.play('hit');
        this.hitstop(PLAYER.HITSTOP_FRAMES);
        this.shake(PLAYER.HIT_SHAKE);
        // A little air bounce when you hit something mid-jump.
        if (!p.grounded && p.vy > -1) p.vy = Math.min(p.vy, -2);
      }
    }

    const body = { x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 2 };
    for (const e of this.enemies) {
      if (e.dead || !overlap(body, e)) continue;
      if (p.invuln === 0) {
        p.hurt(this, e.damage, e.cx);
        if (e.onTouchPlayer) e.onTouchPlayer();
      }
    }

    for (const a of this.arrows) {
      if (a.dead) continue;
      if (a.friendly) {
        for (const e of this.enemies) {
          if (!e.dead && overlap(a, e)) {
            e.hurt(this, 2, Math.sign(a.vx));
            a.dead = true;
            Sound.play('hit');
            break;
          }
        }
      } else if (overlap(body, a) && p.invuln === 0) {
        p.hurt(this, 1, a.cx - a.vx);
        a.dead = true;
      }
    }
  },

  // Ambient particles: leaves and fireflies in the forest, embers elsewhere,
  // sparks above every torch on screen.
  ambient() {
    const c = this.cam;
    const z = this.zoneMix(c.x + VIEW_W / 2);
    const R = Particles.rand;
    if (z < 1.2 && Math.random() < 0.09 * (1.2 - z)) Particles.leaf(c.x + R(0, VIEW_W + 60), c.y - 4);
    if (z < 0.8 && Math.random() < 0.04) Particles.firefly(c.x + R(0, VIEW_W), c.y + R(30, VIEW_H));
    if (z > 0.6 && Math.random() < 0.05 + Math.max(0, z - 1) * 0.12) {
      Particles.ember(c.x + R(0, VIEW_W), c.y + VIEW_H + 4);
    }
    for (const l of this.level.lights) {
      if (l.flicker < 0) continue;
      if (l.x < c.x - 16 || l.x > c.x + VIEW_W + 16 || l.y < c.y - 16 || l.y > c.y + VIEW_H + 16) continue;
      if (Math.random() < 0.06) Particles.torchSpark(l.x, l.y - 4);
    }
  },

  // ---- Render ----
  render(alpha) {
    Renderer.clear(PAL.ink);
    const c = this.cam;
    const cam = {
      x: c.prevX + (c.x - c.prevX) * alpha,
      y: c.prevY + (c.y - c.prevY) * alpha,
    };
    if (this.shakeMag > 0) {
      cam.x += Math.round((Math.random() * 2 - 1) * this.shakeMag);
      cam.y += Math.round((Math.random() * 2 - 1) * this.shakeMag);
    }
    cam.x = Math.round(cam.x);
    cam.y = Math.round(cam.y);

    this.drawWorld(cam, alpha);

    switch (this.state) {
      case 'title':
        this.drawTitle();
        break;
      case 'playing':
      case 'dying':
        this.drawHUD();
        break;
      case 'paused':
        this.drawHUD();
        Renderer.fade(0.55);
        Renderer.text('PAUSED', VIEW_W / 2, 70, { align: 'center', scale: 2, color: PAL.gold2, under: PAL.fire1 });
        Renderer.text('ESC TO RESUME   M TO MUTE', VIEW_W / 2, 98, { align: 'center', color: '#b0a0c8' });
        break;
      case 'gameover':
        this.drawGameOver();
        break;
      case 'victory':
        this.drawHUD();
        this.drawVictory();
        break;
    }

    // Pit respawn: fade to black and back.
    if (this.respawnTimer > 0) {
      const k = this.respawnTimer > 25 ? (50 - this.respawnTimer) / 25 : this.respawnTimer / 25;
      Renderer.fade(k);
    }
    if (this.fadeIn > 0) {
      Renderer.fade(this.fadeIn);
      this.fadeIn = Math.max(0, this.fadeIn - 0.04);
    }
    Renderer.present();
  },

  drawWorld(cam, alpha) {
    const L = this.level;
    Renderer.drawBackground(cam);
    Renderer.beginWorld(cam);
    Renderer.drawStaticWorld(cam);
    Renderer.drawAnimatedBack(cam, L, this.time);

    if (this.state !== 'title') {
      for (const c of this.checkpoints) c.draw();
      if (this.goal) this.goal.draw();
      for (const k of this.pickups) k.draw();
      for (const e of this.enemies) e.draw(alpha);
      for (const a of this.arrows) a.draw(alpha);
      if (!this.player.dead) this.player.draw(alpha, this.time);
    }
    Renderer.drawParticles(alpha);
    Renderer.drawWorldFront(cam, L, this.time, this.fakeAlpha);
    Renderer.endWorld();

    const midX = cam.x + VIEW_W / 2;
    Renderer.drawLighting(cam, this.collectLights(midX), this.darknessAt(midX), this.time);
    Renderer.drawForeground(cam, this.foliageAt(midX));
    Renderer.drawVignette();
  },

  collectLights(midX) {
    const lights = this.level.lights.slice();
    if (this.state === 'title') return lights;
    const p = this.player;
    if (!p.dead) {
      // The hero carries a faint glow that matters in the castle.
      const z = this.zoneMix(midX);
      lights.push({ x: p.cx, y: p.y + 6, r: 40 + z * 14, color: '255,220,180', flicker: -1, intensity: 0.08 });
    }
    for (const e of this.enemies) if (e.light) lights.push(e.light());
    for (const k of this.pickups) if (k.light) lights.push(k.light());
    for (const c of this.checkpoints) {
      const l = c.light();
      if (l) lights.push(l);
    }
    if (this.goal) lights.push(this.goal.light());
    return lights;
  },

  drawHUD() {
    Renderer.drawHUD({
      hp: this.player.hp,
      maxHp: PLAYER.MAX_HP,
      gems: this.gems,
      totalGems: this.totalGems,
      relic: this.hasRelic,
      muted: Sound.isMuted(),
      time: this.time,
      hurtFlash: this.hurtFlash,
      gemPulse: this.gemPulse,
    });
    for (const m of this.messages) {
      const inA = Math.min(1, m.t / 15);
      const outA = Math.min(1, (m.frames - m.t) / 20);
      const a = Math.min(inA, outA);
      const slide = Math.round((1 - inA) * -6);
      const ctx = Renderer.ctx;
      ctx.fillStyle = `rgba(8,4,16,${0.55 * a})`;
      ctx.fillRect(0, 36 + slide, VIEW_W, m.sub ? 26 : 16);
      Renderer.text(m.title, VIEW_W / 2, 40 + slide, { align: 'center', color: PAL.gold2, alpha: a });
      if (m.sub) Renderer.text(m.sub, VIEW_W / 2, 51 + slide, { align: 'center', color: '#c0b0d8', alpha: a });
    }
  },

  drawTitle() {
    const ctx = Renderer.ctx;
    const t = this.time;
    Renderer.fade(0.35);
    const g = ctx.createLinearGradient(0, 30, 0, 110);
    g.addColorStop(0, 'rgba(8,4,16,0)');
    g.addColorStop(0.5, 'rgba(8,4,16,0.55)');
    g.addColorStop(1, 'rgba(8,4,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 30, VIEW_W, 80);

    const y = 46 + Math.round(Math.sin(t * 0.04) * 2);
    Renderer.text('EMBERFALL', VIEW_W / 2, y, { align: 'center', scale: 3, color: PAL.gold2, under: PAL.fire1 });
    Renderer.text('A TALE OF THE HOLLOW CROWN', VIEW_W / 2, y + 28, { align: 'center', color: '#c8a8d8' });

    if (Math.floor(t / 30) % 2 === 0) {
      Renderer.text('PRESS ENTER TO START', VIEW_W / 2, 118, { align: 'center', color: PAL.white });
    }
    const hint = '#8a7aa8';
    Renderer.text('ARROWS/WASD MOVE   SPACE JUMP', VIEW_W / 2, 146, { align: 'center', color: hint });
    Renderer.text('X/J ATTACK   M MUTE   ESC PAUSE', VIEW_W / 2, 156, { align: 'center', color: hint });
  },

  drawGameOver() {
    const k = Math.min(1, this.stateTime / 40);
    Renderer.fade(0.7 * k, '20,4,10');
    Renderer.text('YOU HAVE FALLEN', VIEW_W / 2, 62, { align: 'center', scale: 2, color: PAL.crimson2, under: PAL.crimson1, alpha: k });
    Renderer.text('GEMS ' + this.gems + '/' + this.totalGems + '   FOES SLAIN ' + this.kills, VIEW_W / 2, 92, {
      align: 'center', color: '#c0a0b0', alpha: k,
    });
    if (this.stateTime > 40 && Math.floor(this.time / 30) % 2 === 0) {
      Renderer.text('PRESS ENTER TO RISE AGAIN', VIEW_W / 2, 120, { align: 'center' });
    }
  },

  drawVictory() {
    const k = Math.min(1, Math.max(0, this.stateTime - 30) / 40);
    if (k <= 0) return;
    Renderer.fade(0.6 * k);
    Renderer.text('THE CROWN IS RECLAIMED', VIEW_W / 2, 44, { align: 'center', scale: 2, color: PAL.gold2, under: PAL.fire1, alpha: k });
    const secs = Math.floor(this.playTime / 60);
    const time = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    const rows = [
      ['GEMS', this.gems + '/' + this.totalGems],
      ['RELIC', this.hasRelic ? 'FOUND' : 'HIDDEN STILL...'],
      ['FOES SLAIN', String(this.kills)],
      ['FALLS', String(this.deaths)],
      ['TIME', time],
    ];
    rows.forEach(([a, b], i) => {
      Renderer.text(a, VIEW_W / 2 - 70, 74 + i * 11, { color: '#b0a0c8', alpha: k });
      Renderer.text(b, VIEW_W / 2 + 70, 74 + i * 11, { align: 'right', color: PAL.white, alpha: k });
    });
    if (this.stateTime > 90 && Math.floor(this.time / 30) % 2 === 0) {
      Renderer.text('PRESS ENTER TO PLAY AGAIN', VIEW_W / 2, 140, { align: 'center' });
    }
  },
};

// ---- Fixed timestep loop ------------------------------------------------------
(function boot() {
  Game.init();
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(250, now - last); // clamp so a background tab doesn't spiral
    last = now;
    while (acc >= STEP_MS) {
      Game.update();
      Input.endFrame();
      acc -= STEP_MS;
    }
    Game.render(acc / STEP_MS);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
