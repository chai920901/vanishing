// 紙雕圖案：人、房子、樹、背景、封面，全部畫在 canvas 上。只負責畫圖，不碰 3D。
// 做法是一層一層疊色紙：每個部位填色時帶一點陰影，最後整個剪影往外擴一圈米白色當底紙。
(function () {
  const C = {
    paper: '#f4ead6', card: '#fffaf0', ink: '#24323f', coral: '#d9533b', teal: '#3f8f8a',
    mustard: '#e2a63b', table: '#17324a', brown: '#8a5a3c', leaf: '#6fa37a', leafDark: '#4f8f6a',
    glass: '#cfe3e6', lit: '#f7dc8c', water: '#7fbccd',
  };
  const FONT = '"Noto Sans TC", "PingFang TC", sans-serif';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    return c;
  }

  // 網點：印刷品的感覺
  let tile = null;
  function dotTile() {
    if (tile) return tile;
    tile = makeCanvas(6, 12);
    const t = tile.getContext('2d');
    t.fillStyle = 'rgba(36,50,63,0.2)'; t.fillRect(4, 2, 1.7, 1.7); t.fillRect(1, 8, 1.7, 1.7);
    return tile;
  }
  function halftone(ctx, w, h, alpha) {
    ctx.fillStyle = 'rgba(36,50,63,' + alpha + ')';
    for (let y = 2; y < h; y += 6) for (let x = (y / 6) % 2 ? 2 : 5; x < w; x += 6) ctx.fillRect(x, y, 1.6, 1.6);
  }

  // 畫圖工具：先用 ell / box / poly 描出形狀，再用 paper 貼上一層色紙
  function kit(ctx) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const pattern = ctx.createPattern(dotTile(), 'repeat');
    return {
      paper(color, withDots) {
        ctx.save();
        ctx.shadowColor = 'rgba(36,50,63,0.32)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
        ctx.fillStyle = color; ctx.fill();
        ctx.restore();
        if (withDots) { ctx.fillStyle = pattern; ctx.fill(); }
      },
      flat(color) { ctx.fillStyle = color; ctx.fill(); },
      // 有厚度的線條也當成一層紙
      band(color, width) {
        ctx.save();
        ctx.shadowColor = 'rgba(36,50,63,0.32)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        ctx.restore();
      },
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

  // 把畫好的東西變成單色剪影
  function silhouette(art, color) {
    const s = makeCanvas(art.width, art.height), c = s.getContext('2d');
    c.drawImage(art, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, s.width, s.height);
    return s;
  }
  // 底紙：把剪影往外擴 r 像素
  function grow(target, sil, r) {
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; target.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; target.drawImage(sil, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); }
  }
  function backed(art, r) {
    const out = makeCanvas(art.width, art.height), oc = out.getContext('2d');
    grow(oc, silhouette(art, C.card), r || 11);
    oc.drawImage(art, 0, 0);
    return out;
  }

  // ---------- 走路的人 ----------
  // 紙娃娃：戴貝雷帽、圍圍巾、胸前掛著相機，面向右邊。
  // pose：front、back 是兩條腿的擺動角度，lift 是前腳抬起的高度，arm 是手臂，tail 是圍巾尾巴揚起的程度（0 到 1），blink 是閉眼。
  function person(input) {
    const pose = Object.assign({ front: 0, back: 0, lift: 0, arm: 0, tail: 0, blink: false }, input);
    const SKIN = '#f7d6b5';
    const art = makeCanvas(300, 540), ctx = art.getContext('2d'), k = kit(ctx);
    ctx.translate(-35, 8);

    const arm = (x, angle, color) => {
      ctx.save(); ctx.translate(x, 290); ctx.rotate(angle);
      k.ell(0, 86, 12, 12); k.paper(SKIN);
      k.box(-16, 0, 32, 82, 16); k.paper(color, true);
      ctx.restore();
    };
    const leg = (hip, angle, lift) => {
      ctx.save(); ctx.translate(hip, 404); ctx.rotate(angle);
      k.box(-16, 0, 32, 70 - lift, 10); k.paper(C.ink);
      k.box(-20, 58 - lift, 54, 36, 15); k.paper(C.brown, true);
      ctx.strokeStyle = C.card; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-12, 87 - lift); ctx.lineTo(26, 87 - lift); ctx.stroke();
      ctx.restore();
    };

    arm(264, -pose.arm * 0.9, '#b8442f');                                     // 後面的手

    const t = pose.tail, A = [92, 300 - t * 36], B = [116, 318 - t * 32];       // 圍巾尾巴，走路時往後飄
    ctx.beginPath(); ctx.moveTo(172, 256);
    ctx.quadraticCurveTo(120, 258 - t * 12, A[0], A[1]); ctx.lineTo(B[0], B[1]);
    ctx.quadraticCurveTo(134, 286 - t * 14, 178, 284); ctx.closePath(); k.paper(C.teal, true);
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
    ctx.quadraticCurveTo(274, 268, 240, 262); ctx.closePath(); k.paper(C.coral, true);
    ctx.strokeStyle = 'rgba(36,50,63,0.22)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(256, 276); ctx.lineTo(270, 418); ctx.stroke();
    k.ell(246, 298, 6, 6); k.paper(C.card); k.ell(258, 394, 6, 6); k.paper(C.card);

    k.box(152, 246, 106, 36, 18); k.paper(C.teal, true);                         // 圍巾

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
    k.ell(194, 214, 17, 10); k.flat('rgba(217,83,59,0.4)'); k.ell(284, 212, 12, 9); k.flat('rgba(217,83,59,0.4)');
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(242, 208, 10, 0.14 * Math.PI, 0.86 * Math.PI); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(78, 196);                                        // 瀏海
    ctx.bezierCurveTo(66, 96, 132, 56, 198, 56);
    ctx.bezierCurveTo(262, 56, 312, 100, 304, 168);
    ctx.quadraticCurveTo(300, 128, 262, 120);
    ctx.quadraticCurveTo(250, 152, 214, 146);
    ctx.quadraticCurveTo(196, 162, 164, 140);
    ctx.quadraticCurveTo(140, 170, 128, 228);
    ctx.quadraticCurveTo(100, 226, 78, 196); ctx.closePath(); k.paper(C.ink);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(110, 168); ctx.quadraticCurveTo(116, 136, 142, 122); ctx.stroke();

    k.ell(150, 22, 6, 11, -0.3); k.paper(C.mustard);                             // 貝雷帽
    k.ell(172, 66, 100, 44, -0.16); k.paper(C.mustard, true);
    ctx.strokeStyle = 'rgba(255,250,240,0.5)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(104, 58); ctx.quadraticCurveTo(128, 34, 168, 30); ctx.stroke();

    ctx.strokeStyle = C.ink; ctx.lineWidth = 5;                                  // 相機與背帶
    ctx.beginPath(); ctx.moveTo(182, 278); ctx.lineTo(197, 326); ctx.moveTo(238, 278); ctx.lineTo(241, 326); ctx.stroke();
    k.box(204, 314, 24, 16, 5); k.paper(C.card);
    k.box(188, 324, 62, 44, 9); k.paper(C.card);
    k.ell(219, 346, 15, 15); k.flat(C.ink);
    k.ell(219, 346, 9, 9); k.flat(C.teal);
    k.ell(215, 342, 3.2, 3.2); k.flat('#ffffff');
    k.box(236, 330, 9, 6, 2); k.flat(C.coral);

    arm(148, pose.arm, '#c4472f');                                              // 前面的手
    return backed(art, 11);
  }

  // ---------- 房子 ----------
  // spec 由場域包指定，從下面的零件裡挑：
  //   shape   外形：block 平頂、stepped 高低兩棟、gable 山牆、hip 斜屋頂、arch 拱頂、saw 鋸齒屋頂、gate 校門
  //   windows 窗：grid 格子窗、tall 長窗、arch 拱窗、band 橫帶窗、balcony 陽台
  //   door    門：plain、awning 遮雨棚、columns 門廊列柱
  //   extras  其他：clock 鐘、tank 水塔、antenna 天線、flag 旗、bushes 灌木、note 音符招牌、palette 調色盤招牌
  //   plate   校門門牌上的字
  // wm、hm 是紙片的寬與高（公尺）；open 為 false 時畫成未開拓的描圖紙。
  function building(spec, wm, hm, open) {
    const PX = 9, M = 18;
    const W = Math.round(wm * PX) + M * 2, H = Math.round(hm * PX) + M * 2;
    const art = makeCanvas(W, H), ctx = art.getContext('2d'), k = kit(ctx);
    const s = Object.assign({ shape: 'block', color: C.teal, roof: C.ink, windows: 'grid', door: 'plain', extras: [] }, spec);
    const has = (e) => s.extras.indexOf(e) >= 0;
    const x0 = M, x1 = W - M, yb = H - M, yt = M, bw = x1 - x0, bh = yb - yt, cx = W / 2;
    let seed = Math.round(wm * 7 + hm * 13) + s.shape.length * 31;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const headroom = has('tank') || has('antenna') || has('flag') ? Math.min(66, bh * 0.2) : 4;   // 留給屋頂上的東西

    // 一塊牆面，底部有一條深色基座
    const mass = (x, y, w, h, shade) => {
      k.box(x, y, w, h, 4); k.paper(s.color, true);
      if (shade) { ctx.fillStyle = 'rgba(36,50,63,' + shade + ')'; ctx.fill(); }
      ctx.fillStyle = 'rgba(36,50,63,0.17)'; ctx.fillRect(x, y + h - 12, w, 12);
    };
    const slab = (x, y, w) => { k.box(x - 7, y, w + 14, 15, 4); k.paper(s.roof); };

    const pane = (x, y, w, h, style) => {
      const lit = rnd() < 0.2;
      const shape = (i) => {
        if (style === 'arch') {
          const r = w / 2 - i;
          ctx.beginPath(); ctx.moveTo(x + i, y + h - i); ctx.lineTo(x + i, y + w / 2);
          ctx.arc(x + w / 2, y + w / 2, r, Math.PI, 0); ctx.lineTo(x + w - i, y + h - i); ctx.closePath();
        } else k.box(x + i, y + i, w - i * 2, h - i * 2, 3);
      };
      shape(0); k.paper(C.card);                                   // 窗框
      shape(4); k.flat(lit ? C.lit : C.glass);                     // 玻璃
      ctx.strokeStyle = C.card; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 5); ctx.lineTo(x + w / 2, y + h - 4);
      if (style !== 'band') { ctx.moveTo(x + 4, y + h * 0.48); ctx.lineTo(x + w - 4, y + h * 0.48); }
      else { ctx.moveTo(x + w * 0.25, y + 5); ctx.lineTo(x + w * 0.25, y + h - 4); ctx.moveTo(x + w * 0.75, y + 5); ctx.lineTo(x + w * 0.75, y + h - 4); }
      ctx.stroke();
      k.box(x - 4, y + h - 3, w + 8, 7, 3); k.paper(C.card);       // 窗台
      if (style === 'balcony') {
        k.box(x - 7, y + h * 0.6, w + 14, h * 0.48, 3); k.paper(s.roof);
        ctx.strokeStyle = 'rgba(255,250,240,0.5)'; ctx.lineWidth = 2;
        for (let q = 1; q < 5; q++) { const px = x - 7 + ((w + 14) * q) / 5; ctx.beginPath(); ctx.moveTo(px, y + h * 0.68); ctx.lineTo(px, y + h * 1.02); ctx.stroke(); }
      }
    };
    // 在一塊區域裡排滿窗戶；doorX 有值時，最下面一排會避開門的位置
    const windows = (x, y, w, h, style, doorX) => {
      if (w < 40 || h < 44) return;
      const cw = style === 'tall' ? 52 : style === 'band' ? 108 : 60, ch = style === 'tall' ? 98 : style === 'band' ? 56 : 66;
      const cols = Math.max(1, Math.round(w / cw)), rows = Math.max(1, Math.round(h / ch));
      const gx = w / cols, gy = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const wx = x + gx * c + gx * 0.2, wy = y + gy * r + gy * 0.14, ww = gx * 0.6, wh = Math.min(gy * 0.64, ww * 2.2);
        if (doorX != null && r === rows - 1 && Math.abs(wx + ww / 2 - doorX) < Math.max(52, gx * 0.72)) continue;
        pane(wx, wy, ww, wh, style);
      }
    };
    // 一面牆：上面幾層是窗，最下面一層是門和兩側的窗
    const facade = (x, y, w, h, doorX) => {
      windows(x + 12, y + 16, w - 24, h - 16 - 96, s.windows);
      windows(x + 12, yb - 92, w - 24, 78, s.windows === 'balcony' ? 'grid' : s.windows, doorX);
    };

    const door = (dx) => {
      const dw = 44, dh = 70;
      k.box(dx - dw / 2 - 5, yb - dh - 5, dw + 10, dh + 5, 5); k.paper(C.card);
      k.box(dx - dw / 2, yb - dh, dw, dh, 3); k.flat('#6b4a3a');
      ctx.strokeStyle = 'rgba(255,250,240,0.6)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(dx, yb - dh + 4); ctx.lineTo(dx, yb - 2); ctx.stroke();
      k.ell(dx - 6, yb - dh * 0.45, 2.6, 2.6); k.flat(C.mustard); k.ell(dx + 6, yb - dh * 0.45, 2.6, 2.6); k.flat(C.mustard);
      if (s.door === 'awning') {
        const aw = dw * 2.2, ay = yb - dh - 30;
        k.poly([[dx - aw / 2 + 8, ay], [dx + aw / 2 - 8, ay], [dx + aw / 2, ay + 24], [dx - aw / 2, ay + 24]]); k.paper(C.coral);
        ctx.save(); ctx.clip(); ctx.fillStyle = C.card;
        for (let q = 1; q < 7; q += 2) ctx.fillRect(dx - aw / 2 + (aw * q) / 7, ay - 2, aw / 7, 30);
        ctx.restore();
      }
      if (s.door === 'columns') {
        const pw = Math.min(bw * 0.5, 210), px = dx - pw / 2, top = yb - dh - 44;
        for (let q = 0; q < 4; q++) { k.box(px + (pw * q) / 3 - 7, top + 12, 14, yb - top - 18, 3); k.paper(C.card); }
        k.box(px - 12, top, pw + 24, 15, 3); k.paper(C.card);
        k.poly([[px - 6, top + 1], [dx, top - 32], [px + pw + 6, top + 1]]); k.paper(C.card);
        k.ell(dx, top - 9, 6, 6); k.flat(s.color);
      }
      k.box(dx - dw, yb - 7, dw * 2, 9, 3); k.paper('#e3d6ba');     // 台階
    };

    const roofStuff = (x, y, w) => {
      if (has('tank')) {
        const tx = x + w * 0.66;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx - 12, y + 2); ctx.lineTo(tx - 12, y - 20); ctx.moveTo(tx + 12, y + 2); ctx.lineTo(tx + 12, y - 20); ctx.stroke();
        k.box(tx - 22, y - 52, 44, 34, 8); k.paper('#b9c9cf', true);
        k.box(tx - 25, y - 57, 50, 9, 4); k.paper(C.card);
      }
      if (has('antenna')) {
        const ax = x + w * 0.24;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(ax, y + 2); ctx.lineTo(ax, y - 50); ctx.moveTo(ax - 12, y - 36); ctx.lineTo(ax + 12, y - 36); ctx.moveTo(ax - 8, y - 24); ctx.lineTo(ax + 8, y - 24); ctx.stroke();
        k.ell(ax, y - 52, 4, 4); k.flat(C.coral);
      }
      if (has('flag')) {
        const fx = x + w * 0.5;
        ctx.strokeStyle = '#c9a877'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx, y + 2); ctx.lineTo(fx, y - 58); ctx.stroke();
        k.poly([[fx + 2, y - 58], [fx + 40, y - 47], [fx + 2, y - 36]]); k.paper(C.coral);
      }
    };
    const clock = (x, y, r) => {
      k.ell(x, y, r, r); k.paper(C.card);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.6); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.12); ctx.stroke();
      k.ell(x, y, 2.6, 2.6); k.flat(C.coral);
    };
    const badge = (x, y) => {
      if (!has('note') && !has('palette')) return;
      k.ell(x, y, 21, 21); k.paper(C.card);
      if (has('note')) {
        k.ell(x - 5, y + 8, 6.5, 4.8, -0.3); k.flat(C.ink);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x, y - 11); ctx.lineTo(x + 9, y - 7); ctx.stroke();
      } else {
        k.ell(x, y + 1, 14, 11); k.flat('#c9a877');
        [[-6, -2, C.coral], [1, -5, C.teal], [7, 0, C.mustard], [-2, 5, C.card]].forEach((d) => { k.ell(x + d[0], y + d[1], 2.8, 2.8); k.flat(d[2]); });
      }
    };

    if (s.shape === 'gate') {
      const pw = Math.max(40, bw * 0.2), top = yt + bh * 0.22, beamY = top + bh * 0.08, beamH = Math.max(34, bh * 0.2);
      k.box(x0 + pw * 0.4, beamY, bw - pw * 0.8, beamH, 6); k.paper(s.roof);                 // 橫樑
      k.box(x0 + pw + 6, beamY + 6, bw - pw * 2 - 12, beamH - 12, 4); k.paper(C.card);       // 門牌
      if (s.plate) {
        ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + Math.min(beamH - 18, (bw - pw * 2 - 22) / s.plate.length) + 'px ' + FONT;
        ctx.fillText(s.plate, cx, beamY + beamH / 2 + 1);
      }
      [x0, x1 - pw].forEach((px) => {                                                         // 兩根門柱
        mass(px, top, pw, yb - top);
        k.box(px + 8, top + 22, pw - 16, (yb - top) * 0.46, 4); k.flat('rgba(255,250,240,0.22)');
        k.box(px - 6, top - 10, pw + 12, 16, 4); k.paper(s.roof);
        k.ell(px + pw / 2, top - 24, 13, 13); k.paper(C.mustard);
      });
    } else if (s.shape === 'gable') {
      const eave = yt + bh * 0.36;
      k.poly([[x0 + 14, yb], [x0 + 14, eave], [cx, yt + 18], [x1 - 14, eave], [x1 - 14, yb]]); k.paper(s.color, true);   // 牆身與山牆
      ctx.fillStyle = 'rgba(36,50,63,0.17)'; ctx.fillRect(x0 + 14, yb - 12, bw - 28, 12);
      ctx.save(); ctx.lineJoin = 'miter';
      ctx.beginPath(); ctx.moveTo(x0 + 2, eave + 9); ctx.lineTo(cx, yt + 14); ctx.lineTo(x1 - 2, eave + 9); k.band(s.roof, 21);  // 屋頂
      ctx.restore();
      const r = Math.min(27, (eave - yt) * 0.3);
      if (has('clock')) clock(cx, yt + (eave - yt) * 0.7, r);
      else { k.ell(cx, yt + (eave - yt) * 0.7, r, r); k.paper(C.card); k.ell(cx, yt + (eave - yt) * 0.7, r - 5, r - 5); k.flat(C.glass); }
      facade(x0 + 14, eave + 6, bw - 28, yb - eave - 6, cx);
      door(cx); badge(cx + 60, yb - 122);
    } else if (s.shape === 'hip') {
      const eave = yt + bh * 0.34;
      mass(x0 + 12, eave - 6, bw - 24, yb - eave + 6);
      k.poly([[x0 - 2, eave + 5], [x0 + bw * 0.14, yt + 6], [x1 - bw * 0.14, yt + 6], [x1 + 2, eave + 5]]); k.paper(s.roof, true);
      ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,250,240,0.2)'; ctx.lineWidth = 2.5;      // 瓦片的橫線
      for (let y = yt + 26; y < eave; y += 20) { ctx.beginPath(); ctx.moveTo(x0 - 4, y); ctx.lineTo(x1 + 4, y); ctx.stroke(); }
      ctx.restore();
      k.box(x0 + bw * 0.14 - 6, yt + 1, bw * 0.72 + 12, 10, 4); k.paper(C.card);                    // 屋脊
      k.box(x0 - 5, eave + 2, bw + 10, 9, 3); k.paper(C.card);                                      // 屋簷
      if (has('clock')) clock(cx, yt + (eave - yt) * 0.56, Math.min(24, (eave - yt) * 0.3));
      facade(x0 + 12, eave + 10, bw - 24, yb - eave - 10, cx);
      door(cx); badge(cx + 60, yb - 122);
    } else if (s.shape === 'arch') {
      const spring = yt + bh * 0.42;
      mass(x0 + 10, spring - 4, bw - 20, yb - spring + 4);
      ctx.beginPath(); ctx.moveTo(x0 - 2, spring + 6);
      ctx.bezierCurveTo(x0 + bw * 0.12, yt - bh * 0.1, x1 - bw * 0.12, yt - bh * 0.1, x1 + 2, spring + 6);
      ctx.closePath(); k.paper(s.roof, true);                                                        // 拱頂
      const rx = Math.min(bw * 0.2, 100), ry = Math.min((spring - yt) * 0.62, rx), fy = spring - 2;
      ctx.beginPath(); ctx.ellipse(cx, fy, rx, ry, 0, Math.PI, 0); ctx.closePath(); k.paper(C.card);  // 半圓窗
      ctx.beginPath(); ctx.ellipse(cx, fy - 3, rx - 6, ry - 6, 0, Math.PI, 0); ctx.closePath(); k.flat(C.glass);
      ctx.strokeStyle = C.card; ctx.lineWidth = 3; ctx.beginPath();
      [0.25, 0.5, 0.75].forEach((f) => { const a = Math.PI * (1 + f); ctx.moveTo(cx, fy - 3); ctx.lineTo(cx + Math.cos(a) * (rx - 6), fy - 3 + Math.sin(a) * (ry - 6)); });
      ctx.stroke();
      k.box(x0 - 5, spring + 2, bw + 10, 9, 3); k.paper(C.card);
      facade(x0 + 10, spring + 10, bw - 20, yb - spring - 10, cx);
      door(cx); badge(cx + 60, yb - 122);
    } else if (s.shape === 'saw') {
      const base = yt + bh * 0.3, n = Math.max(2, Math.round(bw / 150)), tw = (bw - 16) / n;
      for (let i = 0; i < n; i++) {                                                                  // 鋸齒屋頂與天窗
        const tx = x0 + 8 + tw * i;
        k.poly([[tx, base + 6], [tx, yt + 6], [tx + tw, base + 6]]); k.paper(s.roof, true);
        k.poly([[tx + 5, base], [tx + 5, yt + 26], [tx + 17, yt + 26 + (base - yt - 20) * (12 / tw)], [tx + 17, base]]); k.flat(C.glass);
      }
      mass(x0 + 8, base, bw - 16, yb - base);
      k.box(x0 + 3, base - 2, bw - 6, 9, 3); k.paper(C.card);
      facade(x0 + 8, base + 8, bw - 16, yb - base - 8, cx);
      door(cx); badge(cx + 60, yb - 122);
    } else if (s.shape === 'stepped') {
      const tw = bw * 0.46, top = yt + headroom, low = yt + Math.max(headroom + 40, bh * 0.36);
      mass(x0 + tw - 14, low + 10, bw - tw + 6, yb - low - 10, 0.1);                                  // 矮的一側
      slab(x0 + tw - 14, low, bw - tw + 6);
      windows(x0 + tw + 8, low + 26, bw - tw - 26, yb - low - 26 - 20, s.windows);
      mass(x0 + 8, top + 10, tw, yb - top - 10);                                                      // 高的一側
      slab(x0 + 8, top, tw);
      facade(x0 + 8, top + 18, tw, yb - top - 18, x0 + 8 + tw / 2);
      door(x0 + 8 + tw / 2); roofStuff(x0 + 8, top, tw); badge(x0 + tw + (bw - tw) / 2, low + 2);
    } else {
      const top = yt + headroom;
      mass(x0 + 8, top + 10, bw - 16, yb - top - 10);
      slab(x0 + 8, top, bw - 16);
      facade(x0 + 8, top + 18, bw - 16, yb - top - 18, cx);
      door(cx); roofStuff(x0 + 8, top, bw - 16); badge(cx + 60, yb - 122);
    }

    if (has('bushes')) {
      [0.07, 0.2, 0.8, 0.93].forEach((f, i) => {
        const r = 15 + (i % 2) * 6;
        k.ell(x0 + bw * f, yb - r * 0.5, r, r * 0.78); k.paper(i % 2 ? C.leaf : C.leafDark, true);
      });
    }

    if (open) return backed(art, 11);

    // 未開拓：一張描圖紙，隱約透出底下的房子，蓋著章
    const out = makeCanvas(W, H), oc = out.getContext('2d');
    grow(oc, silhouette(art, '#ffffff'), 8);
    oc.drawImage(silhouette(art, '#e2f0f4'), 0, 0);
    oc.globalAlpha = 0.2; oc.drawImage(art, 0, 0); oc.globalAlpha = 1;
    oc.save(); oc.translate(W / 2, H * 0.6); oc.rotate(-0.1);
    const sw = Math.min(W * 0.72, 190), sh = sw * 0.36;
    oc.fillStyle = 'rgba(255,250,240,0.92)'; oc.fillRect(-sw / 2, -sh / 2, sw, sh);
    oc.lineWidth = 4; oc.strokeStyle = C.coral; oc.strokeRect(-sw / 2, -sh / 2, sw, sh);
    oc.fillStyle = C.coral; oc.font = '700 ' + sh * 0.56 + 'px ' + FONT;
    oc.textAlign = 'center'; oc.textBaseline = 'middle'; oc.fillText('未開拓', 0, 2);
    oc.restore();
    return out;
  }

  // ---------- 旗子（建築或地標的名牌） ----------
  function sign(name, en, small) {
    const size = small ? 34 : 46;
    const w = Math.max(small ? 130 : 190, name.length * (size + 4) + 56), h = small ? 150 : 190, bh = small ? 70 : 100;
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#c9a877'; ctx.fillRect(w / 2 - 4, bh - 4, 8, h - bh + 4);       // 旗桿
    ctx.fillStyle = C.card; ctx.fillRect(4, 4, w - 8, bh);
    ctx.lineWidth = 5; ctx.strokeStyle = small ? C.teal : C.coral; ctx.strokeRect(6, 6, w - 12, bh - 4);
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.fillText(name, w / 2, small ? 50 : en ? 58 : 68);
    if (en && !small) {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 90); ctx.lineTo(w - 16, 90); ctx.stroke();
      ctx.fillStyle = C.coral; ctx.font = '500 15px "DM Mono", monospace'; ctx.fillText(en.toUpperCase(), w / 2, 82);
    }
    return c;
  }

  // ---------- 樹 ----------
  // kind：round 圓樹、round2 深色圓樹、pine 松樹、bush 灌木
  function tree(kind) {
    const art = makeCanvas(190, 270), ctx = art.getContext('2d'), k = kit(ctx);
    if (kind === 'pine') {
      k.box(87, 196, 16, 60, 4); k.paper(C.brown);
      [[[95, 104], [30, 214], [160, 214]], [[95, 60], [42, 160], [148, 160]], [[95, 16], [54, 106], [136, 106]]]
        .forEach((p, i) => { k.poly(p); k.paper(i === 1 ? '#3f7f6a' : '#356f5c', true); });
    } else if (kind === 'bush') {
      k.ell(60, 222, 46, 34); k.paper(C.leafDark, true);
      k.ell(128, 226, 44, 30); k.paper(C.leaf, true);
      k.ell(94, 206, 50, 40); k.paper(kind === 'bush' ? '#7fb089' : C.leaf, true);
    } else {
      const a = kind === 'round2' ? C.leafDark : C.leaf, b = kind === 'round2' ? '#3f7f6a' : '#86b98e';
      k.box(86, 150, 18, 106, 5); k.paper(C.brown);
      ctx.strokeStyle = C.brown; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(95, 190); ctx.lineTo(64, 160); ctx.moveTo(95, 176); ctx.lineTo(124, 150); ctx.stroke();
      k.ell(95, 98, 72, 68); k.paper(a, true);
      k.ell(62, 78, 38, 34); k.paper(b, true);
      k.ell(124, 112, 34, 30); k.paper(b, true);
      k.ell(104, 56, 28, 24); k.paper(a, true);
    }
    return backed(art, 9);
  }

  // ---------- 水波（立在水邊的小紙片） ----------
  function wave() {
    const art = makeCanvas(250, 90), ctx = art.getContext('2d'), k = kit(ctx);
    const crest = (y, color) => {
      ctx.beginPath(); ctx.moveTo(14, 78);
      ctx.lineTo(14, y + 16);
      for (let i = 0; i < 4; i++) { const x = 14 + i * 55.5; ctx.quadraticCurveTo(x + 14, y - 14, x + 28, y + 6); ctx.quadraticCurveTo(x + 42, y + 22, x + 55.5, y + 16); }
      ctx.lineTo(236, 78); ctx.closePath(); k.paper(color, true);
    };
    crest(22, '#5a9fb5'); crest(42, C.water);
    return backed(art, 8);
  }

  // ---------- 書後方的背景 ----------
  // 一層山丘。w、h 是公尺，其餘決定起伏的樣子
  function hills(color, w, h, amp, phase, dots) {
    const c = makeCanvas(1400, (1400 * h) / w), ctx = c.getContext('2d'), H = c.height;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= 1400; x += 10) {
      ctx.lineTo(x, H * (0.42 - amp * Math.sin((x / 1400) * Math.PI * 3.2 + phase) - amp * 0.5 * Math.sin((x / 1400) * Math.PI * 7 + phase * 2)) + 8);
    }
    ctx.lineTo(1400, H); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.save(); ctx.clip(); halftone(ctx, 1400, H, dots); ctx.restore();
    ctx.lineWidth = 9; ctx.strokeStyle = C.card; ctx.lineJoin = 'round'; ctx.stroke();
    return c;
  }
  function sun() {
    const c = makeCanvas(360, 360), ctx = c.getContext('2d');
    ctx.translate(180, 180); ctx.fillStyle = C.mustard;
    for (let i = 0; i < 14; i++) { ctx.rotate(Math.PI / 7); ctx.beginPath(); ctx.moveTo(-17, -118); ctx.lineTo(0, -170); ctx.lineTo(17, -118); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.fillStyle = C.coral; ctx.fill();
    ctx.lineWidth = 9; ctx.strokeStyle = C.card; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.translate(-180, -180); halftone(ctx, 360, 360, 0.2); ctx.restore();
    return c;
  }
  function cloud() {
    const c = makeCanvas(300, 150), ctx = c.getContext('2d');
    ctx.beginPath();
    [[70, 96, 44], [128, 70, 56], [196, 86, 48], [240, 104, 30]].forEach((b) => { ctx.moveTo(b[0] + b[2], b[1]); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); });
    ctx.rect(60, 96, 190, 38);
    ctx.fillStyle = C.card; ctx.fill();
    ctx.save(); ctx.clip(); halftone(ctx, 300, 150, 0.1); ctx.restore();
    return c;
  }

  // ---------- 封面 ----------
  // w、h 是封面的寬高比（公尺即可）
  function cover(title, subtitle, w, h) {
    const W = 900, H = Math.round((900 * h) / w);
    const c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#b8442f'; ctx.fillRect(0, 0, W, H);
    halftone(ctx, W, H, 0.12);
    ctx.strokeStyle = 'rgba(255,250,240,0.55)'; ctx.lineWidth = 5; ctx.setLineDash([22, 14]);
    ctx.strokeRect(36, 36, W - 72, H - 72); ctx.setLineDash([]);
    const bw = W * 0.66, bh = Math.min(H * 0.34, 520), bx = (W - bw) / 2, by = H * 0.3;
    ctx.fillStyle = 'rgba(36,50,63,0.25)'; ctx.fillRect(bx + 12, by + 14, bw, bh);
    ctx.fillStyle = C.card; ctx.fillRect(bx, by, bw, bh);
    ctx.lineWidth = 5; ctx.strokeStyle = C.coral; ctx.strokeRect(bx + 14, by + 14, bw - 28, bh - 28);
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
    ctx.font = '900 ' + bw * 0.24 + 'px ' + FONT; ctx.fillText(title, W / 2, by + bh * 0.52);
    ctx.strokeStyle = C.coral; ctx.lineWidth = 6; ctx.setLineDash([20, 12]);
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.2, by + bh * 0.64); ctx.lineTo(bx + bw * 0.8, by + bh * 0.64); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.coral; ctx.font = '700 ' + bw * 0.075 + 'px ' + FONT; ctx.fillText(subtitle, W / 2, by + bh * 0.82);
    return c;
  }

  // ---------- 紙盒建築的貼圖 ----------
  // 牆面：一格是一個開間、一層樓，會沿著牆重複。spec.windows 可以是 grid、tall、arch、band、balcony、none
  function wallTile(spec) {
    const s = Object.assign({ color: C.teal, trim: C.ink, windows: 'grid' }, spec);
    const c = makeCanvas(128, 128), ctx = c.getContext('2d'), k = kit(ctx);
    ctx.fillStyle = s.color; ctx.fillRect(0, 0, 128, 128);
    halftone(ctx, 128, 128, 0.17);
    ctx.fillStyle = 'rgba(255,250,240,0.6)'; ctx.fillRect(0, 0, 128, 6);            // 樓層線
    ctx.fillStyle = 'rgba(36,50,63,0.12)'; ctx.fillRect(0, 6, 128, 4);
    if (s.windows === 'none') return c;
    const wide = s.windows === 'band', tall = s.windows === 'tall', arch = s.windows === 'arch';
    const x = wide ? 12 : 37, w = wide ? 104 : 54, y = tall ? 24 : 34, h = tall ? 84 : 60;
    const shape = (i) => {
      if (arch) {
        ctx.beginPath(); ctx.moveTo(x + i, y + h - i); ctx.lineTo(x + i, y + w / 2);
        ctx.arc(x + w / 2, y + w / 2, w / 2 - i, Math.PI, 0); ctx.lineTo(x + w - i, y + h - i); ctx.closePath();
      } else k.box(x + i, y + i, w - i * 2, h - i * 2, 4);
    };
    shape(0); k.paper(C.card);
    shape(5); k.flat(C.glass);
    ctx.strokeStyle = C.card; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2, y + h - 5);
    if (wide) { ctx.moveTo(x + w * 0.25, y + 6); ctx.lineTo(x + w * 0.25, y + h - 5); ctx.moveTo(x + w * 0.75, y + 6); ctx.lineTo(x + w * 0.75, y + h - 5); }
    else { ctx.moveTo(x + 5, y + h * 0.48); ctx.lineTo(x + w - 5, y + h * 0.48); }
    ctx.stroke();
    k.box(x - 5, y + h - 3, w + 10, 8, 3); k.paper(C.card);                           // 窗台
    if (s.windows === 'balcony') {
      k.box(x - 12, y + h * 0.62, w + 24, h * 0.46, 4); k.paper(s.trim);
      ctx.strokeStyle = 'rgba(255,250,240,0.5)'; ctx.lineWidth = 3;
      for (let q = 1; q < 6; q++) { const px = x - 12 + ((w + 24) * q) / 6; ctx.beginPath(); ctx.moveTo(px, y + h * 0.7); ctx.lineTo(px, y + h * 1.04); ctx.stroke(); }
    }
    return c;
  }
  // 屋頂：一張有網點的色紙
  function roofTile(spec) {
    const c = makeCanvas(64, 64), ctx = c.getContext('2d');
    ctx.fillStyle = (spec && spec.roof) || C.ink; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,250,240,0.16)';
    for (let y = 4; y < 64; y += 8) for (let x = (y / 8) % 2 ? 4 : 8; x < 64; x += 8) ctx.fillRect(x, y, 2, 2);
    return c;
  }

  App.paper = { C, makeCanvas, halftone, person, building, sign, tree, wave, hills, sun, cloud, cover, wallTile, roofTile };
})();
