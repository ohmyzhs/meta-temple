/**
 * 절차적 캔버스 텍스처 — 외부 이미지 없이 기와·단청·석재·창호·탱화·현판을 그린다.
 * 모두 한 번만 만들어 캐시한다.
 */
import * as THREE from 'three';

const cache = new Map();
let anisotropy = 4;
export function setAnisotropy(a) {
  anisotropy = a;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = null, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// 결정적 의사난수 (텍스처가 매번 같게)
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, w, h, count, colors, sizeMin, sizeMax, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = sizeMin + r() * (sizeMax - sizeMin);
    ctx.globalAlpha = 0.25 + r() * 0.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** 높이(밝기) 캔버스 → 노멀맵 */
function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const data = sctx.getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/* ───── 기와 지붕 (골기와 줄 + 겹침) ───── */
export function roofTileTextures() {
  return cached('roof', () => {
    const W = 256, Hh = 256;
    const [hc, hctx] = canvas(W, Hh);
    const [cc, cctx] = canvas(W, Hh);
    const cols = 8, rows = 8;
    const cw = W / cols, rh = Hh / rows;
    for (let i = 0; i < cols; i++) {
      // 수키와 볼록면 (가로 그라데이션)
      const g = hctx.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
      g.addColorStop(0, '#202020');
      g.addColorStop(0.18, '#5a5a5a');
      g.addColorStop(0.5, '#e0e0e0');
      g.addColorStop(0.82, '#5a5a5a');
      g.addColorStop(1, '#202020');
      hctx.fillStyle = g;
      hctx.fillRect(i * cw, 0, cw, Hh);
    }
    // 겹침 단차
    for (let j = 0; j < rows; j++) {
      const y = j * rh;
      const g = hctx.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.12, 'rgba(0,0,0,0)');
      g.addColorStop(0.9, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(255,255,255,0.18)');
      hctx.fillStyle = g;
      hctx.fillRect(0, y, W, rh);
    }
    // 색: 짙은 회흑 + 얼룩
    cctx.fillStyle = '#3f4144';
    cctx.fillRect(0, 0, W, Hh);
    cctx.globalCompositeOperation = 'multiply';
    cctx.drawImage(hc, 0, 0);
    cctx.globalCompositeOperation = 'source-over';
    cctx.globalAlpha = 0.5;
    cctx.drawImage(hc, 0, 0);
    cctx.globalAlpha = 1;
    speckle(cctx, W, Hh, 900, ['#2a2b2d', '#55585b', '#4a4d47', '#5e6157'], 1, 3, 7);
    const color = tex(cc);
    const normal = tex(normalFromHeight(hc, 3), { srgb: false });
    return { color, normal };
  });
}

/* ───── 단청 띠 (창방·평방·도리) ───── */
export function dancheongBandTexture() {
  return cached('dancheong', () => {
    const [c, ctx] = canvas(512, 96);
    ctx.fillStyle = '#2d6a5a';
    ctx.fillRect(0, 0, 512, 96);
    // 테두리 선
    const lines = [
      [0, 6, '#b5432c'],
      [6, 3, '#f1e7cf'],
      [87, 3, '#f1e7cf'],
      [90, 6, '#b5432c']
    ];
    lines.forEach(([y, h, col]) => {
      ctx.fillStyle = col;
      ctx.fillRect(0, y, 512, h);
    });
    // 금문 (반복 꽃무늬)
    for (let i = 0; i < 4; i++) {
      const cx = 64 + i * 128, cy = 48;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.fillStyle = k % 2 ? '#d8573b' : '#3a73a8';
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 11, 6, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f1e7cf';
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e1b54a';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      // 사이 연결 무늬
      ctx.strokeStyle = '#f1e7cf';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 34, 22);
      ctx.bezierCurveTo(cx + 54, 34, cx + 54, 62, cx + 34, 74);
      ctx.moveTo(cx + 94, 22);
      ctx.bezierCurveTo(cx + 74, 34, cx + 74, 62, cx + 94, 74);
      ctx.stroke();
      ctx.fillStyle = '#e8a33a';
      ctx.fillRect(cx + 58, 30, 12, 36);
    }
    return tex(c);
  });
}

/* ───── 서까래 밑면 (녹청 서까래 + 연화 머리) ───── */
export function rafterTexture() {
  return cached('rafter', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#d9cfb6';
    ctx.fillRect(0, 0, 256, 256);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (256 / n);
      const g = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
      g.addColorStop(0, '#1d4a40');
      g.addColorStop(0.5, '#3d8a76');
      g.addColorStop(1, '#1d4a40');
      ctx.fillStyle = g;
      ctx.fillRect(x - 9, 0, 18, 256);
      // 끝 띠
      ctx.fillStyle = '#b5432c';
      ctx.fillRect(x - 9, 236, 18, 8);
      ctx.fillStyle = '#f1e7cf';
      ctx.fillRect(x - 9, 230, 18, 4);
      ctx.fillStyle = '#e1b54a';
      ctx.fillRect(x - 9, 246, 18, 10);
    }
    return tex(c);
  });
}

