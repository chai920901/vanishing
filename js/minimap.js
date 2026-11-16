// 等角插畫地圖，用 Three.js 繪製成 3D 場景：平塗色塊、深色細線、平行投影。圖案由 paper.js 提供。
// 座標：場域先轉到「建築的邊與書頁平行」的方向，再以書頁中心為原點。X 向右，Y 向上，Z 朝向讀者。
// 書分成左右兩半，以書脊（X = 0）為軸。打開時右半邊從蓋在左半邊上翻開，書頁上的東西再依序立起來。
(function () {
  const P = App.paper, C = P.C;
  const AZ0 = Math.PI / 4, EL0 = 0.62;                                          // 預設視角：斜 45 度、俯角約 35 度
  const ZOOM = Math.tan((17 * Math.PI) / 180);                                  // view.dist 乘上它就是畫面的半高（公尺）
  const FOLD_AT = 0.3, FOLD_FOR = 1.15, POP_AT = 1.25, POP_SPREAD = 1.0, POP_FOR = 0.6;   // 打開動畫的時間（秒）
  const FOLLOW = 2.4;                                                           // 小人跟隨定位的鬆緊：越大跟得越緊
  const FONT = '"Noto Sans TC", "PingFang TC", sans-serif';

  let T, renderer, scene, camera, canvas, site, origin, cosLat, COS = 1, SIN = 0, aspect = 1, inkLine;
  let page, staticCanvas, pageCanvas, pageTex, feats = [], land;
  let track = [], visited = {};
  let left, right, pops = [], signs = [], turning = [], sheets = {}, anims = [];
  let player, playerPop, poses, base, facing = 1, stepPhase = 0;
  const me = { x: 0, z: 0, vx: 0, vz: 0, ready: false };                        // 小人實際顯示的位置與速度
  let isOpen = false, mode = 'me', fitDist = 400, intro = null, zoomTo = null;
  const view = { az: AZ0, el: EL0, dist: 150, tx: 0, tz: 0 };

  // ---------- 座標 ----------
  const toM = (p) => ({ x: (p.lng - origin.lng) * 111320 * cosLat, y: (p.lat - origin.lat) * 110540 });
  const rot = (m) => ({ x: m.x * COS - m.y * SIN, y: m.x * SIN + m.y * COS });
  const world = (m) => { const r = rot(m); return { x: r.x - page.cx, z: -(r.y - page.cy) }; };
  const fromLngLat = (p) => world(toM({ lng: p[0], lat: p[1] }));
  function toLatLng(x, z) {
    const rx = x + page.cx, ry = -z + page.cy;
    const mx = rx * COS + ry * SIN, my = -rx * SIN + ry * COS;
    return { lat: origin.lat + my / 110540, lng: origin.lng + mx / (111320 * cosLat) };
  }
  // 建築的邊最常見的方向，回傳要把場域轉幾度才會與書頁平行
  function dominant(rings) {
    let sx = 0, sy = 0;
    rings.forEach((r) => {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        if (len < 3) continue;
        const g = Math.atan2(dy, dx) * 4;
        sx += len * Math.cos(g); sy += len * Math.sin(g);
      }
    });
    return (-Math.atan2(sy, sx) / 4) * (180 / Math.PI);
  }

  // ---------- 幾何小工具 ----------
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const backOut = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);   // 超過一點再彈回來
  function inside(p, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  }
  function lineDist(p, pts, closed) {
    let best = Infinity;
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
      const t = len2 ? clamp01(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
    }
    return best;
  }
  const onPage = (p, m) => Math.abs(p.x) < page.w / 2 - m && Math.abs(p.z) < page.d / 2 - m;

  // 外框裡面放得下的最大長方形（邊與書頁平行），屋頂上的東西放在這裡。放不下時回傳 null
  function innerRect(ring) {
    const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z);
    const x0 = Math.min(...xs), z0 = Math.min(...zs), bw = Math.max(...xs) - x0, bd = Math.max(...zs) - z0;
    const ok = (r) => {
      const nx = Math.max(2, Math.ceil((r.x1 - r.x0) / 2.5)), nz = Math.max(2, Math.ceil((r.z1 - r.z0) / 2.5));
      for (let i = 0; i <= nx; i++) {
        const x = r.x0 + ((r.x1 - r.x0) * i) / nx;
        if (!inside({ x, z: r.z0 }, ring) || !inside({ x, z: r.z1 }, ring)) return false;
      }
      for (let i = 0; i <= nz; i++) {
        const z = r.z0 + ((r.z1 - r.z0) * i) / nz;
        if (!inside({ x: r.x0, z }, ring) || !inside({ x: r.x1, z }, ring)) return false;
      }
      return true;
    };
    let best = null, area = 0;
    for (let gx = 1; gx <= 5; gx++) for (let gz = 1; gz <= 5; gz++) {
      const c = { x: x0 + (bw * gx) / 6, z: z0 + (bd * gz) / 6 };
      if (!inside(c, ring)) continue;
      let r = null;
      for (let s = 0.04; s <= 0.5; s += 0.02) {                                   // 先等比例放大
        const t = { x0: c.x - bw * s, x1: c.x + bw * s, z0: c.z - bd * s, z1: c.z + bd * s };
        if (!ok(t)) break;
        r = t;
      }
      if (!r) continue;
      [['x0', -1], ['x1', 1], ['z0', -1], ['z1', 1]].forEach((side) => {         // 再往四邊各自延伸
        for (let i = 0; i < 60; i++) {
          const t = Object.assign({}, r); t[side[0]] += side[1];
          if (!ok(t)) break;
          r = t;
        }
      });
      const a = (r.x1 - r.x0) * (r.z1 - r.z0);
      if (a > area) { area = a; best = r; }
    }
    if (!best) return null;
    best = { x0: best.x0 + 1.6, x1: best.x1 - 1.6, z0: best.z0 + 1.6, z1: best.z1 - 1.6 };
    return Math.min(best.x1 - best.x0, best.z1 - best.z0) >= 6 ? best : null;
  }

  // ---------- 貼圖、材質與零件 ----------
  function texture(c) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // 平塗的材質。面往後退一點，讓描邊的線不會被吃掉
  const flatMat = (color) => new T.MeshLambertMaterial({ color: new T.Color(color).convertSRGBToLinear(), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  // 一塊有描邊的立體零件
  function piece(geo, mats) {
    const g = new T.Group(), m = new T.Mesh(geo, mats);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    g.add(new T.LineSegments(new T.EdgesGeometry(geo, 30), inkLine));
    return g;
  }
  // 把一個側面輪廓（x 是水平、y 是高度）拉長成柱體。alongZ 為 false：輪廓沿 X、往 +Z 拉；為 true：輪廓沿 Z、往 +X 拉
  function prism(pts, depth, alongZ, x, y, z, mats) {
    const shape = new T.Shape();
    pts.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
    const g = piece(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), mats);
    if (alongZ) { g.rotation.y = -Math.PI / 2; g.position.set(x + depth, y, z); } else g.position.set(x, y, z);
    return g;
  }
  // 立著的紙片：底邊貼在書頁上
  function sheet(tex, w, h, opts) {
    const o = opts || {};
    const geo = new T.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide, alphaTest: 0.5 }));
    if (o.shadow !== false) {
      mesh.castShadow = true;
      mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    }
    return mesh;
  }
  // 登記一個會在打開時立起來的東西。type：hinge 從平躺翻起、grow 往上長、scale 放大、fx 由每一幀自己處理
  function pop(obj, x, z, opts) {
    const o = opts || {};
    (x < 0 ? left : right).add(o.holder || obj);
    const p = { obj, z, type: o.type || 'hinge', extra: o.extra || 0, delay: 0, e: 1 };
    pops.push(p);
    return p;
  }
  function setPop(p, r) {
    const e = r <= 0 ? 0 : r >= 1 ? 1 : backOut(r);
    p.e = e;
    if (p.type === 'fx') return;
    p.obj.visible = e > 0;
    if (p.type === 'hinge') p.obj.rotation.x = (-Math.PI / 2) * (1 - e);
    else if (p.type === 'grow') p.obj.scale.y = Math.max(0.001, e);
    else p.obj.scale.setScalar(Math.max(0.001, e));
  }
  // 立在書頁上、永遠轉向鏡頭的紙片（樹、路人）
  function stand(tex, w, h, x, z, opts) {
    const holder = new T.Group(), m = sheet(tex, w, h, opts);
    holder.position.set(x, 0, z); holder.add(m); turning.push(holder);
    return pop(m, x, z, Object.assign({ holder }, opts));
  }

  // ---------- 書頁：地面上的東西都印在這張紙上 ----------
  function drawStatic() {
    const ctx = staticCanvas.getContext('2d'), W = staticCanvas.width, H = staticCanvas.height, k = W / page.w;
    const px = (x) => (x + page.w / 2) * k, py = (z) => (z + page.d / 2) * k;
    const trace = (pts, close) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(px(p.x), py(p.z)) : ctx.moveTo(px(p.x), py(p.z))));
      if (close) ctx.closePath();
    };
    const box = (pts) => {
      const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
      return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    };
    const edge = () => { ctx.strokeStyle = C.ink; ctx.lineWidth = 0.32 * k; ctx.stroke(); };
    // 躺在地上的大字，帶一點厚度
    const letters = (text, x, z, size, angle, color) => {
      ctx.save(); ctx.translate(px(x), py(z)); ctx.rotate(angle || 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 ' + size * k + 'px ' + FONT;
      ctx.fillStyle = P.mix(color || C.brick, C.ink, 0.45); ctx.fillText(text, size * 0.07 * k, size * 0.07 * k);
      ctx.fillStyle = color || C.brick; ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    const spaced = (s) => s.split('').join(' ');
    ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // 底：場域外是米白，場域內是淡綠，帶一道一道的寬條紋
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    if (land.boundary) {
      trace(land.boundary, true); ctx.fillStyle = C.park; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      for (let z = 0; z < page.d; z += 12) ctx.fillRect(0, z * k, W, 6 * k);
      ctx.restore();
    }

    // 路：小路是米白色，大路是粉紅色，上面有一格一格的橫條
    const ROAD = { foot: [2.2, '#f8f3e6', null], path: [4.4, '#f8f3e6', 'rgba(179,199,174,0.6)'], street: [7, C.street, '#fbe7e2'], road: [11, C.street, '#fbe7e2'] };
    Object.keys(ROAD).forEach((kind) => {
      const list = land.roads.filter((r) => r.kind === kind), w = ROAD[kind][0];
      ctx.lineCap = 'round'; ctx.strokeStyle = ROAD[kind][1]; ctx.lineWidth = w * k;
      list.forEach((r) => { trace(r.pts); ctx.stroke(); });
      if (!ROAD[kind][2]) return;
      ctx.lineCap = 'butt'; ctx.strokeStyle = ROAD[kind][2]; ctx.setLineDash([2.4 * k, 2.4 * k]);
      list.forEach((r) => { trace(r.pts); ctx.stroke(); });
      ctx.setLineDash([]);
    });
    ctx.lineCap = 'round';

    // 草地球場：外圍一圈紅土跑道
    land.fields.forEach((f) => {
      trace(f.pts, true);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 12.6 * k; ctx.stroke();
      ctx.strokeStyle = '#e58a6a'; ctx.lineWidth = 12 * k; ctx.stroke();
      ctx.strokeStyle = C.card; ctx.lineWidth = 6.6 * k; ctx.stroke();
      ctx.strokeStyle = '#e58a6a'; ctx.lineWidth = 5.6 * k; ctx.stroke();
      ctx.fillStyle = '#8fb190'; ctx.fill();
      ctx.save(); ctx.clip();
      const b = box(f.pts), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let x = b.x0; x < b.x1; x += 14) ctx.fillRect(px(x), py(b.z0), 7 * k, (b.z1 - b.z0) * k);
      ctx.strokeStyle = 'rgba(255,253,246,0.9)'; ctx.lineWidth = 0.8 * k;
      ctx.strokeRect(px(b.x0 + 5), py(b.z0 + 5), (b.x1 - b.x0 - 10) * k, (b.z1 - b.z0 - 10) * k);
      ctx.beginPath(); ctx.moveTo(px(cx), py(b.z0 + 5)); ctx.lineTo(px(cx), py(b.z1 - 5)); ctx.stroke();
      ctx.beginPath(); ctx.arc(px(cx), py(cz), 9 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      trace(f.pts, true); edge();
    });
    // 硬地球場：奶油黃
    land.courts.forEach((f) => {
      trace(f.pts, true); ctx.fillStyle = C.butter; ctx.fill();
      ctx.save(); ctx.clip();
      const b = box(f.pts);
      ctx.strokeStyle = 'rgba(255,253,246,0.95)'; ctx.lineWidth = 0.6 * k;
      ctx.strokeRect(px(b.x0 + 2), py(b.z0 + 2), (b.x1 - b.x0 - 4) * k, (b.z1 - b.z0 - 4) * k);
      ctx.beginPath(); ctx.moveTo(px(b.x0 + 2), py((b.z0 + b.z1) / 2)); ctx.lineTo(px(b.x1 - 2), py((b.z0 + b.z1) / 2)); ctx.stroke();
      ctx.restore();
      trace(f.pts, true); edge();
    });

    // 水：水池與水路
    land.ponds.forEach((w) => { trace(w.pts, true); ctx.fillStyle = C.water; ctx.fill(); edge(); });
    ctx.strokeStyle = C.ink; ctx.lineWidth = 10.3 * k; land.water.forEach((w) => { trace(w.pts); ctx.stroke(); });
    ctx.strokeStyle = C.water; ctx.lineWidth = 9.6 * k; land.water.forEach((w) => { trace(w.pts); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8 * k; ctx.setLineDash([4 * k, 9 * k]);
    [-2.4, 2.4].forEach((off) => {
      ctx.save(); ctx.translate(0, off * k);
      ctx.lineDashOffset = off > 0 ? 6 * k : 0;
      land.water.forEach((w) => { trace(w.pts); ctx.stroke(); });
      ctx.restore();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    // 每條有名字的水路標一次名字，放在書頁上最長的那一段旁邊
    const named = {};
    land.water.forEach((w) => {
      if (!w.name) return;
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        if (onPage(mid, 30) && (!named[w.name] || len > named[w.name].len)) named[w.name] = { len, mid };
      }
    });
    Object.keys(named).forEach((name) => { const m = named[name].mid; letters(spaced(name), m.x, m.z - 11, 6, 0, '#3f7f93'); });

    // 場域邊界
    if (land.boundary) {
      trace(land.boundary, true);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.5 * k; ctx.setLineDash([3 * k, 2.4 * k]); ctx.stroke(); ctx.setLineDash([]);
    }

    // 建築的位置
    feats.forEach((f) => {
      trace(f.ring, true);
      if (f.featured) { ctx.fillStyle = 'rgba(58,51,64,0.1)'; ctx.fill(); edge(); return; }
      // 沒有資料的建築：虛線輪廓
      ctx.fillStyle = 'rgba(255,253,246,0.6)'; ctx.fill();
      ctx.setLineDash([1.8 * k, 1.4 * k]); ctx.lineWidth = 0.4 * k; ctx.strokeStyle = C.ink; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(58,51,64,0.6)'; ctx.font = '500 ' + 4.6 * k + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('尚無紀錄', px(f.c.x), py(f.c.z) + 6);
    });

    // 下方留白處：躺在地上的場域名稱
    const en = (site.name && site.name.en) || '';
    if (en && page.pad[2] > 40) {
      const text = spaced(en.toUpperCase());
      let size = Math.min(page.pad[2] * 0.2, 24);
      ctx.font = '900 ' + size * k + 'px ' + FONT;
      const tw = ctx.measureText(text).width / k;
      if (tw > page.w * 0.84) size *= (page.w * 0.84) / tw;
      letters(text, 0, page.d / 2 - page.pad[2] * 0.5, size);
    }

    // 摺線
    const fold = ctx.createLinearGradient(W / 2 - 14, 0, W / 2 + 14, 0);
    fold.addColorStop(0, 'rgba(58,51,64,0)'); fold.addColorStop(0.5, 'rgba(58,51,64,0.2)'); fold.addColorStop(1, 'rgba(58,51,64,0)');
    ctx.fillStyle = fold; ctx.fillRect(W / 2 - 14, 0, 28, H);

    // 指北針：放在左上角
    const cx = 40 * k, cy = 38 * k, n = { x: -SIN, z: -COS };
    ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(cx, cy, 20 * k, 0, Math.PI * 2); ctx.fill(); edge();
    ctx.strokeStyle = C.brick; ctx.lineWidth = 1.4 * k; ctx.beginPath(); ctx.moveTo(cx - n.x * 10 * k, cy - n.z * 10 * k); ctx.lineTo(cx + n.x * 14 * k, cy + n.z * 14 * k); ctx.stroke();
    ctx.fillStyle = C.brick; ctx.font = '500 ' + 9 * k + 'px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('N', cx + n.x * 8 * k + 9 * k, cy + n.z * 8 * k + 3 * k);
  }

  // 把靜態的書頁加上走過的紅線，送進貼圖
  function compose() {
    const ctx = pageCanvas.getContext('2d'), k = pageCanvas.width / page.w;
    ctx.setLineDash([]);
    ctx.drawImage(staticCanvas, 0, 0);
    if (track.length > 1) {
      const line = () => {
        ctx.beginPath();
        track.forEach((t, i) => {
          const p = fromLngLat([t[1], t[0]]), x = (p.x + page.w / 2) * k, y = (p.z + page.d / 2) * k;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = C.card; ctx.lineWidth = 2.4 * k; line();
      ctx.setLineDash([5.5 * k, 4.5 * k]); ctx.strokeStyle = C.thread; ctx.lineWidth = 1.3 * k; line();
      ctx.setLineDash([]);
    }
    pageTex.needsUpdate = true;
  }

  // ---------- 場景 ----------
  function buildBook() {
    // 桌面：一道一道的寬條紋
    const tc = P.makeCanvas(64, 64), tx = tc.getContext('2d');
    tx.fillStyle = C.table; tx.fillRect(0, 0, 64, 64);
    tx.fillStyle = 'rgba(255,255,255,0.13)'; tx.fillRect(0, 0, 64, 32);
    const tt = texture(tc); tt.wrapS = tt.wrapT = T.RepeatWrapping; tt.repeat.set(140, 140);
    const table = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshLambertMaterial({ map: tt }));
    table.rotation.x = -Math.PI / 2; table.position.y = -9.4; table.receiveShadow = true; scene.add(table);

    left = new T.Group(); right = new T.Group();
    scene.add(left); scene.add(right);

    staticCanvas = P.makeCanvas(2048, (2048 * page.d) / page.w);
    pageCanvas = P.makeCanvas(staticCanvas.width, staticCanvas.height);
    pageTex = texture(pageCanvas);
    const pageMat = new T.MeshLambertMaterial({ map: pageTex });
    const coverMat = flatMat(C.brick), blockMat = flatMat('#ebe3cf');
    const hw = page.w / 2;
    // 左右各一半：書頁、紙的厚度、封面
    page.halves = [-1, 1].map((side) => {
      const g = side < 0 ? left : right;
      const geo = new T.PlaneGeometry(hw, page.d), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      const m = new T.Mesh(geo, pageMat);
      m.rotation.x = -Math.PI / 2; m.position.x = (side * hw) / 2; m.receiveShadow = true; g.add(m);
      const block = piece(new T.BoxGeometry(hw, 6, page.d), blockMat);
      block.position.set((side * hw) / 2, -3.05, 0); g.add(block);
      const cover = piece(new T.BoxGeometry(hw + 11, 3, page.d + 22), coverMat);
      cover.position.set(side * (hw / 2 + 5.5), -7.55, 0); g.add(cover);
      return m;
    });
    // 封面：書合起來時朝上，印著書名
    page.coverMat = new T.MeshLambertMaterial({ map: coverTexture() });
    const face = new T.Mesh(new T.PlaneGeometry(hw + 11, page.d + 22), page.coverMat);
    face.position.set(hw / 2 + 5.5, -9.08, 0);
    face.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
    right.add(face);
    const spine = piece(new T.BoxGeometry(5, 9, page.d + 22), coverMat);
    spine.position.y = -4.6; scene.add(spine);
  }
  const coverTexture = () => texture(P.cover(document.title || '', App.t(site.name), page.w / 2 + 11, page.d + 22));

  function buildTrees() {
    const tex = {};
    ['dark', 'pale', 'gold', 'bush'].forEach((kind) => { tex[kind] = texture(P.tree(kind)); });
    const placed = [];
    const put = (p, kind, size) => { stand(tex[kind], size * 0.7, size, p.x, p.z); placed.push(p); };
    // 真實資料：行道樹與單株的樹
    land.treeRows.forEach((row) => {
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1], b = row[i], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 8));
        for (let j = i === 1 ? 0 : 1; j <= n; j++) put({ x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n }, 'dark', 13);
      }
    });
    land.trees.forEach((p) => { if (onPage(p, 8)) put(p, 'pale', 14); });
    (site.landmarks || []).forEach((l) => { placed.push(fromLngLat([l.lng, l.lat])); });

    // 裝飾：把空地種滿樹，避開建築、路、水、球場和書脊；場域內密、場域外疏
    const ROADW = { foot: 1.1, path: 2.2, street: 3.5, road: 5.5 };
    let seed = 11;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const free = (p) => {
      if (Math.abs(p.x) < 5 || !onPage(p, 12)) return false;
      if (p.z > page.d / 2 - page.pad[2] * 0.75 && page.pad[2] > 40) return false;               // 留給地上的大字
      if (feats.some((f) => inside(p, f.ring) || lineDist(p, f.ring, true) < 6)) return false;
      if (land.fields.concat(land.courts, land.ponds).some((f) => inside(p, f.pts) || lineDist(p, f.pts, true) < 8)) return false;
      if (land.roads.some((r) => lineDist(p, r.pts) < (ROADW[r.kind] || 2) + 3.6)) return false;
      if (land.water.some((w) => lineDist(p, w.pts) < 10)) return false;
      return !placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 9);
    };
    let inCampus = 0, outside = 0;
    for (let i = 0; i < 2000 && inCampus + outside < 110; i++) {
      const p = { x: (rnd() - 0.5) * page.w, z: (rnd() - 0.5) * page.d }, r = rnd(), s = rnd();
      const campus = !land.boundary || inside(p, land.boundary);
      if (campus ? inCampus >= 86 : outside >= 24) continue;
      if (!free(p)) continue;
      if (r < 0.45) put(p, 'dark', 12 + s * 5);
      else if (r < 0.74) put(p, 'pale', 12 + s * 5);
      else if (r < 0.9) put(p, 'gold', 11 + s * 4);
      else put(p, 'bush', 6.5 + s * 2);
      if (campus) inCampus++; else outside++;
    }
    // 地標樹：比較大，插著名字
    (site.landmarks || []).forEach((l) => {
      const p = fromLngLat([l.lng, l.lat]);
      if (!onPage(p, 8)) return;
      addSign(App.t(l.name), '', p.x, 19, p.z, stand(tex.gold, 14.7, 21, p.x, p.z), true, true);
    });
  }

  // 路上的小人：只是裝飾，隨機站在場域內的小路上
  function buildPeople() {
    const n = site.page && site.page.people != null ? site.page.people : 26;
    const paths = land.roads.filter((r) => r.kind !== 'road' && r.pts.length > 1);
    if (!n || !paths.length) return;
    const tex = [0, 1, 2, 3, 4, 5].map((i) => texture(P.passerby(i)));
    let seed = 29, made = 0;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < n * 40 && made < n; i++) {
      const r = paths[Math.floor(rnd() * paths.length)], j = 1 + Math.floor(rnd() * (r.pts.length - 1)), t = rnd();
      const a = r.pts[j - 1], b = r.pts[j];
      const p = { x: a.x + (b.x - a.x) * t + (rnd() - 0.5) * 2, z: a.z + (b.z - a.z) * t + (rnd() - 0.5) * 2 };
      if (Math.abs(p.x) < 4 || !onPage(p, 8)) continue;
      if (land.boundary && !inside(p, land.boundary)) continue;
      if (feats.some((f) => inside(p, f.ring) || lineDist(p, f.ring, true) < 1.5)) continue;
      stand(tex[made % 6], 2.9, 5.8, p.x, p.z, { shadow: false, type: 'scale', extra: 0.25 });
      made++;
    }
  }

  // 面向鏡頭的名牌
  function addSign(name, en, x, y, z, popRef, on, small) {
    const c = P.sign(name, en, small);
    const s = new T.Mesh(new T.PlaneGeometry(c.width / 9, c.height / 9).translate(0, c.height / 18, 0), new T.MeshBasicMaterial({ map: texture(c), transparent: true, alphaTest: 0.3 }));
    s.position.set(x, y, z);
    s.userData = { pop: popRef, on, small: !!small, name, en };
    scene.add(s); signs.push(s);
    return s;
  }

  // 屋頂上的東西，放在外框裡最大的長方形上。spec.top：saw 鋸齒天窗、gable 斜屋頂、glass 溫室、garden 屋頂菜園，其餘是平屋頂
  function roofTop(g, f) {
    const r = f.flat, s = f.paper || {};
    if (!r) return;
    const y = f.bh, w = r.x1 - r.x0, d = r.z1 - r.z0, alongX = w >= d, long = Math.max(w, d), short = Math.min(w, d);
    const white = flatMat(C.white);
    // across：輪廓橫跨短邊、沿長邊拉長；along：輪廓沿著長邊、往短邊拉
    const across = (pts, len, off, inset, mats) => g.add(alongX ? prism(pts, len, true, r.x0 + off, y, r.z0 + inset, mats) : prism(pts, len, false, r.x0 + inset, y, r.z0 + off, mats));
    const along = (pts, mats) => g.add(prism(pts, short, !alongX, r.x0, y, r.z0, mats));
    const block = (bw, bh, bd, x, z, color) => {
      const b = piece(new T.BoxGeometry(bw, bh, bd).translate(0, bh / 2, 0), flatMat(color));
      b.position.set(x, y, z); g.add(b);
    };
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;

    if (s.top === 'saw') {
      const n = Math.max(2, Math.round(long / 9)), t = long / n, h = 4.6, pts = [[0, 0], [0, h]];
      for (let i = 1; i < n; i++) pts.push([i * t, 0.7], [i * t, h]);
      pts.push([long, 0.7], [long, 0]);
      along(pts, [white, white]);
    } else if (s.top === 'gable') {
      const h = Math.min(9, short * 0.3);
      across([[0, 0], [short, 0], [short / 2, h]], long, 0, 0, [flatMat(P.mix(s.color || C.sage, '#ffffff', 0.25)), flatMat(s.roofTop || C.salmon)]);
    } else if (s.top === 'glass') {
      const sw = Math.min(short * 0.62, 10), len = long * 0.56;
      across([[0, 0], [sw, 0], [sw, 2.6], [sw / 2, 2.6 + sw * 0.34], [0, 2.6]], len, (long - len) / 2, (short - sw) / 2, [white, white]);
    } else if (s.top === 'garden') {
      const nx = Math.max(1, Math.min(5, Math.floor(w / 7))), nz = Math.max(1, Math.min(4, Math.floor(d / 6)));
      const tone = [C.leafDark, C.leaf, C.gold, C.leafDark, C.sage];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if ((i * 3 + j) % 4 === 3) continue;                                     // 留幾格空著
        block(w / nx - 2.4, 0.9, d / nz - 2.4, r.x0 + (w * (i + 0.5)) / nx, r.z0 + (d * (j + 0.5)) / nz, tone[(i + j * 2) % tone.length]);
      }
    } else {
      if (short >= 9) block(7, 4, 6, cx, cz, C.white);
      if (long >= 26) block(3.4, 2, 3, cx + (alongX ? long * 0.3 : 0), cz + (alongX ? 0 : long * 0.3), C.grey);
    }
  }

  // 建築：把外框往上拉成一個量體。牆面貼著一格一格的窗，屋頂是比牆淺的同色，每條邊描一圈細線。
  // 未開拓時是還沒上色的白模型。
  function buildingBox(f, open) {
    const g = new T.Group(), s = f.paper || {};
    const shape = new T.Shape();
    f.ring.forEach((p, i) => (i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)));
    // 牆面貼圖沿著每一面牆的長度排，每面牆剛好放整數個開間；太短的牆只取立面最邊緣的牆色
    const uv = {
      generateTopUV: (g0, v, a, b, c) => [a, b, c].map((i) => new T.Vector2(v[i * 3], v[i * 3 + 1])),
      generateSideWallUV: (g0, v, a, b, c, d) => {
        const n = Math.round(Math.hypot(v[b * 3] - v[a * 3], v[b * 3 + 1] - v[a * 3 + 1]) / 7), u = n ? n * 7 : 0.3;
        return [new T.Vector2(0, v[a * 3 + 2]), new T.Vector2(u, v[b * 3 + 2]), new T.Vector2(u, v[c * 3 + 2]), new T.Vector2(0, v[d * 3 + 2])];
      },
    };
    const geo = new T.ExtrudeGeometry(shape, { depth: f.bh, bevelEnabled: false, UVGenerator: uv });
    let mats;
    if (open) {
      const wall = texture(P.facade(s, f.levels)); wall.wrapS = wall.wrapT = T.RepeatWrapping; wall.repeat.set(1 / 7, 1 / f.bh);
      mats = [flatMat(s.roof || P.mix(s.color || C.sage, '#ffffff', 0.42)), new T.MeshLambertMaterial({ map: wall, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })];
    } else {
      const blank = flatMat(C.white);
      mats = [blank, blank];
    }
    const box = piece(geo, mats);
    box.rotation.x = -Math.PI / 2;
    g.add(box);
    if (open) roofTop(g, f);
    return g;
  }
  function buildBuildings() {
    feats.filter((f) => f.featured).forEach((f) => {
      const open = !!visited[f.id];
      const p = pop(buildingBox(f, open), f.c.x, f.c.z, { type: 'grow' });
      const sign = addSign(f.name, f.en, f.c.x, f.bh + 2, f.c.z, p, open, false);
      const stamp = addSign('未開拓', '', f.c.x, f.bh + 1, f.c.z, p, !open, true);
      sheets[f.id] = { f, pop: p, sign, stamp };
    });
  }

  function buildPlayer() {
    const make = (pose) => texture(P.person(pose));
    poses = {
      idle: make({}),
      blink: make({ blink: true }),
      a: make({ front: -0.36, back: 0.32, arm: 0.36, tail: 0.9 }),              // 跨步
      b: make({ front: -0.05, back: 0.03, lift: 16, arm: -0.14, tail: 0.5 }),   // 收腳、抬起前腳
    };
    player = sheet(poses.idle, 12.2, 22);
    scene.add(player);
    // 腳下的圓牌
    const c = P.makeCanvas(160, 160), ctx = c.getContext('2d');
    ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(80, 80, 76, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.setLineDash([13, 9]); ctx.lineWidth = 6; ctx.strokeStyle = C.thread; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(80, 80, 58, 0, Math.PI * 2); ctx.stroke();
    base = new T.Mesh(new T.CircleGeometry(7, 40), new T.MeshLambertMaterial({ map: texture(c), transparent: true }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.3;
    scene.add(base);
    playerPop = { obj: player, z: 0, type: 'fx', extra: 0.45, delay: 0, e: 1 };
    pops.push(playerPop);
  }

  // 排定每樣東西立起來的時間：從書的後方往前，一樣接一樣
  function schedule() {
    const order = pops.slice().sort((a, b) => a.z - b.z);
    order.forEach((p, i) => { p.delay = POP_AT + (POP_SPREAD * i) / Math.max(1, order.length - 1) + p.extra; });
  }

  // ---------- 小人跟著定位走 ----------
  // 用一條彈簧拉著：定位每秒才更新一次、還會跳動，彈簧讓小人以使用者實際的速度平順地跟上。
  function follow(tx, tz, dt) {
    if (!me.ready || Math.hypot(tx - me.x, tz - me.z) > 120) {
      me.x = tx; me.z = tz; me.vx = me.vz = 0; me.ready = true;
      return 0;
    }
    const n = Math.max(1, Math.min(8, Math.ceil(dt / 0.03))), h = dt / n;
    for (let i = 0; i < n; i++) {
      me.vx += (FOLLOW * FOLLOW * (tx - me.x) - 2 * FOLLOW * me.vx) * h;
      me.vz += (FOLLOW * FOLLOW * (tz - me.z) - 2 * FOLLOW * me.vz) * h;
      me.x += me.vx * h; me.z += me.vz * h;
    }
    return Math.hypot(me.vx, me.vz);
  }

  // ---------- 鏡頭：平行投影，沒有近大遠小 ----------
  function resize() {
    const w = canvas.clientWidth || 148, h = canvas.clientHeight || 148;
    renderer.setSize(w, h, false);
    aspect = w / h;
    const c = Math.abs(Math.cos(AZ0)), s = Math.abs(Math.sin(AZ0));
    const wide = page.w * c + page.d * s, tall = (page.w * s + page.d * c) * Math.sin(EL0) + 70;
    fitDist = Math.max((wide * 0.54) / aspect, tall * 0.56) / ZOOM;
  }
  // 「我附近」的鏡頭距離
  const nearDist = () => Math.max(230, fitDist * 0.42);

  function placeCamera() {
    const ce = Math.cos(view.el), R = 2200, half = view.dist * ZOOM;
    camera.position.set(view.tx + R * Math.sin(view.az) * ce, 12 + R * Math.sin(view.el), view.tz + R * Math.cos(view.az) * ce);
    camera.lookAt(view.tx, 12, view.tz);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
  }

  // 打開：書先合著，封面翻開，東西從後往前一樣一樣立起來，最後鏡頭推近到小人身邊
  function startIntro() {
    intro = { t0: performance.now(), cam: true };
    mode = 'book'; zoomTo = null;
    pops.forEach((p) => setPop(p, 0));
    right.rotation.z = Math.PI;
  }
  function stepIntro(now) {
    const t = (now - intro.t0) / 1000, a = ease(clamp01((t - FOLD_AT) / FOLD_FOR));
    right.rotation.z = Math.PI * (1 - a);
    pops.forEach((p) => setPop(p, clamp01((t - p.delay) / POP_FOR)));
    if (intro.cam) {
      view.az = AZ0; view.el = 0.95 + (EL0 - 0.95) * a; view.dist = fitDist * (0.7 + 0.3 * a);
      view.tx = (-page.w / 4) * (1 - a); view.tz = 0;
      if (t > POP_AT + POP_SPREAD + 0.5) { intro.cam = false; mode = 'me'; zoomTo = nearDist(); }
    }
    if (t > POP_AT + POP_SPREAD + POP_FOR + 0.6) intro = null;
  }
  function settle() {
    intro = null;
    right.rotation.z = 0;
    pops.forEach((p) => setPop(p, 1));
  }

  // 拖曳旋轉、雙指或滾輪縮放、點兩下在「全書」與「我附近」之間切換
  function bindControls() {
    const ptrs = new Map();
    let moved = 0, downAt = 0, lastTap = 0, pinch = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (!isOpen) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 有些環境不支援，不影響操作 */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      zoomTo = null;
      if (intro) intro.cam = false;
      if (ptrs.size === 1) { moved = 0; downAt = Date.now(); }
      if (ptrs.size === 2) { const p = [...ptrs.values()]; pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!isOpen || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        view.az = Math.max(AZ0 - 1.1, Math.min(AZ0 + 1.1, view.az - dx * 0.006));
        view.el = Math.max(0.35, Math.min(1.25, view.el + dy * 0.005));
      } else if (ptrs.size === 2) {
        const q = [...ptrs.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
        if (pinch) view.dist = Math.max(70, Math.min(fitDist * 1.4, (view.dist * pinch) / d));
        pinch = d; moved += 10;
      }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size || moved > 8 || Date.now() - downAt > 350) return;
      const now = Date.now();
      if (now - lastTap < 330) {
        mode = mode === 'me' ? 'book' : 'me';
        zoomTo = mode === 'book' ? fitDist : nearDist();
        if (mode === 'book') { view.az = AZ0; view.el = EL0; }
        lastTap = 0;
        return;
      }
      lastTap = now;
      if (App.minimap.onTap) { const p = pick(e.clientX, e.clientY); if (p) App.minimap.onTap(p); }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      if (!isOpen) return;
      e.preventDefault();
      zoomTo = null;
      view.dist = Math.max(70, Math.min(fitDist * 1.4, view.dist * (1 + e.deltaY * 0.0012)));
    }, { passive: false });
    window.addEventListener('resize', resize);
  }

  // 螢幕上的點對應到書頁上的哪個位置
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }, camera);
    const hit = ray.intersectObjects(page.halves)[0];
    return hit ? toLatLng(hit.point.x, hit.point.z) : null;
  }

  App.minimap = {
    onTap: null,

    // list：[{ id, name, en, featured, h, paper, ring: [[lng, lat], ...] }]；terrain 是場域包的地形資料，可以沒有
    init(canvasEl, list, siteData, state, terrain) {
      T = window.THREE;
      canvas = canvasEl; site = siteData;
      if (!T) { canvas.parentElement.hidden = true; return; }
      origin = site.center;
      cosLat = Math.cos((origin.lat * Math.PI) / 180);
      visited = state.visited || {};
      track = state.track || [];
      const cfg = site.page || {}, t = terrain || {};

      // 書頁的方向與範圍
      const rawRings = list.map((b) => b.ring.slice(0, -1).map((p) => toM({ lng: p[0], lat: p[1] })));
      const deg = cfg.rotation != null ? cfg.rotation : dominant(rawRings);
      COS = Math.cos((deg * Math.PI) / 180); SIN = Math.sin((deg * Math.PI) / 180);
      const span = rawRings.flat().concat((t.boundary || []).map((p) => toM({ lng: p[0], lat: p[1] }))).map(rot);
      const pad = cfg.padding || [34, 34, 34, 34];                                // 上、右、下、左各留多少（公尺）
      const x0 = Math.min(...span.map((r) => r.x)) - pad[3], x1 = Math.max(...span.map((r) => r.x)) + pad[1];
      const y0 = Math.min(...span.map((r) => r.y)) - pad[2], y1 = Math.max(...span.map((r) => r.y)) + pad[0];
      page = { w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, pad };

      feats = list.map((b) => {
        const ring = b.ring.slice(0, -1).map(fromLngLat);
        const xs = ring.map((p) => p.x);
        return Object.assign({}, b, {
          ring,
          c: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: ring.reduce((s, p) => s + p.z, 0) / ring.length },
          flat: b.featured ? innerRect(ring) : null,
          bh: Math.max(12, Math.min(46, b.h * 2)),                                // 量體高度，刻意誇張
          levels: Math.max(1, Math.round(b.h / 3.5)),
        });
      });
      land = {
        boundary: t.boundary ? t.boundary.map(fromLngLat) : null,
        water: (t.water || []).map((w) => ({ name: w.name, pts: w.line.map(fromLngLat) })),
        ponds: (t.ponds || []).map((w) => ({ name: w.name, pts: w.ring.map(fromLngLat) })),
        fields: (t.fields || []).map((w) => ({ name: w.name, pts: w.ring.map(fromLngLat) })),
        courts: (t.courts || []).map((w) => ({ name: w.name, pts: w.ring.map(fromLngLat) })),
        roads: (t.roads || []).map((r) => ({ kind: r.kind, pts: r.line.map(fromLngLat) })),
        treeRows: (t.treeRows || []).map((r) => r.map(fromLngLat)),
        trees: (t.trees || []).map(fromLngLat),
      };

      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true });
      } catch (e) { renderer = null; canvas.parentElement.hidden = true; return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      scene = new T.Scene();
      scene.background = new T.Color(C.table);
      camera = new T.OrthographicCamera(-1, 1, 1, -1, 10, 6000);
      inkLine = new T.LineBasicMaterial({ color: new T.Color(C.ink).convertSRGBToLinear() });

      // 光很平：幾乎都是環境光，只留一點方向光分出明暗面與淡淡的影子
      scene.add(new T.AmbientLight(0xffffff, 0.86));
      const sun = new T.DirectionalLight(0xffffff, 0.24);
      sun.position.set(-page.w * 0.5, 330, page.d * 0.9);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera, r = Math.max(page.w, page.d) * 0.78;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 10; sc.far = 1500;
      sun.shadow.bias = -0.0008;
      scene.add(sun);

      buildBook();
      buildTrees();
      buildPeople();
      buildBuildings();
      buildPlayer();
      schedule();
      settle();
      drawStatic(); compose();
      // 字型載入後，重畫有文字的貼圖
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          drawStatic(); compose();
          page.coverMat.map = coverTexture();
          signs.forEach((s) => { s.material.map = texture(P.sign(s.userData.name, s.userData.en, s.userData.small)); });
        });
      }
      bindControls();
      resize();
    },

    // 每一幀呼叫：pos 是定位、heading 是朝向、dt 是距離上一幀的秒數
    update(pos, heading, dt) {
      if (!renderer) return;
      const now = performance.now(), step = Math.min(dt || 0.016, 0.25);
      const target = fromLngLat([pos.lng, pos.lat]);

      // 小人：跟著定位走，走的方向決定面向左或右；站著時偶爾眨眼
      const speed = follow(target.x, target.z, step), walking = speed > 0.35;
      if (walking) {
        stepPhase += step * Math.min(6.5, Math.max(1.2, speed)) * 4.4;
        const toRight = (me.vx * Math.cos(view.az) - me.vz * Math.sin(view.az)) / speed;
        if (Math.abs(toRight) > 0.25) facing = toRight > 0 ? 1 : -1;
      }
      const sway = walking ? Math.sin(stepPhase) : 0;
      player.position.set(me.x, -0.9 + (walking ? Math.abs(sway) * 1.3 : 0), me.z);
      base.position.x = me.x; base.position.z = me.z;
      const tex = walking ? (sway > 0 ? poses.a : poses.b) : now % 3600 < 140 ? poses.blink : poses.idle;
      if (player.material.map !== tex) { player.material.map = tex; player.customDepthMaterial.map = tex; }

      // 鏡頭
      if (intro) stepIntro(now);
      if (!isOpen) {
        view.tx = me.x; view.tz = me.z; view.az = AZ0; view.el = EL0; view.dist = 150;
      } else if (!(intro && intro.cam)) {
        const tx = mode === 'me' ? me.x : 0, tz = mode === 'me' ? me.z : 0;
        view.tx += (tx - view.tx) * 0.12; view.tz += (tz - view.tz) * 0.12;
        if (zoomTo != null) { view.dist += (zoomTo - view.dist) * 0.07; if (Math.abs(zoomTo - view.dist) < 1.5) zoomTo = null; }
      }
      placeCamera();

      // 樹與路人轉向鏡頭；名牌與小人正對鏡頭，名牌隨縮放調整大小，維持可讀
      turning.forEach((g) => { g.rotation.y = view.az; });
      const signScale = Math.max(0.25, Math.min(2.4, view.dist * 0.0018)) * Math.min(1, 0.5 + aspect * 0.5);   // 直式螢幕窄，名牌縮小一點
      signs.forEach((s) => {
        const e = s.userData.pop.e;
        s.visible = isOpen && s.userData.on && e > 0;
        if (!s.visible) return;
        s.quaternion.copy(camera.quaternion);
        s.scale.setScalar(signScale * e);
      });
      const pe = playerPop.e;
      player.visible = base.visible = pe > 0;
      player.quaternion.copy(camera.quaternion);
      player.rotateZ(sway * 0.07);
      player.scale.set(facing * Math.max(0.001, pe), Math.max(0.001, pe), 1);
      base.scale.setScalar(Math.max(0.001, pe));

      anims = anims.filter((a) => a(now));
      renderer.render(scene, camera);
    },

    setTrack(t) {
      track = t;
      if (renderer) compose();
    },

    // 走近後，白模型換成上了色的建築，從書頁上長起來
    setVisited(map, newId) {
      visited = map;
      if (!renderer) return;
      const s = sheets[newId];
      if (s) {
        const old = s.pop.obj, box = buildingBox(s.f, true);
        old.parent.add(box); old.parent.remove(old);
        s.pop.obj = box;
        s.stamp.userData.on = false;
        const start = performance.now();
        anims.push((now) => {
          const t = Math.min(1, (now - start) / 800);
          box.scale.y = Math.max(0.02, 1 - Math.pow(1 - t, 3) * Math.cos(t * 7));   // 從書頁上長起來，晃兩下
          if (t >= 1) { box.scale.y = 1; s.sign.userData.on = true; }
          return t < 1;
        });
      }
    },

    setOpen(open) {
      isOpen = open;
      if (!renderer) return;
      requestAnimationFrame(() => {
        resize();
        if (open) startIntro(); else settle();
      });
    },
  };
})();
