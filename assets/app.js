(function () {
  'use strict';

  const CFG = Object.assign({ title: 'İmtahan Portalı', subtitle: '', apiUrl: '' }, window.PORTAL_CONFIG || {});
  if (!CFG.apiUrl && CFG.submitUrl) CFG.apiUrl = CFG.submitUrl;
  const LETTERS = 'ABCDEF';
  const KEYS = { ACTIVE: 'ep.active.v3', PENDING: 'ep.pending.v3', LAST: 'ep.last.v3', STUDENT: 'ep.student.v3' };

  // ================= Köməkçilər =================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function storage(kind) {
    return {
      get(key) { try { const v = window[kind].getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
      set(key, val) { try { window[kind].setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
      del(key) { try { window[kind].removeItem(key); } catch { /* yoxdur */ } },
    };
  }
  const local = storage('localStorage');
  const sess = storage('sessionStorage');

  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? `${m} dəq ${s} san` : `${s} san`;
  }
  function fmtDate(v, withTime = true) {
    const d = new Date(v);
    if (!v || isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}` + (withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
  }
  const initials = (s) => `${(s.first || '?')[0]}${(s.last || '')[0] || ''}`.toLocaleUpperCase('az');
  const fullName = (s) => `${s.first || ''} ${s.last || ''}`.trim();
  const scoreColor = (pct) => (pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--accent)' : 'var(--bad)');
  const fold = (s) => String(s || '').toLocaleLowerCase('az').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/ə/g, 'e');
  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function imgUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    const drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1200`;
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[\w./-]+$/.test(u) && !u.includes('..')) return u;
    return '';
  }

  const ICONS = {
    headset: '<svg viewBox="0 0 24 24"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z"/><path d="M18 17v1a3 3 0 0 1-3 3h-3"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    server: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  };

  // ================= Server =================
  class ApiError extends Error {
    constructor(message, code, network) { super(message); this.code = code; this.network = !!network; }
  }

  async function api(action, data = {}, { retries = 2, timeout = 30000 } = {}) {
    if (!CFG.apiUrl) throw new ApiError('Portal hələ Google Cədvəlinə qoşulmayıb (assets/config.js → apiUrl). TƏLİMAT.md-yə baxın.', 'no_api');
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(CFG.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, ...data }),
          signal: ctrl.signal,
          redirect: 'follow',
        });
        if (!res.ok) throw new ApiError(`Server cavab vermədi (HTTP ${res.status}).`, 'http', true);
        let j;
        try { j = await res.json(); } catch { throw new ApiError('Serverdən düzgün cavab gəlmədi. Apps Script "Anyone" girişi ilə yayımlanıbmı?', 'bad_response', true); }
        if (j.ok) return j;
        lastErr = new ApiError(j.message || 'Naməlum xəta', j.error, false);
        if (j.error !== 'busy') throw lastErr;
      } catch (e) {
        lastErr = e instanceof ApiError ? e : new ApiError('İnternet bağlantısı yoxdur və ya server əlçatan deyil.', 'network', true);
        if (!lastErr.network && lastErr.code !== 'busy') throw lastErr;
      } finally {
        clearTimeout(timer);
      }
      if (i < retries) await sleep(800 * 2 ** i + randInt(700));
    }
    throw lastErr;
  }

  // ================= Vəziyyət =================
  let conf = null;
  let confPromise = null;
  let student = sess.get(KEYS.STUDENT);   // { first, last, group, code, attempts }
  let session = null;                     // aktiv imtahan
  let currentView = null;
  let timerId = null;
  let away = false;
  let lastResult = null;
  let currentSubmitId = null;
  let reviewFilter = 'wrong';
  let selectedExam = null;
  let T = null;                           // müəllim paneli məlumatı
  let teacherPass = null;
  let teacherTab = 'results';

  const studentPayload = () => ({ first: student.first, last: student.last, group: student.group || '', code: student.code || '' });
  const examByKey = (k) => (conf ? conf.exams.find((x) => x.key === k) : null);
  const catByKey = (k) => (conf ? conf.categories.find((c) => c.key === k) : null);

  // ================= Görünüşlər =================
  function show(view) {
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
    currentView = view;
    const inExam = view === 'exam';
    const isTeacher = view.startsWith('teacher');
    $('#exam-timer').hidden = !(inExam && session && session.endsAt);
    $('#user-chip').hidden = !student || isTeacher;
    $('[data-action="logout"]').hidden = inExam;
    if (student) {
      $('#user-name').textContent = fullName(student);
      $('#user-initials').textContent = initials(student);
    }
    window.scrollTo({ top: 0 });
  }

  let toastTimer;
  function toast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  function dialog({ title, html = '', actions = [{ label: 'Bağla', value: 'close', cls: 'btn-primary' }], wide = false }) {
    const dlg = $('#dialog');
    if (dlg.open) dlg.close('replaced');
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = html;
    const box = $('#dialog-actions');
    box.innerHTML = '';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = `btn ${a.cls || 'btn-secondary'}`;
      b.value = a.value;
      b.textContent = a.label;
      box.appendChild(b);
    });
    dlg.classList.toggle('wide', wide);
    return new Promise((resolve) => {
      setTimeout(() => {
        dlg.returnValue = '';
        dlg.addEventListener('close', () => resolve(dlg.returnValue || 'dismiss'), { once: true });
        dlg.showModal();
        const primary = box.querySelector('.btn-primary') || box.lastElementChild;
        if (primary) primary.focus();
      }, 0);
    });
  }

  function setBusy(btn, busy, label) {
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Gözləyin…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  // ================= Konfiqurasiya =================
  function loadConfig(force) {
    if (confPromise && !force) return confPromise;
    const status = $('#conn-status');
    status.textContent = 'Serverə qoşulur…';
    status.className = 'conn-status small';
    confPromise = api('config', {}, { retries: 3 }).then((c) => {
      conf = c;
      status.textContent = '';
      applyConfigToLogin();
      return c;
    }).catch((e) => {
      confPromise = null;
      status.innerHTML = `${esc(e.message)} <button class="link-btn" data-action="retry-config">Yenidən cəhd et</button>`;
      status.className = 'conn-status small error';
      throw e;
    });
    return confPromise;
  }

  function applyConfigToLogin() {
    const s = conf.settings;
    $('#group-label').innerHTML = s.requireGroup ? 'Qrup' : 'Qrup <em class="muted">(istəyə bağlı)</em>';
    $('#in-group').required = !!s.requireGroup;
    $('#group-list').innerHTML = (s.groups || []).map((g) => `<option value="${esc(g)}">`).join('');
    $('#code-field').hidden = !s.codesRequired;
  }

  // ================= Tələbə girişi =================
  async function onLogin(e) {
    e.preventDefault();
    const clean = (s) => s.replace(/\s+/g, ' ').trim();
    const first = clean($('#in-first').value), last = clean($('#in-last').value);
    const group = clean($('#in-group').value), code = clean($('#in-code').value);
    const err = $('#login-error');
    const nameOk = (s) => s.length >= 2 && /^[\p{L}\s'.-]+$/u.test(s);
    $('#in-first').setAttribute('aria-invalid', !nameOk(first));
    $('#in-last').setAttribute('aria-invalid', !nameOk(last));
    const bad = [];
    if (!nameOk(first)) bad.push('adınızı');
    if (!nameOk(last)) bad.push('soyadınızı');
    if (bad.length) return showError(err, `Zəhmət olmasa, ${bad.join(' və ')} düzgün yazın (yalnız hərflər, ən az 2 simvol).`);
    showError(err, '');

    const btn = $('#login-btn');
    setBusy(btn, true, 'Yoxlanılır…');
    try {
      await loadConfig();
      if (conf.settings.requireGroup && !group) { $('#in-group').setAttribute('aria-invalid', true); throw new ApiError('Qrupunuzu yazın.'); }
      if (conf.settings.codesRequired && !code) throw new ApiError('Şəxsi kodunuzu yazın.');
      const cap = (s) => s.split(' ').map((w) => w.charAt(0).toLocaleUpperCase('az') + w.slice(1)).join(' ');
      const res = await api('login', { student: { first: cap(first), last: cap(last), group, code } });
      student = { ...res.student, code, attempts: res.attempts || {} };
      sess.set(KEYS.STUDENT, student);
      renderMenu();
      flushPending();
    } catch (ex) {
      showError(err, ex.message);
    } finally {
      setBusy(btn, false);
    }
  }

  function logout() {
    if (session) return;
    student = null;
    sess.del(KEYS.STUDENT);
    $('#login-form').reset();
    show('login');
    $('#in-first').focus();
  }

  async function refreshStudent() {
    if (!student) return;
    try {
      const res = await api('login', { student: studentPayload() }, { retries: 1 });
      student = { ...student, attempts: res.attempts || {} };
      sess.set(KEYS.STUDENT, student);
    } catch { /* menyu köhnə məlumatla qalır */ }
  }

  // ================= Menyu =================
  function examAvailability(x) {
    const a = (student && student.attempts && student.attempts[x.key]) || { used: 0, finished: 0, best: null };
    if (x.status === 'upcoming') return { ok: false, note: `Açılır: ${fmtDate(x.opensAt)}`, a };
    if (x.status === 'closed') return { ok: false, note: 'Bağlanıb', a };
    if (x.limit && a.used >= x.limit && a.finished >= a.used) return { ok: false, note: 'Cəhd limiti bitib', a };
    return { ok: true, note: '', a };
  }

  async function renderMenu(refresh) {
    if (!student) return show('login');
    $('#menu-name').textContent = student.first;
    if (!conf || refresh) {
      $('#category-list').innerHTML = '<div class="card"><p class="muted">Yüklənir…</p></div>';
      show('menu');
      try { await loadConfig(!!refresh); } catch (e) {
        $('#category-list').innerHTML = `<div class="card"><p class="form-error">${esc(e.message)}</p><button class="btn btn-secondary btn-sm" data-action="refresh-menu">Yenidən cəhd et</button></div>`;
        return;
      }
      if (refresh) await refreshStudent();
    }
    const list = $('#category-list');
    list.innerHTML = conf.categories.map((cat) => {
      const exams = conf.exams.filter((x) => x.cat === cat.key);
      return `
      <div class="card category">
        <div class="category-top">
          <div class="cat-icon" aria-hidden="true">${ICONS[cat.icon] || ICONS.book}</div>
          <div><h2>${esc(cat.name)}</h2><p class="muted">${esc(cat.description)}</p></div>
        </div>
        <div class="exam-list">
          ${exams.map((x) => {
            const av = examAvailability(x);
            const tags = [];
            if (x.mode === 'practice') tags.push('<span class="tag tag-learn">Öyrənmə</span>');
            if (x.needsCode) tags.push('<span class="tag">🔒 Kod</span>');
            if (x.limit) tags.push(`<span class="tag">Cəhd ${av.a.used}/${x.limit}</span>`);
            if (av.a.best != null) tags.push(`<span class="tag tag-best">Ən yaxşı: ${av.a.best}%</span>`);
            if (av.note) tags.push(`<span class="tag tag-off">${esc(av.note)}</span>`);
            return `
            <button class="exam-item" data-exam="${esc(x.key)}" ${av.ok ? '' : 'disabled'}>
              <span>
                <strong>${esc(x.name)}</strong>
                <small>${x.count} sual · ${x.minutes ? x.minutes + ' dəq' : 'vaxt limiti yoxdur'}${x.mode === 'exam' ? ' · keçid ' + x.pass + '%' : ''}</small>
                <span class="tags">${tags.join('')}</span>
              </span>
              <span class="go" aria-hidden="true">→</span>
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('') || '<div class="card"><p class="muted">Hazırda aktiv imtahan yoxdur.</p></div>';
    renderPendingBanner();
    show('menu');
  }

  function renderPendingBanner() {
    const banner = $('#pending-banner');
    const pending = local.get(KEYS.PENDING) || [];
    const last = local.get(KEYS.LAST);
    const mine = last && student && fold(fullName(last.student)) === fold(fullName(student)) ? last : null;
    if (pending.length) {
      banner.innerHTML = `<span>${pending.length} imtahanın cavabları hələ serverə çatmayıb.</span><button class="btn btn-primary btn-sm" data-action="flush-pending">İndi göndər</button>`;
      banner.hidden = false;
    } else if (mine) {
      banner.innerHTML = `<span>Son nəticəniz: <b>${esc(mine.examName)}</b>${mine.hidden ? '' : ` — ${mine.percent}%`}</span><button class="btn btn-secondary btn-sm" data-action="show-last">Bax</button>`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  // ================= Qaydalar və başlanğıc =================
  function openIntro(key) {
    const x = examByKey(key);
    if (!x) return;
    selectedExam = key;
    const practice = x.mode === 'practice';
    $('#intro-cat').textContent = (catByKey(x.cat) || {}).name || '';
    $('#intro-title').textContent = x.name;
    $('#intro-stats').innerHTML = `
      <div class="stat"><strong>${x.count}</strong><span>sual</span></div>
      <div class="stat"><strong>${x.minutes || '∞'}</strong><span>${x.minutes ? 'dəqiqə' : 'vaxt limiti yoxdur'}</span></div>
      <div class="stat"><strong>${practice ? '✓' : x.pass + '%'}</strong><span>${practice ? 'dərhal cavab' : 'keçid balı'}</span></div>`;
    const rules = practice ? [
      'Bu <b>öyrənmə</b> testidir: hər cavabdan sonra düzgün cavab və izah dərhal göstərilir.',
      'Cavab seçildikdən sonra dəyişdirilə bilməz.',
      x.minutes ? 'Vaxt bitdikdə test avtomatik bitir.' : 'Vaxt məhdudiyyəti yoxdur — tələsməyin, izahları oxuyun.',
      'Nəticəniz müəllimə "Öyrənmə" kimi göndərilir.',
    ] : [
      'Hər sualın yalnız <b>bir</b> düzgün cavabı var. Səhv cavaba görə bal çıxılmır.',
      'Suallar arasında sərbəst keçə, şübhəli sualları <b>işarələyib</b> sonra qayıda bilərsiniz.',
      x.minutes ? 'Vaxt bitdikdə imtahan <b>avtomatik təhvil verilir</b>.' : 'Vaxt məhdudiyyəti yoxdur.',
      'Səhifə təsadüfən bağlansa, cavablarınız itmir — vaxt isə dayanmır.',
      'Başqa tab/pəncərəyə keçidlər <b>qeydə alınır</b> və müəllimə göstərilir.',
    ];
    if (x.limit) rules.push(`Bu imtahan üçün cəhd limiti: <b>${x.limit}</b>. Başladığınız cəhd sayılır.`);
    rules.push('Klaviatura: <kbd>A</kbd>–<kbd>D</kbd> cavab seçir, <kbd>←</kbd> <kbd>→</kbd> suallar arası keçid' + (practice ? '.' : ', <kbd>F</kbd> işarələyir.'));
    $('#intro-rules').innerHTML = rules.map((r) => `<li>${r}</li>`).join('');
    $('#exam-code-field').hidden = !x.needsCode;
    $('#in-exam-code').value = '';
    showError($('#start-error'), '');
    $('#start-btn').textContent = practice ? 'Öyrənməyə başla' : 'İmtahana başla';
    show('intro');
    if (x.needsCode) $('#in-exam-code').focus();
  }

  async function onStart(e) {
    e.preventDefault();
    const x = examByKey(selectedExam);
    if (!x) return;
    const code = $('#in-exam-code').value.trim();
    if (x.needsCode && !code) return showError($('#start-error'), 'Giriş kodunu yazın.');
    const btn = $('#start-btn');
    setBusy(btn, true, 'Hazırlanır…');
    showError($('#start-error'), '');
    try {
      const res = await api('start', { examKey: x.key, code, student: studentPayload() }, { retries: 3 });
      const at = res.attempt;
      startSession(createSession(at, x));
      if (res.resumed) toast('Yarımçıq cəhdiniz davam etdirilir.');
    } catch (ex) {
      showError($('#start-error'), ex.message);
    } finally {
      setBusy(btn, false);
    }
  }

  // ================= İmtahan =================
  function createSession(at, x) {
    const questions = {};
    const perm = {};
    at.questions.forEach((q) => {
      questions[q.id] = q;
      const idx = q.o.map((_, i) => i);
      perm[q.id] = q.f ? idx : shuffle(idx);
    });
    const now = Date.now();
    return {
      v: 3, attemptId: at.attemptId, examKey: at.examKey, mode: at.mode,
      examName: at.examName, catName: at.catName, pass: at.pass,
      student: { first: student.first, last: student.last, group: student.group },
      order: at.questions.map((q) => q.id), questions, perm, answers: {}, flags: {}, cur: 0,
      startedAt: now,
      endsAt: at.endsAt ? now + (at.endsAt - at.serverNow) : 0,
      focusLost: 0,
      count: x ? x.count : at.questions.length,
    };
  }

  const saveSession = () => { if (session) local.set(KEYS.ACTIVE, session); };
  const isPractice = () => session && session.mode === 'practice';

  function startSession(s) {
    session = s;
    session.cur = Math.min(session.cur || 0, session.order.length - 1);
    saveSession();
    $('#exam-cat').textContent = s.catName;
    $('#exam-name').textContent = s.examName;
    $('#submit-btn').textContent = isPractice() ? 'Testi bitir' : 'İmtahanı bitir';
    $('#nav-legend').innerHTML = isPractice()
      ? '<span><i class="dot dot-ok"></i>Düzgün</span><span><i class="dot dot-bad"></i>Səhv</span>'
      : '<span><i class="dot dot-answered"></i>Cavablı</span><span><i class="dot dot-flagged"></i>İşarəli</span>';
    $('#flag-btn').hidden = isPractice();
    buildNav();
    renderQuestion();
    show('exam');
    startTimer();
  }

  function buildNav() {
    $('#nav-grid').innerHTML = session.order.map((_, i) => `<button type="button" data-goto="${i}" aria-label="Sual ${i + 1}">${i + 1}</button>`).join('');
    updateNav();
  }

  function updateNav() {
    const btns = $('#nav-grid').children;
    let answered = 0;
    const practice = isPractice();
    session.order.forEach((id, i) => {
      const b = btns[i];
      const a = session.answers[id];
      const has = a != null;
      if (has) answered++;
      if (practice) {
        const ok = has && a === session.questions[id].a;
        b.classList.toggle('correct', has && ok);
        b.classList.toggle('wrong', has && !ok);
      } else {
        b.classList.toggle('answered', has);
        b.classList.toggle('flagged', !!session.flags[id]);
      }
      b.classList.toggle('current', i === session.cur);
      b.setAttribute('aria-current', i === session.cur ? 'step' : 'false');
    });
    const total = session.order.length;
    $('#progress-text').textContent = `${answered} / ${total} cavablandırılıb`;
    $('#progress-bar').style.width = `${(answered / total) * 100}%`;
    const cur = btns[session.cur];
    if (cur) {
      const grid = $('#nav-grid');
      const top = cur.offsetTop - grid.offsetTop;
      if (top < grid.scrollTop || top > grid.scrollTop + grid.clientHeight - cur.offsetHeight) grid.scrollTop = top - grid.clientHeight / 2;
    }
  }

  function renderQuestion() {
    const id = session.order[session.cur];
    const q = session.questions[id];
    const total = session.order.length;
    const practice = isPractice();
    const chosen = session.answers[id];
    const locked = practice && chosen != null;
    $('#q-number').textContent = `Sual ${session.cur + 1} / ${total}`;
    $('#q-topic').textContent = q.t;
    $('#q-text').textContent = q.q;
    const src = imgUrl(q.img);
    $('#q-figure').hidden = !src;
    if (src) $('#q-img').src = src; else $('#q-img').removeAttribute('src');
    $('#q-options').innerHTML = session.perm[id].map((orig, pos) => {
      let cls = 'opt';
      if (locked && orig === q.a) cls += ' opt-correct';
      if (locked && orig === chosen && orig !== q.a) cls += ' opt-wrong';
      return `
      <label class="${cls}">
        <input type="radio" name="answer" value="${orig}" ${chosen === orig ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <span class="opt-letter">${LETTERS[pos]}</span>
        <span class="opt-text">${esc(q.o[orig])}</span>
      </label>`;
    }).join('');
    const fb = $('#q-feedback');
    if (locked) {
      const ok = chosen === q.a;
      const rightPos = session.perm[id].indexOf(q.a);
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.innerHTML = `<strong>${ok ? '✓ Düzgün!' : `✗ Səhv. Düzgün cavab: ${LETTERS[rightPos]}) ${esc(q.o[q.a])}`}</strong>${q.e ? `<p>${esc(q.e)}</p>` : ''}`;
      fb.hidden = false;
    } else {
      fb.hidden = true;
    }
    const flagged = !!session.flags[id];
    const flag = $('#flag-btn');
    flag.setAttribute('aria-pressed', flagged);
    flag.querySelector('span').textContent = flagged ? 'İşarələnib' : 'İşarələ';
    $('#prev-btn').disabled = session.cur === 0;
    $('#next-btn').textContent = session.cur === total - 1 ? 'Bitir' : 'Növbəti →';
    $('#clear-btn').hidden = practice || chosen == null;
    updateNav();
  }

  function selectAnswer(orig) {
    const id = session.order[session.cur];
    if (isPractice() && session.answers[id] != null) return;
    session.answers[id] = orig;
    saveSession();
    if (isPractice()) return renderQuestion();
    const input = $(`#q-options input[value="${orig}"]`);
    if (input) input.checked = true;
    $('#clear-btn').hidden = false;
    updateNav();
  }

  function goTo(i) {
    if (!session) return;
    session.cur = Math.max(0, Math.min(session.order.length - 1, i));
    saveSession();
    renderQuestion();
    if (window.innerWidth <= 900) $('#question-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function toggleFlag() {
    if (isPractice()) return;
    const id = session.order[session.cur];
    if (session.flags[id]) delete session.flags[id]; else session.flags[id] = 1;
    saveSession();
    renderQuestion();
  }

  function startTimer() {
    clearInterval(timerId);
    if (!session.endsAt) { $('#exam-timer').hidden = true; return; }
    let warned5 = false, warned1 = false;
    const el = $('#exam-timer'), txt = $('#timer-text');
    const tick = () => {
      if (!session) return clearInterval(timerId);
      const left = (session.endsAt - Date.now()) / 1000;
      txt.textContent = fmtClock(Math.ceil(left));
      el.classList.toggle('warn', left <= 300 && left > 60);
      el.classList.toggle('danger', left <= 60);
      if (left <= 300 && left > 60 && !warned5) { warned5 = true; toast('5 dəqiqə qaldı', 'warn'); }
      if (left <= 60 && !warned1) { warned1 = true; toast('1 dəqiqə qaldı!', 'warn'); }
      if (left <= 0) {
        clearInterval(timerId);
        if ($('#dialog').open) $('#dialog').close('timeout');
        finishExam(true);
      }
    };
    tick();
    timerId = setInterval(tick, 500);
  }

  async function confirmSubmit() {
    const total = session.order.length;
    const answered = session.order.filter((id) => session.answers[id] != null).length;
    const empty = total - answered;
    const flagged = session.order.filter((id) => session.flags[id]).length;
    const lines = [`<p><b>${answered}</b> / ${total} sual cavablandırılıb.</p>`];
    if (empty) lines.push(`<p style="color:var(--bad)"><b>${empty}</b> sual cavabsızdır.</p>`);
    if (flagged) lines.push(`<p><b>${flagged}</b> sual işarələnib.</p>`);
    lines.push(isPractice() ? '<p>Test bitəndən sonra nəticəniz göstəriləcək.</p>' : '<p>Təhvil verdikdən sonra cavabları dəyişmək mümkün olmayacaq.</p>');
    const actions = [{ label: 'Geri qayıt', value: 'back' }];
    if (empty) actions.push({ label: 'İlk boş suala keç', value: 'first-empty' });
    actions.push({ label: isPractice() ? 'Bitir' : 'Təhvil ver', value: 'submit', cls: 'btn-primary' });
    const r = await dialog({ title: isPractice() ? 'Testi bitirmək istəyirsiniz?' : 'İmtahanı bitirmək istəyirsiniz?', html: lines.join(''), actions });
    if (!session) return;
    if (r === 'submit') finishExam(false);
    else if (r === 'first-empty') goTo(session.order.findIndex((id) => session.answers[id] == null));
  }

  function finishExam(auto) {
    if (!session) return;
    clearInterval(timerId);
    const s = session;
    session = null;
    local.del(KEYS.ACTIVE);
    const answers = {};
    s.order.forEach((id) => { answers[id] = s.answers[id] == null ? null : s.answers[id]; });
    const sub = {
      attemptId: s.attemptId, answers, focusLost: s.focusLost || 0, auto: !!auto,
      meta: {
        examKey: s.examKey, examName: s.examName, catName: s.catName, mode: s.mode, pass: s.pass, student: s.student,
        order: s.order, questions: s.order.map((id) => s.questions[id]), startedAt: s.startedAt,
        finishedAt: s.endsAt ? Math.min(Date.now(), s.endsAt) : Date.now(),
      },
    };
    const pending = (local.get(KEYS.PENDING) || []).filter((p) => p.attemptId !== sub.attemptId);
    pending.push(sub);
    local.set(KEYS.PENDING, pending);
    student = { ...student, ...s.student };
    sess.set(KEYS.STUDENT, student);
    currentSubmitId = sub.attemptId;

    if (s.mode === 'practice') {
      const r = localResult(sub);
      local.set(KEYS.LAST, r);
      renderResult(r, 'sending');
    } else {
      showPending('sending');
    }
    if (auto) dialog({ title: 'Vaxt bitdi', html: '<p>Müddət başa çatdı və cavablarınız avtomatik təhvil verildi.</p>' });
    submitOne(sub, true);
  }

  // ================= Göndərmə =================
  const inflight = new Set();

  async function submitOne(sub, interactive) {
    if (inflight.has(sub.attemptId)) return;
    inflight.add(sub.attemptId);
    try {
      const res = await api('submit', {
        attemptId: sub.attemptId, answers: sub.answers, focusLost: sub.focusLost, auto: sub.auto,
        userAgent: navigator.userAgent.slice(0, 200),
      }, { retries: 3 });
      local.set(KEYS.PENDING, (local.get(KEYS.PENDING) || []).filter((p) => p.attemptId !== sub.attemptId));
      const r = serverResult(sub, res.result);
      local.set(KEYS.LAST, r);
      if (currentSubmitId === sub.attemptId && currentView === 'result') renderResult(r, 'ok');
      else if (!interactive) toast(`Nəticə göndərildi: ${sub.meta.examName}`);
      if (currentView === 'menu') renderPendingBanner();
      refreshStudent();
    } catch (e) {
      if (currentSubmitId === sub.attemptId && currentView === 'result') {
        if (sub.meta.mode === 'practice') setSendStatus('fail', e.message);
        else showPending('error', e.message);
      }
    } finally {
      inflight.delete(sub.attemptId);
    }
  }

  function flushPending() {
    (local.get(KEYS.PENDING) || []).forEach((p) => submitOne(p, false));
  }

  function showPending(state, message) {
    $('#res-full').hidden = true;
    $('#res-hidden').hidden = true;
    $('#res-pending').hidden = false;
    const sending = state === 'sending';
    $('#res-pending').classList.toggle('is-error', !sending);
    $('#res-pending-title').textContent = sending ? 'Cavablarınız yoxlanılır…' : 'Cavablar serverə çatmadı';
    $('#res-pending-text').innerHTML = sending
      ? 'Bir neçə saniyə gözləyin. Səhifəni bağlamayın.'
      : `${esc(message || '')}<br>Cavablarınız bu kompüterdə yadda saxlanılıb və internet bərpa olunanda avtomatik göndəriləcək.`;
    $('#res-retry').hidden = sending;
    show('result');
  }

  function setSendStatus(state, message) {
    const box = $('#send-status');
    box.hidden = false;
    box.className = `send-status ${state}`;
    box.innerHTML = state === 'ok' ? '<span>✓ Nəticəniz müəllimə göndərildi.</span>'
      : state === 'fail' ? `<span>Nəticə hələ göndərilmədi: ${esc(message || '')}</span><button class="btn btn-primary btn-sm" data-action="retry-submit">Yenidən göndər</button>`
        : '<span>Nəticə müəllimə göndərilir…</span>';
  }

  // ================= Nəticə =================
  function baseResult(sub) {
    const m = sub.meta;
    return {
      attemptId: sub.attemptId, examKey: m.examKey, examName: `${m.catName ? m.catName + ' — ' : ''}${m.examName}`,
      mode: m.mode, pass: m.pass, student: m.student, order: m.order, questions: m.questions, answers: sub.answers,
      finishedAt: m.finishedAt, durationSec: Math.round((m.finishedAt - m.startedAt) / 1000),
    };
  }

  function localResult(sub) {
    const r = baseResult(sub);
    let correct = 0, wrong = 0, empty = 0;
    r.review = r.questions.map((q) => {
      const a = sub.answers[q.id];
      const ok = a != null && a === q.a;
      if (a == null) empty++; else if (ok) correct++; else wrong++;
      return { id: q.id, ok, c: q.a, e: q.e };
    });
    const total = correct + wrong + empty;
    return Object.assign(r, { correct, wrong, empty, total, percent: pctOf(correct, total), passed: pctOf(correct, total) >= r.pass, grade: '' });
  }

  function serverResult(sub, res) {
    const r = baseResult(sub);
    if (res.hidden) return Object.assign(r, { hidden: true });
    return Object.assign(r, res, { examName: r.examName });
  }

  function renderResult(r, sendState) {
    lastResult = r;
    $('#res-pending').hidden = true;
    if (r.hidden) {
      $('#res-full').hidden = true;
      $('#res-hidden').hidden = false;
      $('#res-hidden-text').textContent = `${r.examName} · ${fullName(r.student)}. Nəticəni müəllim elan edəcək.`;
      return show('result');
    }
    $('#res-hidden').hidden = true;
    $('#res-full').hidden = false;
    const practice = r.mode === 'practice';
    const ring = $('#ring-value');
    ring.style.stroke = scoreColor(r.percent);
    ring.style.strokeDashoffset = 326.73;
    requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = 326.73 * (1 - r.percent / 100); }));
    $('#res-percent').textContent = `${r.percent}%`;
    $('#res-fraction').textContent = `${r.correct} / ${r.total}`;
    const pill = $('#res-pill');
    if (practice) { pill.textContent = 'Öyrənmə testi'; pill.className = 'pill learn'; }
    else { pill.textContent = r.passed ? `Keçdi (keçid balı ${r.pass}%)` : `Keçmədi (keçid balı ${r.pass}%)`; pill.className = `pill ${r.passed ? 'pass' : 'fail'}`; }
    const grade = $('#res-grade');
    grade.hidden = !r.grade || practice;
    grade.textContent = `Qiymət: ${r.grade}`;
    $('#res-title').textContent = r.examName;
    $('#res-student').textContent = `${fullName(r.student)}${r.student.group ? ' · ' + r.student.group : ''} · ${fmtDate(r.finishedAt)}`;
    $('#res-correct').textContent = r.correct;
    $('#res-wrong').textContent = r.wrong;
    $('#res-empty').textContent = r.empty;
    $('#res-time').textContent = fmtClock(r.durationSec);

    const qById = {};
    r.questions.forEach((q) => { qById[q.id] = q; });
    const topics = {};
    r.review.forEach((it) => {
      const q = qById[it.id];
      if (!q) return;
      const t = topics[q.t] || (topics[q.t] = { ok: 0, n: 0 });
      t.n++;
      if (it.ok) t.ok++;
    });
    $('#topic-list').innerHTML = barsHTML(Object.entries(topics)
      .map(([name, t]) => ({ label: name, value: pctOf(t.ok, t.n), text: `${t.ok}/${t.n}`, color: scoreColor(pctOf(t.ok, t.n)) }))
      .sort((a, b) => a.value - b.value), 100);

    reviewFilter = r.wrong ? 'wrong' : r.empty ? 'empty' : 'all';
    renderReview();
    $('#cert-btn').hidden = practice || !r.passed;
    if (sendState) setSendStatus(sendState); else $('#send-status').hidden = true;
    show('result');
  }

  function reviewItemHTML(q, n, chosen, it) {
    const cls = chosen == null ? 'blank' : it.ok ? 'ok' : 'bad';
    let ans = chosen == null ? '<span class="muted">Cavab verilməyib</span>'
      : `<span class="${it.ok ? 'right' : 'you-bad'}">${it.ok ? '✓' : '✗'} Cavab: ${esc(q.o[chosen])}</span>`;
    if (!it.ok && it.c != null && it.c >= 0) ans += `<span class="right">✓ Düzgün cavab: ${esc(q.o[it.c])}</span>`;
    const src = imgUrl(q.img);
    return `<li class="review-item ${cls}">
      <div class="rq"><b>${n}.</b>${esc(q.q)}</div>
      ${src ? `<img class="review-img" src="${esc(src)}" alt="" loading="lazy">` : ''}
      <div class="ra">${ans}</div>
      ${it.e ? `<div class="expl">${esc(it.e)}</div>` : ''}
      <div class="meta">${esc(q.t)}</div>
    </li>`;
  }

  function renderReview() {
    const r = lastResult;
    $$('#review-filter button').forEach((b) => b.setAttribute('aria-selected', b.dataset.filter === reviewFilter));
    const qById = {};
    r.questions.forEach((q) => { qById[q.id] = q; });
    const items = r.review.map((it, i) => ({ it, n: i + 1, q: qById[it.id], a: r.answers[it.id] })).filter((x) => x.q).filter((x) => {
      if (reviewFilter === 'wrong') return x.a != null && !x.it.ok;
      if (reviewFilter === 'empty') return x.a == null;
      return true;
    });
    $('#review-list').innerHTML = items.length
      ? items.map((x) => reviewItemHTML(x.q, x.n, x.a, x.it)).join('')
      : `<li class="empty">${reviewFilter === 'wrong' ? 'Səhv cavab yoxdur 🎉' : reviewFilter === 'empty' ? 'Boş buraxılmış sual yoxdur.' : ''}</li>`;
  }

  function printCertificate() {
    const r = lastResult;
    if (!r) return;
    $('#cert-org').textContent = CFG.title;
    $('#cert-name').textContent = fullName(r.student);
    $('#cert-exam').textContent = r.examName;
    $('#cert-score').textContent = `${r.percent}%`;
    $('#cert-grade').textContent = r.grade || (r.passed ? 'Keçdi' : '—');
    $('#cert-date').textContent = fmtDate(r.finishedAt, false);
    $('#cert-id').textContent = r.attemptId;
    document.body.classList.add('print-cert');
    const done = () => document.body.classList.remove('print-cert');
    window.addEventListener('afterprint', done, { once: true });
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  }

  // ================= Zolaqlı qrafik (tək seriya) =================
  function barsHTML(rows, max) {
    if (!rows.length) return '<p class="empty">Məlumat yoxdur.</p>';
    const top = max || Math.max(1, ...rows.map((r) => r.value));
    return rows.map((r) => `
      <div class="bar-row" title="${esc(r.label)}: ${esc(r.text)}">
        <span class="bar-label">${esc(r.label)}</span><span class="bar-val">${esc(r.text)}</span>
        <div class="bar"><i style="width:${Math.max((r.value / top) * 100, r.value ? 2 : 0)}%;background:${r.color || 'var(--accent)'}"></i></div>
      </div>`).join('');
  }

  // ================= Müəllim paneli =================
  function openTeacherLogin() {
    showError($('#teacher-error'), '');
    $('#in-teacher-pass').value = '';
    show('teacher-login');
    $('#in-teacher-pass').focus();
  }

  async function onTeacherLogin(e) {
    e.preventDefault();
    const pass = $('#in-teacher-pass').value;
    if (!pass) return;
    const btn = $('#teacher-submit');
    setBusy(btn, true, 'Yoxlanılır…');
    showError($('#teacher-error'), '');
    try {
      await loadTeacher(pass);
      teacherPass = pass;
      renderTeacher();
    } catch (ex) {
      showError($('#teacher-error'), ex.message);
    } finally {
      setBusy(btn, false);
    }
  }

  async function loadTeacher(pass) {
    const d = await api('teacher', { password: pass }, { retries: 1, timeout: 60000 });
    d.qById = {};
    d.questions.forEach((q) => { d.qById[q.id] = q; });
    d.examMap = {};
    d.exams.forEach((x) => { d.examMap[x.key] = x; });
    d.results.forEach((r) => {
      r.order = [];
      r.ans = {};
      String(r.answers || '').split(',').filter(Boolean).forEach((pair) => {
        const [id, a] = pair.split(':');
        r.order.push(id);
        r.ans[id] = a === '-' || a === undefined ? null : Number(a);
      });
      r.ts = new Date(r.receivedAt).getTime() || 0;
    });
    d.results.sort((a, b) => b.ts - a.ts);
    d.loadedAt = Date.now();
    T = d;
  }

  async function refreshTeacher(quiet) {
    try {
      await loadTeacher(teacherPass);
      renderTeacher();
      if (!quiet) toast('Yeniləndi');
    } catch (e) {
      toast(`Yeniləmək alınmadı: ${e.message}`, 'warn');
    }
  }

  function examLabel(key) {
    const x = T.examMap[key];
    if (!x) return (T.results.find((r) => r.examKey === key) || {}).examName || key;
    const cat = T.categories.find((c) => c.key === x.cat);
    return `${cat ? cat.name + ' — ' : ''}${x.name}`;
  }

  function renderTeacher() {
    const examSel = $('#t-exam'), groupSel = $('#t-group');
    const prevExam = examSel.value, prevGroup = groupSel.value;
    const keys = [...new Set([...T.exams.map((x) => x.key), ...T.results.map((r) => r.examKey)])];
    examSel.innerHTML = '<option value="">Bütün imtahanlar</option>' + keys.map((k) => `<option value="${esc(k)}">${esc(examLabel(k))}${T.examMap[k] && T.examMap[k].mode === 'practice' ? ' (öyrənmə)' : ''}</option>`).join('');
    if (keys.includes(prevExam)) examSel.value = prevExam;
    const groups = [...new Set([...T.roster.map((r) => r.group), ...T.results.map((r) => r.group)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az'));
    groupSel.innerHTML = '<option value="">Bütün qruplar</option>' + groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if (groups.includes(prevGroup)) groupSel.value = prevGroup;
    $('#t-sheet').href = T.sheetUrl || '#';
    $('#t-sheet').hidden = !T.sheetUrl;
    $('#t-updated').textContent = `Son yenilənmə: ${fmtDate(T.loadedAt)} · ${T.results.length} nəticə · ${T.questions.length} sual · ${T.roster.length} tələbə siyahıda`;
    const warn = [];
    if (T.skipped && T.skipped.length) warn.push(`<div class="banner banner-warn"><span><b>${T.skipped.length}</b> sual "Suallar" vərəqində natamam doldurulduğu üçün imtahanlara düşmür: ${esc(T.skipped.slice(0, 12).join(', '))}${T.skipped.length > 12 ? '…' : ''}</span></div>`);
    $('#t-warnings').innerHTML = warn.join('');
    renderTeacherBody();
    if (currentView !== 'teacher') show('teacher');
  }

  function filteredResults() {
    const q = fold($('#t-search').value.trim());
    const ex = $('#t-exam').value, gr = $('#t-group').value;
    return T.results.filter((r) => (!ex || r.examKey === ex) && (!gr || r.group === gr) &&
      (!q || fold(`${r.first} ${r.last} ${r.group} ${r.attemptId}`).includes(q)));
  }

  function renderTeacherBody() {
    const rows = filteredResults();
    const exams = rows.filter((r) => r.mode !== 'practice');
    const n = rows.length;
    const avg = n ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / n) : 0;
    const people = new Set(rows.map((r) => r.studentKey)).size;
    const passed = exams.filter((r) => r.passed).length;
    $('#t-tiles').innerHTML = `
      <div class="stat"><strong>${n}</strong><span>cəhd</span></div>
      <div class="stat"><strong>${people}</strong><span>tələbə</span></div>
      <div class="stat"><strong>${n ? avg + '%' : '—'}</strong><span>orta nəticə</span></div>
      <div class="stat ok"><strong>${exams.length ? pctOf(passed, exams.length) + '%' : '—'}</strong><span>keçənlər (imtahan)</span></div>`;

    $$('#t-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === teacherTab));
    ['results', 'students', 'stats', 'questions'].forEach((t) => { $(`#t-${t}`).hidden = teacherTab !== t; });

    if (teacherTab === 'results') {
      $('#t-body').innerHTML = rows.map((r) => `
        <tr>
          <td class="nowrap">${esc(fmtDate(r.receivedAt))}</td>
          <td><b>${esc(r.first)} ${esc(r.last)}</b>${r.mode === 'practice' ? ' <span class="tag tag-learn">öyrənmə</span>' : ''}</td>
          <td class="nowrap">${esc(r.group || '—')}</td>
          <td>${esc(examLabel(r.examKey))}</td>
          <td class="num"><span class="score ${r.mode === 'practice' ? '' : r.passed ? 'pass' : 'fail'}">${r.percent}%</span> <span class="muted small">${r.correct}/${r.total}</span></td>
          <td class="nowrap">${esc(r.grade || '—')}</td>
          <td class="num">${fmtClock(r.durationSec)}${r.lateSec > 0 ? ` <span class="tag tag-off" title="Vaxt bitdikdən ${r.lateSec} san sonra gəlib">gecikmə</span>` : ''}</td>
          <td class="num ${r.focusLost >= 3 ? 'tab-warn' : ''}">${r.focusLost}</td>
          <td class="num"><button class="btn btn-secondary btn-sm" data-detail="${esc(r.attemptId)}">Ətraflı</button></td>
        </tr>`).join('');
      $('#t-empty').hidden = n > 0;
    } else if (teacherTab === 'students') {
      renderStudents();
    } else if (teacherTab === 'stats') {
      renderStats(rows);
    } else {
      renderHardQuestions(rows);
    }
  }

  function studentRows() {
    const ex = $('#t-exam').value, gr = $('#t-group').value;
    const q = fold($('#t-search').value.trim());
    if (!ex) return null;
    const x = T.examMap[ex];
    const grace = 2 * 60000;
    const map = new Map();
    const add = (key, first, last, group, inRoster) => {
      if (!map.has(key)) map.set(key, { key, first, last, group, inRoster, starts: [], results: [] });
      return map.get(key);
    };
    T.roster.forEach((r) => add(r.key, r.first, r.last, r.group, true));
    T.starts.filter((s) => s.examKey === ex).forEach((s) => add(s.studentKey, s.first, s.last, s.group, false).starts.push(s));
    T.results.filter((r) => r.examKey === ex).forEach((r) => add(r.studentKey, r.first, r.last, r.group, false).results.push(r));
    const now = Date.now();
    return [...map.values()]
      .filter((s) => (!gr || s.group === gr) && (!q || fold(`${s.first} ${s.last} ${s.group}`).includes(q)))
      .map((s) => {
        const best = s.results.length ? s.results.reduce((a, b) => (b.percent > a.percent ? b : a)) : null;
        const running = s.starts.some((st) => !st.finished && !/sayılmır/i.test(st.status) && (st.endsAt ? new Date(st.endsAt).getTime() + grace > now : now - new Date(st.startedAt).getTime() < 6 * 3600000));
        const status = running ? 'running' : best ? 'done' : s.starts.length ? 'abandoned' : 'none';
        return { ...s, best, status, used: s.starts.filter((st) => !/sayılmır/i.test(st.status)).length, limit: x ? x.limit : null };
      })
      .sort((a, b) => (a.group || '').localeCompare(b.group || '', 'az') || a.last.localeCompare(b.last, 'az') || a.first.localeCompare(b.first, 'az'));
  }

  const STATUS_LABEL = { done: 'Bitirib', running: 'Davam edir', abandoned: 'Yarımçıq qalıb', none: 'Girməyib' };

  function renderStudents() {
    const rows = studentRows();
    const note = $('#t-students-note');
    const body = $('#t-students-body');
    if (!rows) {
      note.textContent = 'Tələbələrin statusunu görmək üçün yuxarıdan imtahan seçin.';
      body.innerHTML = '';
      return;
    }
    const c = { done: 0, running: 0, abandoned: 0, none: 0 };
    rows.forEach((r) => { c[r.status]++; });
    note.innerHTML = `Bitirib: <b>${c.done}</b> · Davam edir: <b>${c.running}</b> · Yarımçıq: <b>${c.abandoned}</b> · Girməyib: <b>${c.none}</b>` +
      (T.roster.length ? '' : ' — <i>"Tələbələr" vərəqi boşdur, ona görə yalnız imtahana girənlər görünür.</i>');
    body.innerHTML = rows.map((r) => `
      <tr>
        <td><b>${esc(r.first)} ${esc(r.last)}</b>${!r.inRoster && T.roster.length ? ' <span class="tag tag-off" title="Tələbələr siyahısında yoxdur">siyahıda yoxdur</span>' : ''}</td>
        <td class="nowrap">${esc(r.group || '—')}</td>
        <td><span class="status s-${r.status}">${STATUS_LABEL[r.status]}</span></td>
        <td class="num">${r.used}${r.limit ? '/' + r.limit : ''}</td>
        <td class="num">${r.best ? `<span class="score ${r.best.passed ? 'pass' : 'fail'}">${r.best.percent}%</span>` : '—'}</td>
        <td>${r.best ? esc(r.best.grade || '—') : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">Heç kim tapılmadı.</td></tr>';
  }

  function topicStats(rows) {
    const topics = {};
    rows.forEach((r) => r.order.forEach((id) => {
      const q = T.qById[id];
      if (!q) return;
      const t = topics[q.t] || (topics[q.t] = { ok: 0, n: 0 });
      t.n++;
      if (r.ans[id] === q.a) t.ok++;
    }));
    return topics;
  }

  function renderStats(rows) {
    const exams = rows.filter((r) => r.mode !== 'practice');
    const counts = {};
    exams.forEach((r) => { const g = r.grade || '—'; counts[g] = (counts[g] || 0) + 1; });
    const gradeOrder = [...T.grades.map((g) => g.label), ...Object.keys(counts).filter((g) => !T.grades.some((x) => x.label === g))];
    $('#chart-grades').innerHTML = exams.length
      ? barsHTML(gradeOrder.filter((g) => counts[g] || T.grades.some((x) => x.label === g)).map((g) => ({ label: g, value: counts[g] || 0, text: `${counts[g] || 0} (${pctOf(counts[g] || 0, exams.length)}%)` })))
      : '<p class="empty">İmtahan nəticəsi yoxdur (öyrənmə testləri sayılmır).</p>';

    const groups = {};
    rows.forEach((r) => { const g = r.group || 'Qrupsuz'; (groups[g] = groups[g] || []).push(r.percent); });
    $('#chart-groups').innerHTML = barsHTML(Object.entries(groups)
      .map(([g, arr]) => { const avg = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length); return { label: g, value: avg, text: `${avg}% · ${arr.length} cəhd` }; })
      .sort((a, b) => b.value - a.value), 100);

    $('#chart-topics').innerHTML = barsHTML(Object.entries(topicStats(rows))
      .map(([t, s]) => ({ label: t, value: pctOf(s.ok, s.n), text: `${pctOf(s.ok, s.n)}% (${s.ok}/${s.n})`, color: scoreColor(pctOf(s.ok, s.n)) }))
      .sort((a, b) => a.value - b.value), 100);
  }

  function questionStats(rows) {
    const stats = {};
    rows.forEach((r) => r.order.forEach((id) => {
      const q = T.qById[id];
      if (!q) return;
      const s = stats[id] || (stats[id] = { n: 0, ok: 0, picks: {} });
      s.n++;
      const a = r.ans[id];
      if (a === q.a) s.ok++;
      else if (a != null) s.picks[a] = (s.picks[a] || 0) + 1;
    }));
    return Object.entries(stats).map(([id, s]) => {
      const top = Object.entries(s.picks).sort((a, b) => b[1] - a[1])[0];
      return { id, q: T.qById[id], ...s, pct: pctOf(s.ok, s.n), top };
    }).sort((a, b) => a.pct - b.pct || b.n - a.n);
  }

  function renderHardQuestions(rows) {
    const list = questionStats(rows).slice(0, 30);
    $('#t-qlist').innerHTML = list.length ? list.map((s) => {
      const src = imgUrl(s.q.img);
      return `<li class="review-item ${s.pct < 40 ? 'bad' : s.pct < 70 ? 'blank' : 'ok'}">
        <div class="rq"><b>${esc(s.id)}</b> ${esc(s.q.q)}</div>
        ${src ? `<img class="review-img" src="${esc(src)}" alt="" loading="lazy">` : ''}
        <div class="ra">
          <span>Düzgün cavablayan: <b style="color:${scoreColor(s.pct)}">${s.pct}%</b> (${s.ok}/${s.n})</span>
          <span class="right">✓ Açar (${LETTERS[s.q.a]}): ${esc(s.q.o[s.q.a])}</span>
          ${s.top ? `<span class="you-bad">Ən çox seçilən səhv: ${esc(s.q.o[s.top[0]])} (${s.top[1]} dəfə)</span>` : ''}
        </div>
        ${s.q.e ? `<div class="expl">${esc(s.q.e)}</div>` : ''}
        <div class="meta">${esc(s.q.t)}</div>
      </li>`;
    }).join('') : '<li class="empty">Məlumat yoxdur.</li>';
  }

  async function showAttemptDetail(attemptId) {
    const r = T.results.find((x) => x.attemptId === attemptId);
    if (!r) return;
    const start = T.starts.find((s) => s.attemptId === attemptId);
    const notCounted = start && /sayılmır/i.test(start.status);
    const items = r.order.map((id, i) => {
      const q = T.qById[id];
      if (!q) return `<li class="review-item blank"><div class="rq"><b>${i + 1}.</b> Sual silinib (${esc(id)})</div></li>`;
      const a = r.ans[id];
      return reviewItemHTML(q, i + 1, a, { ok: a === q.a, c: q.a, e: '' });
    }).join('');
    const x = T.examMap[r.examKey];
    const head = `<p>${esc(examLabel(r.examKey))} · ${esc(fmtDate(r.receivedAt))} · Cəhd ID: <code>${esc(r.attemptId)}</code><br>
      Nəticə: <b style="color:${scoreColor(r.percent)}">${r.percent}%</b> (${r.correct}/${r.total})${r.grade ? ' · Qiymət: <b>' + esc(r.grade) + '</b>' : ''} ·
      Vaxt: ${fmtDuration(r.durationSec)} · Tab keçidi: <b>${r.focusLost}</b>${r.auto ? ' · <i>vaxt bitdiyi üçün avtomatik təhvil</i>' : ''}${r.lateSec > 0 ? ` · <b style="color:var(--warn)">${r.lateSec} san gecikmə</b>` : ''}
      ${notCounted ? '<br><i>Bu cəhd limitə sayılmır (əlavə cəhd verilib).</i>' : ''}</p>`;
    const actions = [];
    if (x && x.limit && start && !notCounted) actions.push({ label: 'Əlavə cəhd ver', value: 'retry' });
    actions.push({ label: 'Bağla', value: 'close', cls: 'btn-primary' });
    const res = await dialog({ title: `${r.first} ${r.last}${r.group ? ' · ' + r.group : ''}`, html: head + `<ol class="review-list" style="max-height:none">${items}</ol>`, wide: true, actions });
    if (res === 'retry') {
      const ok = await dialog({
        title: 'Əlavə cəhd verilsin?',
        html: `<p>Bu cəhd <b>${esc(r.first)} ${esc(r.last)}</b> üçün limitə sayılmayacaq və tələbə imtahanı yenidən verə biləcək. Nəticə silinmir.</p>`,
        actions: [{ label: 'Ləğv et', value: 'no' }, { label: 'Bəli, ver', value: 'yes', cls: 'btn-primary' }],
      });
      if (ok !== 'yes') return;
      try {
        await api('grantRetry', { password: teacherPass, attemptId }, { retries: 1 });
        toast('Əlavə cəhd verildi.');
        refreshTeacher(true);
      } catch (e) {
        toast(e.message, 'warn');
      }
    }
  }

  function downloadXlsx() {
    const rows = filteredResults();
    const sheets = [{
      name: 'Nəticələr',
      widths: [17, 14, 16, 10, 34, 10, 8, 8, 8, 8, 8, 14, 8, 10, 10, 10, 18],
      rows: [['Tarix', 'Ad', 'Soyad', 'Qrup', 'İmtahan', 'Rejim', 'Düzgün', 'Səhv', 'Boş', 'Cəmi', 'Faiz', 'Qiymət', 'Keçdi', 'Müddət (dəq)', 'Gecikmə (san)', 'Tab keçidi', 'Cəhd ID'],
        ...rows.map((r) => [fmtDate(r.receivedAt), r.first, r.last, r.group, examLabel(r.examKey), r.mode === 'practice' ? 'Öyrənmə' : 'İmtahan',
          r.correct, r.wrong, r.empty, r.total, r.percent, r.grade, r.passed ? 'Bəli' : 'Xeyr', Math.round(r.durationSec / 6) / 10, r.lateSec, r.focusLost, r.attemptId])],
    }];
    const st = studentRows();
    if (st) {
      sheets.push({
        name: 'Tələbələr',
        widths: [12, 16, 18, 16, 8, 10, 14],
        rows: [['Qrup', 'Ad', 'Soyad', 'Status', 'Cəhd', 'Ən yaxşı (%)', 'Qiymət'],
          ...st.map((r) => [r.group, r.first, r.last, STATUS_LABEL[r.status], r.used, r.best ? r.best.percent : '', r.best ? r.best.grade : ''])],
      });
    }
    sheets.push({
      name: 'Suallar',
      widths: [8, 70, 22, 12, 12, 40],
      rows: [['ID', 'Sual', 'Mövzu', 'Cavablayan', 'Düzgün (%)', 'Ən çox seçilən səhv'],
        ...questionStats(rows).map((s) => [s.id, s.q.q, s.q.t, s.n, s.pct, s.top ? `${s.q.o[s.top[0]]} (${s.top[1]})` : ''])],
    });
    const ex = $('#t-exam').value;
    window.XlsxLite.download(`imtahan-${ex || 'hamisi'}-${new Date().toISOString().slice(0, 10)}.xlsx`, sheets);
  }

  // ================= Hadisələr =================
  function goHome() {
    if (session) return;
    if (student) renderMenu(); else show('login');
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-exam],[data-goto],[data-filter],[data-tab],[data-detail]');
    if (!t || t.disabled) return;
    if (t.dataset.exam) return openIntro(t.dataset.exam);
    if (t.dataset.goto) return goTo(Number(t.dataset.goto));
    if (t.dataset.filter) { reviewFilter = t.dataset.filter; return renderReview(); }
    if (t.dataset.tab) { teacherTab = t.dataset.tab; return renderTeacherBody(); }
    if (t.dataset.detail) return showAttemptDetail(t.dataset.detail);
    switch (t.dataset.action) {
      case 'home': e.preventDefault(); return goHome();
      case 'logout': return logout();
      case 'menu': return renderMenu();
      case 'refresh-menu': return renderMenu(true);
      case 'retry-config': return loadConfig(true).catch(() => {});
      case 'teacher-login': return openTeacherLogin();
      case 'prev': return goTo(session.cur - 1);
      case 'next': return session.cur === session.order.length - 1 ? confirmSubmit() : goTo(session.cur + 1);
      case 'flag': return toggleFlag();
      case 'clear-answer':
        delete session.answers[session.order[session.cur]];
        saveSession();
        return renderQuestion();
      case 'submit-exam': return confirmSubmit();
      case 'print': return window.print();
      case 'certificate': return printCertificate();
      case 'retry-submit': {
        const p = (local.get(KEYS.PENDING) || []).find((x) => x.attemptId === currentSubmitId);
        if (!p) return;
        if (p.meta.mode === 'practice') setSendStatus('sending'); else showPending('sending');
        return submitOne(p, true);
      }
      case 'flush-pending': toast('Göndərilir…'); return flushPending();
      case 'show-last': { const r = local.get(KEYS.LAST); if (r) { currentSubmitId = r.attemptId; renderResult(r); } return; }
      case 't-refresh': return refreshTeacher();
      case 't-xlsx': return downloadXlsx();
      case 't-logout': teacherPass = null; T = null; return goHome();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'answer' && session) selectAnswer(Number(e.target.value));
    if (e.target.id === 't-exam' || e.target.id === 't-group') renderTeacherBody();
  });
  document.addEventListener('input', (e) => { if (e.target.id === 't-search') renderTeacherBody(); });
  $('#login-form').addEventListener('submit', onLogin);
  $('#start-form').addEventListener('submit', onStart);
  $('#teacher-form').addEventListener('submit', onTeacherLogin);

  document.addEventListener('keydown', (e) => {
    if (currentView !== 'exam' || !session || $('#dialog').open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'radio') return;
    const k = e.key.toLowerCase();
    const perm = session.perm[session.order[session.cur]];
    let pos = k.length === 1 ? LETTERS.toLowerCase().indexOf(k) : -1;
    if (k === 'f' && perm.length < 6) pos = -1;
    if (pos < 0 && /^[1-6]$/.test(k)) pos = Number(k) - 1;
    if (pos >= 0 && pos < perm.length) { e.preventDefault(); return selectAnswer(perm[pos]); }
    if (k === 'arrowright') { e.preventDefault(); return goTo(session.cur + 1); }
    if (k === 'arrowleft') { e.preventDefault(); return goTo(session.cur - 1); }
    if (k === 'f') { e.preventDefault(); return toggleFlag(); }
  });

  // Tab/pəncərə dəyişməsinin qeydə alınması
  function markAway() {
    if (!session || away) return;
    away = true;
    session.focusLost = (session.focusLost || 0) + 1;
    saveSession();
  }
  function markBack() {
    if (!away) return;
    away = false;
    if (session && !isPractice()) toast(`Diqqət: başqa pəncərəyə keçid qeydə alındı (${session.focusLost})`, 'warn');
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? markAway() : markBack()));
  window.addEventListener('blur', markAway);
  window.addEventListener('focus', markBack);

  ['copy', 'cut', 'contextmenu'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (currentView === 'exam' && !isPractice()) e.preventDefault();
  }));
  window.addEventListener('beforeunload', (e) => {
    if (session || inflight.size) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('online', flushPending);

  // ================= Başlanğıc =================
  async function init() {
    document.title = CFG.title;
    $('#brand-title').textContent = CFG.title;
    $('#brand-sub').textContent = CFG.subtitle || '';

    const active = local.get(KEYS.ACTIVE);
    if (active && active.v === 3 && active.order && active.order.length) {
      student = { ...(student || {}), ...active.student };
      sess.set(KEYS.STUDENT, student);
      session = active;
      if (active.endsAt && Date.now() >= active.endsAt) { finishExam(true); loadConfig().catch(() => {}); return; }
      const answered = Object.keys(active.answers).length;
      const r = await dialog({
        title: 'Yarımçıq imtahan tapıldı',
        html: `<p><b>${esc(fullName(active.student))}</b> — ${esc(active.catName)}, ${esc(active.examName)}</p>
               <p>${answered} / ${active.order.length} sual cavablandırılıb.${active.endsAt ? ` Qalan vaxt: <b>${fmtClock((active.endsAt - Date.now()) / 1000)}</b>` : ''}</p>`,
        actions: [{ label: 'Bitir və təhvil ver', value: 'finish' }, { label: 'Davam et', value: 'resume', cls: 'btn-primary' }],
      });
      loadConfig().catch(() => {});
      if (!session) return;
      if (r === 'finish') finishExam(false); else startSession(session);
      flushPending();
      return;
    }

    if (student && student.first) {
      renderMenu();
    } else {
      show('login');
      loadConfig().catch(() => {});
    }
    flushPending();
  }

  init();
})();
