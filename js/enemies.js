// Enemies and their projectiles. Every enemy flashes white when hit, gets
// knocked back, and bursts into particles on death.
class Enemy {
  constructor(x, y, w, h, hp) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = w;
    this.h = h;
    this.vx = 0;
    this.vy = 0;
    this.hp = hp;
    this.flash = 0;
    this.knock = 0;
    this.facing = -1;
    this.dead = false;
    this.damage = 1;
    this.colors = ['#ffffff'];
    this.t = Math.floor(Math.random() * 100);
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  get bottom() {
    return this.y + this.h;
  }

  beginUpdate() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.knock > 0) this.knock--;
  }

  // Interpolated position for drawing.
  lerpPos(alpha) {
    return [this.prevX + (this.x - this.prevX) * alpha, this.prevY + (this.y - this.prevY) * alpha];
  }

  hurt(game, dmg, dir) {
    this.hp -= dmg;
    this.flash = 8;
    this.knock = 14;
    this.vx = dir * PLAYER.ATTACK_KNOCKBACK;
    this.vy = Math.min(this.vy, -2);
    this.facing = -dir;
    Particles.hitSpark(this.cx, this.cy, dir);
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    this.dead = true;
    Particles.deathBurst(this.cx, this.cy, this.colors);
    Sound.play('enemyDie');
    game.shake(4);
    game.onEnemyKilled(this);
  }

  applyGravity(g = 0.3, max = 6) {
    this.vy = Math.min(this.vy + g, max);
  }

  // Ground enemies stop at ledges rather than walking off them.
  groundAhead(level, dir) {
    const ax = dir > 0 ? this.x + this.w + 1 : this.x - 1;
    const ty = Math.floor((this.bottom + 2) / TILE);
    const tx = Math.floor(ax / TILE);
    return level.isSolid(tx, ty) || level.get(tx, ty) === T.PLATFORM;
  }

  sprite(s) {
    const left = this.facing < 0;
    if (this.flash > 0 && this.flash % 4 < 3) return left ? s.lw : s.rw;
    return left ? s.l : s.r;
  }
}

// ---- Slime: hops toward you ------------------------------------------------
class Slime extends Enemy {
  constructor(x, y) {
    super(x, y, 12, 10, 2);
    this.colors = ['#5cc068', '#2e7a4a', '#d0f8b8', '#2e7a4a'];
    this.hopTimer = 40 + Math.floor(Math.random() * 60);
    this.sx = 1;
    this.sy = 1;
    this.grounded = false;
  }

  update(game) {
    this.beginUpdate();
    const level = game.level;
    const player = game.player;
    const dx = player.cx - this.cx;
    const near = Math.abs(dx) < 170 && Math.abs(player.cy - this.cy) < 90;

    if (this.grounded && this.knock === 0) {
      this.vx *= 0.6;
      this.hopTimer--;
      // Wind-up squash just before the hop.
      if (this.hopTimer < 12) {
        this.sx += (1.3 - this.sx) * 0.3;
        this.sy += (0.7 - this.sy) * 0.3;
      }
      if (this.hopTimer <= 0) {
        const dir = near ? Math.sign(dx) || 1 : (Math.random() < 0.5 ? -1 : 1);
        this.facing = dir;
        const big = near && Math.random() < 0.4;
        this.vy = big ? -5 : -3.6;
        this.vx = near ? dir * (big ? 1.2 : 1.5) : 0;
        this.sx = 0.7;
        this.sy = 1.4;
        this.grounded = false;
        this.hopTimer = near ? 50 + Math.floor(Math.random() * 30) : 90 + Math.floor(Math.random() * 80);
        if (near) Sound.play('slimeHop');
      }
    } else if (this.knock > 0) {
      this.vx *= 0.9;
    }

    this.applyGravity(0.28);
    const fall = this.vy;
    const res = level.move(this);
    if (res.bottom) {
      if (!this.grounded && fall > 1.5) {
        this.sx = 1.45;
        this.sy = 0.6;
        Particles.landDust(this.cx, this.bottom, 0.2);
      }
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (res.left || res.right) this.vx = -this.vx * 0.3;

    this.sx += (1 - this.sx) * 0.15;
    this.sy += (1 - this.sy) * 0.15;
    if (this.y > level.pxH) this.dead = true;
  }

  draw(alpha) {
    const [x, y] = this.lerpPos(alpha);
    const wobble = this.grounded ? Math.sin(this.t * 0.15) * 0.04 : 0;
    Renderer.drawScaled(this.sprite(Renderer.sprites.slime), x + this.w / 2, y + this.h + 1, this.sx + wobble, this.sy - wobble);
  }
}

// ---- Skeleton archer: holds position and shoots ------------------------------
class Skeleton extends Enemy {
  constructor(x, y) {
    super(x, y, 10, 18, 3);
    this.colors = ['#ddd4bc', '#9a9280', '#ddd4bc', '#1a1424', '#ff4a30'];
    this.homeX = x;
    this.patrolDir = Math.random() < 0.5 ? -1 : 1;
    this.state = 'patrol';
    this.stateTimer = 60;
    this.grounded = false;
  }

