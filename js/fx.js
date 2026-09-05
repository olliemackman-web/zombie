import * as THREE from 'three';

/** Cheap visual effects: blood bursts, tracers, muzzle flash. */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.tracers = [];

    this.flash = new THREE.PointLight(0xffc060, 0, 8, 2);
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashTimer = 0;

    this._particleGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this._bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0a0a });
    this._sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd080 });
    this._tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 });
  }

  burst(pos, count = 10, kind = 'blood') {
    const mat = kind === 'blood' ? this._bloodMat : this._sparkMat;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this._particleGeo, mat);
      m.position.copy(pos);
      const s = 0.6 + Math.random() * 0.9;
      m.scale.setScalar(s);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3.5 + 1,
        (Math.random() - 0.5) * 4
      );
      this.scene.add(m);
      this.particles.push({ mesh: m, vel: v, life: 0.5 + Math.random() * 0.5 });
    }
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this._tracerMat.clone());
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 6;
    this.flash.visible = true;
    this.flashTimer = 0.06;
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.vel.set(0, 0, 0);
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (this.flash.visible) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash.visible = false;
        this.flash.intensity = 0;
      }
    }
  }

  clear() {
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const t of this.tracers) this.scene.remove(t.line);
    this.particles.length = 0;
    this.tracers.length = 0;
    this.flash.visible = false;
  }
}
