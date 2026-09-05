import * as THREE from 'three';

/** Thin wrapper over AnimationMixer that handles cross-fading between named clips. */
export class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of clips) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.currentName = null;
  }

  has(name) {
    return !!this.actions[name];
  }

  duration(name) {
    const a = this.actions[name];
    return a ? a.getClip().duration : 0;
  }

  /**
   * Play a clip. Same clip requested again is ignored unless `force` is set.
   * @param {string} name
   * @param {{fade?:number, loop?:boolean, speed?:number, force?:boolean}} opts
   */
  play(name, opts = {}) {
    const { fade = 0.18, loop = true, speed = 1, force = false } = opts;
    const action = this.actions[name];
    if (!action) return null;
    if (this.current === action && !force) {
      if (action.timeScale !== speed) action.timeScale = speed;
      return action;
    }

    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = speed;
    action.enabled = true;
    action.setEffectiveWeight(1);

    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, fade, false);
    } else if (this.current === action) {
      // Force-restarting the same action: just reset time.
      action.setEffectiveWeight(1);
    }
    action.play();

    this.current = action;
    this.currentName = name;
    return action;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
