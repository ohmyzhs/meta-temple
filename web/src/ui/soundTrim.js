/**
 * 메뉴 > 소리: 「들리는 소리 하나씩」 — 듣기 모드가 아니어도 지금 이 자리에서 들리는 소리를 하나씩 미세 조정한다 (사용자 2026-11-07).
 * 엔진의 평소 믹스(자리·시간대·날씨가 정한 크기)에 소리마다 배율을 곱한다 (soundEngine.setTrim). 장면을 듣는 동안은 「조절」(나만의 소리)이 맡는다.
 * 값은 settings.soundTrim 에 저장 — 다음에 와도, 다른 자리로 걸어가도 그대로. 소리 창이 열릴 때마다 지금 들리는 소리로 목록을 다시 만든다.
 */
import { MIX_SOUNDS } from '../data/natureSounds.js';
import { icon } from './icons.js';

/** 막대 끝 배율 (가운데 x≈0.71 이 그대로 1). 화롯불은 봉우리가 커서 낮다 — tools/qa/sound-trim.mjs 가 화로 곁 리미터 누름을 잰다 */
export const TRIM_TOP = 2;
const TOP = { brazier: 1.3 };
const top = (k) => TOP[k] ?? TRIM_TOP;
const toX = (k, v) => Math.sqrt(Math.min(top(k), v) / top(k));
const pct = (v) => `${Math.round(v * 100)}%`;

export function bindSoundTrim({ root, sound, store }) {
  const get = () => ({ ...(store.state.settings.soundTrim || {}) });
  const save = (t) => {
    for (const k of Object.keys(t)) if (Math.abs(t[k] - 1) < 0.005) delete t[k]; // 그대로인 것은 남기지 않는다
    store.setSetting('soundTrim', t);
    sound.setTrim(t);
  };
  sound.setTrim(get());

  const render = () => {
    const t = get();
    const heard = new Set(sound.heard());
    const list = MIX_SOUNDS.filter((x) => heard.has(x.k) || x.k in t); // 지금 들리는 것 + 전에 바꿔 둔 것
    root.innerHTML = list.length
      ? `<ul class="trim-list">${list.map((x) => {
          const v = t[x.k] ?? 1;
          return `<li class="trim-row${heard.has(x.k) ? '' : ' far'}">
            <span class="trim-tile" aria-hidden="true">${icon(x.icon)}</span>
            <label class="trim-main"><span class="trim-name">${x.name}<small data-pct="${x.k}">${heard.has(x.k) ? pct(v) : `${pct(v)} · 여기선 안 들림`}</small></span>
              <input type="range" min="0" max="1" step="0.01" value="${toX(x.k, v).toFixed(3)}" data-trim="${x.k}" aria-label="${x.name} 크기 (가운데가 그대로)" /></label>
          </li>`;
        }).join('')}</ul>
        <div class="trim-foot"><button class="ctl chip" type="button" data-trim-reset ${Object.keys(t).length ? '' : 'disabled'}>모두 그대로</button></div>`
      : '<p class="pop-note">지금 이 자리에서는 들리는 자연의 소리가 없습니다.</p>';
  };

  root.addEventListener('input', (e) => {
    const k = e.target.dataset?.trim;
    if (!k) return;
    const x = Number(e.target.value);
    let v = +(x * x * top(k)).toFixed(3);
    if (Math.abs(v - 1) < 0.04) v = 1; // 가운데 근처는 그대로에 붙인다
    const t = get();
    t[k] = v;
    save(t);
    const lab = root.querySelector(`[data-pct="${k}"]`);
    if (lab) lab.textContent = pct(v);
    const reset = root.querySelector('[data-trim-reset]');
    if (reset) reset.disabled = !Object.keys(store.state.settings.soundTrim || {}).length;
  });
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-trim-reset]')) return;
    save({});
    render();
  });

  // 소리 창이 열릴 때마다 (숨김이 풀릴 때) 지금 자리의 소리로
  const sheet = root.closest('.sheet');
  if (sheet) new MutationObserver(() => !sheet.classList.contains('hidden') && render()).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  render();
  return { render };
}
