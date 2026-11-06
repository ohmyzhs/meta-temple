import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMonk, MONK_LIMITS, MONK_BODY_MAX, PERSONA } from './monk.js';

const KEY = 'sk-or-test-not-a-real-key';
const ok = (obj, extra = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(obj) } }],
    usage: { prompt_tokens: 1900, completion_tokens: 210, cost: 0.0002, prompt_tokens_details: { cached_tokens: 1500 } },
    ...extra
  })
});
const TURN = { reply: '찻물이 알맞게 식었습니다. 그 마음, 천천히 들려주시지요.', suggestions: ['요즘 잠을 잘 못 자요', '마음이 조금 복잡해요', '차 한 잔 더 주세요'], verseId: 'dhp_60', crisis: false };

/** OpenRouter 흉내: 받은 요청을 모아 두고, 정해 둔 답을 돌려준다 */
function fake(respond = () => ok(TURN)) {
  const calls = [];
  const logs = [];
  let t = Date.parse('2026-11-06T03:00:00Z');
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return respond(init);
  };
  return { calls, logs, fetch, now: () => t, tick: (ms) => (t += ms), log: (s) => logs.push(s) };
}
const make = (env = {}, f = fake()) => ({ f, monk: createMonk({ OPENROUTER_API_KEY: KEY, ...env }, f) });

test('persona_long_enough_to_cache', () => {
  // Haiku 5.5 캐시 최소 512 토큰. 한국어가 토큰 하나에 3자를 넘게 담기지는 않으니 2,000자면 660 토큰을 넘는다 (실제 값은 로그의 cached=)
  assert.ok(PERSONA.length > 2000, `persona ${PERSONA.length} chars`);
});

test('no_key_turns_ai_off', async () => {
  const f = fake();
  const monk = createMonk({}, f);
  assert.equal(monk.enabled, false);
  assert.deepEqual(monk.status('a'), { ai: false, limit: 20 });
  const r = await monk.ask({ message: '안녕하세요' }, 'a', 'ip');
  assert.equal(r.code, 503);
  assert.equal(r.body.reason, 'off');
  assert.equal(f.calls.length, 0);
});

test('success_shape_and_request_body', async () => {
  const { f, monk } = make();
  const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'monk' : 'user', text: `${i}번째 이야기 `.repeat(60) }));
  const r = await monk.ask({ message: '  요즘 마음이 무거워요  ', history, name: '청풍' }, 'a', 'ip');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, {
    ai: true,
    reply: TURN.reply,
    suggestions: TURN.suggestions,
    verseId: 'dhp_60',
    verse: '“잠 못 이루는 이에게 밤은 길고, 지친 이에게 길은 멀다.” — 『법구경』 제60게',
    crisis: false,
    left: 19
  });
  const { url, init, body } = f.calls[0];
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.headers.authorization, `Bearer ${KEY}`);
  assert.equal(body.model, 'anthropic/claude-haiku-5.5');
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.deepEqual(body.provider, { require_parameters: true, data_collection: 'deny' });
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['reply', 'suggestions', 'verseId', 'crisis']);
  assert.ok(body.max_tokens >= 500);
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.equal(body.messages[1].content, '지금 마주 앉은 도반의 법명: 청풍');
  // 기록은 최근 6개, 하나에 240자까지. 마지막은 지금 한 말
  const hist = body.messages.slice(2, -1);
  assert.equal(hist.length, MONK_LIMITS.history);
  assert.ok(hist.every((m) => m.content.length <= MONK_LIMITS.turn));
  assert.deepEqual(hist.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  assert.deepEqual(body.messages.at(-1), { role: 'user', content: '요즘 마음이 무거워요' });
  // 로그에는 숫자만 — 키도, 한 말도 남지 않는다
  assert.equal(f.logs.length, 1);
  assert.match(f.logs[0], /^\[monk\] ok \d+ms in=1900 cached=1500 out=210 reason=0 \$0\.000200 /);
  assert.ok(!f.logs[0].includes(KEY) && !f.logs[0].includes('무거워'));
});

test('crisis_input_skips_ai_and_gives_109', async () => {
  for (const message of ['죽고 싶어요', '씨발 그냥 사라지고 싶다']) {
    const { f, monk } = make();
    const r = await monk.ask({ message }, 'a', 'ip');
    assert.equal(r.code, 200, message);
    assert.equal(r.body.crisis, true);
    assert.match(r.body.reply, /109/);
    assert.equal(r.body.suggestions.length, 3);
    assert.equal(f.calls.length, 0);
  }
});

test('model_flagged_crisis_always_mentions_109', async () => {
  const { monk } = make({}, fake(() => ok({ ...TURN, reply: '그 마음을 혼자 품지 마세요.', crisis: true })));
  const r = await monk.ask({ message: '다 내려놓고 멀리 가 버리고 싶어요' }, 'a', 'ip');
  assert.equal(r.body.crisis, true);
  assert.match(r.body.reply, /109/);
});

test('abusive_or_link_input_not_sent', async () => {
  const { f, monk } = make();
  assert.equal((await monk.ask({ message: '시1발 진짜' }, 'a', 'ip')).body.reason, 'abuse');
  assert.equal((await monk.ask({ message: 'www.casino.com 놀러오세요' }, 'a', 'ip')).body.reason, 'link');
  assert.equal((await monk.ask({ message: '가'.repeat(MONK_LIMITS.message + 1) }, 'a', 'ip')).body.reason, 'too_long');
  assert.equal((await monk.ask({ message: '   ' }, 'a', 'ip')).code, 400);
  assert.equal(f.calls.length, 0);
});

