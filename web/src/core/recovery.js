/**
 * 기록 지키기 — 복구키로 서버에 맡기고 되찾는다 (server.js /api/backup 짝).
 *
 * 복구키는 비밀번호와 같다. 화면에서 무작위로 만들고, 서버에는 키도 기록 원문도 보내지 않는다:
 *  · PBKDF2(키, 60만 번) → 앞 절반 = 조회값(id, 서버는 이것을 다시 소금 해시해 행을 찾는다), 뒤 절반 = AES-GCM 암호 키
 *  · 기록은 gzip 으로 줄인 뒤 그 키로 잠근다 → DB 가 새어도, 서버 운영자도 읽을 수 없다. 키를 잃으면 아무도 되찾을 수 없다.
 * 키는 6자 (사용자 결정 2026-11-08: 「이렇게까지 길 이유가 없다」). 56^6 ≈ 300억 가지로 짧은 만큼
 *  · 일부러 느린 PBKDF2 로 하나씩 맞혀 보기를 늦추고, 서버는 IP 마다 되찾기 횟수를 막는다
 *  · 새 키로 처음 맡길 때 같은 키가 이미 있으면 서버가 거절하고 화면은 새 키로 다시 (남의 기록을 덮지 않게)
 * DOM 을 쓰지 않는다 (Node 22 에서 그대로 시험 — recovery.test.js).
 */
// 영문 대·소문자 + 숫자에서 헷갈리는 0 O o 1 l I 를 뺀 56자 — 옮겨 적을 때 틀리지 않게
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const KEY_LEN = 6;
const SALT = 'sound-temple/backup/v2';
const ITER = 600000; // PBKDF2-SHA256 (OWASP 권장값). 512비트 뽑기 — 맥 node 실측 약 0.2초, 폰은 그 몇 배
const VERSION = 1;
const enc = new TextEncoder();

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw Object.assign(new Error('이 주소에서는 암호화를 쓸 수 없습니다 (https 로 열어 주세요)'), { code: 'insecure' });
  return s;
};

/** 새 복구키 6자. 224(= 56×4) 이상인 바이트는 버려 56자가 고르게 나오게 */
export function newKey() {
  let k = '';
  while (k.length < KEY_LEN) for (const b of globalThis.crypto.getRandomValues(new Uint8Array(16))) if (b < 224 && k.length < KEY_LEN) k += ALPHA[b % 56];
  return k;
}

/** 보여 줄 꼴: 세 자씩 띄워서 (aB3 kPz) */
export const formatKey = (key) => `${key.slice(0, 3)} ${key.slice(3)}`;

/** 사람이 친 키 → 6자, 틀리면 null. 대·소문자는 그대로 구별하고 띄어쓰기·줄표만 무시한다 */
export function parseKey(input) {
  const k = String(input ?? '').replace(/[\s\-_.·]/g, '');
  return k.length === KEY_LEN && [...k].every((c) => ALPHA.includes(c)) ? k : null;
}

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function material(key) {
  const s = subtle();
  const base = await s.importKey('raw', enc.encode(key), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITER }, base, 512));
  const aes = await s.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id: hex(bits.slice(0, 32)), aes };
}

/** 서버에서 행을 찾는 값 (64자 16진수) */
export const backupId = async (key) => (await material(key)).id;

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * 기록(JSON 글) → { id, data }. data = base64([판 1][1=gzip·0=그대로][IV 12][암호문+태그])
 * gzip 이 없는 옛 브라우저(iOS 16.3 이하)는 줄이지 않고 그대로 잠근다.
 */
export async function sealBackup(json, key) {
  const { id, aes } = await material(key);
  const raw = enc.encode(json);
  const gz = typeof CompressionStream === 'function';
  const body = gz ? await pipe(raw, new CompressionStream('gzip')) : raw;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, aes, body));
  const out = new Uint8Array(2 + iv.length + ct.length);
  out.set([VERSION, gz ? 1 : 0]);
  out.set(iv, 2);
  out.set(ct, 2 + iv.length);
  return { id, data: toB64(out) };
}

/** { data } → 기록(JSON 글). 키가 다르거나 덩어리가 상했으면 throw */
export async function openBackup(data, key) {
  const { aes } = await material(key);
  const b = fromB64(data);
  if (b[0] !== VERSION || b.length < 2 + 12 + 16) throw new Error('알 수 없는 백업 형식');
  const body = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: b.subarray(2, 14) }, aes, b.subarray(14)));
  if (b[1] === 1) {
    if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축을 풀 수 없습니다');
    return new TextDecoder().decode(await pipe(body, new DecompressionStream('gzip')));
  }
  return new TextDecoder().decode(body);
}
