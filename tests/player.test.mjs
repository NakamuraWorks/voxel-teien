import test from 'node:test';
import assert from 'node:assert/strict';

// The player controller registers DOM listeners, so give it the minimum shim before import.
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, pointerLockElement: null };
const fakeCanvas = { addEventListener() {}, requestPointerLock() {} };

const { generateGarden } = await import('../src/garden/generate.js');
const { createPlayer, VIEW } = await import('../src/game/player.js');
const { ROUTE } = await import('../src/garden/layout.js');

const site = generateGarden();
const dt = 1 / 60;

function spawnController() {
  const controller = createPlayer(fakeCanvas, site.world);
  return controller;
}

test('gravity settles the walker onto the entrance paving', () => {
  const controller = spawnController();
  const player = controller.player;
  player.pos.x = site.spawn.x;
  player.pos.y = site.spawn.y + 6;
  player.pos.z = site.spawn.z;
  for (let i = 0; i < 120; i++) controller.update(dt);
  assert.equal(player.grounded, true, 'should be standing after falling');
  const floor = Math.round(site.ground[Math.round(player.pos.z) * 128 + Math.round(player.pos.x)]);
  assert.ok(Math.abs(player.pos.y - (floor + 1)) < 1.6, `feet at ${player.pos.y}, ground top row ${floor}`);
  assert.ok(player.pos.y > 0, 'must not sink through the world');
});

test('walking forward moves the walker and keeps them supported', () => {
  const controller = spawnController();
  const p = controller.player;
  p.pos.x = site.spawn.x;
  p.pos.y = site.spawn.y;
  p.pos.z = site.spawn.z;
  p.yaw = 0; // north
  for (let i = 0; i < 60; i++) controller.update(dt); // settle
  const startZ = p.pos.z;
  controller.keys.add('KeyW');
  for (let i = 0; i < 180; i++) controller.update(dt);
  const travelled = startZ - p.pos.z;
  assert.ok(travelled > 8, `only travelled ${travelled.toFixed(2)} north (blocked?)`);
  assert.ok(p.pos.y > 0, 'fell out of the world');
  assert.equal(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z), true);
});

test('a single-voxel stone is stepped onto, not walked through', () => {
  const controller = spawnController();
  const p = controller.player;
  // Find a stepping stone from generation and drop the walker just beside it.
  const stone = site.stones.find((s) => s.y > 0);
  assert.ok(stone, 'generation should have laid stepping stones');
  p.pos.x = stone.x + 0.5;
  p.pos.z = stone.z + 4.5;
  p.pos.y = stone.y + 3;
  p.yaw = 0; // forward is -Z, i.e. toward the stone
  for (let i = 0; i < 40; i++) controller.update(dt);
  controller.keys.add('KeyW');
  let best = p.pos.y;
  for (let i = 0; i < 240; i++) {
    controller.update(dt);
    best = Math.max(best, p.pos.y);
  }
  const stoneTop = stone.y + 1;
  assert.ok(best >= stoneTop - 0.2, `never climbed onto the stone (best ${best.toFixed(2)}, top ${stoneTop})`);
});

test('the whole circuit is walkable with the real collision code', () => {
  const controller = spawnController();
  const p = controller.player;
  p.pos.x = site.spawn.x;
  p.pos.y = site.spawn.y;
  p.pos.z = site.spawn.z;
  controller.keys.add('KeyW');

  let waypoint = 2;
  let groundedFrames = 0;
  let frames = 0;
  let closestLapDistance = Infinity;
  while (frames < 30000 && waypoint < ROUTE.length) {
    const target = ROUTE[waypoint];
    const dx = target.x + 0.5 - p.pos.x;
    const dz = target.z + 0.5 - p.pos.z;
    const dist = Math.hypot(dx, dz);
    closestLapDistance = Math.min(closestLapDistance, dist);
    if (dist < 3.2) {
      waypoint++;
      continue;
    }
    p.yaw = Math.atan2(-dx, -dz);
    controller.update(dt);
    frames++;
    if (p.grounded) groundedFrames++;
    if (p.pos.y < -5) break;
  }

  const summary = {
    frames,
    waypointReached: waypoint,
    groundedRatio: +(groundedFrames / frames).toFixed(3),
    nearestToFinalWaypoint: +closestLapDistance.toFixed(1),
    pos: { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1) }
  };
  console.log(`   autopilot: ${JSON.stringify(summary)}`);
  assert.ok(waypoint >= ROUTE.length - 1, `stalled at route ${waypoint}/${ROUTE.length - 1} at ${JSON.stringify(summary.pos)}`);
  assert.ok(summary.groundedRatio > 0.75, `mostly airborne: ${summary.groundedRatio}`);
  assert.ok(p.pos.y > 0, 'fell out of the world');
});