test('bad_or_filtered_output_falls_back', async () => {
  const cases = [
    [() => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"reply":"찻' } }] }) }), 'bad_output'],
    [() => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '그냥 글' } }] }) }), 'bad_output'],
    [() => ok({ ...TURN, reply: '씨발 그런 건 몰라요' }), 'filtered'],
    [() => ({ ok: false, status: 402, json: async () => ({ error: { code: 402, message: 'Insufficient credits' } }) }), 'upstream'],
    [() => Promise.reject(new TypeError('fetch failed')), 'upstream']
  ];
  for (const [respond, reason] of cases) {
    const { monk } = make({}, fake(respond));
    const r = await monk.ask({ message: '안녕하세요' }, 'a', 'ip');
    assert.equal(r.code, 502, reason);
    assert.equal(r.body.reason, reason);
  }
});

test('timeout_gives_504', async () => {
  const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  const { monk } = make({ MONK_TIMEOUT_MS: '50' }, fake(hang));
  const t = Date.now();
  const r = await monk.ask({ message: '안녕하세요' }, 'a', 'ip');
  assert.equal(r.code, 504);
  assert.equal(r.body.reason, 'timeout');
  assert.ok(Date.now() - t < 1000);
});

test('suggestions_cleaned_and_filled_to_three', async () => {
  const { monk } = make({}, fake(() => ok({ ...TURN, suggestions: ['씨발', '마음이 복잡해요', '마음이 복잡해요', '죽고 싶어요'], verseId: 'made_up' })));
  const r = await monk.ask({ message: '안녕하세요' }, 'a', 'ip');
  assert.equal(r.body.suggestions.length, 3);
  assert.equal(r.body.suggestions[0], '마음이 복잡해요');
  assert.ok(!r.body.suggestions.some((s) => /씨발|죽고/.test(s)));
  assert.equal(r.body.verseId, '');
  assert.equal(r.body.verse, '');
});

test('daily_quota_per_person_and_ip_resets_at_kst_midnight', async () => {
  const { f, monk } = make({ MONK_DAILY: '2', MONK_DAILY_IP: '3' });
  const ask = (who, ip = 'ip1') => monk.ask({ message: '안녕하세요' }, who, ip);
  assert.equal((await ask('a')).body.left, 1);
  assert.equal((await ask('a')).body.left, 0);
  const over = await ask('a');
  assert.equal(over.code, 429);
  assert.equal(over.body.reason, 'quota');
  assert.equal((await ask('b')).code, 200); // 같은 IP 세 번째
  assert.equal((await ask('c')).code, 429); // IP 한도
  assert.equal((await ask('c', 'ip2')).code, 200);
  assert.equal(f.calls.length, 4); // 막힌 차례는 AI 에 묻지 않는다
  f.tick(24 * 3600e3);
  assert.equal((await ask('a')).code, 200);
});

test('daily_budget_stops_ai_for_everyone', async () => {
  const { f, monk } = make({ MONK_DAILY_USD: '0.0003' });
  assert.equal((await monk.ask({ message: '안녕하세요' }, 'a', 'ip1')).code, 200); // $0.0002
  assert.equal((await monk.ask({ message: '안녕하세요' }, 'b', 'ip2')).code, 200); // $0.0004 — 넘었다
  const r = await monk.ask({ message: '안녕하세요' }, 'c', 'ip3');
  assert.equal(r.code, 503);
  assert.equal(r.body.reason, 'budget');
  assert.equal(monk.status('c').ai, false);
  assert.equal(f.calls.length, 2);
});

test('full_request_fits_body_limit', () => {
  // 화면이 보낼 수 있는 가장 큰 요청 (한글 3바이트)
  const body = {
    message: '가'.repeat(MONK_LIMITS.message),
    history: Array.from({ length: MONK_LIMITS.history }, (_, i) => ({ role: i % 2 ? 'monk' : 'user', text: '가'.repeat(MONK_LIMITS.turn) })),
    name: '가'.repeat(14),
    clientId: 'p_' + '0'.repeat(36)
  };
  const bytes = Buffer.byteLength(JSON.stringify(body));
  assert.ok(bytes < MONK_BODY_MAX, `${bytes} bytes`);
  console.log(`# full /api/monk request = ${bytes} bytes (limit ${MONK_BODY_MAX})`);
});

/* ───── 실제 서버를 띄워 길을 확인 (키 없이) ───── */
const PORT = 8198;
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
before(async () => {
  const env = { ...process.env, PORT: String(PORT) };
  delete env.DATABASE_URL;
  delete env.OPENROUTER_API_KEY;
  proc = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], { env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => proc?.kill());

test('server_route_without_key', async () => {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.monk, false);
  assert.deepEqual(await (await fetch(`${BASE}/api/monk`)).json(), { ai: false, limit: 20 });
  const post = (body) => fetch(`${BASE}/api/monk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const off = await post({ message: '안녕하세요', clientId: 'c1', history: [{ role: 'user', text: '가'.repeat(240) }] });
  assert.equal(off.status, 503);
  assert.equal((await off.json()).reason, 'off');
  const crisis = await post({ message: '자해하고 싶어요', clientId: 'c1' });
  assert.equal(crisis.status, 200);
  assert.equal((await crisis.json()).crisis, true);
  // 가장 큰 요청도 받아 준다 (4KB 기본 한도에 걸리지 않게)
  const big = await post({ message: '가'.repeat(300), clientId: 'c1', history: Array.from({ length: 6 }, () => ({ role: 'user', text: '나'.repeat(240) })) });
  assert.equal(big.status, 503);
});