/* ───── 기둥 (석간주 + 나뭇결) ───── */
export function columnTexture() {
  return cached('column', () => {
    const [c, ctx] = canvas(128, 512);
    ctx.fillStyle = '#7a3527';
    ctx.fillRect(0, 0, 128, 512);
    const r = rng(11);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = r() > 0.5 ? 'rgba(40,12,6,0.25)' : 'rgba(170,90,60,0.18)';
      ctx.lineWidth = 0.5 + r() * 1.5;
      const x = r() * 128;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + i) * 3, y);
      ctx.stroke();
    }
    return tex(c);
  });
}

/* ───── 나무 (거친 목재) ───── */
export function woodTexture(base = '#6b4a2f', seed = 3) {
  return cached('wood' + base + seed, () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const r = rng(seed);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(${r() > 0.5 ? '30,18,8' : '160,120,80'},${0.12 + r() * 0.2})`;
      ctx.lineWidth = 0.5 + r() * 2;
      const y = r() * 256;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.5);
      ctx.stroke();
    }
    return tex(c);
  });
}

/* ───── 마루 (장마루 판재) ───── */
export function floorTexture() {
  return cached('floor', () => {
    const [c, ctx] = canvas(512, 512);
    const r = rng(5);
    const plank = 64;
    for (let i = 0; i < 8; i++) {
      const tone = 0.85 + r() * 0.25;
      ctx.fillStyle = `rgb(${Math.round(120 * tone)},${Math.round(82 * tone)},${Math.round(48 * tone)})`;
      ctx.fillRect(0, i * plank, 512, plank);
      for (let k = 0; k < 14; k++) {
        ctx.strokeStyle = `rgba(40,22,10,${0.1 + r() * 0.2})`;
        ctx.lineWidth = 1;
        const y = i * plank + r() * plank;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + k) * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20,10,4,0.6)';
      ctx.fillRect(0, i * plank, 512, 2);
      const seam = r() * 512;
      ctx.fillRect(seam, i * plank, 2, plank);
    }
    return tex(c);
  });
}

/* ───── 흙벽 / 회벽 ───── */
export function plasterTexture() {
  return cached('plaster', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#e9e1cf';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 2400, ['#d8ccb1', '#f4eee0', '#cfc2a4'], 1, 4, 21);
    return tex(c);
  });
}

/* ───── 창호 꽃살문 (낮: 창호지, 밤: 발광) ───── */
export function latticeTextures() {
  return cached('lattice', () => {
    const W = 256, H = 512;
    const [c, ctx] = canvas(W, H);
    const [e, ectx] = canvas(W, H);
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(0, 0, W, H);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, H);
    // 문틀
    ctx.fillStyle = '#6b3a24';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 60, W, 60);
    ctx.fillRect(0, 0, 14, H);
    ctx.fillRect(W - 14, 0, 14, H);
    ctx.fillRect(W / 2 - 5, 0, 10, H);
    ctx.fillRect(0, H - 150, W, 10);
    // 빗살 꽃살
    const draw = (x0, y0, x1, y1) => {
      ectx.fillStyle = '#ffd9a0';
      ectx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ectx.save();
      ectx.beginPath();
      ectx.rect(x0, y0, x1 - x0, y1 - y0);
      ectx.clip();
      const step = 18;
      for (let k = -H; k < H * 2; k += step) {
        for (const g of [ctx, ectx]) {
          g.strokeStyle = g === ctx ? '#7a4a2c' : '#000';
          g.lineWidth = 3.4;
          g.beginPath();
          g.moveTo(x0 + k, y0);
          g.lineTo(x0 + k + (y1 - y0), y1);
          g.moveTo(x0 + k, y1);
          g.lineTo(x0 + k + (y1 - y0), y0);
          g.stroke();
        }
      }
      ctx.restore();
      ectx.restore();
    };
    draw(14, 14, W / 2 - 5, H - 150);
    draw(W / 2 + 5, 14, W - 14, H - 150);
    // 아래 궁판 (단청 녹색)
    ctx.fillStyle = '#2d6a5a';
    ctx.fillRect(18, H - 140, W / 2 - 28, 74);
    ctx.fillRect(W / 2 + 10, H - 140, W / 2 - 28, 74);
    return { color: tex(c, { wrap: false }), emissive: tex(e, { wrap: false }) };
  });
}

/* ───── 화강암 ───── */
export function graniteTextures() {
  return cached('granite', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#a9a69c';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 5000, ['#6f6c66', '#c9c5b9', '#8c897f', '#d9d4c6', '#5c5a55'], 1, 3, 31);
    const [hc, hctx] = canvas(256, 256);
    hctx.drawImage(c, 0, 0);
    // 이끼 얼룩
    const r = rng(41);
    for (let i = 0; i < 18; i++) {
      const g = ctx.createRadialGradient(r() * 256, r() * 256, 0, r() * 256, r() * 256, 20 + r() * 40);
      g.addColorStop(0, 'rgba(90,100,60,0.22)');
      g.addColorStop(1, 'rgba(90,100,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    return { color: tex(c), normal: tex(normalFromHeight(hc, 1.6), { srgb: false }) };
  });
}

/* ───── 지면 디테일 (밝기 변조, 반복) ───── */
export function groundDetailTexture() {
  return cached('ground', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 7000, ['#5a5a5a', '#9a9a9a', '#707070', '#b0b0b0'], 1, 3, 51);
    const r = rng(52);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '60,60,60' : '170,170,170'},0.18)`;
      ctx.beginPath();
      ctx.ellipse(r() * 256, r() * 256, 2 + r() * 6, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const color = tex(c, { srgb: false });
    const normal = tex(normalFromHeight(c, 1.2), { srgb: false });
    return { color, normal };
  });
}

