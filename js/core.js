// 引擎核心：地理計算與血量計算。不碰畫面，也不含任何場域內容。
window.App = window.App || {};

(function () {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  App.lang = 'zh';
  // 場域包的文字可以是字串或 { zh, en }
  App.t = function (x) {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    return x[App.lang] || x.zh || '';
  };

  App.geo = {
    // 兩點距離（公尺）
    dist(a, b) {
      const dLat = rad(b.lat - a.lat);
      const dLng = rad(b.lng - a.lng);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    },
    // 從 a 看向 b 的方位角（0 為北，順時針）
    bearing(a, b) {
      const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
      const x =
        Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
        Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
      return (deg(Math.atan2(y, x)) + 360) % 360;
    },
    // 角度差，回傳 -180 到 180
    diff(a, b) {
      return ((a - b + 540) % 360) - 180;
    },
    // 往某方位走幾公尺
    move(p, bearingDeg, meters) {
      const d = meters / R;
      const b = rad(bearingDeg);
      const lat1 = rad(p.lat);
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
      const lng2 =
        rad(p.lng) +
        Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
      return { lat: deg(lat2), lng: deg(lng2) };
    },
    centroid(ring) {
      let lng = 0, lat = 0;
      const n = ring.length - 1; // 最後一點與第一點相同
      for (let i = 0; i < n; i++) { lng += ring[i][0]; lat += ring[i][1]; }
      return { lat: lat / n, lng: lng / n };
    },
  };

  // 計算一棟建築在某一天的血量與傷害紀錄
  App.computeHp = function (site, building, now) {
    const today = now || new Date();
    const entries = [];

    const add = (ev, inherited) => {
      const type = site.damageTypes[ev.type];
      const future = ev.date && new Date(ev.date) > today;
      let dmg = type.weight * ev.severity;
      if (inherited) dmg *= site.inheritRatio;
      entries.push({
        date: ev.date, title: ev.title, by: ev.by, source: ev.source,
        typeLabel: type.label, inherited, pending: future, uncertain: !!ev.uncertain,
        dmg: Math.round(dmg),
      });
    };

    site.campusEvents.forEach((ev) => add(ev, true));
    (building.events || []).forEach((ev) => add(ev, false));

    const c = site.countdown;
    if (c) {
      const p = (today - new Date(c.start)) / (new Date(c.end) - new Date(c.start));
      const dmg = Math.round(c.max * Math.min(1, Math.max(0, p)));
      const daysLeft = Math.max(0, Math.ceil((new Date(c.end) - today) / 86400000));
      entries.push({
        date: null, title: c.title, by: c.note, source: c.source,
        typeLabel: { zh: '時間', en: 'Time' }, inherited: true, pending: false,
        countdown: true, daysLeft, dmg,
      });
    }

    const total = entries.filter((e) => !e.pending).reduce((s, e) => s + e.dmg, 0);
    const hp = Math.max(1, site.maxHp - total); // 還在的東西至少剩 1

    // 最近一筆：自己的事件優先於繼承的
    const dated = entries.filter((e) => !e.pending && e.date);
    const pick = (list) => list.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const latest = pick(dated.filter((e) => !e.inherited)) || pick(dated);

    return { hp, max: site.maxHp, entries, latest };
  };
})();
