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

  const state = {
    pos: null,        // { lat, lng }
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
      type: 'Feature', geometry: f.geometry,
      properties: {
        featured: !!b,
        ratio: b ? b.info.hp / b.info.max : 1,
        h: (b && b.height) || (f.properties.levels || 4) * 3.5,
      },
    };
  });

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
        if (r !== 'granted') return fail('需要方向感測，才知道你面對哪一棟建築。請在瀏覽器設定中允許後重新整理。');
      }
      listenOrientation();
    } catch (e) {
      return fail('無法取得方向感測。');
    }

    if (!navigator.mediaDevices || !navigator.geolocation) {
      return fail('這個瀏覽器無法使用相機或定位。請用手機瀏覽器以 HTTPS 開啟。');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('cam').srcObject = stream;
    } catch (e) {
      return fail('需要相機，建築才會出現在畫面裡。請允許相機後重新整理。');
    }

    navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => fail('需要位置，才知道你站在哪裡。位置只在你的手機上使用，不會上傳。'),
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
    state.inField = SIM || d <= site.radius;
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
      if (k === 'w') state.pos = geo.move(state.pos, state.heading, step);
      if (k === 's') state.pos = geo.move(state.pos, state.heading + 180, step);
      if (k === 'a') state.pos = geo.move(state.pos, state.heading - 90, step);
      if (k === 'd') state.pos = geo.move(state.pos, state.heading + 90, step);
      if (k === 'q' || k === 'arrowleft') state.heading = (state.heading - turn + 360) % 360;
      if (k === 'e' || k === 'arrowright') state.heading = (state.heading + turn) % 360;
    };
    window.addEventListener('keydown', (e) => act(e.key.toLowerCase()));
    $('simpanel').addEventListener('click', (e) => { if (e.target.dataset.k) act(e.target.dataset.k); });
    // 點小地圖直接移動到那個位置
    $('mini').addEventListener('click', (e) => {
      const r = $('map').getBoundingClientRect();
      const p = App.minimap.unproject(e.clientX - r.left, e.clientY - r.top);
      if (p) state.pos = p;
    });
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

  function frame() {
    requestAnimationFrame(frame);
    if (!state.pos || !state.inField) return;

    state.smooth = (state.smooth + geo.diff(state.heading, state.smooth) * 0.18 + 360) % 360;
    App.minimap.update(state.pos, state.smooth);

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

  function run() {
    state.running = true;
    const avg = buildings.reduce((s, b) => s + b.info.hp, 0) / buildings.length;
    $('avg-num').textContent = Math.round(avg) + '%';
    App.minimap.init($('map'), mapFeatures, state.pos);
    frame();
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
        (e.inherited ? '<span>校區</span>' : '') +
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
  App.buildings = buildings;
})();
