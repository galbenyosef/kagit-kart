// What makes the ground a page of a book: faint printed text far from the road — running heads, page
// numbers and a passage of the chapter's story on each page. One CanvasTexture per track (disposed with the
// track) and one merged mesh of flat quads. Page text uses a system serif; nothing is downloaded.
import * as THREE from 'three';
import { t, upper } from '../i18n/i18n.js';

const SERIF = 'Georgia, "Times New Roman", "Noto Serif", "DejaVu Serif", serif';

const storyOf = (id) => {
  const k = ['meadow', 'bosphorus', 'glacier', 'desk'].includes(id) ? id : 'default';
  return [t(`story.${k}.0`), t(`story.${k}.1`)];
};

function luminance(c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function wrapLines(g, text, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (g.measureText(next).width > width && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Wrapped lines of a paragraph at one font size: the drop cap takes the first two lines' left side.
function layoutParagraph(g, text, w, size) {
  g.font = `${size}px ${SERIF}`;
  const capSize = size * 2.6;
  g.font = `bold ${capSize}px ${SERIF}`;
  const capW = g.measureText(text[0]).width + size * 0.3;
  g.font = `${size}px ${SERIF}`;
  const rest = text.slice(1);
  const firstLines = wrapLines(g, rest, w - capW).slice(0, 2);
  const used = firstLines.join(' ').length;
  const lines = firstLines.map((l) => ({ t: l, dx: capW, w: w - capW }))
    .concat(wrapLines(g, rest.slice(used).trim(), w).map((l) => ({ t: l, dx: 0, w })));
  return { capSize, lines, lead: size * 1.32 };
}

// Justified paragraph with a drop cap, like a picture book's text block. Longer text (English runs
// longer than the Turkish passages) shrinks, line height with it, until it fits maxH.
function paragraph(g, text, x, y, w, size, maxH) {
  let fs = size;
  let L = layoutParagraph(g, text, w, fs);
  while (fs > 20 && fs + (L.lines.length - 1) * L.lead > maxH) { fs -= 2; L = layoutParagraph(g, text, w, fs); }
  g.font = `bold ${L.capSize}px ${SERIF}`;
  g.fillText(text[0], x, y + L.capSize * 0.78);
  g.font = `${fs}px ${SERIF}`;
  L.lines.forEach((l, k) => {
    const words = l.t.split(' ');
    const last = k === L.lines.length - 1;
    const gapW = last || words.length < 2 ? g.measureText(' ').width
      : (l.w - words.reduce((a, s) => a + g.measureText(s).width, 0)) / (words.length - 1);
    let cx = x + l.dx;
    for (const s of words) { g.fillText(s, cx, y + fs + k * L.lead); cx += g.measureText(s).width + gapW; }
  });
}

function fleuron(g, x, y, s) {
  g.beginPath();
  for (const d of [-1, 1]) {
    g.moveTo(x, y);
    g.bezierCurveTo(x + d * s * 0.5, y - s * 0.5, x + d * s, y - s * 0.1, x + d * s * 1.6, y);
    g.bezierCurveTo(x + d * s, y + s * 0.1, x + d * s * 0.5, y + s * 0.5, x, y);
  }
  g.fill();
  g.beginPath(); g.arc(x, y, s * 0.16, 0, Math.PI * 2); g.fill();
}

// Canvas layout (2048 × 1024): two passages (0..1024 × 0..512 / 512..1024), left head, right head,
// two page numbers, and a chapter ornament line.
const REGIONS = {
  passageA: [0, 0, 1024, 512], passageB: [0, 512, 1024, 512],
  headL: [1024, 0, 1024, 256], headR: [1024, 256, 1024, 256],
  numL: [1024, 512, 512, 256], numR: [1536, 512, 512, 256],
  orn: [1024, 768, 1024, 256],
};

// Last baseline of a passage must stay within its 512 px half of the canvas.
const PASSAGE_H = 440;

function drawCanvas(def, inkCss) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = inkCss;
  g.textBaseline = 'alphabetic';
  const story = storyOf(def.id);
  paragraph(g, story[0], 40, 30, 944, 44, PASSAGE_H);
  paragraph(g, story[1], 40, 542, 944, 44, PASSAGE_H);
  const head = (text, [x, y, w, h]) => {
    let fs = Math.round(h * 0.34);
    g.font = `600 ${fs}px ${SERIF}`;
    g.textAlign = 'center';
    const spaced = text.split('').join(String.fromCharCode(8202));
    // a longer running head shrinks to stay inside its region instead of leaving the page
    const tw = g.measureText(spaced).width;
    if (tw > w * 0.92) { fs = Math.floor(fs * ((w * 0.92) / tw)); g.font = `600 ${fs}px ${SERIF}`; }
    g.fillText(spaced, x + w / 2, y + h * 0.62);
    g.fillRect(x + w * 0.18, y + h * 0.8, w * 0.64, 3);
    g.textAlign = 'left';
  };
  head('KÂĞIT KART', REGIONS.headL);
  head(upper(def.name || ''), REGIONS.headR);
  const chapter = def.chapter || 1;
  const left = 2 * (5 + 6 * chapter);
  const num = (n, [x, y, w, h]) => {
    g.font = `italic ${Math.round(h * 0.62)}px ${SERIF}`;
    g.textAlign = 'center';
    g.fillText(String(n), x + w / 2, y + h * 0.72);
    g.textAlign = 'left';
  };
  num(left, REGIONS.numL);
  num(left + 1, REGIONS.numR);
  const [ox, oy, ow, oh] = REGIONS.orn;
  let ofs = Math.round(oh * 0.3);
  g.font = `italic ${ofs}px ${SERIF}`;
  g.textAlign = 'center';
  // the subtitle shrinks to its region (the longer lines used to run off the canvas edge)
  const sw = g.measureText(def.subtitle || '').width;
  if (sw > ow * 0.94) { ofs = Math.floor(ofs * ((ow * 0.94) / sw)); g.font = `italic ${ofs}px ${SERIF}`; }
  g.fillText(def.subtitle || '', ox + ow / 2, oy + oh * 0.46);
  g.textAlign = 'left';
  fleuron(g, ox + ow / 2, oy + oh * 0.72, 34);
  return c;
}

// page: { minX, maxX, minZ, maxZ, y, spineX }; clearance(x, z) → metres from the nearest drivable edge.
export function buildPagePrint(mats, def, page, clearance) {
  const theme = def.theme;
  const paper = new THREE.Color(theme.paper), ink = new THREE.Color(theme.ink);
  // light print on a dark page (night chapters), ink print otherwise
  const inkCol = luminance(paper) < 0.18 ? paper.clone().lerp(new THREE.Color(theme.roadLine || '#f4e6c4'), 0.55) : ink;
  const canvas = drawCanvas(def, '#' + inkCol.getHexString(THREE.SRGBColorSpace));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.name = 'pagePrint';

  const quads = [];
  const put = (region, cx, cz, w) => {
    const [rx, ry, rw, rh] = REGIONS[region];
    const h = w * rh / rw;
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (rx + uv.getX(k) * rw) / 2048, 1 - (ry + (1 - uv.getY(k)) * rh) / 1024);
    }
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, page.y + 0.02, cz);
    quads.push(geo);
  };

  const { minX, maxX, minZ, maxZ, spineX } = page;
  const pages = [[minX, spineX], [spineX, maxX]];
  const headW = Math.min(150, (spineX - minX) * 0.45);
  put('headL', (minX + spineX) / 2, minZ + 26, headW);
  put('headR', (spineX + maxX) / 2, minZ + 26, headW);
  put('numL', minX + 42, maxZ - 26, 40);
  put('numR', maxX - 42, maxZ - 26, 40);

  // Each passage goes where its page is emptiest: the candidate farthest from the road.
  const blockW = 118, blockH = 59;
  pages.forEach(([x0, x1], k) => {
    let best = null;
    for (let x = x0 + blockW / 2 + 30; x <= x1 - blockW / 2 - 30; x += 16) {
      for (let z = minZ + 70; z <= maxZ - 60 - blockH; z += 16) {
        let c = Infinity;
        for (const [dx, dz] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1], [0, 0.5]]) c = Math.min(c, clearance(x + dx * blockW, z + dz * blockH));
        if (!best || c > best.c) best = { x, z, c };
      }
    }
    if (best && best.c > 30) {
      put(k ? 'passageB' : 'passageA', best.x, best.z + blockH / 2, blockW);
      if (k === 1) put('orn', best.x, best.z + blockH + 16, 60);
    }
  });

  const geo = mergeQuads(quads);
  const mat = mats.paper('#ffffff', { map: tex, transparent: true, depthWrite: false, halftone: false, unique: true, opacity: 0.62 });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -4;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pagePrint';
  mesh.receiveShadow = true;
  return { mesh, dispose() { tex.dispose(); } };
}

function mergeQuads(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
