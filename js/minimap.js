// 左上角的 3D 線框小地圖。地圖以使用者為中心，並隨手機朝向旋轉。
// 不使用外部圖資服務：建築外框來自場域包。
(function () {
  let map = null;
  let ready = false;

  App.minimap = {
    // features：GeoJSON，properties 需有 featured、ratio（血量比例）、h（高度，公尺）
    init(el, features, center) {
      if (!window.maplibregl) { el.parentElement.classList.add('nomap'); return; }
      try {
        map = new maplibregl.Map({
          container: el,
          style: {
            version: 8, sources: {},
            layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#040a1c' } }],
          },
          center: [center.lng, center.lat], zoom: 15.6, pitch: 55, bearing: 0,
          interactive: false, attributionControl: false,
        });
      } catch (e) { map = null; return; }

      const colour = ['interpolate', ['linear'], ['get', 'ratio'], 0, '#ff2d6f', 0.3, '#ffb347', 0.6, '#5ef2ff'];
      map.on('load', () => {
        map.addSource('b', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({ id: 'dim', type: 'fill-extrusion', source: 'b', filter: ['!', ['get', 'featured']],
          paint: { 'fill-extrusion-color': '#1d3b63', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.45 } });
        map.addLayer({ id: 'feat', type: 'fill-extrusion', source: 'b', filter: ['get', 'featured'],
          paint: { 'fill-extrusion-color': colour, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.8 } });
        map.addLayer({ id: 'edge', type: 'line', source: 'b',
          paint: { 'line-color': ['case', ['get', 'featured'], colour, '#3a6ea5'], 'line-width': 1 } });
        ready = true;
      });
    },

    update(pos, heading) {
      if (!ready) return;
      map.jumpTo({ center: [pos.lng, pos.lat], bearing: heading });
    },

    // 把小地圖上的畫面座標換成經緯度（模擬定位用）
    unproject(x, y) {
      if (!ready) return null;
      const p = map.unproject([x, y]);
      return { lat: p.lat, lng: p.lng };
    },
  };
})();
