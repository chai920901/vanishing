// 紙雕立體書地圖，用 Three.js 繪製成真正的 3D 場景。圖案由 paper.js 提供。
// 座標：場域先轉到「建築的邊與書頁平行」的方向，再以書頁中心為原點。X 向右，Y 向上，Z 朝向讀者。
// 書分成左右兩半，以書脊（X = 0）為軸。打開時右半邊從蓋在左半邊上翻開，書頁上的紙片再依序立起來。
(function () {
  const P = App.paper, C = P.C;
  const TILT = -0.06;                                                           // 紙片稍微往後靠
  const FOLD_AT = 0.3, FOLD_FOR = 1.15, POP_AT = 1.25, POP_SPREAD = 1.0, POP_FOR = 0.6;   // 打開動畫的時間（秒）
  const FOLLOW = 2.4;                                                           // 小人跟隨定位的鬆緊：越大跟得越緊

  let T, renderer, scene, camera, canvas, site, origin, cosLat, COS = 1, SIN = 0;
  let page, staticCanvas, pageCanvas, pageTex, feats = [], land;
  let track = [], visited = {};
  let left, right, pops = [], signs = [], sheets = {}, anims = [];
  let player, playerPop, poses, base, facing = 1, stepPhase = 0;
  const me = { x: 0, z: 0, vx: 0, vz: 0, ready: false };                        // 小人實際顯示的位置與速度
  let isOpen = false, mode = 'me', fitDist = 400, intro = null, zoomTo = null;
  const view = { az: 0, el: 0.82, dist: 150, tx: 0, tz: 0 };

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

  // ---------- 貼圖與紙片 ----------
  function texture(c) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // 立著的紙片：底邊貼在書頁上
  function sheet(tex, w, h, opts) {
    const o = opts || {};
    const geo = new T.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const mat = new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide, alphaTest: o.ghost ? 0.05 : 0.5, transparent: !!o.ghost, opacity: o.ghost ? 0.66 : 1, depthWrite: !o.ghost });
    const mesh = new T.Mesh(geo, mat);
    if (!o.ghost && o.shadow !== false) {
      mesh.castShadow = true;
      mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    }
    return mesh;
  }
  // 登記一個會在打開時立起來的東西。type：hinge 從平躺翻起、grow 往上長、scale 放大、fx 由每一幀自己處理
  function pop(obj, x, z, opts) {
    const o = opts || {};
    (o.root ? scene : x < 0 ? left : right).add(obj);
    const p = { obj, z, type: o.type || 'hinge', extra: o.extra || 0, delay: 0, e: 1 };
    pops.push(p);
    return p;
  }
  function setPop(p, r) {
    const e = r <= 0 ? 0 : r >= 1 ? 1 : backOut(r);
    p.e = e;
    if (p.type === 'fx') return;
    p.obj.visible = e > 0;
    if (p.type === 'hinge') p.obj.rotation.x = -Math.PI / 2 + (Math.PI / 2 + TILT) * e;
    else if (p.type === 'grow') p.obj.scale.y = Math.max(0.001, e);
    else p.obj.scale.setScalar(Math.max(0.001, e));
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
    ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // 校外顏色深一點、畫斜線；校內是乾淨的紙
    ctx.fillStyle = land.boundary ? '#e9dcc0' : C.paper; ctx.fillRect(0, 0, W, H);
    if (land.boundary) {
      ctx.strokeStyle = 'rgba(36,50,63,0.05)'; ctx.lineWidth = 2;
      for (let x = -H; x < W; x += 22) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
      trace(land.boundary, true); ctx.fillStyle = '#f8f0de'; ctx.fill();
    }
    P.halftone(ctx, W, H, 0.045);
    ctx.strokeStyle = 'rgba(63,143,138,0.13)'; ctx.lineWidth = 1.5;
    for (let x = 40; x < page.w; x += 40) { ctx.beginPath(); ctx.moveTo(x * k, 0); ctx.lineTo(x * k, H); ctx.stroke(); }
    for (let z = 40; z < page.d; z += 40) { ctx.beginPath(); ctx.moveTo(0, z * k); ctx.lineTo(W, z * k); ctx.stroke(); }

    // 路：校外的馬路偏灰，校內的小路是土色
    const ROAD = { foot: [2.2, '#e3c79b'], path: [4.4, '#e3c79b'], street: [7, '#d9ccb0'], road: [11, '#d2c4a6'] };
    Object.keys(ROAD).forEach((kind) => {
      const list = land.roads.filter((r) => r.kind === kind), w = ROAD[kind][0];
      ctx.strokeStyle = 'rgba(36,50,63,0.17)'; ctx.lineWidth = (w + 1.5) * k;
      list.forEach((r) => { trace(r.pts); ctx.stroke(); });
      ctx.strokeStyle = ROAD[kind][1]; ctx.lineWidth = w * k;
      list.forEach((r) => { trace(r.pts); ctx.stroke(); });
    });

    // 草地球場：外圍一圈紅土跑道
    land.fields.forEach((f) => {
      trace(f.pts, true);
      ctx.strokeStyle = '#cf8a5e'; ctx.lineWidth = 12 * k; ctx.stroke();
      ctx.strokeStyle = C.card; ctx.lineWidth = 6.8 * k; ctx.stroke();
      ctx.strokeStyle = '#cf8a5e'; ctx.lineWidth = 5.6 * k; ctx.stroke();
      ctx.fillStyle = '#a9c99a'; ctx.fill();
      ctx.save(); ctx.clip();
      P.halftone(ctx, W, H, 0.06);
      const b = box(f.pts), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      ctx.strokeStyle = 'rgba(255,250,240,0.85)'; ctx.lineWidth = 0.8 * k;
      ctx.strokeRect(px(b.x0 + 5), py(b.z0 + 5), (b.x1 - b.x0 - 10) * k, (b.z1 - b.z0 - 10) * k);
      ctx.beginPath(); ctx.moveTo(px(cx), py(b.z0 + 5)); ctx.lineTo(px(cx), py(b.z1 - 5)); ctx.stroke();
      ctx.beginPath(); ctx.arc(px(cx), py(cz), 9 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
    // 硬地球場：土色
    land.courts.forEach((f) => {
      trace(f.pts, true); ctx.fillStyle = '#d9a070'; ctx.fill();
      ctx.save(); ctx.clip();
      const b = box(f.pts);
      ctx.strokeStyle = 'rgba(255,250,240,0.85)'; ctx.lineWidth = 0.6 * k;
      ctx.strokeRect(px(b.x0 + 2), py(b.z0 + 2), (b.x1 - b.x0 - 4) * k, (b.z1 - b.z0 - 4) * k);
      ctx.beginPath(); ctx.moveTo(px(b.x0 + 2), py((b.z0 + b.z1) / 2)); ctx.lineTo(px(b.x1 - 2), py((b.z0 + b.z1) / 2)); ctx.stroke();
      ctx.restore();
    });

    // 水：水池與水路
    land.ponds.forEach((w) => {
      trace(w.pts, true); ctx.fillStyle = C.water; ctx.fill();
      ctx.strokeStyle = '#4f93a8'; ctx.lineWidth = 1.4 * k; ctx.stroke();
    });
    ctx.strokeStyle = '#4f93a8'; ctx.lineWidth = 12 * k; land.water.forEach((w) => { trace(w.pts); ctx.stroke(); });
    ctx.strokeStyle = C.water; ctx.lineWidth = 9.6 * k; land.water.forEach((w) => { trace(w.pts); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.9 * k; ctx.setLineDash([5 * k, 8 * k]);
    land.water.forEach((w) => { trace(w.pts); ctx.stroke(); });
    ctx.setLineDash([]);
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
    ctx.textAlign = 'center'; ctx.font = '700 ' + 5.4 * k + 'px "Noto Sans TC", sans-serif';
    Object.keys(named).forEach((name) => {
      const m = named[name].mid;
      ctx.lineWidth = 1.6 * k; ctx.strokeStyle = 'rgba(248,240,222,0.9)'; ctx.strokeText(name, px(m.x), py(m.z - 9));
      ctx.fillStyle = '#2f6f84'; ctx.fillText(name, px(m.x), py(m.z - 9));
    });

    // 校區邊界
    if (land.boundary) {
      trace(land.boundary, true);
      ctx.strokeStyle = 'rgba(217,83,59,0.55)'; ctx.lineWidth = 0.9 * k; ctx.setLineDash([4 * k, 3.4 * k]); ctx.stroke(); ctx.setLineDash([]);
    }

    // 建築的位置
    feats.forEach((f) => {
      trace(f.ring, true);
      if (f.featured) {
        ctx.fillStyle = visited[f.id] ? 'rgba(36,50,63,0.14)' : 'rgba(36,50,63,0.07)'; ctx.fill();
      } else {
        // 沒有資料的建築：虛線輪廓
        ctx.fillStyle = 'rgba(36,50,63,0.05)'; ctx.fill();
        ctx.setLineDash([9, 7]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(36,50,63,0.42)'; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(36,50,63,0.5)'; ctx.font = '500 ' + 4.6 * k + 'px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('尚無紀錄', px(f.c.x), py(f.c.z) + 6);
      }
    });

    // 摺線
    const fold = ctx.createLinearGradient(W / 2 - 70, 0, W / 2 + 70, 0);
    fold.addColorStop(0, 'rgba(36,50,63,0)'); fold.addColorStop(0.5, 'rgba(36,50,63,0.22)'); fold.addColorStop(1, 'rgba(36,50,63,0)');
    ctx.fillStyle = fold; ctx.fillRect(W / 2 - 70, 0, 140, H);

    // 指北針：放在左上角
    const cx = 40 * k, cy = 38 * k, n = { x: -SIN, z: -COS };
    ctx.fillStyle = 'rgba(248,240,222,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, 24 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.coral; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 20 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - n.x * 10 * k, cy - n.z * 10 * k); ctx.lineTo(cx + n.x * 15 * k, cy + n.z * 15 * k); ctx.stroke();
    ctx.fillStyle = C.coral; ctx.font = '500 ' + 9 * k + 'px "DM Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('N', cx + n.x * 8 * k + 9 * k, cy + n.z * 8 * k + 3 * k);
  }

  // 把靜態的書頁加上走過的紅線，送進貼圖
  function compose() {
    const ctx = pageCanvas.getContext('2d'), k = pageCanvas.width / page.w;
    ctx.setLineDash([]);
    ctx.drawImage(staticCanvas, 0, 0);
    if (track.length > 1) {
      const line = (dx, dy) => {
        ctx.beginPath();
        track.forEach((t, i) => {
          const p = fromLngLat([t[1], t[0]]), x = (p.x + page.w / 2) * k + dx, y = (p.z + page.d / 2) * k + dy;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(36,50,63,0.2)'; ctx.lineWidth = 1.8 * k; line(3, 4);
      ctx.setLineDash([5.5 * k, 4.5 * k]); ctx.strokeStyle = C.coral; ctx.lineWidth = 1.3 * k; line(0, 0);
      ctx.setLineDash([]);
    }
    pageTex.needsUpdate = true;
  }

  // ---------- 場景 ----------
  function buildBook() {
    // 桌面
    const tc = P.makeCanvas(256, 256), tx = tc.getContext('2d');
    tx.fillStyle = C.table; tx.fillRect(0, 0, 256, 256);
    tx.strokeStyle = 'rgba(255,255,255,0.13)'; tx.lineWidth = 3; tx.lineCap = 'round';
    [[30, 40, 44, 46], [150, 30, 158, 44], [200, 120, 214, 114], [70, 150, 78, 164], [120, 220, 134, 226], [226, 210, 232, 196], [20, 230, 34, 224], [110, 96, 116, 84]]
      .forEach((s) => { tx.beginPath(); tx.moveTo(s[0], s[1]); tx.lineTo(s[2], s[3]); tx.stroke(); });
    const tt = texture(tc); tt.wrapS = tt.wrapT = T.RepeatWrapping; tt.repeat.set(40, 40);
    const table = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshLambertMaterial({ map: tt }));
    table.rotation.x = -Math.PI / 2; table.position.y = -9.4; table.receiveShadow = true; scene.add(table);

    left = new T.Group(); right = new T.Group();
    scene.add(left); scene.add(right);

    staticCanvas = P.makeCanvas(2048, (2048 * page.d) / page.w);
    pageCanvas = P.makeCanvas(staticCanvas.width, staticCanvas.height);
    pageTex = texture(pageCanvas);
    const pageMat = new T.MeshLambertMaterial({ map: pageTex });
    const coverMat = new T.MeshLambertMaterial({ color: 0xb8442f }), blockMat = new T.MeshLambertMaterial({ color: 0xdccdae });
    const hw = page.w / 2;
    // 左右各一半：書頁、紙的厚度、封面
    page.halves = [-1, 1].map((side) => {
      const g = side < 0 ? left : right;
      const geo = new T.PlaneGeometry(hw, page.d), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      const m = new T.Mesh(geo, pageMat);
      m.rotation.x = -Math.PI / 2; m.position.x = (side * hw) / 2; m.receiveShadow = true; g.add(m);
      const block = new T.Mesh(new T.BoxGeometry(hw, 6, page.d), blockMat);
      block.position.set((side * hw) / 2, -3.05, 0); block.receiveShadow = true; g.add(block);
      const cover = new T.Mesh(new T.BoxGeometry(hw + 11, 3, page.d + 22), coverMat);
      cover.position.set(side * (hw / 2 + 5.5), -7.55, 0); cover.castShadow = true; cover.receiveShadow = true; g.add(cover);
      return m;
    });
    // 封面：書合起來時朝上，印著書名
    page.coverMat = new T.MeshLambertMaterial({ map: coverTexture() });
    const face = new T.Mesh(new T.PlaneGeometry(hw + 11, page.d + 22), page.coverMat);
    face.position.set(hw / 2 + 5.5, -9.08, 0);
    face.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
    right.add(face);
    const spine = new T.Mesh(new T.BoxGeometry(5, 9, page.d + 22), coverMat);
    spine.position.y = -4.6; scene.add(spine);
  }
  const coverTexture = () => texture(P.cover(document.title || '', App.t(site.name), page.w / 2 + 11, page.d + 22));

  // 書後方一層一層的紙雕背景：山丘、太陽、雲
  function buildBackdrop() {
    const back = -page.d / 2, w = page.w + 30;
    const sun = sheet(texture(P.sun()), 96, 96);
    sun.position.set(page.w * 0.2, 34, back - 16); pop(sun, 0, back - 16, { root: true, type: 'scale', extra: 0.2 });
    [['#5b7fa6', 96, 0.2, 0.6, -10, 0.16], [C.teal, 72, 0.17, 2.4, -4, 0.2], [C.leaf, 44, 0.13, 4.4, 2, 0.16]].forEach((h) => {
      const m = sheet(texture(P.hills(h[0], w, h[1], h[2], h[3], h[5])), w, h[1]);
      m.position.set(0, 0, back + h[4]); pop(m, 0, back + h[4], { root: true });
    });
    const cloudTex = texture(P.cloud());
    [[-0.34, 104, -6, 62], [0.02, 122, -13, 78], [0.38, 96, -2, 54], [-0.12, 78, 8, 40]].forEach((c) => {
      const pole = new T.Mesh(new T.BoxGeometry(0.9, c[1], 0.9).translate(0, c[1] / 2, 0), new T.MeshLambertMaterial({ color: 0xc9a877 }));
      pole.position.set(page.w * c[0], 0, back + c[2] - 0.6); pop(pole, 0, back + c[2], { root: true, type: 'grow', extra: 0.1 });
      const m = sheet(cloudTex, c[3], c[3] / 2);
      m.position.set(page.w * c[0], c[1], back + c[2]); pop(m, 0, back + c[2], { root: true, type: 'scale', extra: 0.3 });
    });
  }

  // 水邊立著一排水波
  function buildWater() {
    const tex = texture(P.wave());
    land.water.forEach((w) => {
      let carry = 9;
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
        while (carry < len) {
          const f = carry / len, p = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
          if (onPage(p, 10)) { const m = sheet(tex, 15, 5.4, { shadow: false }); m.position.set(p.x, 0, p.z + 1.5); pop(m, p.x, p.z); }
          carry += 21;
        }
        carry -= len;
      }
    });
  }

  function buildTrees() {
    const tex = {};
    ['round', 'round2', 'pine', 'bush'].forEach((kind) => { tex[kind] = texture(P.tree(kind)); });
    const placed = [];
    const put = (p, kind, size) => {
      const m = sheet(tex[kind], size * 0.7, size);
      m.position.set(p.x, 0, p.z); pop(m, p.x, p.z); placed.push(p);
    };
    // 真實資料：行道樹與單株的樹
    land.treeRows.forEach((row) => {
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1], b = row[i], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 8));
        for (let j = i === 1 ? 0 : 1; j <= n; j++) put({ x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n }, 'round2', 13);
      }
    });
    land.trees.forEach((p) => { if (onPage(p, 8)) put(p, 'round', 14); });
    (site.landmarks || []).forEach((l) => { placed.push(fromLngLat([l.lng, l.lat])); });

    // 裝飾：把空地種滿樹，避開建築、路、水、球場和書脊；校內密、校外疏
    const ROADW = { foot: 1.1, path: 2.2, street: 3.5, road: 5.5 };
    let seed = 11;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const free = (p) => {
      if (Math.abs(p.x) < 5 || !onPage(p, 12)) return false;
      if (feats.some((f) => inside(p, f.ring) || lineDist(p, f.ring, true) < 6)) return false;
      if (land.fields.concat(land.courts, land.ponds).some((f) => inside(p, f.pts) || lineDist(p, f.pts, true) < 8)) return false;
      if (land.roads.some((r) => lineDist(p, r.pts) < ROADW[r.kind] + 3.6)) return false;
      if (land.water.some((w) => lineDist(p, w.pts) < 10)) return false;
      return !placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 9.5);
    };
    let inCampus = 0, outside = 0;
    for (let i = 0; i < 1400 && inCampus + outside < 78; i++) {
      const p = { x: (rnd() - 0.5) * page.w, z: (rnd() - 0.5) * page.d }, r = rnd(), s = rnd();
      const campus = !land.boundary || inside(p, land.boundary);
      if (campus ? inCampus >= 60 : outside >= 18) continue;
      if (!free(p)) continue;
      if (r < 0.42) put(p, 'round', 12 + s * 5);
      else if (r < 0.72) put(p, 'round2', 12 + s * 5);
      else if (r < 0.9) put(p, 'pine', 14 + s * 5);
      else put(p, 'bush', 6.5 + s * 2);
      if (campus) inCampus++; else outside++;
    }
    // 地標樹：比較大，插著名字
    (site.landmarks || []).forEach((l) => {
      const p = fromLngLat([l.lng, l.lat]);
      if (!onPage(p, 8)) return;
      const m = sheet(tex.round, 14.7, 21);
      m.position.set(p.x, 0, p.z);
      addSign(App.t(l.name), '', p.x, 19, p.z - 1, pop(m, p.x, p.z), true, true);
    });
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

  // 紙盒：把建築的外框往上拉成一個盒子。牆面貼著一格一格的窗，屋頂是一張色紙，摺邊是米白色。
  // 未開拓時是半透明的描圖紙盒。
  function buildingBox(f, open) {
    const g = new T.Group();
    const shape = new T.Shape();
    f.ring.forEach((p, i) => (i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)));
    // 牆面貼圖沿著每一面牆的長度排，每面牆剛好放整數個開間；太短的牆不放窗
    const uv = {
      generateTopUV: (g0, v, a, b, c) => [a, b, c].map((i) => new T.Vector2(v[i * 3], v[i * 3 + 1])),
      generateSideWallUV: (g0, v, a, b, c, d) => {
        const n = Math.round(Math.hypot(v[b * 3] - v[a * 3], v[b * 3 + 1] - v[a * 3 + 1]) / 7), u = n ? n * 7 : 0.5;
        return [new T.Vector2(0, 1 - v[a * 3 + 2]), new T.Vector2(u, 1 - v[b * 3 + 2]), new T.Vector2(u, 1 - v[c * 3 + 2]), new T.Vector2(0, 1 - v[d * 3 + 2])];
      },
    };
    const geo = new T.ExtrudeGeometry(shape, { depth: f.bh, bevelEnabled: false, UVGenerator: uv });
    let mats;
    if (open) {
      const wall = texture(P.wallTile(f.paper)); wall.wrapS = wall.wrapT = T.RepeatWrapping; wall.repeat.set(1 / 7, -f.levels / f.bh);
      const roof = texture(P.roofTile(f.paper)); roof.wrapS = roof.wrapT = T.RepeatWrapping; roof.repeat.set(1 / 9, 1 / 9);
      mats = [new T.MeshLambertMaterial({ map: roof }), new T.MeshLambertMaterial({ map: wall })];
    } else {
      const ghost = new T.MeshLambertMaterial({ color: 0xe2f0f4, transparent: true, opacity: 0.5, depthWrite: false });
      mats = [ghost, ghost];
    }
    const box = new T.Mesh(geo, mats);
    box.rotation.x = -Math.PI / 2; box.castShadow = open; box.receiveShadow = open;
    g.add(box);
    const edges = new T.LineSegments(new T.EdgesGeometry(geo, 30), new T.LineBasicMaterial({ color: open ? 0xfffaf0 : 0xffffff }));
    edges.rotation.x = -Math.PI / 2; g.add(edges);
    if (open && inside(f.c, f.ring) && f.sw > 30) {                                // 屋頂上的小盒子
      const hut = new T.Mesh(new T.BoxGeometry(7, 4.5, 6), new T.MeshLambertMaterial({ color: 0xfffaf0 }));
      hut.position.set(f.c.x, f.bh + 2.25, f.c.z); hut.castShadow = true; g.add(hut);
    }
    return g;
  }
  function buildBuildings() {
    feats.filter((f) => f.featured).forEach((f) => {
      const open = !!visited[f.id];
      const p = pop(buildingBox(f, open), f.c.x, f.c.z, { type: 'grow' });
      const sign = addSign(f.name, f.en, f.c.x, f.bh + 2, f.c.z, p, open, false);
      const stamp = addSign('未開拓', '', f.c.x, f.bh * 0.5, f.c.z + 1, p, !open, true);
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
    // 紙底座：像紙娃娃的立牌，邊緣縫一圈紅線
    const c = P.makeCanvas(160, 160), ctx = c.getContext('2d');
    ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(80, 80, 80, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([13, 9]); ctx.lineWidth = 5; ctx.strokeStyle = C.coral; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(80, 80, 62, 0, Math.PI * 2); ctx.stroke();
    base = new T.Mesh(new T.CircleGeometry(7, 40), new T.MeshLambertMaterial({ map: texture(c) }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.3; base.receiveShadow = true;
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

  // ---------- 鏡頭 ----------
  function resize() {
    const w = canvas.clientWidth || 148, h = canvas.clientHeight || 148;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const half = Math.tan((camera.fov * Math.PI) / 360);
    fitDist = Math.max((page.w * 0.56) / (half * camera.aspect), (page.d * 0.72) / half);
  }
  // 「我附近」的鏡頭距離：大約看得到半本書
  const nearDist = () => Math.max(230, fitDist * 0.5);

  function placeCamera() {
    const ce = Math.cos(view.el);
    camera.position.set(view.tx + view.dist * Math.sin(view.az) * ce, view.dist * Math.sin(view.el), view.tz + view.dist * Math.cos(view.az) * ce);
    camera.lookAt(view.tx, 12, view.tz);
  }

  // 打開：書先合著，封面翻開，紙片從後往前一樣一樣立起來，最後鏡頭推近到小人身邊
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
      view.az = 0; view.el = 1.02 + (0.72 - 1.02) * a; view.dist = fitDist * (0.7 + 0.3 * a);
      view.tx = (-page.w / 4) * (1 - a); view.tz = page.d * 0.05;
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
        view.az = Math.max(-1, Math.min(1, view.az - dx * 0.006));
        view.el = Math.max(0.3, Math.min(1.3, view.el + dy * 0.005));
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
        if (mode === 'book') view.az = 0;
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
      page = { w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };

      feats = list.map((b) => {
        const ring = b.ring.slice(0, -1).map(fromLngLat);
        const xs = ring.map((p) => p.x);
        return Object.assign({}, b, {
          ring,
          c: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: ring.reduce((s, p) => s + p.z, 0) / ring.length },
          sw: Math.max(...xs) - Math.min(...xs),
          bh: Math.max(12, Math.min(46, b.h * 2)),                                // 紙盒高度，刻意誇張
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
      camera = new T.PerspectiveCamera(34, 1, 5, 6000);

      scene.add(new T.AmbientLight(0xffffff, 0.78));
      const sun = new T.DirectionalLight(0xfff2dd, 0.42);
      sun.position.set(-page.w * 0.5, 330, page.d * 0.9);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera, r = Math.max(page.w, page.d) * 0.78;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 10; sc.far = 1500;
      sun.shadow.bias = -0.0008;
      scene.add(sun);

      buildBook();
      buildBackdrop();
      buildWater();
      buildTrees();
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
        view.tx = me.x; view.tz = me.z; view.az = 0; view.el = 0.82; view.dist = 150;
      } else if (!(intro && intro.cam)) {
        const tx = mode === 'me' ? me.x : 0, tz = mode === 'me' ? me.z : page.d * 0.05;
        view.tx += (tx - view.tx) * 0.12; view.tz += (tz - view.tz) * 0.12;
        if (zoomTo != null) { view.dist += (zoomTo - view.dist) * 0.07; if (Math.abs(zoomTo - view.dist) < 1.5) zoomTo = null; }
      }
      placeCamera();

      // 名牌與小人永遠面向鏡頭；名牌離鏡頭越遠放得越大，維持可讀
      signs.forEach((s) => {
        const e = s.userData.pop.e;
        s.visible = isOpen && s.userData.on && e > 0;
        if (!s.visible) return;
        s.quaternion.copy(camera.quaternion);
        s.scale.setScalar(Math.max(0.25, Math.min(2.4, camera.position.distanceTo(s.position) * 0.0018)) * e);
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

    // 走近後，紙片從書頁上立起來
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
      drawStatic(); compose();
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
