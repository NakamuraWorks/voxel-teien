import test from 'node:test';
import assert from 'node:assert/strict';

const { generateGarden } = await import('../src/garden/generate.js');
const { createTour } = await import('../src/game/tour.js');
const { VIEW } = await import('../src/game/player.js');
const { RES } = await import('../src/garden/layout.js');

const site = generateGarden();
const dt = 1 / 60;
const tour = createTour(site);

/** Feet height the walker would rest at in this column, or null if nothing is within reach. */
function surfaceAt(x, z, fromY) {
  // ceil() so a voxel directly above feet that sit exactly on a top still counts as penetration.
  const top = Math.min(site.world.sizeY - 1, Math.ceil(fromY));
  const row = site.world.topY(Math.round(x), Math.round(z), top);
  return row < 0 ? null : row + 1;
}

function fakePlayer(y) {
  return {
    pos: { x: site.spawn.x, y, z: site.spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0
  };
}

/** Run the guide for `seconds` and record the vertical trace. */
function run(player, seconds, fromT = 0) {
  tour.start(fromT);
  const trace = [];
  let buriedBy = 0;
  let buriedAt = null;
  let maxJump = 0;
  let frames = 0;
  const total = Math.round(seconds / dt);
  while (frames < total) {
    const before = player.pos.y;
    const res = tour.update(dt, player);
    frames++;
    const floor = surfaceAt(player.pos.x, player.pos.z, player.pos.y);
    if (floor !== null && floor - player.pos.y > buriedBy) {
      buriedBy = floor - player.pos.y;
      buriedAt = { x: +player.pos.x.toFixed(1), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(1), floor };
    }
    maxJump = Math.max(maxJump, Math.abs(player.pos.y - before));
    trace.push(player.pos.y);
    if (res.finished) break;
  }
  tour.stop();
  return { trace, buriedBy, buriedAt, maxJump, frames };
}

test('the guide rides the ground for the whole circuit instead of ploughing through it', () => {
  const player = fakePlayer(site.spawn.y);
  const { trace, buriedBy, buriedAt, maxJump, frames } = run(player, 168);
  const summary = {
    frames,
    yMin: +Math.min(...trace).toFixed(2),
    yMax: +Math.max(...trace).toFixed(2),
    buriedBy: +buriedBy.toFixed(3),
    maxJump: +maxJump.toFixed(3)
  };
  console.log(`   guided lap: ${JSON.stringify(summary)}`);

  assert.ok(frames > 9000, `the circuit stopped early after ${frames} frames`);
  // The route really does climb (the arch of 五橋 sits ~5 voxels above the entrance paving),
  // so a guide that ignores height would show a flat trace and fail here.
  assert.ok(summary.yMax - summary.yMin >= 4 * RES, `height never followed the terrain: ${JSON.stringify(summary)}`);
  assert.ok(buriedBy < 0.05, `camera sank into the ground by ${buriedBy.toFixed(2)} at ${JSON.stringify(buriedAt)}`);
  assert.ok(maxJump < 0.2 * RES, `height jerked by ${maxJump.toFixed(2)} in one frame`);
  assert.ok(player.pos.y > 0 && Number.isFinite(player.pos.y), 'walker left the world');
});

test('entering the guide from a height settles onto the path smoothly', () => {
  const player = fakePlayer(site.spawn.y + 24 * RES); // as if V was pressed while flying
  player.pos.z = site.route[120].z; // somewhere along the route, mid-garden
  player.pos.x = site.route[120].x;
  const { trace, buriedBy, maxJump } = run(player, 6, 0.26);
  const settled = trace[trace.length - 1];
  const floor = surfaceAt(player.pos.x, player.pos.z, settled + VIEW.stepUp);
  const summary = {
    firstFrameY: +trace[0].toFixed(2),
    settledY: +settled.toFixed(2),
    floor: +floor.toFixed(2),
    maxJump: +maxJump.toFixed(3),
    buriedBy: +buriedBy.toFixed(3)
  };
  console.log(`   glide in: ${JSON.stringify(summary)}`);

  // One frame must not teleport: the drop has to be spread over time.
  assert.ok(trace[0] > site.spawn.y + 20 * RES, `height snapped on the first frame: ${trace[0]}`);
  // Close to the walking surface — it may still be a little above it, because the guide reads the
  // ground a few voxels ahead so that steps are climbed early — and never beneath it.
  assert.ok(settled >= floor - 0.05, `drove through the walking surface: ${JSON.stringify(summary)}`);
  assert.ok(settled - floor < 2.5 * RES, `never reached the walking surface: ${JSON.stringify(summary)}`);
  assert.ok(buriedBy < 0.05, `sank through the path: ${JSON.stringify(summary)}`);
  assert.ok(maxJump < 1 * RES, `height fell in one lump: ${JSON.stringify(summary)}`);
});

test('the guide leaves the walker standing on solid ground', () => {
  const player = fakePlayer(site.spawn.y);
  run(player, 61, 0.36); // stop mid-circuit the way pressing V again would
  const floor = surfaceAt(player.pos.x, player.pos.z, player.pos.y);
  const clearance = floor === null ? null : floor - player.pos.y;
  const support = surfaceAt(player.pos.x, player.pos.z, player.pos.y + VIEW.stepUp);
  console.log(`   hand-back: feet=${player.pos.y.toFixed(2)} floor=${floor} clearance=${clearance && +clearance.toFixed(3)}`);
  assert.notEqual(support, null, 'nothing under the walker where the guide handed back');
  assert.ok(clearance !== null && Math.abs(clearance) < 0.4 * RES, `left the walker off the ground: ${clearance}`);
  assert.equal(player.vel.y, 0, 'stale vertical velocity would fling them on hand-back');
});
