# Dead Street — Zombie Survival

A browser-based third-person zombie survival game built with [Three.js](https://threejs.org/).
Pick a survivor, pick a companion, and hold out against escalating waves of zombies on a
ruined city street. You start with nothing but a **guitar** — find real weapons in the glowing
chests scattered around the map.

## Play

The game is plain static HTML/JS (no build step), but it must be served over HTTP because it
uses ES modules and loads glTF assets. From the repo root:

```bash
python3 -m http.server 8000
# or: npx serve .
```

Then open <http://localhost:8000>. Click **START** — the game captures the mouse; press
**Esc** to pause and click to resume. It also works as-is on GitHub Pages or any static host.

## Controls

| Key | Action |
| --- | --- |
| **W A S D** | Move (relative to camera) |
| **Mouse** | Look / aim |
| **Left click** | Attack / shoot (SMG is full-auto — hold) |
| **Shift** | Sprint |
| **E** | Open chest |
| **1–5** / **Q** / scroll | Switch weapon |
| **R** | Reload |

## Gameplay

- **Survivors** — *Matt* (tougher, 130 HP) or *Lis* (faster).
- **Companions** — *Rex* the German Shepherd (fast, bites), the other survivor (covers you
  with a pistol), or nobody. A downed companion gets back up at the end of each wave.
- **Weapons** — Guitar (start), Knife, Shotgun, Rifle, SMG. Each of the four findable weapons is
  in one of the chests placed at the start of a run. Opening a weapon chest for a weapon you
  already own gives ammo instead. Extra ammo/medkit chests spawn between waves.
- **Zombies** — walkers, fast runners (from wave 3), and legless "husk" crawlers. Waves grow
  each round; a short break between waves heals you a little.
- Health regenerates slowly if you avoid damage for a few seconds.

## Project layout

```
index.html          page, menus, HUD markup
css/style.css       UI styling
js/main.js          renderer, game loop, camera, waves, combat resolution, menu wiring
js/player.js        survivor: movement, inventory, melee/gun firing, reload, health
js/zombie.js        zombie types + chase/attack/stagger/death AI
js/companion.js     dog + survivor companion AI (follow, engage, revive)
js/world.js         lighting, ground, barriers, lamp posts, vehicles, props, chests, collision
js/weapons.js       weapon stats
js/animator.js      AnimationMixer cross-fade helper
js/assets.js        glTF loading + skeleton-aware cloning
js/input.js         keyboard / mouse / pointer-lock
js/ui.js            HUD + overlay updates
js/fx.js            blood bursts, tracers, muzzle flash
assets/models/      glTF models (characters, zombies, weapons, vehicles, props)
vendor/             three.js r170 + the two addons used (GLTFLoader, SkeletonUtils)
```

Character models carry their own rigs and animation clips; weapons are already parented to the
survivors' hands inside the glTF, so equipping a weapon just toggles which hand mesh is visible.
