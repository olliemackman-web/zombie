import * as THREE from 'three';
import { cloneModel } from './assets.js';
import { Animator } from './animator.js';
import { WEAPONS, WEAPON_ORDER, ALL_HAND_NODES } from './weapons.js';

const CHARACTERS = {
  Matt: { model: 'Characters_Matt', hp: 130, speed: 4.6 },
  Lis: { model: 'Characters_Lis', hp: 100, speed: 5.4 },
};

export class Player {
  /**
   * @param {{charName:string, onMelee:Function, onShoot:Function, onWeaponChange:Function}} opts
   */
  constructor(opts) {
    const def = CHARACTERS[opts.charName] || CHARACTERS.Matt;
    this.charName = opts.charName;
    this.onMelee = opts.onMelee;
    this.onShoot = opts.onShoot;
    this.onWeaponChange = opts.onWeaponChange;

    this.maxHp = def.hp;
    this.hp = def.hp;
    this.baseSpeed = def.speed;
    this.radius = 0.42;
    this.dead = false;
    this.deathT = 0;
    this.yaw = 0;
    this.moving = false;
    this.sprinting = false;

    // Weapons
    this.inventory = new Set(['guitar']);
    this.weaponKey = 'guitar';
    this.ammo = {};
    for (const key of WEAPON_ORDER) {
      const w = WEAPONS[key];
      if (w.type === 'gun') this.ammo[key] = { mag: 0, reserve: 0 };
    }
    this.cooldown = 0;
    this.attackT = -1; // time since melee swing started; -1 when idle
    this.meleeHitDone = false;
    this.reloading = false;
    this.reloadT = 0;
    this.hurtT = 0;
    this.regenDelay = 0;

    // Model
    const { scene, animations } = cloneModel(def.model);
    this.root = new THREE.Group();
    this.model = scene;
    this.root.add(scene);
    this.anim = new Animator(scene, animations);
    this.handNodes = {};
    scene.traverse((o) => {
      if (ALL_HAND_NODES.includes(o.name)) this.handNodes[o.name] = o;
    });
    this.#showHandNode(WEAPONS.guitar.node);
    this.anim.play('Idle');
  }

  get pos() {
    return this.root.position;
  }
  get weapon() {
    return WEAPONS[this.weaponKey];
  }
  get alive() {
    return !this.dead;
  }

  owns(key) {
    return this.inventory.has(key);
  }

