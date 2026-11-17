import { createSite, gardenStages } from './garden/generate.js';
import { Mesher, sliceRanges } from './core/mesher.js';
import { createStage } from './render/scene.js';
import { createActors } from './render/actors.js';
import { createPlayer, VIEW } from './game/player.js';
import { createTour } from './game/tour.js';
import { createHud } from './ui/hud.js';
import { placeName } from './ui/places.js';
import { createAmbience } from './audio/ambience.js';
import { pondField, STREAM, distToPolyline, WATER_TOP, ROUTE, progressAlongPolyline } from './garden/layout.js';
import { clamp, smoothstep } from './core/noise.js';

const canvas = document.getElementById('view');
const hud = createHud();

// Site creation is deferred until the first frame so the loading screen can paint.
let site = null;
let stage = null;
let actors = null;
let controller = null;
let tour = null;
const audio = createAmbience();

const mode = {
  running: false,
  cycleDay: true,
  orbit: false,
  orbitAngle: 0.6,
  hudOn: true,
  fps: 60,
  lastClockUpdate: 0,
  startedAt: 0
};

// ---------------------------------------------------------------------------
// Loading: run generation and meshing across frames so the progress bar moves.
// ---------------------------------------------------------------------------
async function build() {
  site = createSite();
  hud.elements.stage.textContent = '庭園を設計中…';
  const stages = gardenStages(site);
  const totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);
  let done = 0;
  for (const s of stages) {
    hud.setProgress((done / totalWeight) * 0.62, s.label + '…');
    await nextFrame();
    s.run();
    done += s.weight;
    await nextFrame();
  }

  hud.setProgress(0.64, '面を組み立て中…');
  await nextFrame();
  const mesher = new Mesher(site.world);
  const ranges = sliceRanges(site.size.y, 10);
  for (let i = 0; i < ranges.length; i++) {
    mesher.buildSlice(ranges[i].y0, ranges[i].y1);
    hud.setProgress(0.64 + ((i + 1) / ranges.length) * 0.32, `面を組み立て中… ${Math.round(((i + 1) / ranges.length) * 100)}%`);
    await nextFrame();
  }
  const geoms = mesher.finish();

  hud.setProgress(0.98, '光を灯し、鯉を放つ…');
  await nextFrame();
  hud.attach(site);
  stage = createStage(canvas, site, geoms);
  stage.state.dayT = 0.315;
  actors = createActors(site, stage.scene);
  controller = createPlayer(canvas, site.world);
  tour = createTour(site);
  hud.drawMinimap(site.spawn.x, site.spawn.z, 0, 20);
  hud.setProgress(1, '用意できました');
  hud.ready();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function startGame() {
  audio.start();
  audio.bell();
  const spawn = site.spawn;
  controller.teleport(spawn.x, spawn.y + 1, spawn.z);
  controller.player.yaw = spawn.yaw;
  controller.player.pitch = -0.02;
  mode.running = true;
  mode.startedAt = performance.now();
  try {
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  } catch (err) {
    // Pointer lock needs a gesture; the canvas click handler will ask again.
  }
  hud.toast('クリックで視点を取得 / V で自動ガイド', 4200);
}

// ---------------------------------------------------------------------------
// Automatic modes (auto guide, orbit camera) get the music bed. Checked every frame
// so leaving a guide — by key, by Esc, or by finishing the circuit — always fades it out.
// ---------------------------------------------------------------------------
function syncBgm() {
  const wanted = tour.active || mode.orbit;
  if (wanted !== audio.bgmActive) audio.setBgm(wanted);
}

function nudgeVolume(kind, delta) {
  if (kind === 'bgm') {
    const v = audio.setBgmVolume(audio.bgmVolume + delta);
    hud.showVolume({ master: audio.volume, bgm: v });
    hud.toast(`BGM ${Math.round(v * 100)}`, 900);
  } else {
    const v = audio.setVolume(audio.volume + delta);
    hud.showVolume({ master: v, bgm: audio.bgmVolume });
    hud.toast(`音量 ${Math.round(v * 100)}`, 900);
  }
}

// ---------------------------------------------------------------------------
// Hotkeys
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (!mode.running) return;
  switch (e.code) {
    case 'KeyV':
      if (tour.active) {
        tour.stop();
        controller.player.lookEnabled = true;
        hud.setCaption(null);
        hud.toast('案内を終了');
      } else {
        mode.orbit = false;
        controller.player.fly = false;
        // Resume from the stretch of path the walker is standing on, so starting the guide
        // never drags them back to the gate through a tree.
        tour.start(progressAlongPolyline(controller.player.pos.x, controller.player.pos.z, ROUTE));
        controller.player.lookEnabled = false;
        hud.toast('自動ガイド開始 — もう一度 V で終了', 3200);
      }
      break;
    case 'KeyT':
      mode.cycleDay = !mode.cycleDay;
      hud.toast(mode.cycleDay ? '日時計 進行' : '日時計 停止');
      break;
    case 'KeyL':
      stage.state.lanternsOn = !stage.state.lanternsOn;
      hud.toast(stage.state.lanternsOn ? '灯籠を点す' : '灯籠を消す');
      break;
    case 'KeyM': {
      const muted = audio.setMuted(!audio.muted);
      hud.toast(muted ? '音を防ぐ' : '音を立てる');
      break;
    }
    case 'Minus':
    case 'NumpadSubtract':
      nudgeVolume('master', -0.05);
      break;
    case 'Equal':
    case 'NumpadAdd':
      nudgeVolume('master', 0.05);
      break;
    case 'Comma':
      nudgeVolume('bgm', -0.05);
      break;
    case 'Period':
      nudgeVolume('bgm', 0.05);
      break;
    case 'KeyH':
      mode.hudOn = hud.toggleHud();
      break;
    case 'KeyF':
      controller.player.fly = !controller.player.fly;
      controller.player.vel.y = 0;
      hud.toast(controller.player.fly ? '空を飛ぶ（Space/Q で昇降）' : '地面に降り立つ');
      break;
    case 'KeyR':
      tour.stop();
      controller.player.lookEnabled = true;
      hud.setCaption(null);
      mode.orbit = false;
      controller.teleport(site.spawn.x, site.spawn.y + 1, site.spawn.z);
      controller.player.yaw = site.spawn.yaw;
      hud.toast('総門まで戻りました');
      break;
    case 'KeyC':
      mode.orbit = !mode.orbit;
      controller.player.lookEnabled = !mode.orbit;
      if (mode.orbit) tour.stop();
      hud.setCaption(null);
      hud.toast(mode.orbit ? '庭園を一望（C でもどる）' : '歩行にもどる');
      break;
    case 'BracketLeft':
      stage.state.dayT = (stage.state.dayT + 0.986 + 1) % 1;
      break;
    case 'BracketRight':
      stage.state.dayT = (stage.state.dayT + 0.014) % 1;
      break;
    case 'Escape':
      if (tour.active) {
        tour.stop();
        controller.player.lookEnabled = true;
        hud.setCaption(null);
      }
      break;
    default:
      if (tour.active && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        tour.stop();
        controller.player.lookEnabled = true;
        hud.setCaption(null);
      }
  }
});