/* ───── 현판 ───── */
export function plaqueTexture(text, { vertical = false, w = 512, h = 160, bg = '#1e2b2a', fg = '#e2c06a' } = {}) {
  return cached('plaque' + text + vertical, () => {
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = '#7a3527';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2d6a5a';
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = bg;
    ctx.fillRect(18, 18, w - 36, h - 36);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    if (vertical) {
      const chars = [...text];
      const fs = Math.min((h - 70) / chars.length, w - 60);
      ctx.font = `900 ${fs}px "Noto Serif KR", serif`;
      chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 36 + fs * (i + 0.5)));
    } else {
      const chars = [...text];
      const fs = Math.min(h - 60, (w - 70) / chars.length);
      ctx.font = `900 ${fs}px "Noto Serif KR", serif`;
      const step = (w - 80) / chars.length;
      chars.forEach((ch, i) => ctx.fillText(ch, 40 + step * (i + 0.5), h / 2 + 4));
    }
    return tex(c, { wrap: false });
  });
}

/* ───── 후불탱화 (영산회상도 · 보살회상도) ───── */
// 조선 후기 탱화의 바탕색: 주홍 바탕, 녹청·군청 광배, 흰·분홍 구름, 금니 선
const T = {
  ground: '#a8321f', groundDark: '#7d2216', green: '#2f7a5c', greenDark: '#1f5442', blue: '#2f5f9a', blueDark: '#1f3f6b',
  gold: '#d9a940', white: '#efe6d0', pink: '#e2a79a', skin: '#f2d8b6', skinGold: '#e2b45c', ink: '#1d1a17', red: '#b22a1c', brown: '#8a5a36', grey: '#8d8a80'
};

function cloud(ctx, x, y, s, fill = T.white, edge = T.green) {
  // 오색 구름: 말린 덩굴 세 송이 + 꼬리
  ctx.save();
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  ctx.strokeStyle = edge;
  ctx.fillStyle = fill;
  for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.85, 0.2, 0.7], [0.3, -0.55, 0.6]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + dx * s + r * s * 0.1, y + dy * s, r * s * 0.28, Math.PI * 0.2, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x + s * 1.2, y + s * 0.3);
  ctx.quadraticCurveTo(x + s * 2.2, y + s * 0.9, x + s * 2.9, y + s * 0.2);
  ctx.stroke();
  ctx.restore();
}

/** 광배: 녹청 두광(금테·붉은 띠) */
function halo(ctx, x, y, r, inner = T.green, outer = T.blue) {
  ctx.fillStyle = T.gold;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = T.red;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.gold;
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();
}

function face(ctx, x, y, s, { fierce = false, skin = T.skin } = {}) {
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.5, s * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.ink;
  ctx.lineWidth = Math.max(1, s * 0.05);
  // 귀 (얼굴 옆에 붙은 길쭉한 귓불, 테 없이)
  ctx.fillStyle = skin;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + sx * s * 0.47, y + s * 0.1, s * 0.07, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 눈썹·눈·코·입
  ctx.lineWidth = Math.max(1, s * 0.045);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    if (fierce) {
      ctx.moveTo(x + sx * s * 0.08, y - s * 0.12);
      ctx.lineTo(x + sx * s * 0.36, y - s * 0.24);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + sx * s * 0.2, y - s * 0.03, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = T.ink;
      ctx.beginPath();
      ctx.arc(x + sx * s * 0.2, y - s * 0.03, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 버들잎 눈썹 (높고 길게) + 내려 뜬 가는 눈
      ctx.moveTo(x + sx * s * 0.06, y - s * 0.17);
      ctx.quadraticCurveTo(x + sx * s * 0.22, y - s * 0.27, x + sx * s * 0.4, y - s * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + sx * s * 0.09, y - s * 0.03);
      ctx.quadraticCurveTo(x + sx * s * 0.22, y - s * 0.08, x + sx * s * 0.36, y - s * 0.05);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.02);
  ctx.lineTo(x - s * 0.04, y + s * 0.2);
  ctx.lineTo(x + s * 0.04, y + s * 0.21);
  ctx.stroke();
  ctx.fillStyle = '#b8402e';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.33, s * (fierce ? 0.14 : 0.08), s * (fierce ? 0.06 : 0.035), 0, 0, Math.PI * 2);
  ctx.fill();
  if (fierce) {
    ctx.strokeStyle = T.ink;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y + s * 0.3);
    ctx.quadraticCurveTo(x, y + s * 0.65, x + s * 0.3, y + s * 0.3);
    ctx.stroke();
  }
}