  #showHandNode(name) {
    for (const [n, o] of Object.entries(this.handNodes)) o.visible = n === name;
  }

  /** Returns true if this was a new weapon, false if converted into ammo. */
  giveWeapon(key) {
    const w = WEAPONS[key];
    if (this.inventory.has(key)) {
      if (w.type === 'gun') this.ammo[key].reserve += w.pickupAmmo;
      return false;
    }
    this.inventory.add(key);
    if (w.type === 'gun') {
      this.ammo[key].mag = w.mag;
      this.ammo[key].reserve = w.startReserve;
    }
    this.switchWeapon(key);
    return true;
  }

  giveAmmo() {
    let got = false;
    for (const key of WEAPON_ORDER) {
      if (WEAPONS[key].type === 'gun' && this.inventory.has(key)) {
        this.ammo[key].reserve += WEAPONS[key].pickupAmmo;
        got = true;
      }
    }
    return got;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  switchWeapon(key) {
    if (!this.inventory.has(key) || key === this.weaponKey) return;
    if (this.attackT >= 0) return; // mid swing
    this.weaponKey = key;
    this.reloading = false;
    this.cooldown = Math.max(this.cooldown, 0.25);
    this.#showHandNode(WEAPONS[key].node);
    this.onWeaponChange?.();
  }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((k) => this.inventory.has(k));
    if (owned.length < 2) return;
    const i = owned.indexOf(this.weaponKey);
    const next = owned[(i + dir + owned.length) % owned.length];
    this.switchWeapon(next);
  }

  takeDamage(n) {
    if (this.dead) return;
    this.hp -= n;
    this.hurtT = 0.5;
    this.regenDelay = 6;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.attackT = -1;
      this.reloading = false;
      this.anim.play('Death', { loop: false, fade: 0.1 });
    }
  }

  startReload() {
    const w = this.weapon;
    if (w.type !== 'gun' || this.reloading) return;
    const a = this.ammo[w.key];
    if (a.mag >= w.mag || a.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = w.reloadTime;
    this.onWeaponChange?.();
  }

  /** World-space point bullets/melee originate from. */
  aimOrigin() {
    return this.pos.clone().add(new THREE.Vector3(0, 1.15, 0));
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt, input, camYaw, world) {
    if (this.dead) {
      this.deathT += dt;
      this.anim.update(dt);
      return;
    }

    this.yaw = camYaw;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

    // slow passive regen after not being hit for a while
    if (this.regenDelay > 0) this.regenDelay -= dt;
    else if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);

    /* ---- weapon switching ---- */
    for (const key of WEAPON_ORDER) {
      if (input.pressed(`Digit${WEAPONS[key].slot}`)) this.switchWeapon(key);
    }
    if (input.pressed('KeyQ') || input.pressed('WheelDown')) this.cycleWeapon(1);
    if (input.pressed('WheelUp')) this.cycleWeapon(-1);
    if (input.pressed('KeyR')) this.startReload();

    /* ---- movement ---- */
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const move = new THREE.Vector3();
    if (input.down('KeyW') || input.down('ArrowUp')) move.add(fwd);
    if (input.down('KeyS') || input.down('ArrowDown')) move.sub(fwd);
    if (input.down('KeyD') || input.down('ArrowRight')) move.add(right);
    if (input.down('KeyA') || input.down('ArrowLeft')) move.sub(right);
    // analog joystick (touch)
    move.addScaledVector(fwd, input.move.y).addScaledVector(right, input.move.x);
    this.moving = move.lengthSq() > 0.01;
    this.sprinting = this.moving && input.down('ShiftLeft') && this.attackT < 0 && !this.reloading;

    if (this.moving) {
      const mag = Math.min(1, move.length());
      move.normalize();
      let speed = this.baseSpeed * mag;
      if (this.sprinting) speed *= 1.55;
      if (this.attackT >= 0) speed *= 0.45;
      if (this.reloading) speed *= 0.8;
      this.pos.addScaledVector(move, speed * dt);
    }
    world.resolve(this.pos, this.radius);
    this.model.rotation.y = this.yaw;

    /* ---- reload ---- */
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = this.weapon;
        const a = this.ammo[w.key];
        const need = w.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.reloading = false;
        this.onWeaponChange?.();
      }
    }

    /* ---- attacking ---- */
    const w = this.weapon;
    if (w.type === 'melee') {
      if (this.attackT >= 0) {
        this.attackT += dt;
        if (!this.meleeHitDone && this.attackT >= w.hitTime) {
          this.meleeHitDone = true;
          this.onMelee?.(w);
        }
        if (this.attackT >= w.cooldown) this.attackT = -1;
      } else if (input.pressed('Mouse0') || input.mouseDown) {
        this.attackT = 0;
        this.meleeHitDone = false;
        const dur = this.anim.duration(w.anim) || 1;
        this.anim.play(w.anim, { loop: false, force: true, fade: 0.08, speed: dur / w.cooldown });
      }
    } else {
      const wantFire = w.auto ? input.mouseDown : input.pressed('Mouse0');
      const a = this.ammo[w.key];
      if (wantFire && this.cooldown <= 0 && !this.reloading) {
        if (a.mag > 0) {
          a.mag--;
          this.cooldown = w.cooldown;
          this.onShoot?.(w);
          this.onWeaponChange?.();
          if (a.mag === 0 && a.reserve > 0) this.startReload();
        } else if (a.reserve > 0) {
          this.startReload();
        } else {
          this.cooldown = 0.3; // dry click
        }
      }
    }

    /* ---- animation ---- */
    if (this.attackT < 0) {
      const gun = w.type === 'gun';
      let clip;
      let speed = 1;
      if (this.moving) {
        clip = gun ? 'Run_Gun' : 'Run';
        speed = this.sprinting ? 1.35 : 0.95;
      } else {
        clip = gun ? 'Idle_Gun' : 'Idle';
      }
      this.anim.play(clip, { speed });
    }

    this.anim.update(dt);
  }
}
