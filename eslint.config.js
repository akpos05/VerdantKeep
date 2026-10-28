// The game ships as classic <script> tags that share one global scope, so
// each file uses names declared by the others. They are listed here instead
// of adding import/export or /* global */ comments to the game code.
const js = require('@eslint/js');
const globals = require('globals');

const GAME_GLOBALS = [
  // input.js, audio.js, particles.js
  'Input', 'Sound', 'Particles',
  // level.js
  'TILE', 'LEVEL_W', 'LEVEL_H', 'T', 'B', 'D', 'ZONE_BRIDGE_X', 'ZONE_CASTLE_X', 'tileHash', 'Level',
  // renderer.js
  'VIEW_W', 'VIEW_H', 'PAL', 'Renderer',
  // player.js
  'PLAYER', 'Player',
  // enemies.js
  'Enemy', 'Slime', 'Skeleton', 'Arrow', 'Wisp', 'createEnemy',
  // game.js
  'Gem', 'HeartPickup', 'Relic', 'Checkpoint', 'Goal', 'STEP_MS', 'Game',
];

module.exports = [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...Object.fromEntries(GAME_GLOBALS.map((name) => [name, 'readonly'])),
      },
    },
    rules: {
      // Each file declares the globals listed above, which is not a redeclare.
      'no-redeclare': ['error', { builtinGlobals: false }],
      // Top-level declarations are used by other files, not the declaring one.
      'no-unused-vars': ['error', { vars: 'local', args: 'none' }],
    },
  },
];
