"""把 Overpass 下載的建築外框轉成場域包用的 footprints.js。

用法：python3 tools/build-footprints.py raw.json sites/nanda/footprints.js
raw.json 的取得方式（Overpass QL）：
  [out:json];(way["building"](南,西,北,東););out body geom;
只保留校園內的建築（building=university 或 dormitory）。
"""
import json, sys

KEEP = {"university", "dormitory"}
raw = json.load(open(sys.argv[1], encoding="utf-8"))
features = []
for e in raw["elements"]:
    tags = e.get("tags", {})
    geom = e.get("geometry")
    if e["type"] != "way" or not geom or tags.get("building") not in KEEP:
        continue
    ring = [[round(p["lon"], 7), round(p["lat"], 7)] for p in geom]
    levels = tags.get("building:levels")
    features.append({
        "type": "Feature",
        "properties": {
            "osm": e["id"],
            "name": tags.get("name", ""),
            "levels": int(levels) if levels and levels.isdigit() and int(levels) > 0 else None,
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    })
out = "// 由 tools/build-footprints.py 產生，資料 © OpenStreetMap contributors (ODbL)\n"
out += "window.SITE_FOOTPRINTS = " + json.dumps(
    {"type": "FeatureCollection", "features": features}, ensure_ascii=False) + ";\n"
open(sys.argv[2], "w", encoding="utf-8").write(out)
print(len(features), "棟")
