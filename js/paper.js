// 等角插畫的圖案：人、樹、名牌、封面與建築立面，全部畫在 canvas 上。只負責畫圖，不碰 3D。
// 做法是平塗加細線：每個形狀填一個顏色、描一圈深色細線，不做陰影與漸層。
(function () {
  const C = {
    paper: '#f3eddc', card: '#fffdf6', ink: '#3a3340', coral: '#e0685c', teal: '#6f9484',
    mustard: '#eec65a', table: '#bfcdb9', brown: '#8a6250',
    leaf: '#c3d2b4', leafDark: '#3f6f5c', gold: '#e6c463',
    glass: '#dcebea', water: '#b5d9df',
    pink: '#f6b9b0', salmon: '#ee8f85', brick: '#8f2636', sage: '#b3c7ae', butter: '#f4dc8a',
    lilac: '#c0afdc', grey: '#a9b2b1', orange: '#e88d52', park: '#d8e1cb', street: '#f6cfc8',
    thread: '#c2323f', white: '#fbf8f1',
  };
  const FONT = '"Noto Sans TC", "PingFang TC", sans-serif';
  const SKIN = '#f7d6b5';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    return c;
  }

  // 顏色工具
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const lum = (hex) => { const c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; };

  // 畫圖工具：先用 ell / box / poly 描出形狀，再用 paper 平塗並描邊。line 是描邊的粗細，0 表示不描
  function kit(ctx, line) {
    const lw = line == null ? 4 : line;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    return {
      paper(color) {
        ctx.fillStyle = color; ctx.fill();
        if (lw) { ctx.strokeStyle = C.ink; ctx.lineWidth = lw; ctx.stroke(); }
      },
      flat(color) { ctx.fillStyle = color; ctx.fill(); },
      ell(x, y, rx, ry, r) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), r || 0, 0, Math.PI * 2); },
      box(x, y, w, h, r) {
        const q = Math.max(0, Math.min(r || 0, w / 2, h / 2));
        ctx.beginPath(); ctx.moveTo(x + q, y);
        ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
        ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
      },
      poly(points) {
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
      },
    };
  }

  // 整張圖的外圍再描一圈細線
  function outlined(art, r) {
    const sil = makeCanvas(art.width, art.height), sc = sil.getContext('2d');
    sc.drawImage(art, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = C.ink; sc.fillRect(0, 0, sil.width, sil.height);
    const out = makeCanvas(art.width, art.height), oc = out.getContext('2d');
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; oc.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
    oc.drawImage(art, 0, 0);
    return out;
  }

  // ---------- 走路的人 ----------
  // 戴貝雷帽、圍圍巾、胸前掛著相機，面向右邊。
  // pose：front、back 是兩條腿的擺動角度，lift 是前腳抬起的高度，arm 是手臂，tail 是圍巾尾巴揚起的程度（0 到 1），blink 是閉眼。
  function person(input) {
    const pose = Object.assign({ front: 0, back: 0, lift: 0, arm: 0, tail: 0, blink: false }, input);
    const art = makeCanvas(300, 540), ctx = art.getContext('2d'), k = kit(ctx, 5);
    const sleeve = mix(C.coral, C.ink, 0.14);
    ctx.translate(-35, 8);

    const arm = (x, angle) => {
      ctx.save(); ctx.translate(x, 290); ctx.rotate(angle);
      k.ell(0, 86, 12, 12); k.paper(SKIN);
      k.box(-16, 0, 32, 82, 16); k.paper(sleeve);
      ctx.restore();
    };
    const leg = (hip, angle, lift) => {
      ctx.save(); ctx.translate(hip, 404); ctx.rotate(angle);
      k.box(-16, 0, 32, 70 - lift, 10); k.paper(C.ink);
      k.box(-20, 58 - lift, 54, 36, 15); k.paper(C.brown);
      ctx.strokeStyle = C.card; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-12, 87 - lift); ctx.lineTo(26, 87 - lift); ctx.stroke();
      ctx.restore();
    };

    arm(264, -pose.arm * 0.9);                                                 // 後面的手

    const t = pose.tail, A = [92, 300 - t * 36], B = [116, 318 - t * 32];       // 圍巾尾巴，走路時往後飄
    ctx.beginPath(); ctx.moveTo(172, 256);
    ctx.quadraticCurveTo(120, 258 - t * 12, A[0], A[1]); ctx.lineTo(B[0], B[1]);
    ctx.quadraticCurveTo(134, 286 - t * 14, 178, 284); ctx.closePath(); k.paper(C.teal);
    ctx.strokeStyle = C.card; ctx.lineWidth = 5;
    [0.16, 0.32].forEach((f) => {
      ctx.beginPath(); ctx.moveTo(A[0] + (172 - A[0]) * f, A[1] + (258 - A[1]) * f);
      ctx.lineTo(B[0] + (178 - B[0]) * f, B[1] + (284 - B[1]) * f); ctx.stroke();
    });

    leg(168, pose.back, 0); leg(222, pose.front, pose.lift);

    ctx.beginPath(); ctx.moveTo(166, 262);                                       // 外套
    ctx.quadraticCurveTo(132, 268, 124, 312); ctx.lineTo(106, 400);
    ctx.quadraticCurveTo(104, 420, 126, 420); ctx.lineTo(276, 420);
    ctx.quadraticCurveTo(298, 420, 296, 400); ctx.lineTo(280, 312);
    ctx.quadraticCurveTo(274, 268, 240, 262); ctx.closePath(); k.paper(C.coral);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(256, 276); ctx.lineTo(270, 418); ctx.stroke();
    k.ell(246, 298, 6, 6); k.flat(C.card); k.ell(258, 394, 6, 6); k.flat(C.card);

    k.box(152, 246, 106, 36, 18); k.paper(C.teal);                               // 圍巾

    k.ell(180, 160, 108, 96); k.paper(C.ink);                                    // 後面的頭髮
    k.ell(208, 172, 92, 88); k.paper(SKIN);                                      // 臉
    const eye = (x, rx, ry) => {
      if (pose.blink) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x, 180, rx, 0.14 * Math.PI, 0.86 * Math.PI); ctx.stroke();
        return;
      }
      k.ell(x, 184, rx, ry); k.flat(C.ink);
      k.ell(x + rx * 0.3, 184 - ry * 0.36, rx * 0.4, rx * 0.4); k.flat('#ffffff');
      k.ell(x - rx * 0.32, 184 + ry * 0.42, rx * 0.2, rx * 0.2); k.flat('#ffffff');
    };
    eye(214, 13, 17); eye(266, 11, 16);
    k.ell(194, 214, 17, 10); k.flat('rgba(238,143,133,0.6)'); k.ell(284, 212, 12, 9); k.flat('rgba(238,143,133,0.6)');
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(242, 208, 10, 0.14 * Math.PI, 0.86 * Math.PI); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(78, 196);                                        // 瀏海
    ctx.bezierCurveTo(66, 96, 132, 56, 198, 56);
    ctx.bezierCurveTo(262, 56, 312, 100, 304, 168);
    ctx.quadraticCurveTo(300, 128, 262, 120);
    ctx.quadraticCurveTo(250, 152, 214, 146);
    ctx.quadraticCurveTo(196, 162, 164, 140);
    ctx.quadraticCurveTo(140, 170, 128, 228);
    ctx.quadraticCurveTo(100, 226, 78, 196); ctx.closePath(); k.flat(C.ink);

    k.ell(150, 22, 6, 11, -0.3); k.paper(C.mustard);                             // 貝雷帽
    k.ell(172, 66, 100, 44, -0.16); k.paper(C.mustard);

    ctx.strokeStyle = C.ink; ctx.lineWidth = 5;                                  // 相機與背帶
    ctx.beginPath(); ctx.moveTo(182, 278); ctx.lineTo(197, 326); ctx.moveTo(238, 278); ctx.lineTo(241, 326); ctx.stroke();
    k.box(204, 314, 24, 16, 5); k.paper(C.card);
    k.box(188, 324, 62, 44, 9); k.paper(C.card);
    k.ell(219, 346, 15, 15); k.flat(C.ink);
    k.ell(219, 346, 9, 9); k.flat(C.lilac);
    k.ell(215, 342, 3.2, 3.2); k.flat('#ffffff');
    k.box(236, 330, 9, 6, 2); k.flat(C.coral);

    arm(148, pose.arm);                                                         // 前面的手
    return outlined(art, 2.5);
  }

  // 路上的小人：只是幾個色塊。i 決定衣服與頭髮的顏色
  function passerby(i) {
    const c = makeCanvas(64, 128), ctx = c.getContext('2d'), k = kit(ctx, 3.5);
    const coat = [C.salmon, C.butter, C.lilac, C.brick, C.teal, C.card][i % 6];
    k.box(21, 82, 9, 40, 3); k.paper(C.ink); k.box(34, 82, 9, 40, 3); k.paper(C.ink);
    k.box(15, 40, 34, 52, 13); k.paper(coat);
    k.ell(32, 24, 15, 15); k.paper(SKIN);
    ctx.beginPath(); ctx.arc(32, 22, 15, Math.PI, 0); ctx.closePath(); k.paper(i % 2 ? C.ink : C.brown);
    return c;
  }

  // ---------- 名牌 ----------
  function sign(name, en, small) {
    const size = small ? 34 : 46;
    const w = Math.max(small ? 130 : 190, name.length * (size + 4) + 56), h = small ? 150 : 190, bh = small ? 70 : 100;
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = C.ink; ctx.fillRect(w / 2 - 2.5, bh - 4, 5, h - bh + 4);         // 桿子
    ctx.fillStyle = small ? C.card : C.white; ctx.fillRect(4, 4, w - 8, bh);
    ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.strokeRect(6, 6, w - 12, bh - 4);
    ctx.textAlign = 'center'; ctx.fillStyle = small ? C.brick : C.ink;
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.fillText(name, w / 2, small ? 50 : en ? 58 : 68);
    if (en && !small) { ctx.fillStyle = C.brick; ctx.font = '500 15px "DM Mono", monospace'; ctx.fillText(en.toUpperCase(), w / 2, 84); }
    return c;
  }

  // ---------- 樹 ----------
  // 細樹幹上頂著幾團葉子。kind：dark 深綠、pale 淺綠、gold 黃、bush 灌木
  function tree(kind) {
    const art = makeCanvas(190, 270), ctx = art.getContext('2d');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const tone = { dark: [C.leafDark, '#2c5444'], pale: [C.leaf, '#9db490'], gold: [C.gold, '#c39f3f'], bush: [C.leafDark, '#2c5444'] }[kind] || [C.leafDark, '#2c5444'];
    const bush = kind === 'bush';
    const blobs = bush
      ? [[58, 228, 40, 28], [130, 232, 40, 26], [94, 212, 46, 34]]
      : [[95, 106, 58, 50], [52, 98, 36, 32], [138, 102, 36, 30], [74, 58, 38, 32], [120, 54, 34, 28], [95, 142, 44, 26]];
    if (!bush) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 7; ctx.beginPath();
      ctx.moveTo(95, 262); ctx.lineTo(95, 150); ctx.moveTo(95, 196); ctx.lineTo(68, 164); ctx.moveTo(95, 184); ctx.lineTo(122, 158); ctx.stroke();
    }
    ctx.beginPath();
    blobs.forEach((b) => { ctx.moveTo(b[0] + b[2], b[1]); ctx.ellipse(b[0], b[1], b[2], b[3], 0, 0, Math.PI * 2); });
    ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.stroke();                  // 外圍的線，一半會被葉子蓋住
    ctx.fillStyle = tone[0]; ctx.fill();
    ctx.strokeStyle = tone[1]; ctx.lineWidth = 4;                              // 葉子的筆觸
    (bush ? [[70, 222], [104, 206], [132, 228]] : [[70, 92], [112, 76], [96, 122], [134, 106], [56, 108], [84, 54], [118, 48]])
      .forEach((m) => { ctx.beginPath(); ctx.arc(m[0], m[1], 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); });
    return art;
  }

  // ---------- 封面 ----------
  // w、h 是封面的寬高比（公尺即可）
  function cover(title, subtitle, w, h) {
    const W = 900, H = Math.round((900 * h) / w);
    const c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = C.brick; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < H; y += 56) ctx.fillRect(0, y, W, 28);
    ctx.strokeStyle = C.pink; ctx.lineWidth = 5; ctx.strokeRect(36, 36, W - 72, H - 72);
    const bw = W * 0.66, bh = Math.min(H * 0.34, 520), bx = (W - bw) / 2, by = H * 0.3;
    ctx.fillStyle = C.card; ctx.fillRect(bx, by, bw, bh);
    ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.strokeRect(bx, by, bw, bh);
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
    ctx.font = '900 ' + bw * 0.24 + 'px ' + FONT; ctx.fillText(title, W / 2, by + bh * 0.52);
    ctx.fillStyle = C.salmon; ctx.fillRect(bx + bw * 0.2, by + bh * 0.62, bw * 0.6, 8);
    ctx.fillStyle = C.brick; ctx.font = '700 ' + bw * 0.075 + 'px ' + FONT; ctx.fillText(subtitle, W / 2, by + bh * 0.82);
    return c;
  }

  // ---------- 建築立面 ----------
  // 一張圖是一個開間寬、整棟樓高，會沿著牆面橫向重複。最下面一層是比較深的基座與大開口。
  // spec：color 牆色、base 基座色、pane 窗色、trim 陽台色、windows 窗型（grid、tall、arch、band、balcony、none）
  function facade(spec, levels) {
    const s = Object.assign({ color: C.sage, windows: 'grid' }, spec);
    const n = Math.max(1, levels), H = n <= 1 ? 128 : n <= 2 ? 256 : n <= 5 ? 512 : 1024, lh = H / n;
    const c = makeCanvas(128, H), ctx = c.getContext('2d'), k = kit(ctx, 3);
    const pane = s.pane || (lum(s.color) < 0.45 ? mix(s.color, '#fff1df', 0.85) : mix(s.color, '#ffffff', 0.62));
    const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    ctx.fillStyle = s.color; ctx.fillRect(0, 0, 128, H);
    if (s.windows === 'none') return c;

    for (let i = 0; i < n; i++) {
      const y0 = H - (i + 1) * lh;
      if (i === 0 && n > 1) {                                                    // 一樓
        ctx.fillStyle = s.base || mix(s.color, C.ink, 0.2); ctx.fillRect(0, y0, 128, lh);
        k.box(16, y0 + lh * 0.26, 96, lh * 0.74 + 4, 0); k.paper(pane);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; line(64, y0 + lh * 0.26, 64, H);
        ctx.lineWidth = 3; line(0, y0, 128, y0);
        continue;
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      if (s.windows === 'band') {                                                // 橫帶窗：連成一整條
        const y = y0 + lh * 0.3, h = lh * 0.42;
        ctx.fillStyle = pane; ctx.fillRect(0, y, 128, h);
        ctx.lineWidth = 3; line(0, y, 128, y); line(0, y + h, 128, y + h);
        ctx.lineWidth = 2.5; [16, 48, 80, 112].forEach((x) => line(x, y, x, y + h));
      } else if (s.windows === 'arch') {
        const x = 36, w = 56, y = y0 + lh * 0.2, h = lh * 0.62;
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
        k.paper(pane);
        ctx.lineWidth = 2.5; line(x + w / 2, y + 4, x + w / 2, y + h);
      } else if (s.windows === 'balcony') {
        k.box(22, y0 + lh * 0.2, 44, lh * 0.64, 0); k.paper(pane);
        k.box(80, y0 + lh * 0.28, 30, lh * 0.36, 0); k.paper(pane);
        k.box(10, y0 + lh * 0.58, 68, lh * 0.3, 0); k.paper(s.trim || mix(s.color, '#ffffff', 0.5));     // 陽台
        ctx.lineWidth = 2; [27, 44, 61].forEach((x) => line(x, y0 + lh * 0.62, x, y0 + lh * 0.86));
      } else {
        const tall = s.windows === 'tall', w = tall ? 30 : 40, y = y0 + lh * (tall ? 0.16 : 0.24), h = lh * (tall ? 0.7 : 0.5);
        [32 - w / 2, 96 - w / 2].forEach((x) => {
          k.box(x, y, w, h, 0); k.paper(pane);
          ctx.lineWidth = 2;
          if (tall) line(x, y + h * 0.4, x + w, y + h * 0.4); else { line(x + w / 2, y, x + w / 2, y + h); line(x, y + h / 2, x + w, y + h / 2); }
        });
      }
    }
    return c;
  }

  App.paper = { C, mix, makeCanvas, person, passerby, sign, tree, cover, facade };
})();
