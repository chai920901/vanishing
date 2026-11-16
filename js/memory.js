// 記憶卡：參觀者留下的話。送出後立刻公開，所有走到那裡的人都會獲得。只收文字。
// 送出：寫進一份 Google 表單。讀取：從表單連結的試算表讀回來（試算表要設成知道連結的人都能檢視）。
// 設定在場域包的 site.memory，沒有設定就不開放投稿。試算表裡的內容是陌生人寫的，讀進來一律當成不可信的資料檢查。
(function () {
  const site = window.SITE, cfg = site.memory;
  if (!cfg || !cfg.form || !cfg.sheet || !cfg.entries) return;

  const geo = App.geo, state = App.state;
  const $ = (id) => document.getElementById(id);
  const MINE = 'vanishing.' + site.id + '.mine.v1';
  const GAP = 60 * 1000;                 // 同一支手機兩次送出至少隔多久
  const REFRESH = 90 * 1000;             // 多久重新讀一次試算表
  const MAX_TITLE = cfg.maxTitle || 30, MAX_TEXT = cfg.maxText || 300, RADIUS = cfg.radius || 15;
  const KEYS = ['title', 'text', 'lat', 'lng', 'site', 'id', 'hide'];

  let mine = [], remote = [];
  try {
    const raw = JSON.parse(localStorage.getItem(MINE));
    if (raw && raw.version === 1 && Array.isArray(raw.cards)) mine = raw.cards;
  } catch (e) { /* 讀不到就當作沒送過 */ }
  const saveMine = () => { try { localStorage.setItem(MINE, JSON.stringify({ version: 1, cards: mine })); } catch (e) { /* 存不了也照常運作 */ } };

  let toastTimer = 0;
  function toast(msg) {
    const el = $('au-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
  const changed = () => { if (App.cards) App.cards.refresh(null); };

  // ---------- 讀取 ----------
  // 把試算表的一格轉成字串
  const cell = (c) => (c == null || c.v == null ? '' : String(typeof c.v === 'number' && c.f ? c.f : c.v).trim());
  function parse(res) {
    const table = res && res.table;
    if (!table || !Array.isArray(table.rows)) return [];
    // 依欄位標題找位置；找不到標題就照表單的固定順序（第一欄是時間戳記）
    const at = {};
    (table.cols || []).forEach((c, i) => { const k = String(c.label || '').trim().toLowerCase(); if (KEYS.indexOf(k) >= 0 && at[k] == null) at[k] = i; });
    KEYS.forEach((k, i) => { if (at[k] == null) at[k] = i + 1; });

    const seen = {}, out = [];
    table.rows.slice(-600).forEach((row) => {
      const c = row.c || [], get = (k) => cell(c[at[k]]);
      const id = get('id'), lat = parseFloat(get('lat')), lng = parseFloat(get('lng')), text = get('text');
      if (get('hide') || get('site') !== site.id || !/^[A-Za-z0-9_-]{4,40}$/.test(id) || seen[id]) return;
      if (!isFinite(lat) || !isFinite(lng) || !text) return;
      if (geo.dist({ lat, lng }, site.center) > site.radius + 60) return;            // 不在這個場域裡的不收
      seen[id] = true;
      out.push({ id, title: get('title').slice(0, MAX_TITLE), text: text.slice(0, MAX_TEXT), lat, lng });
    });
    return out;
  }
  function load() {
    const name = 'vanishingMemory' + Date.now(), s = document.createElement('script');
    const done = () => { delete window[name]; s.remove(); };
    window[name] = (res) => {
      done();
      try { remote = parse(res); } catch (e) { return; }
      changed();
    };
    s.onerror = done;
    s.src = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(cfg.sheet) + '/gviz/tq?tqx=out:json;responseHandler:' + name +
      '&headers=1' + (cfg.gid != null ? '&gid=' + encodeURIComponent(cfg.gid) : '') + '&_=' + Date.now();
    document.head.appendChild(s);
  }

  // ---------- 送出 ----------
  let draftAt = null;
  function showWhere() {
    const p = state.pos;
    draftAt = p ? { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), acc: p.acc } : null;
    $('mem-where').textContent = draftAt
      ? '位置 ' + draftAt.lat.toFixed(5) + ', ' + draftAt.lng.toFixed(5) + (draftAt.acc != null ? '　誤差約 ' + Math.round(draftAt.acc) + ' 公尺' : '')
      : '還沒有定位';
  }
  $('mem-btn').addEventListener('click', () => {
    showWhere();
    $('mem-title').maxLength = MAX_TITLE; $('mem-text').maxLength = MAX_TEXT;
    $('mem-form').hidden = false;
    $('mem-form').scrollTop = 0;
  });
  $('mem-close').addEventListener('click', () => { $('mem-form').hidden = true; });

  let sending = false;
  $('mem-send').addEventListener('click', async () => {
    if (sending) return;
    const title = $('mem-title').value.trim().slice(0, MAX_TITLE), text = $('mem-text').value.trim().slice(0, MAX_TEXT);
    if (!text) return toast('先寫下想留在這裡的話');
    showWhere();
    if (!draftAt) return toast('還沒有定位，等一下再試');
    const last = mine.length ? mine[mine.length - 1].at : 0;
    if (Date.now() - last < GAP) return toast('剛剛才留過，過一分鐘再留下一段');

    const card = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, text, lat: draftAt.lat, lng: draftAt.lng, site: site.id };
    const body = new URLSearchParams();
    Object.keys(cfg.entries).forEach((k) => { body.append(cfg.entries[k], String(card[k] == null ? '' : card[k])); });
    sending = true; $('mem-send').textContent = '送出中…';
    try {
      // 跨網域送表單，回應讀不到，只知道有沒有送出去
      await fetch(cfg.form, { method: 'POST', mode: 'no-cors', body });
    } catch (e) {
      sending = false; $('mem-send').textContent = '送出';
      return toast('送不出去，檢查一下網路再試');
    }
    sending = false; $('mem-send').textContent = '送出';

    // 自己留的這張立刻算已獲得，不用等試算表讀回來
    mine.push({ id: card.id, title, text, lat: card.lat, lng: card.lng, at: Date.now() });
    saveMine();
    const got = App.save.data.cards || (App.save.data.cards = {});
    got[card.id] = { at: new Date().toISOString(), lat: card.lat, lng: card.lng };
    App.save.persist();
    $('mem-title').value = ''; $('mem-text').value = '';
    $('mem-form').hidden = true;
    changed();
    toast('已留下。走到這裡的人都會看到');
    setTimeout(load, 5000);
  });

  // ---------- 給故事層用 ----------
  App.memory = {
    cards() {
      const own = {}, onSheet = {};
      mine.forEach((c) => { own[c.id] = true; });
      remote.forEach((c) => { onSheet[c.id] = true; });
      return remote.map((c) => Object.assign({ radius: RADIUS, memory: true, mine: !!own[c.id] }, c))
        .concat(mine.filter((c) => !onSheet[c.id]).map((c) => ({ id: c.id, title: c.title, text: c.text, lat: c.lat, lng: c.lng, radius: RADIUS, memory: true, mine: true })));
    },
    parse,
  };

  $('mem-btn').hidden = false;
  $('start-msg').innerHTML = '這件作品需要相機、位置與方向感測。<br>位置只在你的手機上使用；只有當你送出一段記憶時，那段話和它的位置才會上傳並公開。';
  load();
  setInterval(() => { if (!document.hidden) load(); }, REFRESH);
})();