window.addEventListener('resize', () => {
  if (stage) stage.resize();
});

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let last = performance.now();
let hudClock = 0;
let miniTick = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
  last = now;
  if (!stage) return;

  const player = controller.player;
  if (mode.running) {
    if (tour.active) {
      const res = tour.update(dt, player);
      hud.setCaption(res.index);
      if (res.finished) {
        controller.player.lookEnabled = true;
        hud.toast('案内を終了しました');
      }
      player.enabled = true;
    } else if (!mode.orbit) {
      player.enabled = true;
      controller.update(dt);
      for (const step of controller.consumeSteps()) {
        audio.step(step.kind, step.surface, step.strength);
        if (step.kind === 'splash') actors.ripple(player.pos.x, WATER_TOP + 1, player.pos.z, 0.55, 1.7);
      }
    } else {
      player.enabled = false;
      controller.consumeSteps();
    }
  }

  syncBgm();

  // Clock of the garden.
  if (mode.cycleDay && mode.running) stage.state.dayT = (stage.state.dayT + dt / 300) % 1;

  // Camera.
  if (mode.orbit) {
    mode.orbitAngle += dt * 0.055;
    const r = 58 + Math.sin(mode.orbitAngle * 0.6) * 7;
    stage.camera.position.set(
      64 + Math.cos(mode.orbitAngle) * r,
      53 + Math.sin(mode.orbitAngle * 0.43) * 5,
      56 + Math.sin(mode.orbitAngle) * r
    );
    stage.camera.lookAt(64, 15, 58);
  } else {
    stage.camera.position.set(player.pos.x, player.pos.y + VIEW.eye + player.bob, player.pos.z);
    stage.camera.rotation.set(player.pitch, player.yaw, 0);
  }

  stage.update(dt, stage.camera.position);
  actors.update(dt, stage.state.elapsed, stage.state.night, stage.camera.position);

  // Sound field.
  const px = stage.camera.position.x;
  const pz = stage.camera.position.z;
  const field = pondField(px, pz);
  const dStream = distToPolyline(px, pz, STREAM);
  const nearPond = smoothstep(26, 2, Math.max(0, -field));
  const nearStream = smoothstep(14, 1, dStream);
  const wade = player.inWater ? 1 : 0;
  const wind = 0.4 + 0.35 * Math.sin(stage.state.elapsed * 0.13) * Math.sin(stage.state.elapsed * 0.041);
  audio.tick(dt, {
    water: clamp(Math.max(nearPond * 0.8, nearStream, wade), 0, 1),
    wind: clamp(wind, 0, 1),
    night: stage.state.night,
    day: 1 - stage.state.night
  });

  if (mode.running) {
    const submerged = clamp((player.waterDepth - 1) / 4, 0, 1);
    hud.setWet(player.inWater ? 0.18 + submerged * 0.72 : 0);
  }

  // HUD read-outs, throttled.
  mode.fps += (1 / dt - mode.fps) * 0.08;
  hudClock += dt;
  if (hudClock > 0.25) {
    hudClock = 0;
    const hours = stage.state.dayT * 24;
    const hh = String(Math.floor(hours)).padStart(2, '0');
    const mm = String(Math.floor((hours % 1) * 60)).padStart(2, '0');
    hud.setStatus({
      clock: `${hh}:${mm}`,
      place: placeName(site, px, pz),
      fps: Math.round(mode.fps)
    });
  }
  miniTick++;
  if (mode.hudOn && miniTick % 3 === 0) {
    hud.drawMinimap(player.pos.x, player.pos.z, mode.orbit ? mode.orbitAngle + Math.PI : player.yaw, stage.camera.position.y);
  }

  stage.renderer.render(stage.scene, stage.camera);
}

build().then(() => {
  hud.beginGame(startGame);
  hud.bindVolume({
    master: (v) => audio.setVolume(v),
    bgm: (v) => audio.setBgmVolume(v)
  });
  hud.showVolume({ master: audio.volume, bgm: audio.bgmVolume });
  // Small handle for automated smoke tests and the browser console.
  window.__teien = { site, stage, actors, controller, tour, mode, hud, audio, startGame };
  requestAnimationFrame(frame);
});
