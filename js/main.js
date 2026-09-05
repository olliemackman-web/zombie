import * as THREE from 'three';
import { loadAll } from './assets.js';
import { World, ARENA } from './world.js';
import { Player } from './player.js';
import { Zombie } from './zombie.js';
import { Companion } from './companion.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { ui } from './ui.js';
import { WEAPONS, CHEST_WEAPONS } from './weapons.js';

/* ------------------------------------------------------------ renderer */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 220);
const input = new Input(canvas);
const fx = new FX(scene);
const clock = new THREE.Clock();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* --------------------------------------------------------------- game */
const CAM_DIST = 4.4;
const CAM_SHOULDER = 0.8;
const CAM_HEIGHT = 1.5;

class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.time = 0;
    this.over = false;
    this.kills = 0;
    this.wave = 0;
    this.waveState = 'break';
    this.breakTimer = 2.5;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.zombies = [];
    this.camYaw = Math.PI; // start looking down -Z... camera behind player
    this.camPitch = -0.12;
    this.camPos = new THREE.Vector3();
    this.camForward = new THREE.Vector3(0, 0, 1);
    this.recoil = 0;

    this.world = new World(scene);
    this.world.build();

    this.player = new Player({
      charName: cfg.charName,
      onMelee: (w) => this.#melee(w),
      onShoot: (w) => this.#shoot(w),
      onWeaponChange: () => ui.setWeapon(this.player),
    });
    this.player.isPlayer = true;
    this.player.pos.set(0, 0, 0);
    scene.add(this.player.root);

    this.companion = null;
    if (cfg.companion !== 'none') {
      const other = cfg.charName === 'Matt' ? 'Lis' : 'Matt';
      this.companion = new Companion({
        kind: cfg.companion,
        charName: other,
        onShoot: (c, target, kind) => this.#companionHit(c, target, kind),
      });
      this.companion.pos.set(1.6, 0, -1.2);
      scene.add(this.companion.root);
    }

    // Starting chests: every findable weapon, plus a medkit and an ammo box.
    const weaponKeys = [...CHEST_WEAPONS].sort(() => Math.random() - 0.5);
    const exclude = [{ x: 0, z: 0, r: 7 }];
    for (const key of weaponKeys) this.world.spawnChest({ type: 'weapon', key }, exclude);
    this.world.spawnChest({ type: 'health' }, exclude);
    this.world.spawnChest({ type: 'ammo' }, exclude);

    ui.setWave(1);
    ui.setKills(0);
    ui.setWeapon(this.player);
    ui.setHealth(this.player.hp, this.player.maxHp);
    if (this.companion) ui.setCompanion(this.companion.name, this.companion.hp, this.companion.maxHp);
    else ui.setCompanion(null);
    ui.setPrompt(null);
    ui.waveMessage('GET READY', 2000);

    this.#placeCamera(0, true);
  }

  /* ---------------- waves ---------------- */
  #startWave(n) {
    this.wave = n;
    ui.setWave(n);
    ui.waveMessage(`WAVE ${n}`);
    const count = Math.min(48, 5 + n * 3);
    const runnerFrac = Math.min(0.45, Math.max(0, (n - 2) * 0.08));
    const huskFrac = 0.25;
    this.spawnQueue = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let type = 'walker';
      if (r < runnerFrac) type = 'runner';
      else if (r < runnerFrac + huskFrac) type = 'husk';
      this.spawnQueue.push(type);
    }
    this.spawnInterval = Math.max(0.3, 1.5 - n * 0.09);
    this.spawnTimer = 0.5;
    this.waveState = 'spawning';
  }

  #spawnPoint() {
    const p = this.player.pos;
    for (let i = 0; i < 30; i++) {
      const side = Math.floor(Math.random() * 4);
      const t = -ARENA + 3 + Math.random() * (ARENA * 2 - 6);
      const e = ARENA - 2.5;
      let x, z;
      if (side === 0) [x, z] = [t, -e];
      else if (side === 1) [x, z] = [t, e];
      else if (side === 2) [x, z] = [-e, t];
      else [x, z] = [e, t];
      if (Math.hypot(x - p.x, z - p.z) < 16) continue;
      if (this.world.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    const q = this.world.randomFreePoint(0.8, [{ x: p.x, z: p.z, r: 14 }]);
    return q ? new THREE.Vector3(q.x, 0, q.z) : new THREE.Vector3(ARENA - 3, 0, ARENA - 3);
  }

  #spawnZombie(type) {
    const z = new Zombie(type, this.#spawnPoint());
    scene.add(z.root);
    this.zombies.push(z);
  }

  #updateWaves(dt) {
    if (this.waveState === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawnQueue.length) {
        this.#spawnZombie(this.spawnQueue.shift());
        this.spawnTimer = this.spawnInterval;
      }
      if (!this.spawnQueue.length) this.waveState = 'fighting';
    } else if (this.waveState === 'fighting') {
      if (!this.zombies.some((z) => !z.dead)) {
        this.waveState = 'break';
        this.breakTimer = 7;
        ui.waveMessage('WAVE CLEARED', 2500);
        this.player.heal(25);
        this.companion?.revive();
        const ex = [{ x: this.player.pos.x, z: this.player.pos.z, r: 5 }];
        this.world.spawnChest({ type: Math.random() < 0.5 ? 'ammo' : 'health' }, ex);
        if (this.wave % 2 === 0) this.world.spawnChest({ type: 'ammo' }, ex);
      }
    } else {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.#startWave(this.wave + 1);
    }
  }

  /* ---------------- combat ---------------- */
  /**
   * Ray vs. zombie hit test. Each zombie is a vertical cylinder standing on the
   * ground, so a shot anywhere from feet to head counts. Returns the nearest hit.
   */
  #hitTest(origin, dir, maxT, minT = 2.2) {
    let best = null;
    let bestT = maxT;
    const dxz2 = dir.x * dir.x + dir.z * dir.z;
    if (dxz2 < 1e-8) return null; // shooting straight up/down
    for (const z of this.zombies) {
      if (z.dead) continue;
      const ox = z.pos.x - origin.x;
      const oz = z.pos.z - origin.z;
      // Closest approach of the ray (projected onto the ground plane) to the zombie's axis.
      const t = (ox * dir.x + oz * dir.z) / dxz2;
      if (t < minT || t > bestT) continue;
      const px = origin.x + dir.x * t - z.pos.x;
      const pz = origin.z + dir.z * t - z.pos.z;
      if (px * px + pz * pz > (z.radius + 0.15) ** 2) continue;
      const y = origin.y + dir.y * t;
      if (y < -0.1 || y > z.def.height + 0.1) continue;
      bestT = t;
      best = z;
    }
    if (!best) return null;
    return { zombie: best, t: bestT, point: origin.clone().addScaledVector(dir, bestT) };
  }

  #gunPos() {
    const f = this.player.forward();
    const right = new THREE.Vector3(f.z, 0, -f.x);
    return this.player.aimOrigin().addScaledVector(f, 0.55).addScaledVector(right, -0.2);
  }

  #shoot(w) {
    const origin = camera.position.clone();
    const base = this.camForward.clone();
    const gun = this.#gunPos();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(base, up).normalize();
    const upv = new THREE.Vector3().crossVectors(right, base).normalize();

    for (let i = 0; i < w.pellets; i++) {
      const dir = base
        .clone()
        .addScaledVector(right, (Math.random() - 0.5) * 2 * w.spread)
        .addScaledVector(upv, (Math.random() - 0.5) * 2 * w.spread)
        .normalize();
      const hit = this.#hitTest(origin, dir, w.range + CAM_DIST);
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, w.range + CAM_DIST);
      fx.tracer(gun, end);
      if (hit) {
        const dist = Math.max(0, hit.t - CAM_DIST);
        let dmg = w.damage;
        if (w.key === 'shotgun') dmg *= Math.max(0.3, 1 - dist / w.range);
        hit.zombie.takeDamage(dmg, dir, w.key === 'shotgun' ? 1.6 : 0.5);
        fx.burst(hit.point, w.key === 'rifle' ? 12 : 5);
      }
    }
    fx.muzzle(gun);
    this.recoil += w.recoil;
  }

  #melee(w) {
    const origin = this.player.pos;
    const fwd = this.player.forward();
    const to = new THREE.Vector3();
    let hitAny = false;
    for (const z of this.zombies) {
      if (z.dead) continue;
      to.subVectors(z.pos, origin).setY(0);
      const d = to.length();
      if (d > w.range + z.radius) continue;
      to.divideScalar(Math.max(d, 1e-4));
      const ang = Math.acos(Math.max(-1, Math.min(1, fwd.dot(to))));
      if (ang > w.arc / 2) continue;
      z.takeDamage(w.damage, to.clone(), w.knockback);
      fx.burst(z.hitPoint(), 9);
      hitAny = true;
    }
    if (hitAny) this.recoil += 0.015;
  }

  #companionHit(comp, target, kind) {
    if (kind === 'pistol') {
      fx.tracer(comp.aimOrigin(), target.hitPoint());
      fx.burst(target.hitPoint(), 4);
    } else {
      fx.burst(target.hitPoint(), 6);
    }
  }

  /* ---------------- chests ---------------- */
  #updateChests() {
    const p = this.player;
    const chest = this.world.nearestClosedChest(p.pos, 2.4);
    ui.setPrompt(chest && p.alive ? 'Press <b>E</b> to open chest' : null);
    if (chest && p.alive && input.pressed('KeyE')) {
      const c = chest.open();
      chest.openedAt = this.time;
      if (c.type === 'weapon') {
        const isNew = p.giveWeapon(c.key);
        ui.toast(isNew ? `FOUND ${WEAPONS[c.key].name}!` : `${WEAPONS[c.key].name} AMMO`);
      } else if (c.type === 'health') {
        p.heal(50);
        ui.toast('MEDKIT  +50 HP');
      } else if (p.giveAmmo()) {
        ui.toast('AMMO CACHE');
      } else {
        p.heal(25);
        ui.toast('BANDAGES  +25 HP');
      }
      ui.setWeapon(p);
    }
    // Clean up old opened chests.
    for (let i = this.world.chests.length - 1; i >= 0; i--) {
      const c = this.world.chests[i];
      if (c.opened && this.time - c.openedAt > 25) {
        this.world.group.remove(c.group);
        this.world.chests.splice(i, 1);
      }
    }
  }

  /* ---------------- camera ---------------- */
  #placeCamera(dt, snap = false) {
    const p = this.player;
    this.camYaw -= input.mouseDX * 0.0021;
    this.camPitch -= input.mouseDY * 0.0021;
    this.camPitch = Math.max(-0.55, Math.min(0.7, this.camPitch));
    // Recoil is a temporary upward kick that settles back to the player's aim.
    this.recoil *= Math.exp(-dt * 9);
    if (this.recoil < 0.0005) this.recoil = 0;
    const pitch = Math.min(0.75, this.camPitch + this.recoil);

    const cp = Math.cos(pitch);
    const fwd = new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(pitch), Math.cos(this.camYaw) * cp);
    const flat = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new THREE.Vector3(flat.z, 0, -flat.x);
    const target = p.pos.clone().add(new THREE.Vector3(0, CAM_HEIGHT, 0)).addScaledVector(right, CAM_SHOULDER);
    const want = target.clone().addScaledVector(fwd, -CAM_DIST);
    if (want.y < 0.35) want.y = 0.35;

    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-dt * 18));
    camera.position.copy(this.camPos);
    camera.lookAt(this.camPos.clone().add(fwd));
    this.camForward.copy(fwd);
  }

  /* ---------------- main update ---------------- */
  update(dt) {
    this.time += dt;
    const p = this.player;

    // Camera yaw is what the player faces.
    this.#placeCamera(dt);
    p.update(dt, input, this.camYaw, this.world);

    // Targets for zombies.
    const targets = [p];
    if (this.companion) targets.push(this.companion);

    // Zombie separation (cheap O(n²), n is small).
    const live = this.zombies.filter((z) => !z.dead);
    const d = new THREE.Vector3();
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        d.subVectors(a.pos, b.pos).setY(0);
        const dist = d.length();
        const min = a.radius + b.radius + 0.1;
        if (dist < min && dist > 1e-4) {
          const f = ((min - dist) / min) * 3.5;
          d.divideScalar(dist);
          a.push.addScaledVector(d, f);
          b.push.addScaledVector(d, -f);
        }
      }
    }

    for (const z of this.zombies) z.update(dt, targets, this.world);

    // Kill accounting + cleanup.
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.dead && !z.counted) {
        z.counted = true;
        this.kills += z.def.score;
        ui.setKills(this.kills);
      }
      if (z.remove) {
        scene.remove(z.root);
        this.zombies.splice(i, 1);
      }
    }

    this.companion?.update(dt, p, this.zombies, this.world);

    this.#updateWaves(dt);
    this.#updateChests();
    this.world.update(dt, this.time);

    // HUD
    ui.setHealth(p.hp, p.maxHp);
    if (this.companion) ui.setCompanion(this.companion.name, this.companion.hp, this.companion.maxHp);
    const low = p.hp / p.maxHp < 0.35 ? (0.35 - p.hp / p.maxHp) * 1.6 + 0.15 : 0;
    ui.vignette(p.hurtT * 1.5 + low);

    if (p.dead && p.deathT > 2.4 && !this.over) {
      this.over = true;
      ui.vignette(0.8);
      ui.setPrompt(null);
      ui.gameOver(
        `Survived to <b>wave ${this.wave}</b><br>` +
          `<b>${this.kills}</b> zombies put down<br>` +
          `Weapons found: <b>${p.inventory.size - 1}</b> / ${CHEST_WEAPONS.length}`
      );
      input.enabled = false;
      input.releaseLock();
    }
  }

  dispose() {
    this.world.dispose();
    scene.remove(this.player.root);
    if (this.companion) scene.remove(this.companion.root);
    for (const z of this.zombies) scene.remove(z.root);
    this.zombies.length = 0;
    fx.clear();
  }
}

