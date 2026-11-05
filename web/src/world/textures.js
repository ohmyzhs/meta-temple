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

/* ───── 후불탱화 ───── */
export function paintingTexture() {
  return cached('painting', () => {
    const W = 1024, H = 640;
    const [c, ctx] = canvas(W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#6e1d14');
    bg.addColorStop(1, '#4a120c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const r = rng(77);
    // 구름 문양
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(66,120,110,0.55)' : 'rgba(230,210,170,0.35)';
      const x = r() * W, y = r() * H, s = 10 + r() * 26;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x + k * s * 0.8, y + Math.sin(k) * 4, s * (1 - k * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 권속 (작은 광배 인물들)
    const figure = (x, y, s, robe) => {
      const halo = ctx.createRadialGradient(x, y - s * 1.5, 0, x, y - s * 1.5, s * 1.4);
      halo.addColorStop(0, 'rgba(240,200,110,0.9)');
      halo.addColorStop(0.7, 'rgba(200,140,60,0.7)');
      halo.addColorStop(1, 'rgba(200,140,60,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y - s * 1.5, s * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.moveTo(x - s, y + s * 1.6);
      ctx.quadraticCurveTo(x - s * 1.1, y - s * 0.6, x, y - s * 0.9);
      ctx.quadraticCurveTo(x + s * 1.1, y - s * 0.6, x + s, y + s * 1.6);
      ctx.fill();
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath();
      ctx.arc(x, y - s * 1.4, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2a33';
      ctx.beginPath();
      ctx.arc(x, y - s * 1.62, s * 0.42, Math.PI, 0);
      ctx.fill();
    };
    const robes = ['#2f6f5f', '#b5432c', '#3a5f8a', '#d8a03a', '#f0e6cf'];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9; i++) {
        const x = 70 + i * 110 + (row % 2) * 30;
        if (x > 330 && x < 700 && row < 2) continue;
        figure(x, 140 + row * 190, 24, robes[(i + row) % robes.length]);
      }
    }
    // 본존
    const cx = W / 2, cy = 330;
    const aura = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
    aura.addColorStop(0, 'rgba(255,220,140,0.95)');
    aura.addColorStop(0.45, 'rgba(230,160,70,0.85)');
    aura.addColorStop(0.75, 'rgba(160,60,40,0.6)');
    aura.addColorStop(1, 'rgba(110,29,20,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,160,0.7)';
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
      ctx.lineTo(cx + Math.cos(a) * 230, cy + Math.sin(a) * 230);
      ctx.stroke();
    }
    figure(cx, cy + 40, 70, '#b5432c');
    // 테두리
    ctx.strokeStyle = '#d6aa4f';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, W - 14, H - 14);
    ctx.strokeStyle = '#2d6a5a';
    ctx.lineWidth = 8;
    ctx.strokeRect(22, 22, W - 44, H - 44);
    return tex(c, { wrap: false });
  });
}

/* ───── 우물천장 ───── */
export function ceilingTexture() {
  return cached('ceiling', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#2b5b4f';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#6b3a24';
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillRect(0, 0, 12, 256);
    const cx = 134, cy = 134;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.fillStyle = k % 2 ? '#d8573b' : '#e7b4b9';
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, 30, 13, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e1b54a';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
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
