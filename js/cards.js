// 故事層：散落在場域裡的故事卡。走進卡片的半徑就自動獲得，收進故事冊。
// 故事卡不影響血條。卡片來自場域包（sites/<場域>/cards.js）；作者模式下，自己剛放的草稿也算，方便在現場試走。
(function () {
  const site = window.SITE, geo = App.geo, t = App.t;
  const $ = (id) => document.getElementById(id);
  const pack = (window.SITE_CARDS && window.SITE_CARDS.cards) || [];
  const LEAVE = 6;          // 草稿剛放下時人就站在裡面，要先走出半徑再多幾公尺，回來才會獲得

  let all = [], queue = [], showing = null, started = false;
  const hold = {};
  const got = () => { const d = App.save.data; if (!d.cards) d.cards = {}; return d.cards; };

  function collect() {
    const drafts = App.author ? App.author.cards().map((c) => ({
      id: c.id, title: c.title, text: c.text, lat: c.lat, lng: c.lng, radius: c.radius, hasPhoto: c.hasPhoto, draft: true,
    })) : [];
    const mine = {};
    drafts.forEach((d) => { mine[d.id] = true; });
    all = pack.filter((c) => !mine[c.id]).concat(drafts);
    // 參觀者留下的記憶卡（見 memory.js）
    const used = {};
    all.forEach((c) => { used[c.id] = true; });
    if (App.memory) all = all.concat(App.memory.cards().filter((c) => !used[c.id]));
  }
  const marks = () => all.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, got: !!got()[c.id], memory: !!c.memory }));
  const owned = () => all.filter((c) => got()[c.id]).sort((a, b) => (got()[a.id].at < got()[b.id].at ? 1 : -1));
  function sync() {
    $('book-count').textContent = owned().length;
    if (started) App.minimap.setCards(marks());
  }

  async function photoOf(c) {
    if (c.photo) return c.photo;
    if (c.draft && c.hasPhoto && App.author) return App.author.photo(c.id);
    return null;
  }
  function near(c) {
    let best = null, bd = Infinity;
    App.buildings.forEach((b) => { const d = geo.dist(c, b.center); if (d < bd) { bd = d; best = b; } });
    return best ? '在「' + t(best.name) + '」附近' : '';
  }
  const day = (iso) => iso.slice(0, 10).replace(/-/g, '.');

  // ---------- 卡片畫面 ----------
  async function open(c, fresh) {
    showing = c;
    $('card-tag').textContent = c.memory
      ? (c.mine ? '你留在這裡的記憶' : fresh ? '有人在這裡留下一段記憶' : '別人留下的記憶')
      : (fresh ? '你走到了一個故事' : '故事卡') + (c.draft ? '　草稿，只有你看得到' : c.demo ? '　示範' : '');
    $('card').classList.toggle('memory', !!c.memory);
    $('card-title').textContent = t(c.title) || (c.memory ? '' : '（沒有標題）');
    $('card-text').textContent = t(c.text) || '';
    $('card-meta').textContent = [near(c), got()[c.id] ? day(got()[c.id].at) + ' 獲得' : ''].filter(Boolean).join('　');
    const img = $('card-photo');
    img.hidden = true; img.removeAttribute('src');
    $('book').hidden = true;
    $('card').hidden = false;
    $('card').scrollTop = 0;
    const photo = await photoOf(c);
    if (photo && showing === c) { img.src = photo; img.hidden = false; }
  }
  function next() {
    if (!$('card').hidden || !queue.length) return;
    open(queue.shift(), true);
  }
  $('card-close').addEventListener('click', () => { $('card').hidden = true; showing = null; next(); });

  // ---------- 故事冊：只列出已獲得的，不透露總共有幾張 ----------
  function renderBook() {
    const list = owned(), ol = $('book-items');
    ol.innerHTML = '';
    $('book-none').hidden = list.length > 0;
    list.forEach((c) => {
      const li = document.createElement('li'), btn = document.createElement('button');
      const title = document.createElement('b'), meta = document.createElement('small');
      title.textContent = t(c.title) || (c.memory ? t(c.text).slice(0, 14) : '（沒有標題）');
      meta.textContent = [c.memory ? (c.mine ? '你留下的記憶' : '記憶') : '', near(c), day(got()[c.id].at)].filter(Boolean).join('　');
      btn.append(title, meta);
      btn.addEventListener('click', () => open(c, false));
      li.appendChild(btn); ol.appendChild(li);
    });
  }
  $('book-btn').addEventListener('click', () => { renderBook(); $('book').hidden = false; });
  $('book-close').addEventListener('click', () => { $('book').hidden = true; });

  App.cards = {
    // 地圖準備好之後呼叫
    start() { started = true; sync(); },

    // 每次位置更新時呼叫：走進半徑就獲得
    check(pos) {
      const mine = got();
      all.forEach((c) => {
        if (mine[c.id]) return;
        const d = geo.dist(pos, c), r = c.radius || 15;
        if (hold[c.id]) { if (d > r + LEAVE) delete hold[c.id]; return; }
        if (d > r) return;
        mine[c.id] = { at: new Date().toISOString(), lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) };
        App.save.persist();
        queue.push(c);
        sync();
        next();
      });
    },

    // 作者模式改了草稿之後呼叫。placedId 是剛放下的那張，人還站在上面，先不觸發
    refresh(placedId) {
      collect();
      if (placedId && !got()[placedId]) hold[placedId] = true;
      sync();
    },
  };

  collect();
  sync();
})();
