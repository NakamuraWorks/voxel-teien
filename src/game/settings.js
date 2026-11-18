// Persistent player settings (localStorage; silently memory-only outside a browser).
const KEY = 'teien.settings.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ invertY: settings.invertY }));
  } catch {
    // private mode / file:// — the setting just will not survive a reload
  }
}

export const settings = {
  invertY: false
};

if (typeof localStorage !== 'undefined') settings.invertY = !!load().invertY;

export function setInvertY(value) {
  settings.invertY = !!value;
  save();
  return settings.invertY;
}
