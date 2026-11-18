// Gamepad (standard mapping) polled every frame: left stick walks, right stick looks,
// the rest fire named press events that main.js maps to the same commands as the hotkeys.
// navigator.getGamepads only exists once a pad is pressed, so the adopt-on-connect
// fallback covers pads plugged in after load as well as the registered event.
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15
};

const DEADZONE = 0.16;
const TRIGGER = 0.5;

function shaped(v) {
  if (!Number.isFinite(v) || Math.abs(v) < DEADZONE) return 0;
  return (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}

export function createGamepad({ onPress, onConnect, onDisconnect } = {}) {
  let index = null;
  let id = '';
  const down = new Set();
  const state = {
    connected: false,
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    sprint: false,
    jump: false,
    ascend: false,
    descend: false
  };

  function adopt(pad) {
    index = pad.index;
    id = pad.id || 'ゲームパッド';
    state.connected = true;
    down.clear();
    if (onConnect) onConnect(id);
  }

  function drop() {
    index = null;
    state.connected = false;
    state.moveX = state.moveZ = state.lookX = state.lookY = 0;
    state.sprint = state.jump = state.ascend = state.descend = false;
    down.clear();
    if (onDisconnect) onDisconnect();
  }

  window.addEventListener('gamepadconnected', (e) => {
    if (e.gamepad && e.gamepad.mapping === 'standard') adopt(e.gamepad);
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad && e.gamepad.index === index) drop();
  });

  /** Read the live pad, fire press edges, and refresh the axis state. Call once per frame. */
  function poll() {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    if (index !== null && list[index] && list[index].connected) pad = list[index];
    else {
      for (const p of list) {
        if (p && p.connected && p.mapping === 'standard') {
          adopt(p);
          pad = p;
          break;
        }
      }
      if (!pad && index !== null) drop();
    }
    if (!pad) return null;

    const b = pad.buttons;
    const ax = pad.axes;
    for (const key of ['A', 'B', 'X', 'Y', 'LB', 'RB', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT']) {
      const i = PAD[key];
      const isDown = !!b[i] && (b[i].pressed || b[i].value > TRIGGER);
      if (isDown && !down.has(key) && onPress) onPress(key);
      if (isDown) down.add(key);
      else down.delete(key);
    }

    state.connected = true;
    state.moveX = shaped(ax[0] || 0);
    state.moveZ = shaped(ax[1] || 0);
    state.lookX = shaped(ax[2] || 0);
    state.lookY = shaped(ax[3] || 0);
    const lt = b[PAD.LT] ? (b[PAD.LT].value || (b[PAD.LT].pressed ? 1 : 0)) : 0;
    const rt = b[PAD.RT] ? (b[PAD.RT].value || (b[PAD.RT].pressed ? 1 : 0)) : 0;
    state.sprint = lt > 0.2;
    state.descend = lt > TRIGGER;
    state.ascend = rt > TRIGGER;
    state.jump = !!b[PAD.A] && (b[PAD.A].pressed || b[PAD.A].value > TRIGGER);
    return state;
  }

  return {
    poll,
    state,
    get connected() {
      return state.connected;
    },
    get id() {
      return id;
    }
  };
}
