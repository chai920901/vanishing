"""把 Overpass 下載的地形資料轉成場域包用的 terrain.js。

用法：python3 tools/build-terrain.py raw.json sites/nanda/terrain.js 南 西 北 東
raw.json 的取得方式（Overpass QL，範圍比場域大一圈）：
  [out:json];(way["natural"](範圍);way["waterway"](範圍);way["leisure"](範圍);
  node["natural"="tree"](範圍);way["highway"](範圍);way["amenity"="university"](範圍););out body geom;
只保留範圍內的水路、水池、球場、道路、行道樹與校區邊界。
"""
import json, sys

raw = json.load(open(sys.argv[1], encoding="utf-8"))
S, W, N, E = [float(v) for v in sys.argv[3:7]]

ROAD = {
    "secondary": "road", "tertiary": "road", "tertiary_link": "road", "residential": "street",
    "pedestrian": "path", "service": "path", "footway": "foot", "path": "foot", "steps": "foot",
}

def pts(geom):
    return [[round(p["lon"], 6), round(p["lat"], 6)] for p in geom]

def inside(geom):
    return any(S <= p["lat"] <= N and W <= p["lon"] <= E for p in geom)

out = {"boundary": None, "water": [], "ponds": [], "fields": [], "courts": [], "roads": [], "treeRows": [], "trees": []}
for e in raw["elements"]:
    t = e.get("tags", {})
    if e["type"] == "node":
        if t.get("natural") == "tree" and S <= e["lat"] <= N and W <= e["lon"] <= E:
            out["trees"].append([round(e["lon"], 6), round(e["lat"], 6)])
        continue
    g = e.get("geometry")
    if e["type"] != "way" or not g:
        continue
    if t.get("amenity") == "university":
        out["boundary"] = pts(g)
        continue
    if not inside(g):
        continue
    name = t.get("name", "")
    if "waterway" in t:
        out["water"].append({"name": name, "line": pts(g)})
    elif t.get("natural") == "water":
        out["ponds"].append({"name": name, "ring": pts(g)})
    elif t.get("leisure") == "pitch":
        grass = t.get("sport") == "soccer" or t.get("surface") == "grass"
        out["fields" if grass else "courts"].append({"name": name, "ring": pts(g)})
    elif t.get("natural") == "tree_row":
        out["treeRows"].append(pts(g))
    elif t.get("highway") in ROAD:
        out["roads"].append({"kind": ROAD[t["highway"]], "name": name, "line": pts(g)})

text = "// 由 tools/build-terrain.py 產生，資料 © OpenStreetMap contributors (ODbL)\n"
text += "window.SITE_TERRAIN = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(sys.argv[2], "w", encoding="utf-8").write(text)
print({k: (len(v) if v else 0) for k, v in out.items()})
