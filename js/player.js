// ============================================================================
//  GAME FEEL KNOBS: tweak these and reload. Units are pixels and frames
//  at a fixed 60 updates per second. One tile is 16px.
// ============================================================================
const PLAYER = {
  // Health
  MAX_HP: 5,

  // Running
  RUN_SPEED: 2.0, // top horizontal speed
  GROUND_ACCEL: 0.34, // speed gained per frame while holding a direction
  GROUND_FRICTION: 0.3, // speed lost per frame when not holding a direction
  TURN_BOOST: 1.6, // accel multiplier when reversing direction (snappier turns)
  AIR_ACCEL: 0.24,
  AIR_FRICTION: 0.06,

  // Jumping
  GRAVITY: 0.35,
  FALL_GRAVITY_MULT: 1.25, // heavier on the way down: less floaty
  APEX_GRAVITY_MULT: 0.55, // lighter near the apex while jump is held: hang time
  APEX_THRESHOLD: 0.9, // |vy| below this counts as the apex
  MAX_FALL_SPEED: 6.0,
  JUMP_VELOCITY: 6.2, // ~3.4 tiles of height with a full hold
  DOUBLE_JUMP_VELOCITY: 5.6,
  JUMP_CUT: 0.45, // upward speed is multiplied by this when jump is released early
  COYOTE_FRAMES: 6, // grace frames to jump after walking off a ledge
  JUMP_BUFFER_FRAMES: 7, // a jump pressed this many frames before landing still fires

  // Sword
  ATTACK_DURATION: 16, // total frames of a swing
  ATTACK_ACTIVE_START: 3, // hitbox becomes live on this frame...
  ATTACK_ACTIVE_END: 9, // ...and stays live until this one
  ATTACK_COOLDOWN: 3, // frames after a swing before the next can start
  ATTACK_RANGE: 22, // reach in front of the body
  ATTACK_HEIGHT: 22,
  ATTACK_DAMAGE: 1,
  ATTACK_KNOCKBACK: 3.2, // speed applied to enemies you hit
  GROUND_ATTACK_DRAG: 0.82, // ground speed is multiplied by this while swinging

  // Getting hurt
  INVULN_FRAMES: 90,
  HURT_STUN_FRAMES: 16,
  HURT_KNOCKBACK_X: 2.6,
  HURT_KNOCKBACK_Y: 3.6,

  // Juice
  HITSTOP_FRAMES: 4, // world freeze when your sword connects
  HIT_SHAKE: 3, // screen shake when your sword connects
  HURT_SHAKE: 7,
  LAND_SHAKE_SPEED: 5.4, // landings faster than this shake the screen
  SQUASH_RECOVERY: 0.22, // how fast squash/stretch springs back (0..1)
};
// ============================================================================

class Player {
  constructor(x, y) {
    this.w = 10;
    this.h = 14;
    this.hp = PLAYER.MAX_HP;
    this.canDoubleJump = false; // unlocked at the first checkpoint
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false; // true while a jump can still be cut short
    this.usedDoubleJump = false;
    this.dropThrough = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.hitThisSwing = new Set();
    this.invuln = 0;
    this.stun = 0;
    this.sx = 1; // squash/stretch
    this.sy = 1;
    this.animDist = 0;
    this.dustTimer = 0;
    this.dead = false;
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

  attackBox() {
    const P = PLAYER;
    return {
      x: this.facing > 0 ? this.cx - 2 : this.cx - P.ATTACK_RANGE + 2,
      y: this.bottom - 8 - P.ATTACK_HEIGHT / 2,
      w: P.ATTACK_RANGE,
      h: P.ATTACK_HEIGHT,
    };
  }

  attackActive() {
    return this.attackTimer >= PLAYER.ATTACK_ACTIVE_START && this.attackTimer <= PLAYER.ATTACK_ACTIVE_END;
  }

  update(game) {
    const P = PLAYER;
    const level = game.level;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.invuln > 0) this.invuln--;
    if (this.stun > 0) this.stun--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.dropThrough > 0) this.dropThrough--;

    const ax = this.stun > 0 ? 0 : Input.axisX();

    // --- Horizontal movement: acceleration and friction ---
    const accel = this.grounded ? P.GROUND_ACCEL : P.AIR_ACCEL;
    const friction = this.grounded ? P.GROUND_FRICTION : P.AIR_FRICTION;
    if (ax !== 0) {
      const turning = Math.sign(this.vx) !== 0 && Math.sign(this.vx) !== ax;
      this.vx += ax * accel * (turning ? P.TURN_BOOST : 1);
      if (Math.abs(this.vx) > P.RUN_SPEED) {
        // Knockback can push past top speed; bleed it off instead of clamping.
        this.vx = Math.sign(this.vx) * Math.max(P.RUN_SPEED, Math.abs(this.vx) - friction);
      }
      if (this.attackTimer === 0) this.facing = ax;
      if (turning && this.grounded && Math.abs(this.vx) > 0.8) {
        Particles.runDust(this.cx, this.bottom, -ax);
      }
    } else {
      const s = Math.abs(this.vx);
      this.vx = s <= friction ? 0 : this.vx - Math.sign(this.vx) * friction;
    }
    if (this.attackTimer > 0 && this.grounded) this.vx *= P.GROUND_ATTACK_DRAG;

