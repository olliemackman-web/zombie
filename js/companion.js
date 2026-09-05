import * as THREE from 'three';
import { cloneModel } from './assets.js';
import { Animator } from './animator.js';
import { ALL_HAND_NODES } from './weapons.js';

const KINDS = {
  dog: {
    name: 'Rex',
    model: 'Characters_GermanShepherd',
    hp: 90,
    speed: 6.2,
    radius: 0.4,
    ranged: false,
    damage: 16,
    reach: 1.35,
    attackTime: 0.7,
    hitTime: 0.35,
    attackCooldown: 0.25,
    engageRange: 13,
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    attack: 'Attack',
    death: 'Death',
  },
  survivor: {
    name: null, // set from character
    hp: 110,
    speed: 4.9,
    radius: 0.42,
    ranged: true,
    damage: 26,
    range: 15,
    holdMin: 3.5,
    holdMax: 7,
    attackCooldown: 0.7,
    engageRange: 17,
    idle: 'Idle_Gun',
    walk: 'Walk_Gun',
    run: 'Run_Gun',
    death: 'Death',
  },
};

export class Companion {
  /**
   * @param {{kind:'dog'|'survivor', charName?:string, onShoot?:Function}} opts
   */
  constructor(opts) {
    const def = { ...KINDS[opts.kind] };
    if (opts.kind === 'survivor') {
      def.model = opts.charName === 'Lis' ? 'Characters_Lis' : 'Characters_Matt';
      def.name = opts.charName;
    }
    this.kind = opts.kind;
    this.def = def;
    this.name = def.name;
    this.onShoot = opts.onShoot;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.radius = def.radius;
    this.downed = false;
    this.attackT = -1;
    this.attackHitDone = false;
    this.cooldown = 0;
    this.facing = 0;
    this.target = null;
    this.isPlayer = false;

    const { scene, animations } = cloneModel(def.model);
    this.root = new THREE.Group();
    this.model = scene;
    this.root.add(scene);
    this.anim = new Animator(scene, animations);
    if (opts.kind === 'survivor') {
      scene.traverse((o) => {
        if (ALL_HAND_NODES.includes(o.name)) o.visible = o.name === 'Pistol';
      });
    }
    this.anim.play(def.idle);
  }

  get pos() {
    return this.root.position;
  }
  get alive() {
    return !this.downed;
  }

  takeDamage(n) {
    if (this.downed) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downed = true;
      this.attackT = -1;
      this.anim.play(this.def.death, { loop: false, fade: 0.1 });
    }
  }

  revive() {
    if (!this.downed) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.4);
      return;
    }
    this.downed = false;
    this.hp = Math.round(this.maxHp * 0.6);
    this.anim.play(this.def.idle, { force: true });
  }

  aimOrigin() {
    return this.pos.clone().add(new THREE.Vector3(0, this.kind === 'dog' ? 0.6 : 1.15, 0));
  }

  update(dt, player, zombies, world) {
    if (this.downed) {
      this.anim.update(dt);
      return;
    }
    const def = this.def;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Nearest living zombie that is reasonably close to the player.
    let target = null;
    let bd = Infinity;
    for (const z of zombies) {
      if (z.dead) continue;
      const dp = z.pos.distanceTo(player.pos);
      if (dp > def.engageRange) continue;
      const d = z.pos.distanceTo(this.pos);
      if (d < bd) {
        bd = d;
        target = z;
      }
    }
    this.target = target;

    const vel = new THREE.Vector3();
    let clip = def.idle;
    let clipSpeed = 1;

    if (this.attackT >= 0) {
      // mid melee swing (dog)
      this.attackT += dt;
      if (target) this.#face(target.pos, dt, 10);
      if (!this.attackHitDone && this.attackT >= def.hitTime) {
        this.attackHitDone = true;
        if (target && !target.dead && target.pos.distanceTo(this.pos) < def.reach + target.radius + 0.5) {
          const dir = new THREE.Vector3().subVectors(target.pos, this.pos).setY(0).normalize();
          target.takeDamage(def.damage, dir, 1.2);
          this.onShoot?.(this, target, 'bite');
        }
      }
      if (this.attackT >= def.attackTime) {
        this.attackT = -1;
        this.cooldown = def.attackCooldown;
      }
      clip = def.attack;
    } else if (target) {
      const toT = new THREE.Vector3().subVectors(target.pos, this.pos).setY(0);
      const d = toT.length();
      toT.normalize();

      if (!def.ranged) {
        if (d < def.reach + target.radius) {
          this.#face(target.pos, dt, 10);
          if (this.cooldown <= 0) {
            this.attackT = 0;
            this.attackHitDone = false;
            const dur = this.anim.duration(def.attack) || 1;
            this.anim.play(def.attack, { loop: false, force: true, fade: 0.08, speed: dur / def.attackTime });
          }
          clip = def.idle;
        } else {
          vel.copy(toT).multiplyScalar(def.speed);
          clip = def.run;
          this.#face(target.pos, dt, 8);
        }
      } else {
        // Ranged: hold a comfortable distance and shoot.
        this.#face(target.pos, dt, 10);
        if (d > def.holdMax) {
          vel.copy(toT).multiplyScalar(def.speed);
          clip = def.run;
        } else if (d < def.holdMin) {
          vel.copy(toT).multiplyScalar(-def.speed * 0.7);
          clip = def.walk;
        }
        if (d <= def.range && this.cooldown <= 0) {
          this.cooldown = def.attackCooldown;
          const dir = new THREE.Vector3().subVectors(target.pos, this.pos).setY(0).normalize();
          target.takeDamage(def.damage, dir, 0.4);
          this.onShoot?.(this, target, 'pistol');
        }
      }
    } else {
      // Follow the player.
      const toP = new THREE.Vector3().subVectors(player.pos, this.pos).setY(0);
      const d = toP.length();
      if (d > 2.6) {
        toP.normalize();
        const fast = d > 6;
        vel.copy(toP).multiplyScalar(fast ? def.speed : def.speed * 0.55);
        clip = fast ? def.run : def.walk;
        clipSpeed = fast ? 1 : 1.1;
        this.#face(player.pos, dt, 8);
      } else if (d > 1.2) {
        this.#face(player.pos, dt, 4);
      }
    }

    // Keep out of the player's space.
    const dp = new THREE.Vector3().subVectors(this.pos, player.pos).setY(0);
    const dd = dp.length();
    const minD = this.radius + player.radius + 0.1;
    if (dd < minD && dd > 1e-4) {
      this.pos.addScaledVector(dp.normalize(), minD - dd);
    }

    this.pos.addScaledVector(vel, dt);
    world.resolve(this.pos, this.radius);
    this.pos.y = 0;

    if (this.attackT < 0) this.anim.play(clip, { speed: clipSpeed });
    this.anim.update(dt);
  }

  #face(target, dt, rate) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let diff = want - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, dt * rate);
    this.model.rotation.y = this.facing;
  }
}
