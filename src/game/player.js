// First-person walker: pointer-lock look, voxel AABB collision with auto step-up, wading,
// sprint and a fly mode. Positions are in voxel units (1 voxel ≈ 0.32 m).
import { T, soundOf } from '../core/palette.js';

export const VIEW = {
  eye: 4.55,
  height: 5.2,
  half: 0.62,
  stepUp: 1.15
};

const GRAVITY = 26;
const JUMP = 8.6;
const WALK = 8.2;
const SPRINT = 13.6;
const GROUND_ACCEL = 64;
const AIR_ACCEL = 22;
const FRICTION = 13;
const FRICTION_AIR = 1.4;
const FLY_SPEED = 24;

export function createPlayer(canvas, world) {
  const p = {
    pos: { x: 65.5, y: 20, z: 119.5 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: -0.04,
    grounded: false,
    fly: false,
    sprint: false,
    inWater: false,
    waterDepth: 0,
    bob: 0,
    stride: 0,
    steps: [],
    locked: false,
    enabled: true,
    lookEnabled: true,
    debug: { blockedX: false, blockedZ: false, stepped: false, hitY: 0 }
  };
  const keys = new Set();
  const LOOK = 0.0022;

  function isSolid(x, y, z) {
    return world.isSolid(x, y, z);
  }

  /** Any solid voxel inside the player's box? Returns the extreme blocking face if so. */
  function sweep(axis, amount) {
    const eps = 1e-3;
    const min = [
      p.pos.x - VIEW.half,
      p.pos.y + eps,
      p.pos.z - VIEW.half
    ];
    const max = [
      p.pos.x + VIEW.half,
      p.pos.y + VIEW.height - eps,
      p.pos.z + VIEW.half
    ];
    const x0 = Math.floor(min[0]);
    const x1 = Math.floor(max[0]);
    const y0 = Math.floor(min[1]);
    const y1 = Math.floor(max[1]);
    const z0 = Math.floor(min[2]);
    const z1 = Math.floor(max[2]);
    let face = null;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!isSolid(x, y, z)) continue;
          if (axis === 0) {
            const f = amount > 0 ? x : x + 1;
            face = face === null ? f : amount > 0 ? Math.min(face, f) : Math.max(face, f);
          } else if (axis === 1) {
            const f = amount > 0 ? y : y + 1;
            face = face === null ? f : amount > 0 ? Math.min(face, f) : Math.max(face, f);
          } else {
            const f = amount > 0 ? z : z + 1;
            face = face === null ? f : amount > 0 ? Math.min(face, f) : Math.max(face, f);
          }
        }
      }
    }
    return face;
  }

  function moveAxis(axis, amount) {
    if (amount === 0) return false;
    p.pos[['x', 'y', 'z'][axis]] += amount;
    const face = sweep(axis, amount);
    if (face === null) return false;
    const eps = 1e-3;
    const key = ['x', 'y', 'z'][axis];
    if (amount > 0) p.pos[key] = face - (axis === 1 ? VIEW.height : VIEW.half) - eps;
    else p.pos[key] = face + (axis === 1 ? 0 : VIEW.half) + eps;
    if (p.trace) p.trace.push({ phase: 'block', axis, amount, face, snapped: p.pos[key] });
    p.vel[key] = 0;
    return true;
  }

  function groundCheck() {
    const eps = 0.06;
    const y = p.pos.y - eps;
    const x0 = Math.floor(p.pos.x - VIEW.half);
    const x1 = Math.floor(p.pos.x + VIEW.half);
    const z0 = Math.floor(p.pos.z - VIEW.half);
    const z1 = Math.floor(p.pos.z + VIEW.half);
    let top = -Infinity;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(x, Math.floor(y), z)) top = Math.max(top, Math.floor(y) + 1);
      }
    }
    return top === -Infinity ? null : top;
  }

  /** Highest solid surface at or below `fromY` under the walker's footprint. */
  function supportBelow(fromY, depth = VIEW.stepUp + 0.5) {
    const x0 = Math.floor(p.pos.x - VIEW.half);
    const x1 = Math.floor(p.pos.x + VIEW.half);
    const z0 = Math.floor(p.pos.z - VIEW.half);
    const z1 = Math.floor(p.pos.z + VIEW.half);
    const start = Math.floor(fromY + 0.001);
    const stop = Math.floor(fromY - depth);
    for (let y = start; y >= stop; y--) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (isSolid(x, y, z)) return y + 1;
        }
      }
    }
    return null;
  }

  function waterCheck() {
    const fx = Math.floor(p.pos.x);
    const fz = Math.floor(p.pos.z);
    let depth = 0;
    for (let k = 0; k < 8; k++) {
      if (world.get(fx, Math.floor(p.pos.y) + k, fz) === T.WATER) depth = k + 1;
      else break;
    }
    p.inWater = world.get(fx, Math.floor(p.pos.y + 0.3), fz) === T.WATER;
    p.waterDepth = depth;
  }

  function surfaceSound() {
    const x = Math.floor(p.pos.x);
    const z = Math.floor(p.pos.z);
    for (let k = -1; k <= 1; k++) {
      const id = world.get(x, Math.floor(p.pos.y) - 1 + k, z);
      if (id !== T.AIR && id !== T.WATER) return soundOf(id);
    }
    return 'soft';
  }

  function update(dt) {
    if (!p.enabled) return;
    p.debug.blockedX = false;
    p.debug.blockedZ = false;
    p.debug.stepped = false;
    const forward = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
    const back = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
    const left = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
    const right = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
    let mx = right - left;
    let mz = forward - back;
    const mag = Math.hypot(mx, mz);
    if (mag > 0) {
      mx /= mag;
      mz /= mag;
    }
    p.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');

    // Local axes from yaw: forward points to -Z when yaw is 0.
    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
    const wishX = -sinY * mz + cosY * mx;
    const wishZ = -cosY * mz - sinY * mx;

    const wade = p.inWater ? 0.52 : 1;
    const speed = (p.fly ? FLY_SPEED : p.sprint ? SPRINT : WALK) * wade;
    const accel = p.grounded || p.fly ? GROUND_ACCEL : AIR_ACCEL;

    p.vel.x += (wishX * speed - p.vel.x) * Math.min(1, accel * dt * 0.14);
    p.vel.z += (wishZ * speed - p.vel.z) * Math.min(1, accel * dt * 0.14);

    if (p.fly) {
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('ControlLeft') || keys.has('KeyQ') ? 1 : 0);
      p.vel.y += (up * speed * 0.7 - p.vel.y) * Math.min(1, 9 * dt);
      p.vel.x *= 1 - Math.min(1, 3.4 * dt);
      p.vel.z *= 1 - Math.min(1, 3.4 * dt);
    } else {
      p.vel.y -= GRAVITY * dt;
      if (keys.has('Space') && p.grounded && !p.inWater) {
        p.vel.y = JUMP;
        p.grounded = false;
      }
      if (p.inWater) p.vel.y *= 1 - Math.min(1, 3.2 * dt);
      if (p.grounded && mag === 0) {
        const f = Math.min(1, FRICTION * dt);
        p.vel.x -= p.vel.x * f;
        p.vel.z -= p.vel.z * f;
      } else if (!p.grounded && mag === 0) {
        const f = Math.min(1, FRICTION_AIR * dt);
        p.vel.x -= p.vel.x * f;
        p.vel.z -= p.vel.z * f;
      }
    }

    const prevX = p.pos.x;
    const prevZ = p.pos.z;
    const prevY = p.pos.y;

    // Horizontal, with an automatic step-up so single-voxel stones are walkable.
    const dx = p.vel.x * dt;
    const dz = p.vel.z * dt;
    for (const axis of [0, 2]) {
      const amount = axis === 0 ? dx : dz;
      if (Math.abs(amount) < 1e-6) continue;
      const key = axis === 0 ? 'x' : 'z';
      const before = { x: p.pos.x, y: p.pos.y, z: p.pos.z, vel: p.vel[key] };
      if (!moveAxis(axis, amount)) {
        p.debug[axis === 0 ? 'blockedX' : 'blockedZ'] = false;
        continue;
      }
      p.debug[axis === 0 ? 'blockedX' : 'blockedZ'] = true;
      // Blocked: lift by one step, retry, and settle on the new floor if it is reachable.
      p.pos.x = before.x;
      p.pos.y = before.y + VIEW.stepUp;
      p.pos.z = before.z;
      p.vel[key] = before.vel;
      const still = moveAxis(axis, amount);
      const support = supportBelow(p.pos.y);
      const reachable = !still && support !== null && support - before.y <= VIEW.stepUp + 0.06 && support >= before.y;
      if (p.trace) p.trace.push({ ax: axis, phase: 'step', before: before.y, lifted: p.pos.y, still, support, reachable });
      if (reachable) {
        // Keep the lifted position and settle the feet on the new floor.
        p.pos.y = support;
        p.grounded = true;
        p.debug.stepped = true;
      } else {
        p.pos.x = before.x;
        p.pos.y = before.y;
        p.pos.z = before.z;
        p.vel[key] = before.vel;
        moveAxis(axis, amount);
      }
    }

    const dy = p.vel.y * dt;
    const yBefore = p.pos.y;
    const hitY = moveAxis(1, dy);
    if (p.trace) p.trace.push({ ax: 1, phase: 'gravity', dy, yBefore, yAfter: p.pos.y, hitY });
    p.debug.hitY = hitY ? (dy < 0 ? -1 : 1) : 0;
    if (hitY) {
      if (dy < 0) {
        p.grounded = true;
        const land = Math.abs(dy);
        if (land > 9) p.steps.push({ kind: 'land', strength: Math.min(1, land / 16) });
      }
    } else {
      const support = groundCheck();
      p.grounded = support !== null && Math.abs(support - p.pos.y) < 0.08;
    }

    // Fall-safety: never let the walker leave the world.
    if (p.pos.y < -6) {
      p.pos.y = 40;
      p.vel.y = 0;
    }

    waterCheck();

    const moved = Math.hypot(p.pos.x - prevX, p.pos.z - prevZ);
    if (p.grounded && moved > 0.001) {
      p.stride += moved;
      const stride = p.sprint ? 2.5 : 1.9;
      if (p.stride > stride * (p.inWater ? 1.35 : 1)) {
        p.stride = 0;
        p.steps.push({ kind: p.inWater && p.waterDepth > 0 ? 'splash' : 'step', surface: surfaceSound(), strength: p.sprint ? 1 : 0.7 });
      }
    }
    const targetBob = p.grounded && moved > 0.001 ? Math.sin(performance.now() * 0.001 * (p.sprint ? 13 : 9)) * (p.sprint ? 0.1 : 0.055) : 0;
    p.bob += (targetBob - p.bob) * Math.min(1, 8 * dt);
    if (p.pos.y !== prevY) p.verticalMoved = p.pos.y - prevY;
    return p;
  }

  function consumeSteps() {
    const out = p.steps;
    p.steps = [];
    return out;
  }

  function teleport(x, y, z) {
    p.pos.x = x;
    p.pos.y = y;
    p.pos.z = z;
    p.vel.x = p.vel.y = p.vel.z = 0;
  }

  // ---- input -----------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (p.locked && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('click', () => {
    if (!p.locked && canvas.requestPointerLock) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    p.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!p.locked || !p.lookEnabled) return;
    p.yaw -= e.movementX * LOOK;
    p.pitch -= e.movementY * LOOK;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  });

  return {
    player: p,
    update,
    consumeSteps,
    teleport,
    keys,
    get looking() {
      return p.locked;
    },
    look(yawDelta, pitchDelta) {
      p.yaw -= yawDelta;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - pitchDelta));
    }
  };
}
