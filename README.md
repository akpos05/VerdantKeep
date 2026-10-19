# This is a title
Hello, world

# The is a second header 
Hello, again

# Emberfall

A 16-bit fantasy side-scroller in vanilla JavaScript and HTML5 Canvas. No build
step and no dependencies. Every sprite, tile and sound is generated in code.

**Play:** open `index.html` in a browser.

| Action | Keys |
| --- | --- |
| Move | Arrow keys / WASD |
| Jump (hold for height, again in midair once unlocked) | Space / Z / K |
| Drop through a wooden platform | Down + Jump |
| Attack (also parries arrows) | X / J |
| Mute | M |
| Pause | Esc / P |

Game-feel constants live in the `PLAYER` block at the top of `js/player.js`.

| File | Role |
| --- | --- |
| `js/game.js` | fixed-timestep loop, state machine, camera, pickups, screens |
| `js/player.js` | tunables, movement physics, sword |
| `js/enemies.js` | slime, skeleton archer (and arrows), wisp |
| `js/level.js` | tile collision and the level layout |
| `js/renderer.js` | procedural art, parallax, lighting, pixel font, HUD |
| `js/particles.js` | pooled particles and effect presets |
| `js/audio.js` | WebAudio SFX and music |
| `js/input.js` | keyboard state with per-update edge detection |
