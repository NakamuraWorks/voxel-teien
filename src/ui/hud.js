// All DOM: loading screen, status read-out, caption card, toasts and the hand-drawn minimap.
import { T, NAMES } from '../core/palette.js';
import { TOUR, tAtPoint, ROUTE, RES } from '../garden/layout.js';

const INK = '#f3ece0';

const MINIMAP_COLOR = {
  WATER: [30, 78, 92],
  SAND: [206, 197, 170],
  SAND_RIDGE: [181, 172, 148],
  STONE: [150, 150, 146],
  STONE_DARK: [104, 106, 110],
  GRAVEL: [126, 124, 118],
  ROCK: [124, 126, 130],
  ROCK_DARK: [86, 89, 93],
  MOSS_ROCK: [104, 122, 96],
  GRASS: [86, 118, 66],
  MOSS: [62, 96, 58],
  MOSS_LIGHT: [112, 146, 78],
  LEAF_PILE: [140, 68, 40],
  DIRT: [78, 60, 46],
  MUD: [58, 46, 36],
  WOOD: [130, 98, 64],
  WOOD_DARK: [80, 60, 42],
  PLANK: [158, 122, 82],
  BARK: [96, 70, 50],
  BARK_DARK: [66, 48, 34],
  PINE: [38, 78, 54],
  PINE_DARK: [30, 62, 44],
  MAPLE_RED: [150, 52, 42],
  MAPLE_ORANGE: [176, 96, 36],
  MAPLE_GOLD: [190, 142, 48],
  SHRUB: [52, 92, 52],
  SHRUB_LIGHT: [74, 118, 62],
  BAMBOO: [150, 162, 74],
  BAMBOO_LEAF: [82, 118, 56],
  IRIS: [66, 106, 74],
  IRIS_FLOWER: [104, 84, 148],
  REED: [158, 146, 96],
  TORII_RED: [168, 58, 44],
  TORII_DARK: [44, 40, 40],
  TORII_WHITE: [210, 206, 196],
  LANTERN_STONE: [166, 164, 156],
  LANTERN_FIRE: [255, 176, 92],
  LANTERN_PAPER: [255, 226, 170],
  WALL_EARTH: [96, 84, 66],
  SHINGLE: [56, 56, 62]
};