/** 권속 한 분. kind: buddha | bodhi | monk | king. (x, y) = 얼굴 중심, s = 얼굴 높이 */
function figure(ctx, x, y, s, kind, r) {
  const robes = [T.red, T.green, T.blue, T.white, '#c97a2a'];
  const robe = kind === 'monk' ? [T.brown, T.grey, '#6f6a5a'][Math.floor(r() * 3)] : robes[Math.floor(r() * robes.length)];
  const lining = robe === T.red ? T.green : T.red;
  if (kind !== 'monk') halo(ctx, x, y - s * 0.05, s * (kind === 'king' ? 0.95 : 0.85), r() > 0.5 ? T.green : T.blue, r() > 0.5 ? T.blue : T.greenDark);
  // 몸
  const sh = s * (kind === 'king' ? 1.25 : 1.0);
  ctx.fillStyle = robe;
  ctx.strokeStyle = T.ink;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(x - sh * 0.35, y + s * 0.5);
  ctx.quadraticCurveTo(x - sh * 1.05, y + s * 0.75, x - sh * 1.1, y + s * 2.6);
  ctx.lineTo(x + sh * 1.1, y + s * 2.6);
  ctx.quadraticCurveTo(x + sh * 1.05, y + s * 0.75, x + sh * 0.35, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 안감 V 자 깃 + 금니 옷단
  ctx.fillStyle = lining;
  ctx.beginPath();
  ctx.moveTo(x - sh * 0.35, y + s * 0.5);
  ctx.lineTo(x, y + s * 1.35);
  ctx.lineTo(x + sh * 0.35, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = T.gold;
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x - sh * 0.35, y + s * 0.5);
  ctx.lineTo(x, y + s * 1.35);
  ctx.lineTo(x + sh * 0.35, y + s * 0.5);
  ctx.moveTo(x - sh * 1.1, y + s * 2.55);
  ctx.lineTo(x + sh * 1.1, y + s * 2.55);
  ctx.stroke();
  // 옷주름 먹선
  ctx.strokeStyle = 'rgba(29,26,23,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x - sh * (0.75 - k * 0.15), y + s * (1.2 + k * 0.35));
    ctx.quadraticCurveTo(x, y + s * (1.6 + k * 0.35), x + sh * (0.75 - k * 0.15), y + s * (1.2 + k * 0.35));
    ctx.stroke();
  }
  if (kind === 'king') {
    // 갑옷: 금 비늘 가슴판 + 띠
    ctx.fillStyle = T.gold;
    ctx.fillRect(x - sh * 0.55, y + s * 0.85, sh * 1.1, s * 0.75);
    ctx.strokeStyle = '#7a5a1a';
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(x - sh * 0.55, y + s * (0.95 + k * 0.11));
      ctx.lineTo(x + sh * 0.55, y + s * (0.95 + k * 0.11));
      ctx.stroke();
    }
    ctx.fillStyle = T.red;
    ctx.fillRect(x - sh * 0.7, y + s * 1.6, sh * 1.4, s * 0.16);
  }
  // 두 손 (합장 또는 지물)
  ctx.fillStyle = kind === 'buddha' ? T.skinGold : T.skin;
  ctx.strokeStyle = T.ink;
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.ellipse(x, y + s * 1.25, s * 0.14, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (kind === 'king') {
    // 칼
    ctx.strokeStyle = '#c9cfd6';
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.1, y + s * 1.2);
    ctx.lineTo(x + s * 0.9, y - s * 0.9);
    ctx.stroke();
  }
  // 얼굴
  const skin = kind === 'king' ? ['#d25a3c', '#4f8f6c', '#e8dcc6', '#3f6aa8'][Math.floor(r() * 4)] : kind === 'buddha' ? T.skinGold : T.skin;
  face(ctx, x, y, s, { fierce: kind === 'king', skin });
  // 머리
  if (kind === 'monk') {
    ctx.fillStyle = 'rgba(60,80,110,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.22, s * 0.5, s * 0.36, 0, Math.PI, 0);
    ctx.fill();
  } else if (kind === 'buddha') {
    ctx.fillStyle = '#23324f';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.25, s * 0.52, s * 0.4, 0, Math.PI, 0);
    ctx.ellipse(x, y - s * 0.62, s * 0.26, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.red;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.5, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 보관 (금관 + 보석)
    ctx.fillStyle = '#1f2a3a';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.28, s * 0.5, s * 0.34, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = T.gold;
    ctx.strokeStyle = '#7a5a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y - s * 0.38);
    ctx.lineTo(x - s * 0.36, y - s * (kind === 'king' ? 1.0 : 0.85));
    ctx.lineTo(x - s * 0.12, y - s * 0.6);
    ctx.lineTo(x, y - s * (kind === 'king' ? 1.15 : 1.0));
    ctx.lineTo(x + s * 0.12, y - s * 0.6);
    ctx.lineTo(x + s * 0.36, y - s * (kind === 'king' ? 1.0 : 0.85));
    ctx.lineTo(x + s * 0.5, y - s * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = r() > 0.5 ? T.red : T.blue;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.62, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

function lotusThrone(ctx, x, y, w, h) {
  for (let row = 0; row < 2; row++) {
    const n = 9 - row * 2;
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + (w * (i + 0.5)) / n;
      ctx.fillStyle = row ? '#e7a6a0' : '#d86a5c';
      ctx.strokeStyle = T.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - w / n / 2, y + h * (row ? -0.25 : 0.25));
      ctx.quadraticCurveTo(px, y - h * (row ? 1.1 : 0.55), px + w / n / 2, y + h * (row ? -0.25 : 0.25));
      ctx.quadraticCurveTo(px, y + h * 0.4, px - w / n / 2, y + h * (row ? -0.25 : 0.25));
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** kind: 'center' 영산회상도 | 'side' 보살회상도 */
export function taenghwaTexture(kind = 'center') {
  return cached('taenghwa-' + kind, () => {
    const W = kind === 'center' ? 2048 : 1024, H = kind === 'center' ? 1708 : 1104;
    const [c, ctx] = canvas(W, H);
    const r = rng(kind === 'center' ? 301 : 417);
    // 장황(비단 테) → 붉은 바탕
    ctx.fillStyle = '#26534f';
    ctx.fillRect(0, 0, W, H);
    const m = W * 0.035;
    ctx.fillStyle = T.gold;
    ctx.fillRect(m * 0.7, m * 0.7, W - m * 1.4, H - m * 1.4);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.1, W / 2, H * 0.5, W * 0.75);
    g.addColorStop(0, T.ground);
    g.addColorStop(1, T.groundDark);
    ctx.fillStyle = g;
    ctx.fillRect(m, m, W - m * 2, H - m * 2);
    // 세월에 바랜 얼룩
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '40,10,5' : '230,190,150'},${0.02 + r() * 0.04})`;
      ctx.beginPath();
      ctx.arc(m + r() * (W - 2 * m), m + r() * (H - 2 * m), 3 + r() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(m, m, W - m * 2, H - m * 2);
    ctx.clip();
    // 오색 구름 띠 (위)
    for (let i = 0; i < (kind === 'center' ? 14 : 7); i++) cloud(ctx, m + ((i + 0.3) / (kind === 'center' ? 14 : 7)) * (W - 2 * m), m + H * (0.06 + r() * 0.04), W * 0.018 + r() * W * 0.008, r() > 0.6 ? '#f1d2c4' : T.white, r() > 0.5 ? T.green : T.blue);
    const S = W / 2048; // 크기 기준
    if (kind === 'center') {
      // 화불 한 줄
      for (let i = 0; i < 9; i++) figure(ctx, m + ((i + 0.5) / 9) * (W - 2 * m), H * 0.13, 34 * S, 'buddha', r);
      // 본존: 거신광 + 연화좌
      const cx = W / 2, cy = H * 0.42;
      ctx.fillStyle = T.gold;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 250 * S, 330 * S, 430 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [rad, col] of [[0.97, T.blueDark], [0.88, T.red], [0.8, T.green], [0.7, '#5c8fbf']]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 250 * S, 330 * S * rad, 430 * S * rad, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(240,210,120,0.6)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 120 * S, cy + 250 * S + Math.sin(a) * 160 * S);
        ctx.lineTo(cx + Math.cos(a) * 225 * S, cy + 250 * S + Math.sin(a) * 300 * S);
        ctx.stroke();
      }
      halo(ctx, cx, cy, 150 * S, T.green, T.blue);
      // 본존 몸 (금빛 살, 붉은 가사)
      figure(ctx, cx, cy, 140 * S, 'buddha', () => 0.0);
      lotusThrone(ctx, cx, cy + 420 * S, 560 * S, 90 * S);
      // 좌우 권속: 보살(아래 두 줄) · 제자(위) · 사천왕(네 귀퉁이)
      for (const sx of [-1, 1]) {
        for (let row = 0; row < 2; row++)
          for (let i = 0; i < 3; i++) {
            const x = cx + sx * (430 + i * 150 + row * 40) * S;
            figure(ctx, x, H * (0.5 + row * 0.2) - i * 18 * S, (64 - row * 4) * S, 'bodhi', r);
          }
        for (let i = 0; i < 5; i++) figure(ctx, cx + sx * (300 + i * 120) * S, H * 0.28 + (i % 2) * 40 * S, 46 * S, 'monk', r);
        figure(ctx, cx + sx * 880 * S, H * 0.27, 78 * S, 'king', r);
        figure(ctx, cx + sx * 880 * S, H * 0.78, 84 * S, 'king', r);
      }
      // 아래 구름
      for (let i = 0; i < 8; i++) cloud(ctx, m + ((i + 0.5) / 8) * (W - 2 * m), H * 0.93, 26 * S, T.white, T.green);
    } else {
      // 보살회상: 가운데 보살과 둘레 권속
      const cx = W / 2, cy = H * 0.36;
      halo(ctx, cx, cy + 150 * S, 300 * S, T.blue, T.green);
      halo(ctx, cx, cy, 150 * S, T.green, T.blue);
      figure(ctx, cx, cy, 120 * S, 'bodhi', () => 0.2);
      lotusThrone(ctx, cx, cy + 330 * S, 420 * S, 80 * S);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) figure(ctx, cx + sx * (290 + (i % 2) * 70) * S, H * (0.24 + i * 0.22), 56 * S, i === 1 ? 'monk' : 'bodhi', r);
        figure(ctx, cx + sx * 380 * S, H * 0.8, 70 * S, 'king', r);
      }
      for (let i = 0; i < 5; i++) cloud(ctx, m + ((i + 0.5) / 5) * (W - 2 * m), H * 0.94, 24 * S, T.white, T.blue);
    }
    ctx.restore();
    // 금니 테두리 선
    ctx.strokeStyle = T.gold;
    ctx.lineWidth = 3;
    ctx.strokeRect(m - 4, m - 4, W - m * 2 + 8, H - m * 2 + 8);
    return tex(c, { wrap: false });
  });
}

/* ───── 우물천장: 녹색 반자틀 + 청판의 연화문 ───── */
export function ceilingTexture() {
  return cached('ceiling', () => {
    const N = 512;
    const [c, ctx] = canvas(N, N);
    // 청판 바탕 (짙은 녹청)
    ctx.fillStyle = '#1e4a45';
    ctx.fillRect(0, 0, N, N);
    // 반자틀: 뇌록 바탕 + 흰·먹 줄
    const F = N * 0.1;
    const frame = (x, y, w, h) => {
      ctx.fillStyle = '#3f7d5f';
      ctx.fillRect(x, y, w, h);
    };
    frame(0, 0, N, F / 2);
    frame(0, N - F / 2, N, F / 2);
    frame(0, 0, F / 2, N);
    frame(N - F / 2, 0, F / 2, N);
    ctx.strokeStyle = '#f0e8d4';
    ctx.lineWidth = 3;
    ctx.strokeRect(F / 2 + 3, F / 2 + 3, N - F - 6, N - F - 6);
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 2;
    ctx.strokeRect(F / 2 + 7, F / 2 + 7, N - F - 14, N - F - 14);
    // 틀 가운데 줄
    ctx.strokeStyle = '#d9b04a';
    ctx.lineWidth = 2;
    for (const t of [F / 4, N - F / 4]) {
      ctx.beginPath();
      ctx.moveTo(0, t);
      ctx.lineTo(N, t);
      ctx.moveTo(t, 0);
      ctx.lineTo(t, N);
      ctx.stroke();
    }
    // 네 모서리(이웃 칸과 맞물려 하나가 됨): 붉은 꽃 + 금 테
    const rosette = (x, y, R) => {
      for (const [rr, col] of [[1, '#d9b04a'], [0.8, '#b8402b'], [0.5, '#f0e8d4'], [0.3, '#2f6a9a']]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, R * rr, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    for (const x of [0, N]) for (const y of [0, N]) rosette(x, y, F * 0.7);
    // 가운데 연화문: 바깥 녹청 꽃잎 → 붉은 꽃잎(흰 테) → 노란 씨방
    const cx = N / 2, cy = N / 2;
    const petals = (n, R, w, fill, edge, rot = 0) => {
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(w, -R * 0.55, 0, -R);
        ctx.quadraticCurveTo(-w, -R * 0.55, 0, 0);
        ctx.fillStyle = fill;
        ctx.fill();
        if (edge) {
          ctx.strokeStyle = edge;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    ctx.fillStyle = '#2b5f86';
    ctx.beginPath();
    ctx.arc(cx, cy, N * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f0e8d4';
    ctx.lineWidth = 3;
    ctx.stroke();
    petals(16, N * 0.34, N * 0.07, '#3f8a6a', '#e8e0c8', Math.PI / 16);
    petals(8, N * 0.27, N * 0.11, '#c8452f', '#f3d7c8');
    petals(8, N * 0.19, N * 0.08, '#e7a294', null, Math.PI / 8);
    for (const [rr, col] of [[0.085, '#d9b04a'], [0.06, '#b8402b'], [0.035, '#f0e8d4']]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, N * rr, 0, Math.PI * 2);
      ctx.fill();
    }
    return tex(c);
  });
}

/* ───── 수미단 판넬: 녹·청 테 안에 모란과 연꽃 (한 칸) ───── */
export function sumidanTexture() {
  return cached('sumidan', () => {
    const W = 512, H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#5a1810';
    ctx.fillRect(0, 0, W, H);
    // 테: 녹색 → 금 → 청
    ctx.fillStyle = '#2f6e55';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d6a945';
    ctx.fillRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = '#2a4f86';
    ctx.fillRect(20, 20, W - 40, H - 40);
    ctx.fillStyle = '#8a2818';
    ctx.fillRect(30, 30, W - 60, H - 60);
    const r = rng(53);
    const peony = (x, y, s) => {
      // 잎
      ctx.fillStyle = '#2f7a4f';
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.7;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, s * 1.05, s * 0.32, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 꽃잎 겹
      for (const [rr, col] of [[1, '#e7869a'], [0.75, '#d24f62'], [0.5, '#f3c0c4'], [0.25, '#e3b04a']]) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + rr;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * s * rr * 0.45, y + Math.sin(a) * s * rr * 0.45, s * rr * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    const lotus = (x, y, s) => {
      ctx.fillStyle = '#3f8a5a';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.9, s * 1.3, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = -2; k <= 2; k++) {
        ctx.save();
        ctx.translate(x, y + s * 0.5);
        ctx.rotate(k * 0.42);
        ctx.fillStyle = k % 2 ? '#f1c6c6' : '#e48c92';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 0.45, -s * 0.6, 0, -s * 1.3);
        ctx.quadraticCurveTo(-s * 0.45, -s * 0.6, 0, 0);
        ctx.fill();
        ctx.strokeStyle = '#d6a945';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    };
    // 덩굴 줄기
    ctx.strokeStyle = '#3b8a5a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(40, H * 0.7);
    ctx.bezierCurveTo(W * 0.3, H * 0.2, W * 0.6, H * 0.95, W - 40, H * 0.4);
    ctx.stroke();
    peony(W * 0.3, H * 0.48, 46);
    lotus(W * 0.72, H * 0.45, 52);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = r() > 0.5 ? '#f3d27a' : '#e9e0cc';
      ctx.beginPath();
      ctx.arc(40 + r() * (W - 80), 40 + r() * (H - 80), 3 + r() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return tex(c);
  });
}

/* ───── 닫집: 공포(포작) 층 앞면 — 단청 짠 받침들 ───── */
export function canopyTexture() {
  return cached('canopy', () => {
    const W = 512, H = 128;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#2f6e55';
    ctx.fillRect(0, 0, W, H);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (W / n);
      // 받침(첨차) 겹: 아래로 좁아지는 계단
      for (let k = 0; k < 3; k++) {
        const w = W / n - 8 - k * 14, y = 18 + k * 34;
        ctx.fillStyle = ['#b8402b', '#2a5d97', '#3f8a5f'][k];
        ctx.fillRect(x - w / 2, y, w, 28);
        ctx.strokeStyle = '#e5c06a';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - w / 2, y, w, 28);
        ctx.fillStyle = '#f0e8d4';
        ctx.beginPath();
        ctx.arc(x, y + 14, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#d6a945';
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H - 8, W, 8);
    return tex(c);
  });
}

/** 낙양(투각 장식): 금빛 덩굴과 구름이 아래로 드리운 띠 (알파로 오려 낸다) */
export function valanceTexture() {
  return cached('valance', () => {
    const W = 1024, H = 192;
    const [c, ctx] = canvas(W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#d6a945';
    ctx.fillRect(0, 0, W, 22);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (W / n);
      ctx.strokeStyle = '#d6a945';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - W / n / 2 + 10, 22);
      ctx.bezierCurveTo(x - 60, 120, x - 10, 150, x, 120);
      ctx.bezierCurveTo(x + 10, 150, x + 60, 120, x + W / n / 2 - 10, 22);
      ctx.stroke();
      // 가운데 드리개: 붉은 구름 송이 + 금테
      ctx.fillStyle = '#b8402b';
      ctx.beginPath();
      ctx.arc(x, 150, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = '#2a5d97';
      ctx.beginPath();
      ctx.arc(x, 150, 9, 0, Math.PI * 2);
      ctx.fill();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.lineWidth = 6;
        ctx.arc(x + sx * 46, 70, 20, 0, Math.PI * 1.6);
        ctx.stroke();
      }
    }
    return tex(c);
  });
}

/* ───── 대나무 줄기 ───── */
export function bambooTexture() {
  return cached('bamboo', () => {
    const [c, ctx] = canvas(64, 256);
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, '#3e5a2a');
    g.addColorStop(0.5, '#86a35a');
    g.addColorStop(1, '#3e5a2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 64) {
      ctx.fillStyle = 'rgba(230,230,190,0.6)';
      ctx.fillRect(0, y, 64, 3);
      ctx.fillStyle = 'rgba(40,50,20,0.5)';
      ctx.fillRect(0, y + 3, 64, 2);
    }
    return tex(c);
  });
}

/* ───── 아바타 얼굴 (눈 감은 미소) ───── */
export function faceTexture(skin = '#f1e3c8', { blush = true } = {}) {
  return cached('face' + skin + blush, () => {
    const [c, ctx] = canvas(512, 256);
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, 512, 256);
    // three SphereGeometry: u=0.25 가 +Z(정면)
    const cx = 128, cy = 136;
    ctx.strokeStyle = '#2e2018';
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      // 감은 눈 (아래로 휜 초승달)
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx + s * 24, cy - 6, 11, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      // 눈썹
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(cx + s * 24, cy - 14, 15, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 미소
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.arc(cx, cy + 16, 8, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
    if (blush) {
      for (const s of [-1, 1]) {
        const g = ctx.createRadialGradient(cx + s * 36, cy + 10, 0, cx + s * 36, cy + 10, 14);
        g.addColorStop(0, 'rgba(225,125,115,0.5)');
        g.addColorStop(1, 'rgba(225,125,115,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx + s * 36 - 16, cy - 6, 32, 32);
      }
    }
    return tex(c, { wrap: false });
  });
}

/* ───── 스프라이트 (부드러운 원, 연기, 불꽃) ───── */
export function softDotTexture() {
  return cached('dot', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return tex(c, { wrap: false });
  });
}

export function smokeTexture() {
  return cached('smoke', () => {
    const [c, ctx] = canvas(128, 128);
    const r = rng(91);
    for (let i = 0; i < 26; i++) {
      const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, s = 14 + r() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    return tex(c, { wrap: false });
  });
}

export function flameTexture() {
  return cached('flame', () => {
    const [c, ctx] = canvas(64, 128);
    const g = ctx.createRadialGradient(32, 92, 2, 32, 80, 50);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.25, 'rgba(255,200,90,0.95)');
    g.addColorStop(0.6, 'rgba(240,110,30,0.5)');
    g.addColorStop(1, 'rgba(200,40,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.bezierCurveTo(58, 60, 54, 120, 32, 124);
    ctx.bezierCurveTo(10, 120, 6, 60, 32, 4);
    ctx.fill();
    return tex(c, { wrap: false });
  });
}

/**
 * 화로 숯불: 검은 숯덩이들 사이 틈이 붉게 이글거린다. color(숯 빛깔)와 glow(빛나는 곳, emissiveMap) 두 장 — 같은 숯 배치.
 * 숯덩이 가장자리가 가장 밝고, 몇몇 덩이는 속이 갈라져 빛난다.
 */
export function coalBedTextures() {
  return cached('coals', () => {
    const S = 256;
    const [cc, c] = canvas(S, S);
    const [gc, g] = canvas(S, S);
    const r = rng(77);
    c.fillStyle = '#160d08';
    c.fillRect(0, 0, S, S);
    const glowBase = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
    glowBase.addColorStop(0, '#ffb04a');
    glowBase.addColorStop(0.55, '#ff6a1e');
    glowBase.addColorStop(1, '#5a1406');
    g.fillStyle = glowBase;
    g.fillRect(0, 0, S, S);
    const chunk = (ctx, x, y, rad, rot, sides) => {
      ctx.beginPath();
      for (let k = 0; k < sides; k++) {
        const a = rot + (k / sides) * Math.PI * 2, rr = rad * (0.7 + r() * 0.45);
        ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
    };
    for (let i = 0; i < 95; i++) {
      const x = r() * S, y = r() * S, rad = 9 + r() * 17, rot = r() * 6.28, sides = 5 + ((r() * 3) | 0);
      const shade = 34 + r() * 30;
      c.fillStyle = `rgb(${shade + 6},${shade},${shade - 6})`;
      chunk(c, x, y, rad, rot, sides);
      c.fill();
      // 빛: 숯덩이는 어둡게 덮고, 가장자리는 이글거리게 (안쪽으로 줄인 덩이를 어둡게)
      g.save();
      g.globalAlpha = 0.9;
      g.fillStyle = '#1a0702';
      chunk(g, x, y, rad * 0.86, rot, sides);
      g.fill();
      g.restore();
      if (r() < 0.22) {
        // 속이 갈라져 빛나는 덩이
        g.strokeStyle = `rgba(255,${150 + r() * 80},60,0.9)`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x - rad * 0.5, y + (r() - 0.5) * rad);
        g.quadraticCurveTo(x, y + (r() - 0.5) * rad, x + rad * 0.5, y + (r() - 0.5) * rad);
        g.stroke();
      }
    }
    return { color: tex(cc, { wrap: false }), glow: tex(gc, { wrap: false }) };
  });
}

/**
 * 혀 모양 불꽃 (정사각 — 점 입자는 정사각으로 그려지므로 세로 그림이 눌리지 않게 가운데 좁고 길게).
 * 밑동은 희고 뜨겁게, 위로 가며 주황, 끝은 가늘게 흩어진다. 가장자리는 흐리게.
 */
export function tongueTexture() {
  return cached('tongue', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    ctx.filter = 'blur(2.5px)';
    const g = ctx.createLinearGradient(0, S - 6, 0, 6);
    g.addColorStop(0, 'rgba(255,250,228,1)');
    g.addColorStop(0.28, 'rgba(255,214,120,0.95)');
    g.addColorStop(0.62, 'rgba(250,140,50,0.6)');
    g.addColorStop(1, 'rgba(230,70,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(64, 6);
    ctx.bezierCurveTo(74, 34, 92, 66, 88, 98);
    ctx.bezierCurveTo(85, 118, 74, 124, 64, 124);
    ctx.bezierCurveTo(54, 124, 43, 118, 40, 98);
    ctx.bezierCurveTo(36, 66, 56, 40, 64, 6);
    ctx.fill();
    // 속불: 밑동 가운데가 더 밝게
    const r = ctx.createRadialGradient(64, 104, 2, 64, 100, 26);
    r.addColorStop(0, 'rgba(255,255,240,0.9)');
    r.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = r;
    ctx.fillRect(30, 70, 68, 56);
    ctx.filter = 'none';
    return tex(c, { wrap: false });
  });
}

/* ───── 물결 노멀 (타일링) ───── */
export function waterNormalTexture() {
  return cached('waterN', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    const img = ctx.createImageData(S, S);
    const waves = [];
    const r = rng(101);
    for (let i = 0; i < 14; i++) {
      waves.push({ kx: Math.round((r() - 0.5) * 12), ky: Math.round((r() - 0.5) * 12), a: 0.3 + r(), p: r() * 6.28 });
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let dx = 0, dy = 0;
        for (const w of waves) {
          const ph = ((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p;
          const d = Math.cos(ph) * w.a;
          dx += d * w.kx;
          dy += d * w.ky;
        }
        const nx = -dx * 0.012, ny = -dy * 0.012;
        const len = Math.hypot(nx, ny, 1);
        const i = (y * S + x) * 4;
        img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });
}

/* ───── 기와 불사: 검은 기와 위 흰 붓글씨 ───── */
export function tileWishTexture(text, author) {
  const [c, ctx] = canvas(256, 384);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#16171a');
  g.addColorStop(0.5, '#34363a');
  g.addColorStop(1, '#16171a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = '#f2ede2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text.replace(/\s+/g, ' ').trim()].slice(0, 24);
  // 세로쓰기 2열
  const perCol = 12;
  const cols = Math.ceil(chars.length / perCol) || 1;
  const fs = 26;
  ctx.font = `${fs}px "Nanum Brush Script", "Noto Serif KR", serif`;
  for (let i = 0; i < chars.length; i++) {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x = 128 + ((cols - 1) / 2 - col) * 34;
    ctx.fillText(chars[i], x, 40 + row * 26);
  }
  ctx.font = `15px "Noto Serif KR", serif`;
  ctx.globalAlpha = 0.7;
  ctx.fillText(author || '', 128, 360);
  return tex(c, { wrap: false });
}
