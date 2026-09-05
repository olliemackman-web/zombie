import { WEAPON_ORDER, WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);

export const ui = {
  els: {},

  init() {
    const ids = [
      'loading', 'loading-text', 'loading-bar', 'menu', 'hud', 'gameover', 'paused',
      'wave-num', 'wave-msg', 'kill-num', 'health-bar', 'comp-health-row', 'comp-label',
      'comp-health-bar', 'weapon-name', 'ammo-text', 'weapon-slots', 'prompt',
      'pickup-toast', 'damage-vignette', 'gameover-stats', 'start-btn', 'restart-btn',
      'other-survivor-name',
    ];
    for (const id of ids) this.els[id] = $(id);
    this._slotEls = {};
    this.els['weapon-slots'].innerHTML = '';
    for (const key of WEAPON_ORDER) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.textContent = WEAPONS[key].slot;
      el.title = WEAPONS[key].name;
      this.els['weapon-slots'].appendChild(el);
      this._slotEls[key] = el;
    }
    this._toastTimer = null;
    this._waveMsgTimer = null;
  },

  show(id) { this.els[id].classList.remove('hidden'); },
  hide(id) { this.els[id].classList.add('hidden'); },

  setLoading(frac, text) {
    this.els['loading-bar'].style.width = `${Math.round(frac * 100)}%`;
    if (text) this.els['loading-text'].textContent = text;
  },

  setHealth(hp, max) {
    const f = Math.max(0, Math.min(1, hp / max));
    this.els['health-bar'].style.width = `${f * 100}%`;
  },

  setCompanion(name, hp, max) {
    if (!name) {
      this.els['comp-health-row'].classList.add('hidden');
      return;
    }
    this.els['comp-health-row'].classList.remove('hidden');
    this.els['comp-label'].textContent = name.toUpperCase();
    const f = Math.max(0, Math.min(1, hp / max));
    this.els['comp-health-bar'].style.width = `${f * 100}%`;
  },

  setWave(n) { this.els['wave-num'].textContent = n; },
  setKills(n) { this.els['kill-num'].textContent = n; },

  waveMessage(text, ms = 2600) {
    const el = this.els['wave-msg'];
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._waveMsgTimer);
    this._waveMsgTimer = setTimeout(() => el.classList.remove('show'), ms);
  },

  setWeapon(player) {
    const w = player.weapon;
    this.els['weapon-name'].textContent = w.name;
    const ammoEl = this.els['ammo-text'];
    if (w.type === 'melee') {
      ammoEl.textContent = 'MELEE';
      ammoEl.classList.remove('empty');
    } else {
      const a = player.ammo[w.key];
      if (player.reloading) {
        ammoEl.textContent = 'RELOADING…';
        ammoEl.classList.remove('empty');
      } else {
        ammoEl.textContent = `${a.mag} / ${a.reserve}`;
        ammoEl.classList.toggle('empty', a.mag === 0 && a.reserve === 0);
      }
    }
    for (const key of WEAPON_ORDER) {
      const el = this._slotEls[key];
      el.classList.toggle('owned', player.owns(key));
      el.classList.toggle('active', key === w.key);
    }
  },

  setPrompt(text) {
    const el = this.els['prompt'];
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.innerHTML = text;
    el.classList.remove('hidden');
  },

  toast(text) {
    const el = this.els['pickup-toast'];
    el.textContent = text;
    el.classList.remove('hidden');
    // restart the CSS animation
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2300);
  },

  vignette(intensity) {
    this.els['damage-vignette'].style.opacity = String(Math.max(0, Math.min(1, intensity)));
  },

  gameOver(stats) {
    this.els['gameover-stats'].innerHTML = stats;
    this.show('gameover');
  },
};
