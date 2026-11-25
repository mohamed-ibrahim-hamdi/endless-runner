# Metro Dash 3D

An original 3D endless runner (Subway-Surfers-style mechanics, original character,
world and branding) built with HTML, CSS, JavaScript and Three.js. Plays directly
in a browser on desktop and mobile, no build step required.

## How to run

- **Hosted File (play instantly):** open the published File link and press PLAY.
- **Static site (Replit `endless-runner` or any static host):** serve the project
  root and open `index.html`. All modules are native ES modules; Three.js is
  vendored at `src/vendor/three.module.min.js` (r160), so no network access or
  install is needed.
- **Controls:** phone: swipe left/right to change lane, up to jump, down to
  slide. Desktop: arrow keys (space also jumps, A/D/W/S work too), P or Esc to
  pause, Enter to start from the menu.

## Architecture

Two deliverables share one game engine:

- `src/game/*.js` - the engine, plain ES modules with zero dependencies beyond
  vendored Three.js. Native-browser compatible (explicit `.js` import
  specifiers), so the same files run unbundled on any static host.
- `src/App.tsx` + `src/main.tsx` - a thin React shell used only by the hosted
  Instinct File wrapper; it mounts the engine into a card and adds a README
  route. The Replit/static version uses `index.html` + `src/game/static-main.js`
  instead and does not need React.

Engine modules:

| Module | Responsibility |
| --- | --- |
| `main.js` | Game states (menu / countdown / playing / dying / paused / over), RAF loop, physics, scoring, input (keyboard, touch swipe, mouse drag), camera, power-up timers, mission checks, debug handle `window.__METRO_DASH__`. |
| `config.js` | All tuning constants (speeds, timers, lane layout). |
| `world.js` | Recycled city segments (tracks, buildings, street lights, tunnel frames), day/night cycle driving sky, fog, sun, stars and building glow. |
| `player.js` | "Dash", an original robot built from primitives, with procedural run / jump / slide / lane-change / death animation. |
| `obstacles.js` | Pooled trains (parked + moving), jump barriers, slide-under signal bars, tall signal boxes. Spawn clusters always leave a survivable lane; difficulty scales cluster density. AABB collision. |
| `collectibles.js` | Pooled coins (lines and jump arcs) and power-ups (magnet, boost, shield) with magnet attraction. |
| `effects.js` | Pooled particle bursts (coins, power-ups, crash), camera shake, run dust. |
| `audio.js` | Fully synthesized WebAudio SFX plus an adaptive two-bar music loop whose intensity follows difficulty. No audio files. |
| `ui.js` | DOM HUD and screens: main menu, pause, game over, missions, settings, countdown, toasts. |
| `missions.js` | Three live missions with progress bars, rewards, and harder tiers unlocking. |
| `storage.js` | Best score / coin bank / settings / missions with an in-memory fallback when `localStorage` is blocked (e.g. sandboxed embeds). |

## Completed features

- 3-lane endless running with swipe, drag, arrow keys and space.
- Urban railway world: tracks with ties and rails, trains, tunnels, buildings
  with lit windows, street lights, sidewalks, day/night cycle, segment recycling.
- Obstacles: moving and parked trains, low jump barriers, high slide-under
  bars, tall signal boxes; randomized fair patterns that always leave a path.
- Collectibles: coins, magnet, speed boost (2x score), shield (absorbs one
  crash), each with particles and sound.
- Progression: speed ramps with distance, difficulty scales spawn density, best
  score and coin bank persist, 12 missions across 4 tiers with coin rewards.
- UI: main menu, HUD (score, coins, multiplier, power-up timers), pause menu,
  game over with stats and mission progress, settings (sound, music, graphics
  quality, reset progress), 3-2-1 countdown, mission toasts, new-best badge.
- Visuals: real-time shadows, ACES tone mapping, emissive lighting, particles,
  camera bob/shake, boost FOV kick, animated day/night sky with stars and moon.
- Audio: synthesized SFX (coins, jump, slide, crash, power-ups, UI) and an
  adaptive music loop; independent sound/music toggles.
- Responsive: touch and mouse swipe, resize-aware canvas, low/high quality
  setting (shadows + pixel ratio) for weaker phones.

## Unfinished features

- Character skins purchasable with banked coins.
- Online leaderboard / daily challenge seed.
- Additional biomes (desert, night market) on the same segment system.
- Near-miss and combo scoring.

## Known bugs

- None known at handoff.
- By design: pausing during the 3-2-1 countdown restarts the countdown on
  resume, and storage-blocked browsers keep progress only for the session.

## Next development tasks

1. Add a skin shop (3-4 recolors of Dash, bought with banked coins).
2. Add near-miss detection in `obstacles.js` and combo multiplier in `main.js`.
3. Add a daily-seed RNG so all players get the same layout that day.
4. Add a leaderboard backend (or a shareable score card image).
5. Extract the biome palette in `world.js` into themes and add a second biome.

## Testing notes

`window.__METRO_DASH__` exposes `state()`, `score()`, `coins()`, `distance()`,
`start()`, `crash()`, `lane()`, `jump()`, `slide()` for automated smoke tests.