  update(game) {
    this.beginUpdate();
    const level = game.level;
    const player = game.player;
    const dx = player.cx - this.cx;
    const dy = player.cy - this.cy;
    const inRange = Math.abs(dx) < 190 && Math.abs(dy) < 56 && !player.dead;

    if (this.knock > 0) {
      this.vx *= 0.88;
    } else if (this.state === 'patrol') {
      this.vx = this.patrolDir * 0.35;
      this.facing = this.patrolDir;
      const far = Math.abs(this.x - this.homeX) > 28;
      if (far && Math.sign(this.x - this.homeX) === this.patrolDir) this.patrolDir *= -1;
      if (!this.groundAhead(level, this.patrolDir)) this.patrolDir *= -1;
      if (inRange) {
        this.state = 'cooldown';
        this.stateTimer = 30;
      }
    } else {
      this.vx = 0;
      this.facing = Math.sign(dx) || this.facing;
      this.stateTimer--;
      if (this.state === 'cooldown' && this.stateTimer <= 0) {
        if (inRange) {
          this.state = 'aim';
          this.stateTimer = 34;
          Sound.play('bowDraw');
        } else {
          this.state = 'patrol';
        }
      } else if (this.state === 'aim' && this.stateTimer <= 0) {
        game.arrows.push(new Arrow(this.cx + this.facing * 8, this.y + 8, this.facing));
        Sound.play('arrow');
        this.state = 'cooldown';
        this.stateTimer = 80 + Math.floor(Math.random() * 40);
      }
    }

    this.applyGravity(0.35);
    const res = level.move(this);
    this.grounded = res.bottom;
    if ((res.left || res.right) && this.state === 'patrol') this.patrolDir *= -1;
    if (this.y > level.pxH) this.dead = true;
  }

  hurt(game, dmg, dir) {
    super.hurt(game, dmg, dir);
    this.vy = -1.5;
    // Getting hit interrupts a shot.
    if (this.state === 'aim') {
      this.state = 'cooldown';
      this.stateTimer = 40;
    }
  }

  draw(alpha) {
    const [x, y] = this.lerpPos(alpha);
    const S = Renderer.sprites;
    const aiming = this.state === 'aim';
    const img = this.sprite(aiming ? S.skeletonAim : S.skeleton);
    // Patrol gait: a 1px bob.
    const bob = this.state === 'patrol' && Math.floor(this.t / 10) % 2 ? 1 : 0;
    // Tremble just before release as a tell.
    const shake = aiming && this.stateTimer < 10 ? (this.t % 2 ? 1 : -1) * 0.6 : 0;
    Renderer.draw(img, x + this.w / 2 - 8 + shake, y + this.h + 1 - 20 + bob);
  }
}

// ---- Arrow: can be parried back with the sword ------------------------------
class Arrow {
  constructor(x, y, dir) {
    this.w = 10;
    this.h = 3;
    this.x = this.prevX = x - this.w / 2;
    this.y = this.prevY = y;
    this.vx = dir * 3.2;
    this.vy = 0;
    this.life = 220;
    this.dead = false;
    this.friendly = false; // true once reflected by the player
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  update(game) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;
    const tipX = this.vx > 0 ? this.x + this.w : this.x;
    if (game.level.isSolidAt(tipX, this.cy) || --this.life <= 0) {
      this.dead = true;
      Particles.arrowBreak(tipX, this.cy);
    }
  }

