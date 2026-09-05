import * as THREE from 'three';
import { cloneModel } from './assets.js';
import { WEAPONS } from './weapons.js';

export const ARENA = 36; // half-extent of the playable square

const VEHICLES = [
  'Vehicle_Pickup',
  'Vehicle_Pickup_Armored',
  'Vehicle_Sports',
  'Vehicle_Sports_Armored',
  'Vehicle_Truck_Armored',
];
const DECOR = ['TrafficCone_1', 'TrafficCone_2', 'TrashBag_1', 'Pallet_Broken', 'TrafficCone_1', 'TrashBag_1'];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

/* ------------------------------------------------------------------ ground */
function makeAsphaltTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');

  g.fillStyle = '#1c1c1f';
  g.fillRect(0, 0, size, size);

  // noise speckle
  for (let i = 0; i < 26000; i++) {
    const v = 18 + Math.random() * 30;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // cracks
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    g.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // faded lane markings (two crossing roads)
  g.fillStyle = 'rgba(220,200,120,0.28)';
  for (let i = 0; i < size; i += 96) {
    g.fillRect(i + 10, size / 2 - 4, 56, 8);
    g.fillRect(size / 2 - 4, i + 10, 8, 56);
  }
  g.fillStyle = 'rgba(230,230,230,0.14)';
  g.fillRect(0, size / 2 - 120, size, 4);
  g.fillRect(0, size / 2 + 116, size, 4);
  g.fillRect(size / 2 - 120, 0, 4, size);
  g.fillRect(size / 2 + 116, 0, 4, size);
  // blood splats
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(${90 + Math.random() * 40},8,8,${0.35 + Math.random() * 0.3})`;
    const x = Math.random() * size, y = Math.random() * size;
    for (let j = 0; j < 12; j++) {
      g.beginPath();
      g.arc(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, 2 + Math.random() * 9, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------- chest */
export class Chest {
  constructor(pos, contents) {
    this.contents = contents;
    this.opened = false;
    this.openT = 0;
    this.item = null;
    this.itemT = 0;
    this.radius = 0.9;
    this.time = Math.random() * 10;

    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.group = g;

    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.7 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.62), wood);
    base.position.y = 0.25;
    base.castShadow = base.receiveShadow = true;
    g.add(base);

    for (const x of [-0.32, 0.32]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.66), metal);
      band.position.set(x, 0.25, 0);
      g.add(band);
    }

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.5, -0.31);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.62), wood);
    lid.position.set(0, 0.09, 0.31);
    lid.castShadow = true;
    lidPivot.add(lid);
    for (const x of [-0.32, 0.32]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.66), metal);
      band.position.set(x, 0.09, 0.31);
      lidPivot.add(band);
    }
    g.add(lidPivot);
    this.lid = lidPivot;

    const glowColor = contents.type === 'weapon' ? 0xffb040 : contents.type === 'health' ? 0x50ff70 : 0x60b0ff;
    this.light = new THREE.PointLight(glowColor, 4, 6, 2);
    this.light.position.set(0, 0.9, 0);
    g.add(this.light);

    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: glowColor })
    );
    this.marker.position.y = 1.6;
    g.add(this.marker);

    this.pos = g.position;
  }

  open() {
    if (this.opened) return null;
    this.opened = true;
    this.marker.visible = false;
    const c = this.contents;
    if (c.type === 'weapon') {
      const { scene } = cloneModel(WEAPONS[c.key].model);
      scene.position.y = 0.4;
      scene.scale.setScalar(0.8);
      this.group.add(scene);
      this.item = scene;
      this.itemT = 0;
    }
    return c;
  }

  update(dt) {
    this.time += dt;
    if (!this.opened) {
      this.marker.rotation.y += dt * 2;
      this.marker.position.y = 1.5 + Math.sin(this.time * 3) * 0.12;
      this.light.intensity = 3.5 + Math.sin(this.time * 4) * 1.2;
    } else {
      this.openT = Math.min(1, this.openT + dt * 2.5);
      this.lid.rotation.x = -1.9 * this.openT;
      this.light.intensity = Math.max(0, 4 - this.openT * 4);
      if (this.item) {
        this.itemT += dt;
        this.item.position.y = 0.4 + this.itemT * 0.9;
        this.item.rotation.y += dt * 3;
        if (this.itemT > 1.4) {
          this.group.remove(this.item);
          this.item = null;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------- world */
export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.shadowSize = opts.shadowSize ?? 2048;
    this.decorCount = opts.decorCount ?? 70;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.obstacles = [];
    this.chests = [];
    this.lamps = [];
  }

  build() {
    this.#lighting();
    this.#ground();
    this.#barriers();
    this.#lampPosts();
    this.#vehicles();
    this.#decor();
  }

  #lighting() {
    const hemi = new THREE.HemisphereLight(0x6a7cb0, 0x1a1a20, 2.6);
    this.group.add(hemi);
    this.group.add(new THREE.AmbientLight(0x30343c, 1.2));

    const moon = new THREE.DirectionalLight(0xb0bce8, 3.0);
    moon.position.set(-25, 40, 18);
    moon.castShadow = true;
    moon.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    const s = ARENA + 6;
    moon.shadow.camera.left = -s;
    moon.shadow.camera.right = s;
    moon.shadow.camera.top = s;
    moon.shadow.camera.bottom = -s;
    moon.shadow.camera.near = 5;
    moon.shadow.camera.far = 110;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.02;
    this.group.add(moon);
    this.group.add(moon.target);

    this.scene.fog = new THREE.FogExp2(0x0a0c14, 0.013);
    this.scene.background = new THREE.Color(0x0a0c14);
  }

  #ground() {
    const tex = makeAsphaltTexture();
    const size = ARENA * 2 + 40;
    tex.repeat.set(size / 24, size / 24);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  #barriers() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x77767a, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(2.0, 0.9, 0.55);
    const step = 2.1;
    const n = Math.ceil((ARENA * 2) / step);
    for (let i = 0; i <= n; i++) {
      const t = -ARENA + i * step;
      for (const [x, z, ry] of [
        [t, -ARENA - 0.3, 0],
        [t, ARENA + 0.3, 0],
        [-ARENA - 0.3, t, Math.PI / 2],
        [ARENA + 0.3, t, Math.PI / 2],
      ]) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, 0.45, z);
        m.rotation.y = ry;
        m.castShadow = m.receiveShadow = true;
        this.group.add(m);
      }
    }
  }

  #lampPosts() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.6, metalness: 0.5 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd090 });
    const spots = [
      [-18, -18], [18, -18], [-18, 18], [18, 18],
      [0, -26], [0, 26], [-26, 0], [26, 0],
    ];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5, 8), poleMat);
      pole.position.y = 2.5;
      pole.castShadow = true;
      g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), poleMat);
      arm.position.set(0.55, 5, 0);
      g.add(arm);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), bulbMat);
      bulb.position.set(1.05, 4.92, 0);
      g.add(bulb);
      const light = new THREE.PointLight(0xffc070, 70, 26, 2);
      light.position.set(1.05, 4.7, 0);
      g.add(light);
      g.rotation.y = Math.atan2(-x, -z); // arm points toward the center
      this.group.add(g);
      this.obstacles.push({ x, z, r: 0.25 });
      this.lamps.push({ light, base: 70, seed: Math.random() * 10 });
    }
  }

  #vehicles() {
    const placed = [];
    let attempts = 0;
    while (placed.length < 10 && attempts++ < 400) {
      const x = rand(-ARENA + 5, ARENA - 5);
      const z = rand(-ARENA + 5, ARENA - 5);
      if (Math.hypot(x, z) < 8) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 7.5)) continue;
      if (this.lamps.length && this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue;
      placed.push({ x, z });

      const name = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
      const { scene } = cloneModel(name);
      const box = new THREE.Box3().setFromObject(scene);
      scene.position.set(x, -box.min.y, z);
      const ry = Math.random() * Math.PI * 2;
      scene.rotation.y = ry;
      this.group.add(scene);

      // Two collision circles along the vehicle's length.
      const halfLen = (box.max.z - box.min.z) / 2;
      const halfWid = (box.max.x - box.min.x) / 2;
      const cz = (box.max.z + box.min.z) / 2;
      const r = halfWid + 0.15;
      for (const off of [cz - halfLen * 0.5, cz + halfLen * 0.5]) {
        this.obstacles.push({
          x: x + Math.sin(ry) * off,
          z: z + Math.cos(ry) * off,
          r,
        });
      }
    }
  }

  #decor() {
    for (let i = 0; i < this.decorCount; i++) {
      const name = DECOR[Math.floor(Math.random() * DECOR.length)];
      const p = this.randomFreePoint(0.6, [{ x: 0, z: 0, r: 3 }]);
      if (!p) continue;
      const { scene } = cloneModel(name);
      scene.position.set(p.x, 0, p.z);
      scene.rotation.y = Math.random() * Math.PI * 2;
      if (name.startsWith('TrafficCone') && Math.random() < 0.25) {
        scene.rotation.z = Math.PI / 2;
        scene.position.y = 0.28;
      }
      this.group.add(scene);
    }
  }

  /* ---- queries ---- */

  /** Find a random point not inside an obstacle, respecting extra exclusion circles. */
  randomFreePoint(radius, exclude = [], margin = 2) {
    for (let i = 0; i < 80; i++) {
      const x = rand(-ARENA + margin, ARENA - margin);
      const z = rand(-ARENA + margin, ARENA - margin);
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + radius)) continue;
      if (exclude.some((e) => Math.hypot(e.x - x, e.z - z) < e.r)) continue;
      if (this.chests.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 3)) continue;
      return { x, z };
    }
    return null;
  }

  /** Push a position out of all obstacles and keep it inside the arena. */
  resolve(pos, radius) {
    for (const o of this.obstacles) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (d < min && d > 1e-5) {
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else if (d <= 1e-5) {
        pos.x += min;
      }
    }
    for (const c of this.chests) {
      const dx = pos.x - c.pos.x;
      const dz = pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 0.65 + radius;
      if (d < min && d > 1e-5) {
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    const lim = ARENA - 0.6 - radius;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }

  spawnChest(contents, exclude = []) {
    const p = this.randomFreePoint(1.4, exclude, 4);
    if (!p) return null;
    const chest = new Chest(new THREE.Vector3(p.x, 0, p.z), contents);
    this.group.add(chest.group);
    this.chests.push(chest);
    return chest;
  }

  nearestClosedChest(pos, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  update(dt, time) {
    for (const c of this.chests) c.update(dt);
    for (const l of this.lamps) {
      // subtle flicker
      const f = Math.sin(time * 17 + l.seed) * Math.sin(time * 5.3 + l.seed * 2);
      l.light.intensity = l.base * (0.9 + 0.1 * f);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.fog = null;
  }
}
