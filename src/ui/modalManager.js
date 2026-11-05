import {
  SUTRA_VERSES,
  DHARMA_CARDS,
  generateMonkTeaResponse
} from '../data/templeData.js';

/**
 * 청연산사 (清蓮山寺) — 사찰 신행 활동 모달 및 수행 오버레이 매니저
 * - 소원 연등 달기 & 열람
 * - 기와 불사 각인
 * - 소원 돌탑 쌓기
 * - 번뇌 소각 화로 (작성한 고민을 불꽃으로 태워 완전 소멸)
 * - 108배 & 염주 굴리기 수행 패널
 * - 반야심경·법구경 디지털 사경(필사)
 * - AI 스님 1:1 차담 & 오늘의 죽비 카드
 */
export class ModalManager {
  constructor(stateStore, callbacks = {}) {
    this.store = stateStore;
    this.callbacks = callbacks;

    this.overlayEl = document.getElementById('modal-overlay');
    this.titleEl = document.getElementById('modal-title');
    this.subtitleEl = document.getElementById('modal-subtitle');
    this.bodyEl = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close-btn');

    this.autoBowInterval = null;

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlayEl?.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) this.close();
    });
  }

  close() {
    if (this.autoBowInterval) {
      clearInterval(this.autoBowInterval);
      this.autoBowInterval = null;
    }
    this.overlayEl?.classList.add('hidden');
  }

  open(type, payload = null) {
    if (this.autoBowInterval) {
      clearInterval(this.autoBowInterval);
      this.autoBowInterval = null;
    }
    this.overlayEl?.classList.remove('hidden');

    switch (type) {
      case 'wish_lantern':
      case 'lantern_view':
        this._renderLanternModal(payload);
        break;
      case 'wish_tile':
        this._renderTileModal();
        break;
      case 'stone_pagoda':
        this._renderStonePagodaModal();
        break;
      case 'burn_worry':
        this._renderBurnWorryModal();
        break;
      case 'prostrate_108':
      case 'mala_meditate':
        this._renderPracticeModal(type);
        break;
      case 'sutra_copy':
        this._renderSutraCopyModal();
        break;
      case 'ai_tea_chat':
        this._renderTeaChatModal();
        break;
      case 'dharma_card':
        this._renderDharmaCardModal();
        break;
      default:
        this.close();
    }
  }

  /**
   * 1. 소원 연등 달기 및 도반들의 연등 열람 모달
   */
  _renderLanternModal(selectedLantern = null) {
    this.titleEl.textContent = '🏮 마당 소원 연등 봉안';
    this.subtitleEl.textContent = '하늘에 매달린 연등마다 도반들의 간절한 발원이 빛나고 있습니다.';

    const highlightHtml = selectedLantern?.lanternData
      ? `<div class="highlighted-lantern-card" style="border-left: 4px solid ${selectedLantern.lanternData.color}">
           <div class="card-meta">선택한 연등 · <strong>${selectedLantern.lanternData.author}</strong></div>
           <p class="card-wish">"${selectedLantern.lanternData.wish}"</p>
         </div>`
      : '';

    const lanterns = this.store.lanterns;
    const listHtml = lanterns
      .slice()
      .reverse()
      .map(
        (l) => `
        <div class="wish-item">
          <div class="wish-header">
            <span class="lantern-dot" style="background:${l.color}"></span>
            <strong class="wish-author">${l.author}</strong>
            <button class="empathy-btn" data-id="${l.id}">🙏 합장 공감 ${l.empathy || 0}</button>
          </div>
          <p class="wish-text">${l.wish}</p>
        </div>`
      )
      .join('');

    this.bodyEl.innerHTML = `
      ${highlightHtml}
      <div class="modal-form-box">
        <label class="form-label">나의 소원 연등 달기 (법명: <strong>${this.store.profile.dharmaName}</strong>)</label>
        <div class="color-picker-row">
          <button type="button" class="color-chip active" data-color="#ff9e80" style="background:#ff9e80">연분홍</button>
          <button type="button" class="color-chip" data-color="#ffd180" style="background:#ffd180">등황빛</button>
          <button type="button" class="color-chip" data-color="#b9f6ca" style="background:#b9f6ca">비취빛</button>
          <button type="button" class="color-chip" data-color="#80d8ff" style="background:#80d8ff">하늘빛</button>
        </div>
        <textarea id="lantern-wish-input" rows="2" maxlength="90" placeholder="가족의 건강, 마음의 평안 등 이루고 싶은 서원을 적어주세요..."></textarea>
        <button id="lantern-submit-btn" class="primary-gold-btn">마당 하늘에 소원 연등 밝히기</button>
      </div>
      <div class="wish-list-container">
        <h4 class="section-subhead">현재 마당을 밝히고 있는 연등 (${lanterns.length}개)</h4>
        <div class="wish-scroll-list">${listHtml}</div>
      </div>
    `;

    let chosenColor = '#ff9e80';
    this.bodyEl.querySelectorAll('.color-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bodyEl.querySelectorAll('.color-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        chosenColor = btn.dataset.color;
      });
    });

    this.bodyEl.querySelector('#lantern-submit-btn')?.addEventListener('click', () => {
      const input = this.bodyEl.querySelector('#lantern-wish-input');
      const text = input.value.trim();
      if (!text) return;
      this.callbacks.onAddLantern?.(text, chosenColor);
      this._renderLanternModal();
    });

    this.bodyEl.querySelectorAll('.empathy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.callbacks.onEmpathizeLantern?.(id);
        this._renderLanternModal(selectedLantern);
      });
    });
  }

  /**
   * 2. 기와 불사 각인 모달
   */
  _renderTileModal() {
    this.titleEl.textContent = '🪨 천년 기와 불사 (서원 각인)';
    this.subtitleEl.textContent = '비바람을 막아주는 검은 기와 위에 하얀 붓글씨로 변치 않는 서원을 새깁니다.';

    const tilesHtml = this.store.tiles
      .slice()
      .reverse()
      .map(
        (t) => `
        <div class="tile-card">
          <div class="tile-brush-text">${t.wish}</div>
          <div class="tile-footer">${t.author} · ${t.date}</div>
        </div>`
      )
      .join('');

    this.bodyEl.innerHTML = `
      <div class="tile-preview-slab">
        <div id="tile-live-preview" class="tile-live-brush">마음의 평안과 가족 건강 발원</div>
        <div class="tile-live-author">불기 2570년 · ${this.store.profile.dharmaName} 합장</div>
      </div>
      <div class="modal-form-box">
        <input id="tile-wish-input" type="text" maxlength="45" placeholder="기와에 새길 서원 문구를 입력하세요 (최대 45자)" />
        <button id="tile-submit-btn" class="primary-gold-btn">기와에 서원 새겨 올리기</button>
      </div>
      <div class="tile-grid-list">${tilesHtml}</div>
    `;

    const inputEl = this.bodyEl.querySelector('#tile-wish-input');
    const previewEl = this.bodyEl.querySelector('#tile-live-preview');

    inputEl?.addEventListener('input', () => {
      previewEl.textContent = inputEl.value.trim() || '마음의 평안과 가족 건강 발원';
    });

    this.bodyEl.querySelector('#tile-submit-btn')?.addEventListener('click', () => {
      const val = inputEl.value.trim();
      if (!val) return;
      this.callbacks.onAddTile?.(val);
      this._renderTileModal();
    });
  }

  /**
   * 3. 일주문 숲길 소원 돌탑 쌓기 모달
   */
  _renderStonePagodaModal() {
    this.titleEl.textContent = '🪨 산사 숲길 소원 돌탑 쌓기';
    this.subtitleEl.textContent = '지나가는 나그네들이 조약돌 하나씩을 얹어 무너지지 않는 탑을 이루었습니다.';

    const stonesHtml = this.store.stones
      .slice()
      .reverse()
      .map(
        (s) => `
        <div class="wish-item">
          <div class="wish-header">
            <strong class="wish-author">🪨 ${s.author}</strong>
            <span class="wish-date">${s.date}</span>
          </div>
          <p class="wish-text">${s.wish}</p>
        </div>`
      )
      .join('');

    this.bodyEl.innerHTML = `
      <div class="modal-form-box">
        <input id="stone-wish-input" type="text" maxlength="60" placeholder="돌탑 위에 조약돌을 얹으며 다짐 한 줄을 남겨보세요..." />
        <button id="stone-submit-btn" class="primary-gold-btn">조약돌 하나 얹고 합장하기</button>
      </div>
      <div class="wish-scroll-list">${stonesHtml}</div>
    `;

    this.bodyEl.querySelector('#stone-submit-btn')?.addEventListener('click', () => {
      const val = this.bodyEl.querySelector('#stone-wish-input').value.trim();
      if (!val) return;
      this.callbacks.onAddStone?.(val);
      this._renderStonePagodaModal();
    });
  }

  /**
   * 4. 번뇌 소각 화로 (고민 적고 불에 태워 소멸시키기)
   */
  _renderBurnWorryModal() {
    this.titleEl.textContent = '🔥 번뇌 소각장 (비움의 화로)';
    this.subtitleEl.textContent = '누군가에게 말하기 힘든 후회, 미움, 불안, 집착을 종이에 적어 불길에 태워 보냅니다. 적으신 내용은 어디에도 저장되지 않고 연기와 함께 완전히 사라집니다.';

    this.bodyEl.innerHTML = `
      <div id="burn-paper-box" class="hanji-burn-paper">
        <textarea id="worry-input" rows="4" placeholder="마음을 무겁게 짓누르는 생각이나 털어내고 싶은 기억을 솔직하게 적어보세요..."></textarea>
      </div>
      <div class="modal-action-center">
        <button id="burn-trigger-btn" class="danger-fire-btn">🔥 화로에 던져 재로 태워 보내기</button>
      </div>
      <p id="burn-result-msg" class="burn-complete-msg hidden">
        화로의 불길이 모든 번뇌를 태워 허공의 연기로 흩어 보냈습니다. 가벼워진 마음으로 깊게 숨을 내쉬어 보세요.
      </p>
    `;

    const paperBox = this.bodyEl.querySelector('#burn-paper-box');
    const input = this.bodyEl.querySelector('#worry-input');
    const btn = this.bodyEl.querySelector('#burn-trigger-btn');
    const msg = this.bodyEl.querySelector('#burn-result-msg');

    btn?.addEventListener('click', () => {
      if (!input.value.trim()) {
        input.placeholder = '태워 보낼 마음의 짐을 한 단어라도 적어주세요...';
        return;
      }
      paperBox.classList.add('burning-ash-anim');
      btn.disabled = true;
      this.callbacks.onBurnWorry?.();

      setTimeout(() => {
        input.value = '';
        paperBox.classList.remove('burning-ash-anim');
        msg.classList.remove('hidden');
        btn.disabled = false;
      }, 1350);
    });
  }

  /**
   * 5. 대웅전 좌복 108배 & 염주 굴리기 집중 수행 모달
   */
  _renderPracticeModal(initialMode = 'prostrate_108') {
    this.titleEl.textContent = '🙏 대웅전 침묵 수행 (108배 · 염주)';
    this.subtitleEl.textContent = '말없이 나란히 앉은 도반들과 함께 호흡을 고르며 절을 올리거나 염주를 굴립니다.';

    const stats = this.store.profile.stats;
    const progressPct = Math.min(((stats.bowCount % 108) / 108) * 100, 100).toFixed(0);

    this.bodyEl.innerHTML = `
      <div class="practice-dashboard">
        <div class="stat-pill-box">
          <div class="stat-num" id="modal-bow-count">${stats.bowCount}<span>배</span></div>
          <div class="stat-label">누적 큰절 (108배 원만 달성: ${Math.floor(stats.bowCount / 108)}회)</div>
          <div class="progress-bar-bg"><div id="bow-progress-fill" class="progress-bar-fill" style="width:${progressPct}%"></div></div>
        </div>
        <div class="stat-pill-box">
          <div class="stat-num" id="modal-mala-count">${stats.malaCount}<span>알</span></div>
          <div class="stat-label">굴린 나무 염주 알 수</div>
        </div>
      </div>

      <div id="breath-guide-banner" class="breath-guide-box">
        숨을 깊게 들이쉬며 두 손을 모으고, 천천히 내쉬며 나를 낮추어 절을 올립니다.
      </div>

      <div class="practice-btn-grid">
        <button id="single-bow-btn" class="primary-gold-btn">🙇 1회 큰절 올리기 (오체투지)</button>
        <button id="auto-bow-btn" class="secondary-outline-btn">🕯️ 108배 연속 리듬 수행 시작 (4초 주기)</button>
        <button id="roll-mala-btn" class="secondary-outline-btn">📿 나무 염주 한 알 굴리기 (+목탁)</button>
      </div>
    `;

    const bowCountEl = this.bodyEl.querySelector('#modal-bow-count');
    const malaCountEl = this.bodyEl.querySelector('#modal-mala-count');
    const progressEl = this.bodyEl.querySelector('#bow-progress-fill');
    const guideEl = this.bodyEl.querySelector('#breath-guide-banner');
    const autoBtn = this.bodyEl.querySelector('#auto-bow-btn');

    const doOneBow = () => {
      this.callbacks.onPerformBow?.();
      const c = this.store.profile.stats.bowCount;
      bowCountEl.innerHTML = `${c}<span>배</span>`;
      progressEl.style.width = `${Math.min(((c % 108) / 108) * 100, 100)}%`;
      const reflections = [
        '첫째, 내 안의 교만과 조급함을 내려놓습니다.',
        '둘째, 스쳐간 인연들의 평안을 조용히 발원합니다.',
        '셋째, 지금 이 순간 살아 숨 쉬고 있음에 감사합니다.',
        '넷째, 타인의 허물보다 내 마음을 먼저 살핍니다.'
      ];
      guideEl.textContent = `[${c}배] ${reflections[c % reflections.length]}`;
    };

    this.bodyEl.querySelector('#single-bow-btn')?.addEventListener('click', doOneBow);

    autoBtn?.addEventListener('click', () => {
      if (this.autoBowInterval) {
        clearInterval(this.autoBowInterval);
        this.autoBowInterval = null;
        autoBtn.textContent = '🕯️ 108배 연속 리듬 수행 시작 (4초 주기)';
        autoBtn.classList.remove('active-loop');
      } else {
        doOneBow();
        autoBtn.textContent = '⏹️ 108배 연속 수행 멈추기 (진행 중...)';
        autoBtn.classList.add('active-loop');
        this.autoBowInterval = setInterval(doOneBow, 3800);
      }
    });

    this.bodyEl.querySelector('#roll-mala-btn')?.addEventListener('click', () => {
      this.callbacks.onRollMala?.();
      malaCountEl.innerHTML = `${this.store.profile.stats.malaCount}<span>알</span>`;
      guideEl.textContent = '손끝으로 둥근 나무 염주 알을 넘기며 흩어진 생각을 호흡으로 모읍니다.';
    });

    if (initialMode === 'mala_meditate') {
      this.callbacks.onRollMala?.();
    }
  }

  /**
   * 6. 반야심경·법구경 디지털 사경(필사) 모달
   */
  _renderSutraCopyModal(verseIndex = 0) {
    const verse = SUTRA_VERSES[verseIndex % SUTRA_VERSES.length];
    this.titleEl.textContent = '🖌️ 디지털 사경 (경전 한 줄 필사)';
    this.subtitleEl.textContent = '한지 위에 경전 구절을 한 글자씩 따라 적으며 어지러운 마음을 정갈하게 가다듬습니다.';

    const tabsHtml = SUTRA_VERSES.map(
      (v, idx) =>
        `<button class="sutra-tab ${idx === verseIndex ? 'active' : ''}" data-idx="${idx}">${v.title}</button>`
    ).join('');

    this.bodyEl.innerHTML = `
      <div class="sutra-tabs-row">${tabsHtml}</div>
      <div class="hanji-sutra-sheet">
        <div class="sutra-hanja">${verse.hanja}</div>
        <div class="sutra-guide-text">${verse.text}</div>
        <p class="sutra-meaning">${verse.meaning}</p>
        <input id="sutra-typing-input" type="text" class="sutra-input" placeholder="위의 독음 구절을 천천히 따라 적어보세요..." autocomplete="off" />
        <div class="sutra-status-row">
          <span id="sutra-match-accuracy">글자를 입력하면 먹물 필사가 시작됩니다.</span>
          <button id="sutra-complete-btn" class="primary-gold-btn">사경 갈무리 및 회향하기</button>
        </div>
      </div>
    `;

    this.bodyEl.querySelectorAll('.sutra-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._renderSutraCopyModal(Number(btn.dataset.idx));
      });
    });

    const inputEl = this.bodyEl.querySelector('#sutra-typing-input');
    const statusEl = this.bodyEl.querySelector('#sutra-match-accuracy');

    inputEl?.addEventListener('input', () => {
      const typed = inputEl.value.trim();
      const target = verse.text;
      let matchCount = 0;
      for (let i = 0; i < typed.length; i++) {
        if (typed[i] === target[i]) matchCount++;
      }
      const pct = Math.min(Math.round((matchCount / target.length) * 100), 100);
      statusEl.textContent = `필사 진행도: ${pct}% (${typed.length} / ${target.length}자)`;
    });

    this.bodyEl.querySelector('#sutra-complete-btn')?.addEventListener('click', () => {
      if (inputEl.value.trim().length < 5) {
        statusEl.textContent = '경전 구절을 최소 다섯 글자 이상 정성껏 따라 적어주세요.';
        return;
      }
      this.callbacks.onCompleteSutra?.(verse);
      statusEl.textContent = '🙏 한 줄 사경 공덕이 원만히 갈무리되었습니다.';
      inputEl.value = '';
    });
  }

  /**
   * 7. 후원 다실(심검당) AI 스님 1:1 차담 모달
   */
  _renderTeaChatModal() {
    this.titleEl.textContent = '🍵 다실 심검당(尋劍堂) — 선사와의 1:1 차담';
    this.subtitleEl.textContent = '따뜻한 연잎차 한 잔을 사이에 두고, 누구에게도 꺼내지 못했던 마음의 이야기를 내려놓으세요.';

    this.bodyEl.innerHTML = `
      <div id="tea-chat-history" class="tea-chat-box">
        <div class="monk-message">
          <div class="msg-sender">🧘 청연 선사</div>
          <p class="msg-text">어서 오십시오, <strong>${this.store.profile.dharmaName}</strong> 도반님. 산사까지 걸어오시느라 발걸음이 고단하지는 않으셨는지요. 찻물이 알맞게 우러났으니, 마음에 걸려 있는 고민이나 질문을 편히 들려주십시오.</p>
        </div>
      </div>
      <div class="tea-input-row">
        <input id="tea-user-input" type="text" placeholder="불안, 인간관계, 피로, 그리움 등 마음속 이야기를 적어보세요..." />
        <button id="tea-send-btn" class="primary-gold-btn">차 한 모금과 함께 건네기</button>
      </div>
      <div class="tea-footer-actions">
        <button id="open-dharma-card-btn" class="secondary-outline-btn">🎍 오늘의 죽비(경전 한 구절 카드) 뽑기</button>
      </div>
    `;

    const chatBox = this.bodyEl.querySelector('#tea-chat-history');
    const inputEl = this.bodyEl.querySelector('#tea-user-input');
    const sendBtn = this.bodyEl.querySelector('#tea-send-btn');

    const submitTeaMessage = () => {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';

      chatBox.insertAdjacentHTML(
        'beforeend',
        `<div class="user-message">
           <div class="msg-sender">${this.store.profile.dharmaName}</div>
           <p class="msg-text">${text}</p>
         </div>`
      );

      const res = generateMonkTeaResponse(text);
      this.callbacks.onTeaChatTurn?.();

      setTimeout(() => {
        chatBox.insertAdjacentHTML(
          'beforeend',
          `<div class="monk-message">
             <div class="msg-sender">🧘 청연 선사</div>
             <p class="msg-text">${res.reply}</p>
             <div class="monk-verse-quote">${res.verse}</div>
           </div>`
        );
        chatBox.scrollTop = chatBox.scrollHeight;
      }, 420);
    };

    sendBtn?.addEventListener('click', submitTeaMessage);
    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitTeaMessage();
    });

    this.bodyEl.querySelector('#open-dharma-card-btn')?.addEventListener('click', () => {
      this._renderDharmaCardModal();
    });
  }

  /**
   * 8. 오늘의 죽비 (경전 한 구절 카드) 뽑기 모달
   */
  _renderDharmaCardModal() {
    const card = DHARMA_CARDS[Math.floor(Math.random() * DHARMA_CARDS.length)];
    this.titleEl.textContent = '🎍 오늘의 죽비 (경전 화두 카드)';
    this.subtitleEl.textContent = '지금 이 순간 당신의 걸음에 건네는 산사의 짧은 문장입니다.';

    this.bodyEl.innerHTML = `
      <div class="dharma-card-frame">
        <div class="dharma-card-source">${card.source}</div>
        <blockquote class="dharma-card-quote">“${card.quote}”</blockquote>
        <p class="dharma-card-reflection">${card.reflection}</p>
      </div>
      <div class="modal-action-center">
        <button id="redraw-card-btn" class="secondary-outline-btn">다른 죽비 구절 다시 뽑기</button>
      </div>
    `;

    this.bodyEl.querySelector('#redraw-card-btn')?.addEventListener('click', () => {
      this.callbacks.onDrawDharmaCard?.();
      this._renderDharmaCardModal();
    });
  }
}
