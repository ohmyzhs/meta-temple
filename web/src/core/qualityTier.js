/**
 * 화질 단계(low ↔ high) 자동 전환 판단 — three·DOM 없이 돈다 (qualityTier.test.js).
 *
 * 첫 판정(main.js detectQuality)은 기기 종류만 본다 (터치 + 작은 화면 = low). 그래서 폰은 늘 low 로 시작한다.
 * 들어온 뒤: 받을 것이 다 받아지고(실사 질감) 망이 느리지 않을 때(데이터 절약·3G 이하가 아님) 프레임이 넉넉하면 high 로 올린다.
 * 자원·망은 문(gate)이고 결정은 프레임이 한다 — 셋 중 하나만 보고 올리면 프레임이 모자란 폰이 올렸다 바로 내리기를 되풀이한다.
 * rAF 간격은 화면 주사율에서 멈추므로 low 에서 60fps 라는 것은 여유가 얼마인지까지 말해 주지 않는다 → 올려 보고 모자라면 내린다.
 *
 * 오락가락하지 않게:
 *  - 올리는 기준(최근 6초 평균 17.5ms 아래)과 내리는 기준(최근 2초 평균 22ms 위) 사이를 비워 둔다 (main.js _adaptQuality 와 같은 수).
 *  - high 에서 느려지면 먼저 화면 배율을 low 상한까지 내리고, 거기서도 느리면 그때 단계를 내린다 (atFloor).
 *  - 내릴 때마다 다시 올리기까지 기다림이 두 배 (2분 → 4분 → 8분), 세 번 내리면 이번 방문에는 더 올리지 않는다.
 *  - 바꾼 뒤 3초는 쉰다 (_adaptQuality 의 rest).
 * ?q=low / ?q=high 로 연 화면(forced)은 단계를 바꾸지 않는다 (화면 배율 자동 조절은 그대로).
 */
export const TIER = { ok: 17.5, slow: 22, retry: 120000, maxDowns: 3 };

export function createTier(start, { forced = false } = {}) {
  return { tier: start, forced, downs: 0, noUpUntil: 0 };
}

/**
 * 한 번 판단해 s 를 고친다. 돌려주는 것: 바꿀 단계 'high' | 'low', 그대로면 null.
 * okAvg / slowAvg: 최근 6초 / 2초 평균 프레임 간격(ms, 표본이 모자라면 null)
 * atCap: 화면 배율이 지금 단계의 상한에 닿았다 (더 올릴 배율이 없다) · atFloor: high 단계의 바닥(low 상한)까지 내려왔다
 * ready: 자원·망 문이 열렸다 (netReady 등)
 */
export function decideTier(s, { now, okAvg, slowAvg, atCap, atFloor, ready }) {
  if (s.forced) return null;
  if (s.tier === 'high') {
    if (slowAvg == null || slowAvg <= TIER.slow || !atFloor) return null;
    s.tier = 'low';
    s.downs++;
    s.noUpUntil = s.downs >= TIER.maxDowns ? Infinity : now + TIER.retry * 2 ** (s.downs - 1);
    return 'low';
  }
  if (!ready || okAvg == null || okAvg >= TIER.ok || !atCap || now < s.noUpUntil) return null;
  s.tier = 'high';
  return 'high';
}

/** navigator.connection 으로 본 망: 데이터 절약이거나 3G 이하면 아직. 없는 브라우저(iOS Safari·Firefox)는 막지 않는다 */
export function netReady(c) {
  if (!c) return true;
  if (c.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(c.effectiveType);
}