/* ------------------------------------------------------------- menu */
let game = null;
let paused = false;
const config = { charName: 'Matt', companion: 'dog' };

function bindChoices(containerId, attr, onPick) {
  const buttons = document.querySelectorAll(`#${containerId} .choice`);
  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      onPick(b.dataset[attr]);
    });
  });
}

function startGame() {
  if (game) game.dispose();
  ui.hide('menu');
  ui.hide('gameover');
  ui.hide('paused');
  ui.show('hud');
  ui.vignette(0);
  game = new Game({ ...config });
  paused = false;
  input.enabled = true;
  input.requestLock();
}

function backToMenu() {
  ui.hide('gameover');
  ui.hide('hud');
  ui.show('menu');
  input.enabled = false;
  if (game) {
    game.dispose();
    game = null;
  }
}

input.onLockChange = (locked) => {
  if (!game || game.over) return;
  if (!locked) {
    paused = true;
    ui.show('paused');
  } else {
    paused = false;
    ui.hide('paused');
    clock.getDelta(); // drop the paused interval
  }
};

/* ------------------------------------------------------------- loop */
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game && !paused && !game.over) {
    game.update(dt);
  } else if (game && game.over) {
    // let death animations finish playing
    game.player.update(dt, input, game.camYaw, game.world);
    for (const z of game.zombies) z.anim.update(dt);
  }
  fx.update(dt);
  renderer.render(scene, camera);
  input.endFrame();
}

/* ------------------------------------------------------------- boot */
async function boot() {
  ui.init();
  bindChoices('char-choices', 'char', (v) => {
    config.charName = v;
    ui.els['other-survivor-name'].textContent = v === 'Matt' ? 'Lis' : 'Matt';
  });
  bindChoices('comp-choices', 'comp', (v) => (config.companion = v));
  ui.els['start-btn'].addEventListener('click', startGame);
  ui.els['restart-btn'].addEventListener('click', backToMenu);
  // The pause overlay sits on top of the canvas, so clicking it must re-capture the mouse.
  ui.els['paused'].addEventListener('click', () => {
    if (game && !game.over) input.requestLock();
  });

  try {
    await loadAll((f, name) => ui.setLoading(f, `Loading ${name}…`));
  } catch (err) {
    ui.setLoading(0, `Failed to load: ${err.message}`);
    console.error(err);
    return;
  }
  ui.hide('loading');
  ui.show('menu');
  // Idle render so the background isn't blank behind the menu.
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 1, 0);
  frame();
}

boot();

// Expose for debugging in the console.
window.__zombie = { scene, camera, input, get game() { return game; } };
