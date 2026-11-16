// 主程式：起始流程、感測器、模擬定位、相機血條與傷害紀錄。
(function () {
  const site = window.SITE;
  const geo = App.geo;
  const t = App.t;
  const $ = (id) => document.getElementById(id);

  const FOV = 60;          // 相機水平視角（度），暫定
  const MAX_DIST = 150;    // 顯示距離上限（公尺）
  const MAX_BARS = 5;

  const params = new URLSearchParams(location.search);
  const SIM = params.has('sim');
  const AUTHOR = params.has('author');   // 作者模式：放卡用，見 author.js

  const state = {
    pos: null,        // { lat, lng, acc }，acc 是定位誤差（公尺），模擬定位時沒有
    heading: 0,       // 感測器給的朝向
    smooth: 0,        // 平滑後的朝向，畫面用這個
    inField: false,
    running: false,
  };

  // ---------- 準備建築資料 ----------
  const footprints = {};
  window.SITE_FOOTPRINTS.features.forEach((f) => { footprints[f.properties.osm] = f; });

  const buildings = site.buildings.map((b) => {
    const f = footprints[b.osm];
    const info = App.computeHp(site, b);
    return Object.assign({}, b, { center: geo.centroid(f.geometry.coordinates[0]), info });
  });
  const byOsm = {};
  buildings.forEach((b) => { byOsm[b.osm] = b; });

  const mapFeatures = window.SITE_FOOTPRINTS.features.map((f) => {
    const b = byOsm[f.properties.osm];
    return {
      id: b ? b.id : 'osm' + f.properties.osm,
      featured: !!b,
      name: b ? t(b.name) : '',
      en: b && b.name.en ? b.name.en : '',
      h: (b && b.height) || (f.properties.levels || 4) * 3.5,
      paper: b ? b.paper : null,
      ring: f.geometry.coordinates[0],
    };
  });

  // ---------- 存檔：走過的路與走近過的建築，只存在這支手機上 ----------
  const SAVE_KEY = 'vanishing.' + site.id + '.v1';
  const VISIT_RADIUS = 45;   // 走到多近算「去過」（公尺）
  const TRACK_STEP = 6;      // 每走幾公尺縫一針
  const TRACK_MAX = 3000;
  let save = { version: 1, visited: {}, track: [], cards: {} };   // cards：已獲得的故事卡
  // 測試用：網址加上 ?reset=1 會清掉這個場域的存檔。清完就把參數從網址拿掉，免得之後重新整理又清一次
  if (params.has('reset')) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 清不掉就照舊 */ }
    params.delete('reset');
    try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch (e) { /* 改不了網址不影響使用 */ }
  }
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (raw && raw.version === 1) save = { version: 1, visited: raw.visited || {}, track: raw.track || [], cards: raw.cards || {} };
  } catch (e) { /* 讀不到就用空存檔 */ }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 存不了也照常運作 */ }
  }

  const level = (r) => (r < 0.25 ? 'low' : r < 0.5 ? 'mid' : '');

  // ---------- 畫面切換 ----------
  function show(id) {
    ['start', 'away', 'stage'].forEach((s) => { $(s).hidden = s !== id; });
  }

  function fail(msg) {
    const el = $('start-msg');
    el.textContent = msg;
    el.classList.add('err');
    show('start');
  }

  // ---------- 起始 ----------
  $('start-site').textContent = t(site.name).toUpperCase() + ' · ' + t(site.place);
  $('away-place').textContent = t(site.name) + '｜' + t(site.place);

  $('enter').addEventListener('click', async () => {
    if (SIM) return startSim();
    try {
      // iOS 需要使用者點擊後才能請求方向感測
      if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted' && !AUTHOR) return fail('需要方向感測，才知道你面對哪一棟建築。請在瀏覽器設定中允許後重新整理。');
      }
      listenOrientation();
    } catch (e) {
      // 作者模式下，方向感測或相機拿不到也讓人進去，放卡只需要定位
      if (!AUTHOR) return fail('無法取得方向感測。');
    }

    if (!navigator.mediaDevices || !navigator.geolocation) {
      return fail('這個瀏覽器無法使用相機或定位。請用手機瀏覽器以 HTTPS 開啟。');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('cam').srcObject = stream;
    } catch (e) {
      if (!AUTHOR) return fail('需要相機，建築才會出現在畫面裡。請允許相機後重新整理。');
    }

    navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => fail('需要位置，才知道你站在哪裡。請允許定位後重新整理。'),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    $('start-msg').textContent = '正在定位…';
  });

  function listenOrientation() {
    const on = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading; // iOS
      else if (e.absolute && e.alpha != null) h = 360 - e.alpha;                    // Android
      if (h == null) return;
      const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
      state.heading = (h + screenAngle + 360) % 360;
    };
    window.addEventListener('deviceorientationabsolute', on);
    window.addEventListener('deviceorientation', on);
  }

  function setPos(p) {
    state.pos = p;
    const d = geo.dist(p, site.center);
    state.inField = SIM || AUTHOR || d <= site.radius;   // 作者模式不受場域範圍限制
    if (state.inField) {
      show('stage');
      if (!state.running) run();
    } else {
      const away = d - site.radius;
      $('away-dist').textContent = away >= 1000 ? (away / 1000).toFixed(1) + ' km' : Math.round(away) + ' m';
      show('away');
    }
  }

  // ---------- 模擬定位（開發與佈卡用） ----------
  function startSim() {
    document.body.classList.add('sim');
    $('simpanel').hidden = false;
    state.heading = state.smooth = parseFloat(params.get('h')) || 0;
    setPos({
      lat: parseFloat(params.get('lat')) || site.center.lat,
      lng: parseFloat(params.get('lng')) || site.center.lng,
    });

    const act = (k) => {
      const step = 4, turn = 8;
      if ('wasd'.indexOf(k) >= 0) state.simTarget = null;
      if (k === 'w') state.pos = geo.move(state.pos, state.heading, step);
      if (k === 's') state.pos = geo.move(state.pos, state.heading + 180, step);
      if (k === 'a') state.pos = geo.move(state.pos, state.heading - 90, step);
      if (k === 'd') state.pos = geo.move(state.pos, state.heading + 90, step);
      if (k === 'q' || k === 'arrowleft') state.heading = (state.heading - turn + 360) % 360;
      if (k === 'e' || k === 'arrowright') state.heading = (state.heading + turn) % 360;
    };
    window.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;          // 正在打字時不要移動
      act(e.key.toLowerCase());
    });
    $('simpanel').addEventListener('click', (e) => { if (e.target.dataset.k) act(e.target.dataset.k); });
    // 地圖展開時，點地圖直接移動到那個位置
    // 地圖展開時點一下書頁，模擬的使用者會走過去
    App.minimap.onTap = (p) => { state.simTarget = p; };
    App.simSet = (lat, lng, h) => { state.pos = { lat, lng }; if (h != null) state.heading = h; };
  }

  // ---------- 血條 ----------
  const hud = $('hud');
  const bars = {};

  function makeBar(b) {
    const el = document.createElement('button');
    const r = b.info.hp / b.info.max;
    el.className = 'bar ' + level(r);
    const why = b.info.latest
      ? '<b>−' + b.info.latest.dmg + '</b>' + t(b.info.latest.title)
      : '';
    el.innerHTML =
      '<div class="bar-top"><span class="bar-name"></span><span class="bar-dist"></span></div>' +
      '<div class="track"><div class="fill" style="width:' + r * 100 + '%"></div></div>' +
      '<div class="bar-num">HP ' + b.info.hp + '<small>/' + b.info.max + '</small></div>' +
      '<div class="bar-why">' + why + '</div>';
    el.querySelector('.bar-name').textContent = t(b.name);
    el.addEventListener('click', () => openLog(b));
    el.style.display = 'none';
    hud.appendChild(el);
    return el;
  }
  buildings.forEach((b) => { bars[b.id] = makeBar(b); });

  const SIM_SPEED = 9;       // 模擬定位點地圖移動時的速度（公尺／秒）
  let lastFrame = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = lastFrame ? Math.min(0.25, (ts - lastFrame) / 1000) : 0.016;
    lastFrame = ts;
    if (state.simTarget && state.pos) {
      const d = geo.dist(state.pos, state.simTarget);
      if (d < 0.6) state.simTarget = null;
      else {
        state.heading = geo.bearing(state.pos, state.simTarget);
        state.pos = geo.move(state.pos, state.heading, Math.min(d, SIM_SPEED * dt));
      }
    }
    if (!state.pos || !state.inField) return;

    state.smooth = (state.smooth + geo.diff(state.heading, state.smooth) * 0.18 + 360) % 360;
    App.minimap.update(state.pos, state.smooth, dt);
    walk();

    const W = hud.clientWidth, H = hud.clientHeight;
    const seen = buildings
      .map((b) => ({
        b,
        d: geo.dist(state.pos, b.center),
        rel: geo.diff(geo.bearing(state.pos, b.center), state.smooth),
      }))
      .filter((v) => v.d <= MAX_DIST && Math.abs(v.rel) <= FOV / 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_BARS);

    const shown = {};
    seen.forEach((v, i) => {
      const el = bars[v.b.id];
      shown[v.b.id] = true;
      const near = 1 - v.d / MAX_DIST;                 // 1 近，0 遠
      const scale = 0.78 + 0.22 * near;
      const x = W / 2 + (v.rel / (FOV / 2)) * (W / 2);
      const y = H * (0.66 - i * 0.115);                 // 近的在下，遠的往上排
      el.style.display = '';
      el.style.opacity = (0.5 + 0.5 * near).toFixed(2);
      el.style.zIndex = 10 - i;
      // 靠近視野邊緣時貼著畫面邊，不讓血條被切掉
      const left = Math.max(6, Math.min(W - 210 * scale - 6, x - 105 * scale));
      el.style.transform = 'translate(' + left + 'px,' + (y - 45 * scale) + 'px) scale(' + scale.toFixed(3) + ')';
      el.querySelector('.bar-dist').textContent = Math.round(v.d) + ' m';
    });
    buildings.forEach((b) => { if (!shown[b.id]) bars[b.id].style.display = 'none'; });
    $('empty').hidden = seen.length > 0;
  }

  // 記錄走過的路，並檢查有沒有走近新的建築
  function walk() {
    const last = save.track[save.track.length - 1];
    const here = [+state.pos.lat.toFixed(6), +state.pos.lng.toFixed(6)];
    if (!last || geo.dist({ lat: last[0], lng: last[1] }, state.pos) >= TRACK_STEP) {
      save.track.push(here);
      if (save.track.length > TRACK_MAX) save.track.shift();
      App.minimap.setTrack(save.track);
      persist();
    }
    if (App.cards) App.cards.check(state.pos);
    buildings.forEach((b) => {
      if (!save.visited[b.id] && geo.dist(state.pos, b.center) <= VISIT_RADIUS) {
        save.visited[b.id] = true;
        App.minimap.setVisited(save.visited, b.id);
        persist();
      }
    });
  }

  // 縮圖點一下展開成立體書
  $('mini').addEventListener('click', () => {
    if ($('mini').classList.contains('open')) return;
    $('mini').classList.add('open');
    App.minimap.setOpen(true);
  });
  $('map-close').addEventListener('click', (e) => {
    e.stopPropagation();
    $('mini').classList.remove('open');
    App.minimap.setOpen(false);
  });
  $('map-site').textContent = t(site.name);

  function run() {
    state.running = true;
    const avg = buildings.reduce((s, b) => s + b.info.hp, 0) / buildings.length;
    $('avg-num').textContent = Math.round(avg) + '%';
    App.minimap.init($('map'), mapFeatures, site, save, window.SITE_TERRAIN);
    if (App.cards) App.cards.start();
    requestAnimationFrame(frame);
  }

  // ---------- 傷害紀錄 ----------
  function openLog(b) {
    const info = b.info;
    const r = info.hp / info.max;
    $('log-name').textContent = t(b.name);
    $('log-meta').textContent = '興建年份：' + (b.built || '不明') + (b.note ? '　' + t(b.note) : '');
    $('log-fill').style.width = r * 100 + '%';
    $('log-num').textContent = info.hp + '/' + info.max;
    document.querySelector('.log-hp').className = 'log-hp ' + level(r);

    const order = (e) => (e.pending ? 2 : e.countdown ? 0 : 1);
    // 排序：倒數、已發生（新到舊）、預告
    const list = info.entries.slice();
    list.sort((a, b2) => order(a) - order(b2) || ((b2.date || '0') > (a.date || '0') ? 1 : -1));

    const ol = $('log-list');
    ol.innerHTML = '';
    list.forEach((e) => {
      const li = document.createElement('li');
      if (e.pending) li.className = 'pending';
      const date = e.countdown ? '還有 ' + e.daysLeft + ' 天' : e.date ? e.date.replace(/-/g, '.') : '日期不明';
      const meta = document.createElement('div');
      meta.className = 'ev-meta';
      meta.innerHTML = '<span></span><span class="tag"></span>' +
        (e.inherited ? '<span class="scope">校區</span>' : '') +
        (e.pending ? '<span>預告' + (e.uncertain ? '・未確認' : '') + '</span>' : '');
      meta.children[0].textContent = date;
      meta.children[1].textContent = t(e.typeLabel);

      const title = document.createElement('div');
      title.className = 'ev-title';
      title.textContent = t(e.title);

      const by = document.createElement('div');
      by.className = 'ev-by';
      by.textContent = (e.countdown ? '' : '造成：') + t(e.by);
      if (e.source) {
        const a = document.createElement('a');
        a.href = e.source; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '出處 ↗';
        by.appendChild(a);
      }

      const dmg = document.createElement('div');
      dmg.className = 'ev-dmg';
      dmg.textContent = e.pending ? '−?' : '−' + e.dmg;

      li.append(meta, title, dmg, by);
      ol.appendChild(li);
    });
    $('log').hidden = false;
    $('log').scrollTop = 0;
  }
  $('log-close').addEventListener('click', () => { $('log').hidden = true; });

  App.state = state;
  App.save = { data: save, persist };
  App.buildings = buildings;
})();