export function createHud() {
  let site = null;
  const el = {
    hud: document.getElementById('hud'),
    boot: document.getElementById('boot'),
    bar: document.getElementById('progress-bar'),
    stage: document.getElementById('stage-name'),
    start: document.getElementById('start'),
    clock: document.getElementById('clock'),
    place: document.getElementById('place'),
    fps: document.getElementById('fps'),
    caption: document.getElementById('caption'),
    captionTitle: document.getElementById('caption-title'),
    captionText: document.getElementById('caption-text'),
    captionProgress: document.getElementById('caption-progress'),
    toast: document.getElementById('toast'),
    wet: document.getElementById('wet'),
    hint: document.getElementById('hint'),
    mini: document.getElementById('minimap'),
    volMaster: document.getElementById('vol-master'),
    volMasterValue: document.getElementById('vol-master-value'),
    volBgm: document.getElementById('vol-bgm'),
    volBgmValue: document.getElementById('vol-bgm-value')
  };
  const mctx = el.mini.getContext('2d');
  const base = document.createElement('canvas');
  let bctx = null;
  let toastTimer = 0;

  function attach(nextSite) {
    site = nextSite;
    base.width = site.size.x;
    base.height = site.size.z;
    bctx = base.getContext('2d');
    paintMinimapBase();
  }

  function paintMinimapBase() {
    if (!site) return;
    const img = bctx.createImageData(site.size.x, site.size.z);
    const { sizeX, sizeZ } = site.world;
    let minH = 999;
    let maxH = -999;
    for (let i = 0; i < site.ground.length; i++) {
      const h = site.ground[i];
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const i = z * sizeX + x;
        const top = site.world.topY(x, z, 30 * RES);
        const id = top >= 0 ? site.world.get(x, top, z) : T.AIR;
        const key = NAMES[id];
        let rgb = MINIMAP_COLOR[key] || [70, 78, 62];
        // Relief: slope toward the north-west brightens, away darkens. Ground is sampled
        // per world voxel (finer by RES), so the gain comes back down by RES.
        const hl = site.ground[i] - site.ground[Math.max(0, i - 1)];
        const hd = site.ground[i] - site.ground[Math.max(0, i - sizeX)];
        const relief = (hl + hd) * (7 / RES);
        const height = 0.8 + ((site.ground[i] - minH) / (maxH - minH || 1)) * 0.3;
        const k = Math.max(0.42, Math.min(1.5, height + relief));
        const o = i * 4;
        img.data[o] = Math.min(255, rgb[0] * k);
        img.data[o + 1] = Math.min(255, rgb[1] * k);
        img.data[o + 2] = Math.min(255, rgb[2] * k);
        img.data[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  function setProgress(fraction, label) {
    el.bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    if (label) el.stage.textContent = label;
  }

  function ready() {
    el.stage.textContent = '用意できました';
    el.start.classList.remove('hidden');
    el.start.focus();
  }

  function beginGame(onStart) {
    el.start.addEventListener('click', () => {
      onStart();
      el.boot.classList.add('fading');
      setTimeout(() => el.boot.classList.add('hidden'), 950);
      el.hud.classList.remove('hidden');
    });
  }

  function setStatus({ clock, place, fps }) {
    if (clock !== undefined) el.clock.textContent = clock;
    if (place !== undefined) el.place.textContent = place;
    if (fps !== undefined) el.fps.textContent = String(fps);
  }

  function setCaption(stoppedIndex) {
    if (stoppedIndex === null || stoppedIndex === undefined) {
      el.caption.classList.add('hidden');
      return;
    }
    const stop = TOUR[stoppedIndex];
    if (!stop) return;
    el.caption.classList.remove('hidden');
    if (el.captionTitle.textContent !== stop.title) {
      el.captionTitle.textContent = stop.title;
      el.captionText.textContent = stop.text;
      el.captionProgress.innerHTML = TOUR.map((_, i) => `<i class="${i <= stoppedIndex ? 'on' : ''}"></i>`).join('');
    }
  }

  function toast(message, ms = 2200) {
    el.toast.textContent = message;
    el.toast.classList.remove('hidden');
    el.toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.style.opacity = '0';
      setTimeout(() => el.toast.classList.add('hidden'), 420);
    }, ms);
  }

  function setWet(v) {
    el.wet.style.opacity = String(Math.max(0, Math.min(1, v)));
  }

  function toggleHud() {
    const hide = !el.hud.classList.contains('hidden');
    el.hud.classList.toggle('hidden', hide);
    return !hide;
  }

  function drawMinimap(px, pz, yaw, cameraY) {
    if (!site) return;
    const size = el.mini.width;
    const scale = size / site.size.x;
    mctx.clearRect(0, 0, size, size);
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(base, 0, 0, size, size);

    // Tour stops.
    mctx.fillStyle = 'rgba(212,85,63,0.9)';
    for (const stop of TOUR) {
      const p = ROUTE[stop.via];
      mctx.beginPath();
      mctx.arc(p.x * scale, p.z * scale, 1.8, 0, Math.PI * 2);
      mctx.fill();
    }

    // View cone.
    const dirX = -Math.sin(yaw);
    const dirZ = -Math.cos(yaw);
    const angle = Math.atan2(dirZ, dirX);
    mctx.save();
    mctx.translate(px * scale, pz * scale);
    mctx.rotate(angle);
    const reach = 17 + (cameraY / RES) * 0.12;
    const grad = mctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    grad.addColorStop(0, 'rgba(255,246,230,0.42)');
    grad.addColorStop(1, 'rgba(255,246,230,0)');
    mctx.fillStyle = grad;
    mctx.beginPath();
    mctx.moveTo(0, 0);
    mctx.arc(0, 0, reach, -0.52, 0.52);
    mctx.closePath();
    mctx.fill();
    mctx.restore();

    mctx.fillStyle = INK;
    mctx.beginPath();
    mctx.arc(px * scale, pz * scale, 2.4, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = 'rgba(20,16,14,0.85)';
    mctx.lineWidth = 1;
    mctx.stroke();
  }

  function hint(text) {
    if (text) el.hint.innerHTML = text;
  }

  // The sliders sit outside the HUD's pointer-events: none, so they are grabbable once
  // pointer lock is released with Esc — the keys work either way.
  function bindVolume({ master, bgm }) {
    el.volMaster.addEventListener('input', () => master(Number(el.volMaster.value) / 100));
    el.volBgm.addEventListener('input', () => bgm(Number(el.volBgm.value) / 100));
  }

  function showVolume({ master, bgm }) {
    const m = Math.round(master * 100);
    const b = Math.round(bgm * 100);
    el.volMaster.value = String(m);
    el.volBgm.value = String(b);
    el.volMasterValue.textContent = String(m);
    el.volBgmValue.textContent = String(b);
  }

  return {
    attach,
    setProgress,
    ready,
    beginGame,
    setStatus,
    setCaption,
    toast,
    setWet,
    toggleHud,
    drawMinimap,
    hint,
    bindVolume,
    showVolume,
    elements: el
  };
}

export { tAtPoint };
