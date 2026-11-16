#!/usr/bin/env python3
"""把作者模式匯出的故事卡併入場域包。

用法：
    python3 tools/import-cards.py 匯出檔.json sites/nanda
    python3 tools/import-cards.py 匯出檔.txt  sites/nanda      （「分享檔案」拿到的是 .txt，內容一樣）

做的事：
  - 照片存成 sites/<場域>/cards/<卡片 id>.jpg
  - 卡片寫進 sites/<場域>/cards.js。已經在裡面的卡片（同一個 id）會被更新，其他的保留
  - 加上 --replace 則整份換掉，不保留原本的卡片

注意：場域包會推送到 GitHub，卡片的文字和照片推送後就是公開的。
"""
import base64
import json
import os
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
replace = '--replace' in sys.argv
if len(args) != 2:
    sys.exit(__doc__)
src, site_dir = args
out_js = os.path.join(site_dir, 'cards.js')
photo_dir = os.path.join(site_dir, 'cards')

data = json.load(open(src, encoding='utf-8'))
if data.get('format') != 'vanishing-cards':
    sys.exit('這不是作者模式匯出的檔案（format 不是 vanishing-cards）')
site_id = os.path.basename(os.path.normpath(site_dir))
if data.get('site') != site_id:
    sys.exit('這份卡片屬於場域「%s」，不是「%s」' % (data.get('site'), site_id))

# 原本的卡片
old = []
if not replace and os.path.exists(out_js):
    m = re.search(r'window\.SITE_CARDS\s*=\s*(\{.*\})\s*;', open(out_js, encoding='utf-8').read(), re.S)
    if m:
        old = json.loads(m.group(1)).get('cards', [])
cards = {c['id']: c for c in old}

added = updated = photos = 0
for c in data.get('cards', []):
    cid = c['id']
    if not re.fullmatch(r'[A-Za-z0-9_-]+', cid):
        sys.exit('卡片 id 不合規則：%r' % cid)
    photo = cards.get(cid, {}).get('photo')
    raw = c.get('photo')
    if raw:
        m = re.match(r'data:image/(jpeg|png);base64,(.*)$', raw, re.S)
        if not m:
            sys.exit('卡片 %s 的照片格式看不懂' % cid)
        os.makedirs(photo_dir, exist_ok=True)
        name = cid + ('.jpg' if m.group(1) == 'jpeg' else '.png')
        with open(os.path.join(photo_dir, name), 'wb') as f:
            f.write(base64.b64decode(m.group(2)))
        photo = 'sites/%s/cards/%s' % (site_id, name)      # 相對於 index.html 的路徑
        photos += 1
    elif not c.get('hasPhoto'):
        photo = None            # 匯出時就沒有照片
    if c.get('hasPhoto') and not photo:
        print('提醒：卡片「%s」有照片，但這份檔案不含照片（用「複製文字」匯出的不含照片）' % c.get('title'))
    if cid in cards:
        updated += 1
    else:
        added += 1
    cards[cid] = {
        'id': cid, 'title': c.get('title', ''), 'text': c.get('text', ''),
        'lat': c['lat'], 'lng': c['lng'], 'radius': c.get('radius', 15), 'photo': photo,
    }

body = json.dumps({'cards': list(cards.values())}, ensure_ascii=False, indent=1)
with open(out_js, 'w', encoding='utf-8') as f:
    f.write('// 故事卡。由 tools/import-cards.py 把作者模式匯出的檔案併進來，不要手動編排。\n')
    f.write('// 每張卡：{ id, title, text, lat, lng, radius, photo }。photo 是照片檔的路徑，沒有照片是 null。\n')
    f.write('window.SITE_CARDS = ' + body + ';\n')
print('新增 %d 張、更新 %d 張、存了 %d 張照片，場域包現在共有 %d 張卡' % (added, updated, photos, len(cards)))
