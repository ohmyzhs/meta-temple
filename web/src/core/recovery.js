/**
 * 기록 지키기 — 복구키로 서버에 맡기고 되찾는다 (server.js /api/backup 짝).
 *
 * 복구키는 비밀번호와 같다. 화면에서 무작위로 만들고, 서버에는 키도 기록 원문도 보내지 않는다:
 *  · 조회값(id) = HKDF(키, 'id')  — 서버는 이것을 다시 소금 해시해 행을 찾는다
 *  · 암호 키   = HKDF(키, 'enc') — 기록을 gzip 으로 줄인 뒤 AES-GCM 으로 잠근다
 * 그래서 DB 가 새어도, 서버 운영자도 기록을 읽을 수 없다. 키를 잃으면 아무도 되찾을 수 없다.
 * DOM 을 쓰지 않는다 (Node 22 에서 그대로 시험 — recovery.test.js).
 */
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 — 헷갈리는 I·L·O·U 없음
export const KEY_LEN = 28; // 28자 × 5비트 = 140비트 (128비트 이상), 4자씩 7묶음
const SALT = 'sound-temple/backup/v1';
const VERSION = 1;
const enc = new TextEncoder();

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw Object.assign(new Error('이 주소에서는 암호화를 쓸 수 없습니다 (https 로 열어 주세요)'), { code: 'insecure' });
  return s;
};

/** 새 복구키 (붙여 쓴 28자). 한 바이트의 아래 5비트 = 32가지가 고르게 나온다 (256 ÷ 32) */
export function newKey() {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(KEY_LEN));
  return [...b].map((x) => ALPHA[x & 31]).join('');
}

/** 보여 줄 꼴: XXXX-XXXX-… */
export const formatKey = (key) => key.match(/.{1,4}/g).join('-');

/** 사람이 친 키 → 붙여 쓴 28자, 틀리면 null. 소문자·띄어쓰기·줄표는 괜찮고 O→0, I·L→1 로 읽는다 */
export function parseKey(input) {
  const k = String(input ?? '')
    .toUpperCase()
    .replace(/[\s\-_.·]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return k.length === KEY_LEN && [...k].every((c) => ALPHA.includes(c)) ? k : null;
}

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function material(key) {
  const s = subtle();
  const base = await s.importKey('raw', enc.encode(key), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const p = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(SALT), info: enc.encode(info) });
  const [id, aes] = await Promise.all([
    s.deriveBits(p('id'), base, 256),
    s.deriveKey(p('enc'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  ]);
  return { id: hex(id), aes };
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