    // --- Jumping: buffer, coyote time, double jump, drop-through ---
    if (Input.pressed('jump') && this.stun === 0) this.jumpBuffer = P.JUMP_BUFFER_FRAMES;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;

    if (this.jumpBuffer > 0) {
      if (this.grounded && Input.down('down') && this.onPlatform(level)) {
        this.dropThrough = 10;
        this.jumpBuffer = 0;
        this.grounded = false;
        this.coyote = 0;
        this.vy = 1;
      } else if (this.grounded || this.coyote > 0) {
        this.jump(game);
      } else if (Input.pressed('jump') && this.canDoubleJump && !this.usedDoubleJump) {
        this.doubleJump(game);
      }
    }

    // Releasing jump early cuts the ascent: variable jump height.
    if (this.jumping && !Input.down('jump') && this.vy < 0) {
      this.vy *= P.JUMP_CUT;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    // --- Gravity ---
    let g = P.GRAVITY;
    if (this.vy > 0) g *= P.FALL_GRAVITY_MULT;
    else if (Input.down('jump') && Math.abs(this.vy) < P.APEX_THRESHOLD) g *= P.APEX_GRAVITY_MULT;
    this.vy = Math.min(this.vy + g, P.MAX_FALL_SPEED);

    // --- Attack ---
    if (Input.pressed('attack') && this.attackTimer === 0 && this.attackCooldown === 0 && this.stun === 0) {
      this.attackTimer = 1;
      this.hitThisSwing.clear();
      Sound.play('swing');
    } else if (this.attackTimer > 0) {
      this.attackTimer++;
      if (this.attackTimer > P.ATTACK_DURATION) {
        this.attackTimer = 0;
        this.attackCooldown = P.ATTACK_COOLDOWN;
      }
    }
    if (this.attackTimer === P.ATTACK_ACTIVE_START + 1) {
      Particles.swordTrail(this.cx + this.facing * 14, this.bottom - 9, this.facing);
    }

    // --- Move and collide ---
    const wasGrounded = this.grounded;
    const fallSpeed = this.vy;
    const res = level.move(this);
    this.grounded = res.bottom;
    if (res.top) this.jumping = false;

    if (this.grounded) {
      this.coyote = P.COYOTE_FRAMES;
      this.usedDoubleJump = false;
    } else if (this.coyote > 0) {
      this.coyote--;
    }

    if (!wasGrounded && this.grounded) this.land(game, fallSpeed);

    // --- Hazards ---
    if (level.touchesSpike(this)) {
      this.hurt(game, 1, this.cx - this.facing * 8);
      if (this.stun > 0) this.vy = -P.HURT_KNOCKBACK_Y * 1.2;
    }

    // --- Ambient juice ---
    if (this.grounded && Math.abs(this.vx) > 1.2 && ax !== 0) {
      if (++this.dustTimer % 9 === 0) Particles.runDust(this.cx - this.facing * 3, this.bottom, this.facing);
    }
    this.animDist += Math.abs(this.vx);
    this.sx += (1 - this.sx) * P.SQUASH_RECOVERY;
    this.sy += (1 - this.sy) * P.SQUASH_RECOVERY;
  }

  onPlatform(level) {
    const ty = Math.floor((this.bottom + 1) / TILE);
    const tx0 = Math.floor(this.x / TILE);
    const tx1 = Math.floor((this.x + this.w - 0.001) / TILE);
    let platform = false;
    for (let tx = tx0; tx <= tx1; tx++) {
      if (level.isSolid(tx, ty)) return false;
      if (level.get(tx, ty) === T.PLATFORM) platform = true;
    }
    return platform;
  }

  jump() {
    this.vy = -PLAYER.JUMP_VELOCITY;
    this.jumping = true;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sx = 0.7;
    this.sy = 1.35;
    Particles.jumpDust(this.cx, this.bottom);
    Sound.play('jump');
  }

  doubleJump() {
    this.vy = -PLAYER.DOUBLE_JUMP_VELOCITY;
    this.jumping = true;
    this.usedDoubleJump = true;
    this.jumpBuffer = 0;
    this.sx = 0.75;
    this.sy = 1.3;
    Particles.doubleJumpRing(this.cx, this.bottom);
    Sound.play('doubleJump');
  }

