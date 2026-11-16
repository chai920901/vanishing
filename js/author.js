// 作者模式：網址加上 ?author=1 才會啟動。在現場按「在這裡放卡」，把故事卡放在當下站的位置。
// 卡片只存在這支手機的瀏覽器裡（文字在 localStorage、照片在 IndexedDB），不會上傳。
// 回去前按「匯出」拿到一個檔案，再併入場域包。
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has('author')) return;

  const site = window.SITE, geo = App.geo, state = App.state;
  const $ = (id) => document.getElementById(id);
  const KEY = 'vanishing.' + site.id + '.cards.v1';
  const POOR = 20;          // 定位誤差超過幾公尺就提醒

  // ---------- 存取 ----------
  let cards = [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.version === 1 && Array.isArray(raw.cards)) cards = raw.cards;
  } catch (e) { /* 讀不到就從空的開始 */ }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, cards })); return true; } catch (e) { return false; }
  }

  // 照片比較大，放在 IndexedDB，用卡片的 id 當鑰匙
  const openDb = () => new Promise((resolve, reject) => {
    const r = indexedDB.open('vanishing-author', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const photoDo = (mode, fn) => openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode), req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
  const photoPut = (id, data) => photoDo('readwrite', (s) => s.put(data, id));
  const photoGet = (id) => photoDo('readonly', (s) => s.get(id)).catch(() => null);
  const photoDel = (id) => photoDo('readwrite', (s) => s.delete(id)).catch(() => null);

  // 照片縮到長邊 1280，轉成 JPEG
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  // ---------- 小工具 ----------
  const fix = (n) => +n.toFixed(6);
  const whereText = (c) => c.lat.toFixed(6) + ', ' + c.lng.toFixed(6) +
    (c.acc != null ? '　誤差約 ' + Math.round(c.acc) + ' 公尺' : '　模擬定位');
  let toastTimer = 0;
  function toast(msg) {
    const el = $('au-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  const refreshCount = () => { $('au-count').textContent = cards.length; };

  // ---------- 放卡與編輯 ----------
  let draft = null, isNew = false, newPhoto;      // newPhoto：undefined 沒動、null 拿掉、字串是新照片

  function here() {
    const p = state.pos;
    return p ? { lat: fix(p.lat), lng: fix(p.lng), acc: p.acc != null ? Math.round(p.acc) : null } : null;
  }
  function showWhere() {
    const el = $('au-where');
    el.textContent = whereText(draft);
    el.classList.toggle('poor', draft.acc != null && draft.acc > POOR);
    $('au-poor').hidden = !(draft.acc != null && draft.acc > POOR);
  }
  async function openForm(card) {
    if (!card) {
      const p = here();
      if (!p) return toast('還沒有定位，等一下再試');
      draft = Object.assign({ id: 'c' + Date.now().toString(36), title: '', text: '', radius: 15, hasPhoto: false, createdAt: new Date().toISOString() }, p);
      isNew = true;
    } else {
      draft = Object.assign({}, card);
      isNew = false;
    }
    newPhoto = undefined;
    $('au-form-title').textContent = isNew ? '在這裡放卡' : '修改卡片';
    $('au-title').value = draft.title;
    $('au-text').value = draft.text;
    $('au-radius').value = String(draft.radius);
    $('au-photo').value = '';
    $('au-delete').hidden = isNew;
    $('au-move').textContent = isNew ? '重新抓位置' : '把位置改成我現在站的地方';
    showWhere();
    const photo = draft.hasPhoto ? await photoGet(draft.id) : null;
    setPreview(photo);
    $('au-cards').hidden = true;
    $('au-form').hidden = false;
    $('au-form').scrollTop = 0;
  }
  function setPreview(data) {
    $('au-preview').hidden = !data;
    $('au-photo-clear').hidden = !data;
    if (data) $('au-preview').src = data; else $('au-preview').removeAttribute('src');
  }

  $('au-add').addEventListener('click', () => openForm(null));
  $('au-form-close').addEventListener('click', () => { $('au-form').hidden = true; });
  $('au-move').addEventListener('click', () => {
    const p = here();
    if (!p) return toast('還沒有定位');
    Object.assign(draft, p);
    showWhere();
  });
  $('au-photo').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { newPhoto = await shrink(file); setPreview(newPhoto); } catch (err) { toast('這張照片讀不進來'); }
  });
  $('au-photo-clear').addEventListener('click', () => { newPhoto = null; $('au-photo').value = ''; setPreview(null); });

  $('au-save').addEventListener('click', async () => {
    draft.title = $('au-title').value.trim();
    draft.text = $('au-text').value.trim();
    draft.radius = parseInt($('au-radius').value, 10) || 15;
    if (!draft.title && !draft.text) return toast('至少寫一個標題或一段內容');
    let photoFailed = false;
    if (typeof newPhoto === 'string') {
      try { await photoPut(draft.id, newPhoto); draft.hasPhoto = true; } catch (e) { photoFailed = true; }
    } else if (newPhoto === null) {
      await photoDel(draft.id); draft.hasPhoto = false;
    }
    const i = cards.findIndex((c) => c.id === draft.id);
    if (i >= 0) cards[i] = draft; else cards.push(draft);
    if (!persist()) return toast('存不進去：瀏覽器的空間滿了或不允許儲存');
    refreshCount();
    $('au-form').hidden = true;
    toast(photoFailed ? '文字已存，但照片存不進去' : '已放下「' + (draft.title || draft.text.slice(0, 8)) + '」');
  });
  $('au-delete').addEventListener('click', async () => {
    if (!confirm('刪除這張卡？刪掉就找不回來。')) return;
    cards = cards.filter((c) => c.id !== draft.id);
    await photoDel(draft.id);
    persist(); refreshCount();
    $('au-form').hidden = true;
    toast('已刪除');
  });

  // ---------- 清單 ----------
  function renderList() {
    const ol = $('au-items');
    ol.innerHTML = '';
    $('au-none').hidden = cards.length > 0;
    cards.forEach((c) => {
      const li = document.createElement('li'), btn = document.createElement('button');
      const title = document.createElement('b'), text = document.createElement('span'), meta = document.createElement('small');
      title.textContent = c.title || '（沒有標題）';
      text.textContent = c.text.length > 44 ? c.text.slice(0, 44) + '…' : c.text;
      meta.textContent = (state.pos ? '距離這裡 ' + Math.round(geo.dist(state.pos, c)) + ' 公尺　' : '') +
        '半徑 ' + c.radius + ' 公尺' + (c.hasPhoto ? '　有照片' : '');
      btn.append(title, text, meta);
      btn.addEventListener('click', () => openForm(c));
      li.appendChild(btn); ol.appendChild(li);
    });
  }
  $('au-list').addEventListener('click', () => { renderList(); $('au-form').hidden = true; $('au-cards').hidden = false; });
  $('au-cards-close').addEventListener('click', () => { $('au-cards').hidden = true; });

  // ---------- 匯出 ----------
  async function bundle(withPhotos) {
    const out = [];
    for (const c of cards) {
      out.push({
        id: c.id, title: c.title, text: c.text, lat: c.lat, lng: c.lng, accuracy: c.acc, radius: c.radius, createdAt: c.createdAt,
        photo: withPhotos && c.hasPhoto ? await photoGet(c.id) : null, hasPhoto: !!c.hasPhoto,
      });
    }
    return { format: 'vanishing-cards', version: 1, site: site.id, exportedAt: new Date().toISOString(), cards: out };
  }
  const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = (ext) => 'vanishing-cards-' + site.id + '-' + stamp() + '.' + ext;

  if (!navigator.share) $('au-share').hidden = true;
  $('au-share').addEventListener('click', async () => {
    if (!cards.length) return toast('還沒有卡片');
    // 分享用純文字檔，手機上能分享的檔案種類比較多
    const file = new File([JSON.stringify(await bundle(true))], fileName('txt'), { type: 'text/plain' });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) return toast('這個瀏覽器不能分享檔案，請用「下載檔案」');
    try { await navigator.share({ files: [file], title: '消失中 卡片' }); } catch (e) { /* 使用者取消 */ }
  });
  $('au-download').addEventListener('click', async () => {
    if (!cards.length) return toast('還沒有卡片');
    const url = URL.createObjectURL(new Blob([JSON.stringify(await bundle(true), null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName('json');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  $('au-copy').addEventListener('click', async () => {
    if (!cards.length) return toast('還沒有卡片');
    const text = JSON.stringify(await bundle(false), null, 1);
    try { await navigator.clipboard.writeText(text); toast('已複製（不含照片）'); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      toast(ok ? '已複製（不含照片）' : '複製失敗，請用「下載檔案」');
    }
  });

  $('author').hidden = false;
  refreshCount();
  App.author = { bundle, cards: () => cards };
})();
