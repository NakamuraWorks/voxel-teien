// Named spots for the HUD read-out. Ordered by specificity, nearest wins.
// All coordinates and radii are world voxels (layout.js RES).
import { BRIDGE, BAMBOO, DECK, KARESANSUI, MOUND, PLAZA, STREAM, RES, distToPolyline, SX, SZ } from '../garden/layout.js';
import { gIndex } from '../garden/terrain.js';

const TSUKUBAI = { x: 49 * RES, z: 86 * RES };
const POINTS = [
  { name: '総門', x: 65 * RES, z: 124 * RES, r: 7 * RES },
  { name: '鳥居', x: 65 * RES, z: 114 * RES, r: 6 * RES },
  { name: '蹲踞', x: TSUKUBAI.x, z: TSUKUBAI.z, r: 5 * RES },
  { name: '中之島', x: 71 * RES, z: 46 * RES, r: 6.5 * RES },
  { name: '五橋', x: BRIDGE.x, z: BRIDGE.z, r: 8 * RES },
  { name: '眺めの縁側', x: (DECK.x0 + DECK.x1) / 2, z: (DECK.z0 + DECK.z1) / 2, r: 12 * RES },
  { name: '松の岡', x: MOUND.cx, z: MOUND.cz, r: 13 * RES }
];

export function placeName(site, x, z) {
  if (x < 4 * RES || z < 4 * RES || x > SX - 5 * RES || z > SZ - 5 * RES) return '土塀';
  const i = gIndex(Math.round(x), Math.round(z));
  if (site.pondMask[i]) return '大池';
  if (site.streamMask[i]) return '渓流';
  if (x >= DECK.x0 - RES && x <= DECK.x1 + RES && z >= DECK.z0 - RES && z <= DECK.z1 + RES) return '眺めの縁側';
  if (x >= KARESANSUI.x0 && x <= KARESANSUI.x1 && z >= KARESANSUI.z0 && z <= KARESANSUI.z1) return '枯山水';
  if (x >= BAMBOO.x0 - 2 * RES && x <= BAMBOO.x1 + 2 * RES && z >= BAMBOO.z0 - 2 * RES && z <= BAMBOO.z1 + 2 * RES) return '竹林';
  if (x >= PLAZA.x0 && x <= PLAZA.x1 && z >= PLAZA.z0 - 2 * RES && z <= PLAZA.z1) return '総門の前';

  let best = Infinity;
  let name = null;
  for (const p of POINTS) {
    const d = Math.hypot(x - p.x, z - p.z) - p.r;
    if (d < 0 && d < best) {
      best = d;
      name = p.name;
    }
  }
  if (name) return name;

  const dStream = distToPolyline(x, z, STREAM);
  if (dStream < 6 * RES) return '渓音の谷';
  if (site.pathMask[i]) return '飛石の延段';
  const dm = Math.hypot((x - MOUND.cx) / MOUND.rx, (z - MOUND.cz) / MOUND.rz);
  if (dm < 1.4) return '苔庭';
  if (z < 40 * RES) return '北の杜';
  if (x < 45 * RES) return '西の苔';
  if (x > 88 * RES) return '東の砂州';
  return '回遊の径';
}
