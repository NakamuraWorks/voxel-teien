// The built-in walkthrough guide: walks the circuit, keeps the walker on the ground as the
// route climbs and falls, turns the head toward each subject and shows the caption card.
// Press V to start, V / Esc / any movement key to leave it.
import { TOUR, ROUTE, tAtPoint } from '../garden/layout.js';
import { VIEW } from '../game/player.js';

const DURATION = 168; // seconds for the whole circuit
const WINDOW = 0.048; // how wide a stop's caption stays up
const GROUND_FOLLOW = 3; // how fast the feet chase the planned height (1/s)
const GLIDE = 6; // hard cap on the guide's vertical speed (voxels/s ≈ 1.9 m/s)
const LOOK_AHEAD = 5; // polyline samples (~3 voxels) the ground is read from, so steps are climbed early
const BLEND = 3; // ± samples of averaging on top of that
const PROBE = 8; // rows the safety probe looks down before calling a column a hole

export function createTour(site) {
  const world = site.world;
  const stops = TOUR.map((s) => ({ ...s, t: tAtPoint(ROUTE, s.via) }));
  const route = site.route;
  const last = route.length - 1;
  let t = 0;
  let active = false;
  let shownIndex = null;

  /** Feet height on top of the highest solid within `fromY`, or null when the column is a hole. */
  function surfaceAt(x, z, fromY) {
    // Searching from ceil() rather than floor() matters: when the feet sit exactly on a voxel top,
    // the row directly above them is the one that would swallow the camera.
    const top = Math.min(world.sizeY - 1, Math.ceil(fromY));
    const row = world.topY(Math.round(x), Math.round(z), top);
    if (row < 0 || top - row > PROBE) return null;
    return row + 1;
  }

  /**
   * Planned foot height per polyline sample. Reading the ground straight under the walker makes
   * the camera hop every stone and plough into the deck at the 縁側 steps, so the profile looks
   * ahead (climb before the step arrives), averages it, then refuses to fall below the real
   * surface. Nothing else drives y while the guide runs, so this is the walker's ground.
   */
  function planFloor() {
    const raw = new Float64Array(route.length);
    let foot = site.spawn ? site.spawn.y : 14;
    for (let i = 0; i < route.length; i++) {
      const row = world.topY(
        Math.round(route[i].x),
        Math.round(route[i].z),
        Math.min(world.sizeY - 1, Math.round(foot + VIEW.stepUp))
      );
      if (row >= 0) foot = row + 1;
      raw[i] = foot;
    }
    const planned = new Float64Array(route.length);
    for (let i = 0; i < route.length; i++) {
      let highest = raw[i];
      for (let k = i + 1; k <= Math.min(last, i + LOOK_AHEAD); k++) highest = Math.max(highest, raw[k]);
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, i - BLEND); k <= Math.min(last, i + BLEND); k++) {
        sum += highest;
        n++;
      }
      planned[i] = Math.max(sum / n, raw[i]);
    }
    return planned;
  }

  const floor = planFloor();

  function pointAt(k) {
    const f = Math.max(0, Math.min(1, k)) * last;
    const i = Math.min(last - 1, Math.floor(f));
    const frac = f - i;
    const a = route[i];
    const b = route[i + 1];
    return { x: a.x + (b.x - a.x) * frac, z: a.z + (b.z - a.z) * frac };
  }

  function nearestAngle(current, target) {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function start(fromT = 0) {
    active = true;
    t = fromT;
    shownIndex = null;
  }

  function stop() {
    active = false;
    shownIndex = null;
  }

  function update(dt, player) {
    if (!active) return { index: null, t };
    t += dt / DURATION;
    if (t >= 1) {
      stop();
      return { index: null, t: 1, finished: true };
    }
    const here = pointAt(t);
    player.pos.x += (here.x + 0.5 - player.pos.x) * Math.min(1, dt * 2.4);
    player.pos.z += (here.z + 0.5 - player.pos.z) * Math.min(1, dt * 2.4);
    player.vel.x *= 0.55;
    player.vel.z *= 0.55;

    // Nothing else drives the vertical axis while the guide runs — the physics loop is skipped —
    // and the route climbs four voxels over the arch of 五橋 and drops back down, so a frozen y
    // buries the camera in the deck. Chase the planned height, and keep a per-frame probe as the
    // safety net so geometry can never swallow the camera.
    const f = t * last;
    const i0 = Math.min(last - 1, Math.floor(f));
    const planned = floor[i0] + (floor[i0 + 1] - floor[i0]) * (f - i0);
    // Rate-limited as well as eased: chasing an exponential target from far above (V pressed
    // while flying) would otherwise dive at tens of voxels per second on the first frame.
    const chase = (planned - player.pos.y) * Math.min(1, dt * GROUND_FOLLOW);
    player.pos.y += Math.max(-GLIDE * dt, Math.min(GLIDE * dt, chase));
    player.vel.y = 0;
    const under = surfaceAt(player.pos.x, player.pos.z, player.pos.y);
    if (under !== null && player.pos.y < under) player.pos.y = under;

    // Head toward the stop being described, otherwise along the path.
    let index = null;
    let best = WINDOW;
    for (let i = 0; i < stops.length; i++) {
      const d = Math.abs(stops[i].t - t);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    let aim;
    if (index !== null) {
      aim = stops[index].view;
    } else {
      const ahead = pointAt(Math.min(1, t + 0.02));
      aim = ahead;
    }
    const dx = aim.x + 0.5 - player.pos.x;
    const dz = aim.z + 0.5 - player.pos.z;
    const wanted = Math.atan2(-dx, -dz);
    player.yaw += nearestAngle(player.yaw, wanted) * Math.min(1, dt * 1.7);
    const eyeY = player.pos.y + 4.55;
    const aimY = aim.y === undefined ? player.pos.y + 4.7 : aim.y;
    const wantedPitch = Math.atan2(aimY - eyeY, Math.max(1, Math.hypot(dx, dz)));
    player.pitch += (Math.max(-0.5, Math.min(0.35, wantedPitch * 0.5)) - player.pitch) * Math.min(1, dt * 1.5);
    if (index !== shownIndex) {
      shownIndex = index;
    }
    return { index, t };
  }

  return {
    get active() {
      return active;
    },
    get t() {
      return t;
    },
    stops,
    start,
    stop,
    update
  };
}