  parry(game) {
    this.vx = -this.vx * 1.4;
    this.friendly = true;
    this.life = 120;
    Particles.hitSpark(this.cx, this.cy, Math.sign(this.vx));
    Sound.play('parry');
    game.hitstop(3);
    game.shake(2);
  }

  draw(alpha) {
    const x = this.prevX + (this.x - this.prevX) * alpha;
    const y = this.prevY + (this.y - this.prevY) * alpha;
    const s = Renderer.sprites.arrow;
    Renderer.draw(this.vx > 0 ? s.r : s.l, x, y);
    if (this.friendly) {
      const ctx = Renderer.ctx;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,180,255,0.6)';
      ctx.fillRect(Math.round(x), Math.round(y), this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// ---- Wisp: drifts through walls and chases ----------------------------------
class Wisp extends Enemy {
  constructor(x, y) {
    super(x, y, 10, 10, 2);
    this.colors = ['#ffffff', '#b0f0ff', '#5aa8f0', '#4a3ec0'];
    this.homeX = x;
    this.homeY = y;
    this.retreat = 0;
  }

  update(game) {
    this.beginUpdate();
    const player = game.player;
    const dx = player.cx - this.cx;
    const dy = player.cy - 2 - this.cy;
    const dist = Math.hypot(dx, dy);
    const chasing = dist < 150 && !player.dead;

    if (this.knock > 0) {
      this.vx *= 0.9;
      this.vy *= 0.9;
    } else if (this.retreat > 0) {
      this.retreat--;
      this.vx += (-Math.sign(dx) * 1.2 - this.vx) * 0.08;
      this.vy += (-0.6 - this.vy) * 0.08;
    } else if (chasing) {
      const ax = (dx / (dist || 1)) * 0.06;
      const ay = (dy / (dist || 1)) * 0.06;
      this.vx += ax;
      this.vy += ay + Math.sin(this.t * 0.08) * 0.03;
      const sp = Math.hypot(this.vx, this.vy);
      const max = 1.15;
      if (sp > max) {
        this.vx *= max / sp;
        this.vy *= max / sp;
      }
    } else {
      // Drift lazily around home.
      const hx = this.homeX + Math.sin(this.t * 0.02) * 20 - this.x;
      const hy = this.homeY + Math.sin(this.t * 0.05) * 6 - this.y;
      this.vx += (hx * 0.01 - this.vx) * 0.05;
      this.vy += (hy * 0.01 - this.vy) * 0.05;
    }
    if (Math.abs(this.vx) > 0.05) this.facing = Math.sign(this.vx);
    this.x += this.vx;
    this.y += this.vy;
    if (this.t % 3 === 0) Particles.wispTrail(this.cx, this.cy + 2);
  }

  // After touching the player, back off for a moment instead of sticking.
  onTouchPlayer() {
    this.retreat = 70;
  }

  hurt(game, dmg, dir) {
    super.hurt(game, dmg, dir);
    this.vx = dir * 4;
    this.vy = -1;
  }

  draw(alpha) {
    const [x, y] = this.lerpPos(alpha);
    const frames = Renderer.sprites.wisp;
    const f = frames[Math.floor(this.t / 6) % frames.length];
    const bob = Math.round(Math.sin(this.t * 0.1) * 1.5);
    Renderer.draw(this.sprite(f), x + this.w / 2 - 9, y + this.h / 2 - 11 + bob);
  }

  light() {
    return { x: this.cx, y: this.cy, r: 46, color: '110,170,255', flicker: this.t * 0.1, intensity: 0.35 };
  }
}

function createEnemy(spawn) {
  const px = spawn.tx * TILE + TILE / 2;
  const floor = spawn.row * TILE;
  switch (spawn.type) {
    case 'slime': return new Slime(px - 6, floor - 10);
    case 'skeleton': return new Skeleton(px - 5, floor - 18);
    case 'wisp': return new Wisp(px - 5, spawn.row * TILE);
    default: return null;
  }
}