  land(game, fallSpeed) {
    const strength = Math.min(1, fallSpeed / PLAYER.MAX_FALL_SPEED);
    this.sx = 1 + 0.45 * strength;
    this.sy = 1 - 0.38 * strength;
    if (fallSpeed > 2) {
      Particles.landDust(this.cx, this.bottom, strength);
      Sound.play('land');
    }
    if (fallSpeed > PLAYER.LAND_SHAKE_SPEED) game.shake(2.5);
  }

  hurt(game, dmg, fromX) {
    if (this.invuln > 0 || this.dead) return;
    const P = PLAYER;
    this.hp -= dmg;
    this.invuln = P.INVULN_FRAMES;
    this.stun = P.HURT_STUN_FRAMES;
    this.attackTimer = 0;
    const dir = this.cx >= fromX ? 1 : -1;
    this.vx = dir * P.HURT_KNOCKBACK_X;
    this.vy = -P.HURT_KNOCKBACK_Y;
    this.jumping = false;
    this.grounded = false;
    game.shake(P.HURT_SHAKE);
    game.hitstop(5);
    game.hurtFlash = 1;
    Particles.hitSpark(this.cx, this.y + 6, dir);
    Sound.play('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      game.playerDied();
    }
  }

  // Interpolated drawing. `alpha` blends between the last two fixed updates.
  draw(alpha, time) {
    const S = Renderer.sprites;
    const ctx = Renderer.ctx;
    const x = this.prevX + (this.x - this.prevX) * alpha;
    const y = this.prevY + (this.y - this.prevY) * alpha;
    const cx = x + this.w / 2;
    const bottom = y + this.h;
    const left = this.facing < 0;

    // Invulnerability flicker (but always show the first hurt frames).
    if (this.invuln > 0 && this.stun === 0 && Math.floor(this.invuln / 3) % 2 === 0) return;

    // Cape tail streaming behind.
    const speed = Math.abs(this.vx) + (this.grounded ? 0 : 1.5);
    const len = Math.round(1 + Math.min(4, speed * 1.6));
    for (let i = 0; i < len; i++) {
      const tx = cx - this.facing * (5 + i);
      const ty = bottom - 9 + Math.round(Math.sin(time * 0.35 - i * 0.9) * (0.4 + i * 0.3)) + (i >> 1);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 5 - (i >> 1));
    }
    for (let i = 0; i < len; i++) {
      const tx = cx - this.facing * (5 + i);
      const ty = bottom - 9 + Math.round(Math.sin(time * 0.35 - i * 0.9) * (0.4 + i * 0.3)) + (i >> 1);
      ctx.fillStyle = i === len - 1 ? '#9a451c' : '#d8742a';
      ctx.fillRect(Math.round(tx), Math.round(ty), 1, 3 - (i >> 1));
    }

    // Pick a frame.
    let legs;
    if (!this.grounded) legs = this.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(this.vx) > 0.25) legs = ['runA', 'runB', 'runC', 'runD'][Math.floor(this.animDist / 8) % 4];
    else legs = 'idle';
    const attacking = this.attackTimer > 0;
    const frame = S.player[legs + (attacking ? 'Atk' : '')];
    const flash = this.stun > PLAYER.HURT_STUN_FRAMES - 6;
    const img = left ? (flash ? frame.lw : frame.l) : flash ? frame.rw : frame.r;

    let sy = this.sy;
    if (legs === 'idle' && !attacking) sy *= 1 + Math.sin(time * 0.07) * 0.035;
    Renderer.drawScaled(img, cx, bottom, this.sx, sy);

    if (attacking) this.drawSword(cx, bottom);
  }

  drawSword(cx, bottom) {
    const S = Renderer.sprites;
    const t = this.attackTimer;
    const left = this.facing < 0;
    const angleIndex = t < 3 ? 0 : t < 4 ? 1 : t < 5 ? 2 : t < 7 ? 3 : t < 10 ? 4 : 5;
    const sword = S.swords[angleIndex];
    const handX = cx + this.facing * 3.5;
    const handY = bottom - 8;
    Renderer.draw(left ? sword.l : sword.r, handX - 16, handY - 16);

    if (t >= PLAYER.ATTACK_ACTIVE_START && t < PLAYER.ATTACK_ACTIVE_START + 6) {
      const f = Math.min(2, Math.floor((t - PLAYER.ATTACK_ACTIVE_START) / 2));
      const slash = S.slashes[f];
      const ox = left ? cx - 2 - 30 : cx + 2 - 10;
      const ctx = Renderer.ctx;
      ctx.globalAlpha = f === 2 ? 0.6 : 0.95;
      Renderer.draw(left ? slash.l : slash.r, ox, bottom - 9 - 18);
      ctx.globalAlpha = 1;
    }
  }
}
