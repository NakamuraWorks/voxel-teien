import test from 'node:test';
import assert from 'node:assert/strict';

// gamepad.js registers window listeners and reads navigator.getGamepads, so shim both
// before import; player.js needs the same window/document/canvas minimum as its own test.
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, pointerLockElement: null };
const fakeCanvas = { addEventListener() {}, requestPointerLock() {} };

const axes = [0, 0, 0, 0];
const fakePad = { index: 0, connected: true, mapping: 'standard', id: 'virtual pad', axes, buttons: [] };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { getGamepads: () => [fakePad] }
});

const { createGamepad } = await import('../src/game/gamepad.js');
const { generateGarden } = await import('../src/garden/generate.js');
const { createPlayer } = await import('../src/game/player.js');
const { RES } = await import('../src/garden/layout.js');

const site = generateGarden();
const dt = 1 / 60;

function settle(controller, p) {
  controller.teleport(site.spawn.x, site.spawn.y, site.spawn.z);
  p.yaw = 0; // forward is -Z
  for (let i = 0; i < 60; i++) controller.update(dt);
}

test('left stick pushed forward reads as forward (+moveZ)', () => {
  const gamepad = createGamepad();
  axes[1] = -1; // standard mapping: up on the stick is negative
  const pad = gamepad.poll();
  assert.ok(pad.moveZ > 0.9, `moveZ was ${pad.moveZ}`);
  axes[1] = 1;
  assert.ok(gamepad.poll().moveZ < -0.9, 'pulling back must read as backward');
  axes[1] = 0;
});

test('stick-forward walks the same way as W', () => {
  const gamepad = createGamepad();
  const controller = createPlayer(fakeCanvas, site.world);
  const p = controller.player;
  settle(controller, p);

  const startZ = p.pos.z;
  axes[1] = -1;
  for (let i = 0; i < 180; i++) {
    controller.setPad(gamepad.poll());
    controller.update(dt);
  }
  axes[1] = 0;
  controller.setPad(null);
  const stickNorth = startZ - p.pos.z;

  settle(controller, p);
  const resetZ = p.pos.z;
  controller.keys.add('KeyW');
  for (let i = 0; i < 180; i++) controller.update(dt);
  controller.keys.delete('KeyW');
  const keyNorth = resetZ - p.pos.z;

  assert.ok(stickNorth > 8 * RES, `stick walked ${stickNorth.toFixed(2)} south, not north`);
  assert.ok(Math.abs(stickNorth - keyNorth) < keyNorth * 0.2, `stick ${stickNorth.toFixed(2)} vs W ${keyNorth.toFixed(2)}`);
});
