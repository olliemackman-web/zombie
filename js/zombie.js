import * as THREE from 'three';
import { cloneModel } from './assets.js';
import { Animator } from './animator.js';

export const ZOMBIE_TYPES = {
  walker: {
    model: 'Zombie_Basic',
    hp: 75,
    speed: 1.7,
    damage: 12,
    reach: 1.55,
    attackAnim: 'Idle_Attack',
    attackTime: 1.1,
    hitTime: 0.5,
    moveAnim: 'Walk',
    moveAnimSpeed: 1.0,
    radius: 0.45,
    center: 0.95,
    height: 1.45,
    score: 1,
  },
  runner: {
    model: 'Zombie_Basic',
    hp: 45,
    speed: 4.2,
    damage: 9,
    reach: 1.5,
    attackAnim: 'Punch',
    attackTime: 0.75,
    hitTime: 0.35,
    moveAnim: 'Run',
    moveAnimSpeed: 1.15,
    radius: 0.42,
    center: 0.95,
    height: 1.45,
    score: 2,
  },
  husk: {
    model: 'Zombie_Ribcage',
    hp: 38,
    speed: 2.5,
    damage: 8,
    reach: 1.4,
    attackAnim: 'Jump',
    attackTime: 0.9,
    hitTime: 0.45,
    moveAnim: 'Walk',
    moveAnimSpeed: 1.6,
    radius: 0.35,
    center: 0.55,
    height: 1.1,
    score: 1,
  },
};

let nextId = 1;

export class Zombie {
  constructor(type, pos) {
    const def = ZOMBIE_TYPES[type];
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.radius = def.radius;
    this.speed = def.speed * (0.9 + Math.random() * 0.25);
    this.dead = false;
    this.remove = false;
    this.deathT = 0;
    this.state = 'chase';
    this.attackT = 0;
    this.attackHitDone = false;
    this.attackCooldown = Math.random() * 0.5;
    this.staggerT = 0;
    this.target = null;
    this.push = new THREE.Vector3(); // separation force accumulated by the game
    this.knock = new THREE.Vector3();

    const { scene, animations } = cloneModel(def.model);
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.model = scene;
    this.root.add(scene);
    this.anim = new Animator(scene, animations);
    this.anim.play(def.moveAnim, { speed: def.moveAnimSpeed * (0.9 + Math.random() * 0.2) });
    this.facing = Math.random() * Math.PI * 2;
  }

  get pos() {
    return this.root.position;
  }
  get alive() {
    return !this.dead;
  }

  /** Center-of-mass point for hit tests. */
  hitPoint() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.def.center, this.pos.z);
  }

  takeDamage(n, knockDir = null, knockForce = 0) {
    if (this.dead) return false;
    this.hp -= n;
    if (knockDir && knockForce > 0) {
      this.knock.addScaledVector(knockDir, knockForce);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.state = 'dead';
      this.anim.play('Death', { loop: false, fade: 0.1 });
      return true;
    }
    // Stagger on big hits or randomly on small ones
    if (this.state !== 'attack' && (n >= 25 || Math.random() < 0.35)) {
      this.state = 'stagger';
      this.staggerT = 0.35;
      this.anim.play('HitReact', { loop: false, force: true, fade: 0.06, speed: 1.6 });
    }
    return false;
  }

  /**
   * @param {number} dt
   * @param {Array<{pos:THREE.Vector3, alive:boolean, radius:number, takeDamage:Function, isPlayer:boolean}>} targets
   * @param {import('./world.js').World} world
   */
  update(dt, targets, world) {
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 2.6) this.root.position.y -= dt * 0.5; // sink into the ground
      if (this.deathT > 4.5) this.remove = true;
      this.anim.update(dt);
      return;
    }

    // Pick a target: prefer the player unless the companion is much closer.
    let best = null;
    let bestScore = Infinity;
    for (const t of targets) {
      if (!t.alive) continue;
      const d = this.pos.distanceTo(t.pos);
      const score = t.isPlayer ? d * 0.75 : d;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    this.target = best;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const def = this.def;
    const vel = new THREE.Vector3();

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
    } else if (this.state === 'attack') {
      this.attackT += dt;
      if (best) this.#face(best.pos, dt, 8);
      if (!this.attackHitDone && this.attackT >= def.hitTime) {
        this.attackHitDone = true;
        if (best && this.pos.distanceTo(best.pos) < def.reach + best.radius + 0.5) {
          best.takeDamage(def.damage);
        }
      }
      if (this.attackT >= def.attackTime) {
        this.state = 'chase';
        this.attackCooldown = 0.5 + Math.random() * 0.5;
      }
    } else if (best) {
      const toT = new THREE.Vector3().subVectors(best.pos, this.pos);
      toT.y = 0;
      const d = toT.length();
      if (d < def.reach + best.radius) {
        if (this.attackCooldown <= 0) {
          this.state = 'attack';
          this.attackT = 0;
          this.attackHitDone = false;
          const dur = this.anim.duration(def.attackAnim) || 1;
          this.anim.play(def.attackAnim, { loop: false, force: true, fade: 0.1, speed: dur / def.attackTime });
        } else {
          this.anim.play('Idle', { speed: 1.2 });
        }
        this.#face(best.pos, dt, 8);
      } else {
        toT.normalize();
        vel.copy(toT).multiplyScalar(this.speed);
        this.anim.play(def.moveAnim, { speed: def.moveAnimSpeed });
        this.#face(best.pos, dt, 6);
      }
    }

    // separation push (set by the game each frame) + knockback decay
    vel.add(this.push);
    this.push.set(0, 0, 0);
    vel.add(this.knock);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));

    this.pos.addScaledVector(vel, dt);
    world.resolve(this.pos, this.radius);
    this.pos.y = 0;
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
