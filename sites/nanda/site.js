// 場域包：國立清華大學南大校區
// 換場域時只需要換這個資料夾。引擎（js/）不含任何南大的內容。
// 每一筆事件都要有來源；查不到的資料寫 null，畫面會顯示「不明」，不拿來扣血。

window.SITE = {
  id: 'nanda',
  name: { zh: '南大校區', en: 'Nanda Campus' },
  place: { zh: '新竹市東區南大路 521 號', en: '521 Nanda Rd., East Dist., Hsinchu' },

  // 場域範圍：超出半徑就不能進入
  center: { lat: 24.793233, lng: 120.964801 },
  radius: 260,

  // 立體書地圖：書頁四周留白（上、右、下、左，公尺）。下方多留，是為了把校區南邊的汀甫圳放進來。
  page: { padding: [34, 30, 120, 30], people: 26 },   // people：地圖上裝飾用的小人數量

  // 地標：位置取自校方地圖導覽系統的導航點，可能與實際位置有落差，需現場校正
  landmarks: [
    { type: 'tree', name: { zh: '麵包樹' }, lat: 24.793131, lng: 120.965204 },
    { type: 'tree', name: { zh: '傻瓜樹' }, lat: 24.793182, lng: 120.964030 },
  ],

  maxHp: 100,

  // 傷害類型與權重（暫定值，之後由作者調整）。傷害 = 權重 × 嚴重度（1 到 3）
  damageTypes: {
    name:       { label: { zh: '名字消失', en: 'Name erased' },      weight: 6 },
    relocation: { label: { zh: '遷離',     en: 'Relocation' },       weight: 8 },
    closure:    { label: { zh: '設施停用', en: 'Service closed' },   weight: 7 },
    policy:     { label: { zh: '政策',     en: 'Policy' },           weight: 6 },
    structure:  { label: { zh: '結構',     en: 'Structure' },        weight: 9 },
  },

  // 校區事件由每棟建築繼承，乘上這個比例
  inheritRatio: 0.5,

  // 隨日期增加的傷害：從 start 到 end 線性累積到 max
  countdown: {
    start: '2016-11-01',
    end: '2027-08-01',
    max: 15,
    title: { zh: '倒數：最後一批學生預計離開', en: 'Countdown: last students expected to leave' },
    note: { zh: '藝術學院預計 2027 年暑假前遷出，為間接時程，未經官方確認', en: 'College of Arts expected to move by summer 2027 (indirect schedule, unconfirmed)' },
    source: 'https://www.lib.nthu.edu.tw/library/nanda/',
  },

  // 校區層級事件：每棟建築都承受
  campusEvents: [
    { date: '2016-11-01', type: 'name', severity: 2,
      title: { zh: '併入清華大學，「國立新竹教育大學」校名消失' },
      by: { zh: '兩校合併' },
      source: 'https://archives.lib.nthu.edu.tw/history/timeline/timeline03.html' },
    { date: '2017-08-01', type: 'policy', severity: 1,
      title: { zh: '中文系、應用數學系、應用科學系等四系所停招' },
      by: { zh: '合校後系所調整' },
      source: 'https://zh.wikipedia.org/zh-tw/國立新竹教育大學' },
    { date: '2023-10-01', type: 'closure', severity: 1,
      title: { zh: '註冊業務移到校本部辦理' },
      by: { zh: '校方行政調整' },
      source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
    { date: '2025-09-01', type: 'relocation', severity: 3,
      title: { zh: '竹師教育學院近兩千名師生遷往校本部' },
      by: { zh: '校本部新大樓啟用' },
      source: 'https://www.nthu.edu.tw/hotNews/content/1233' },
    { date: '2026-06-09', type: 'policy', severity: 2,
      title: { zh: '校方規劃將校區轉型為國際會議中心' },
      by: { zh: '校方規劃，採民間促參' },
      source: 'https://news.ltn.com.tw/news/HsinchuCity/breakingnews/5465647' },
    { date: '2027-08-01', type: 'relocation', severity: 3, uncertain: true,
      title: { zh: '藝術學院預計遷往校本部' },
      by: { zh: '校本部藝術學院大樓' },
      source: 'https://www.lib.nthu.edu.tw/library/nanda/' },
  ],

  // 有資料的建築。osm 對應 footprints.js 裡的外框。
  // built：興建或啟用年份，查不到寫 null。
  buildings: [
    { id: 'gate', osm: 297889614, height: 9, paper: { color: '#ee8f85', windows: 'none' },
      name: { zh: '校門', en: 'Main Gate' }, built: null,
      events: [
        { date: '2016-11-01', type: 'name', severity: 3,
          title: { zh: '門額由「國立新竹教育大學」改為「國立清華大學」' },
          by: { zh: '兩校合併' },
          source: 'https://archives.lib.nthu.edu.tw/history/timeline/timeline03.html' },
      ] },

    { id: 'library', osm: 291042237, paper: { color: '#8f2636', windows: 'tall', top: 'saw' },
      name: { zh: '圖書館', en: 'Library' }, built: null,
      events: [
        { date: '2025-06-11', type: 'closure', severity: 2,
          title: { zh: '閉館搬書，之後只留約兩萬冊藝術相關館藏' },
          by: { zh: '教育學院遷出' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
        { date: '2026-07-31', type: 'closure', severity: 3,
          title: { zh: '清華圖書館南大分館結束營運' },
          by: { zh: '校方' },
          source: 'https://www.lib.nthu.edu.tw/library/nanda/' },
        { date: '2026-11-03', type: 'name', severity: 1,
          title: { zh: '改為新竹市立圖書館南大分館' },
          by: { zh: '市府與清華合作' },
          source: 'https://www.chinatimes.com/realtimenews/20261103003801-260421' },
      ] },

    { id: 'memorial', osm: 1165031198, paper: { color: '#f6b9b0', windows: 'arch', top: 'gable', roofTop: '#ee8f85' },
      name: { zh: '竹師會館', en: 'Zhushi Memorial Hall' }, built: null,
      note: { zh: '2019 年由閒置教室整建啟用，保存竹師校史', en: 'Converted from disused classrooms in 2019 to keep the school history' },
      events: [] },

    { id: 'extension', osm: 297888032, paper: { color: '#f4dc8a', base: '#e88d52', windows: 'grid' },
      name: { zh: '推廣教育大樓（九大）', en: 'Extension Education Bldg.' }, built: null,
      note: { zh: '竹松社區大學使用中', en: 'In use by Zhusong Community College' },
      events: [] },

    { id: 'activity2', osm: 297888461, paper: { color: '#c0afdc', windows: 'band', top: 'glass' },
      name: { zh: '第二活動中心（二活）', en: 'Student Activity Center II' }, built: null,
      note: { zh: '三樓為藝術學院學士班與科技藝術研究所空間', en: '3F houses College of Arts programs' },
      events: [] },

    { id: 'artdesign', osm: 297888361, paper: { color: '#ee8f85', windows: 'band', top: 'saw' },
      name: { zh: '藝設系館', en: 'Arts & Design Bldg.' }, built: null,
      note: { zh: '仍在使用，等待遷往校本部', en: 'Still in use, awaiting relocation' },
      events: [] },

    { id: 'music', osm: 297889691, paper: { color: '#b3c7ae', base: '#e88d52', windows: 'arch' },
      name: { zh: '音樂系館', en: 'Music Bldg.' }, built: null,
      note: { zh: '仍在使用，等待遷往校本部', en: 'Still in use, awaiting relocation' },
      events: [] },

    { id: 'yinhong', osm: 1165031189, paper: { color: '#f6b9b0', trim: '#ee8f85', windows: 'balcony' },
      name: { zh: '飲虹樓', en: 'Yinhong Hall' }, built: null,
      events: [
        { date: '2018-02-01', type: 'structure', severity: 3,
          title: { zh: '建物安全評估：不符現行耐震標準' },
          by: { zh: '建物安全評估' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
        { date: null, type: 'closure', severity: 1,
          title: { zh: '停止安排教職員進住' },
          by: { zh: '校方' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
        { date: '2025-05-29', type: 'closure', severity: 2,
          title: { zh: '地下室健身中心停用' },
          by: { zh: '耐震不符' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
      ] },

    // 以下三棟依校方「南大校區平面圖」補上
    { id: 'appsci', osm: 291042241, paper: { color: '#c0afdc', windows: 'grid', top: 'garden' },
      name: { zh: '應用科學大樓', en: 'Applied Science Bldg.' }, built: null,
      note: { zh: '原為應用科學系、中國語文學系、環境與文化資源學系使用', en: 'Formerly home to three departments' },
      events: [
        { date: '2017-08-01', type: 'policy', severity: 2,
          title: { zh: '應用科學系、中國語文學系停招' },
          by: { zh: '合校後系所調整' },
          source: 'https://zh.wikipedia.org/zh-tw/國立新竹教育大學' },
        { date: '2025-09-01', type: 'relocation', severity: 2,
          title: { zh: '環境與文化資源學系隨竹師教育學院遷往校本部' },
          by: { zh: '校本部新大樓啟用' },
          source: 'https://www.nthu.edu.tw/hotNews/content/1233' },
      ] },

    { id: 'gym', osm: 291042231, paper: { color: '#a9b2b1', windows: 'band', top: 'gable', roofTop: '#fbf8f1' },
      name: { zh: '體育館', en: 'Gymnasium' }, built: null,
      events: [
        { date: null, type: 'name', severity: 1,
          title: { zh: '體育學系更名為運動科學系' },
          by: { zh: '系所轉型' },
          source: 'https://dpe.site.nthu.edu.tw/' },
      ] },

    { id: 'pehealth', osm: 297887802, paper: { color: '#f4dc8a', windows: 'tall' },
      name: { zh: '體育健康教學大樓', en: 'PE & Health Bldg.' }, built: 2010,
      note: { zh: '作者現場回報：現為「陽光多元運動中心」，啟用時間與營運單位待確認', en: 'Author reports it now houses a multi-sport centre; opening date and operator to be confirmed' },
      events: [] },

    { id: 'admin', osm: 291042232, paper: { color: '#b3c7ae', base: '#e88d52', windows: 'grid' },
      name: { zh: '行政大樓', en: 'Administration Bldg.' }, built: null,
      note: { zh: '2026 年 8 月起，一樓設有清華圖書館的臨時服務點，預計服務到 2027 年暑假', en: 'Hosts a temporary library service point since Aug 2026' },
      events: [] },

    { id: 'teaching', osm: 291042234, paper: { color: '#f6b9b0', base: '#ee8f85', windows: 'grid', top: 'garden' },
      name: { zh: '教學大樓', en: 'Teaching Bldg.' }, built: null,
      note: { zh: '竹師大事紀記載「教學（二）大樓」1969 年落成，是否為同一棟尚未確認', en: 'A 1969 completion is recorded for a "Teaching Bldg. II"; not confirmed to be this one' },
      events: [] },

    { id: 'general', osm: 291042236, paper: { color: '#a9b2b1', windows: 'band', top: 'garden' },
      name: { zh: '綜合教學大樓', en: 'General Teaching Bldg.' }, built: 2011,
      note: { zh: '校區最新的一棟。依校方平面圖，現有永續學院、醫學資訊與精準醫療等學程、推廣教育中心，地下一樓是國際會議廳', en: 'The newest building; now hosts new programmes, the extension centre and an international conference hall' },
      events: [] },

    { id: 'studentaffairs', osm: 291042244, paper: { color: '#f4dc8a', windows: 'grid' },
      name: { zh: '學務處', en: 'Student Affairs' }, built: null,
      note: { zh: '校方平面圖標為學務處；開放地圖上的名稱是第一學生活動中心', en: 'Labelled Student Affairs on the campus map; Student Activity Center I on OpenStreetMap' },
      events: [] },

    { id: 'mingfeng', osm: 291042243, paper: { color: '#c0afdc', trim: '#f6b9b0', windows: 'balcony' },
      name: { zh: '鳴鳳樓', en: 'Mingfeng Hall' }, built: null,
      note: { zh: '女生宿舍' },
      events: [
        { date: '2025-09-01', type: 'relocation', severity: 1,
          title: { zh: '大一新生改為集中住校本部，只有藝術學院學生優先住南大' },
          by: { zh: '住宿分配調整（114 學年度起）' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
      ] },

    { id: 'chongshan', osm: 1165031185, paper: { color: '#b3c7ae', trim: '#f6b9b0', windows: 'balcony' },
      name: { zh: '崇善樓', en: 'Chongshan Hall' }, built: null,
      note: { zh: '女生宿舍' },
      events: [
        { date: '2025-09-01', type: 'relocation', severity: 1,
          title: { zh: '大一新生改為集中住校本部，只有藝術學院學生優先住南大' },
          by: { zh: '住宿分配調整（114 學年度起）' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
      ] },

    { id: 'yingxi', osm: 1165031186, paper: { color: '#ee8f85', trim: '#f9d5cf', windows: 'balcony' },
      name: { zh: '迎曦軒', en: 'Yingxi Hall' }, built: null,
      note: { zh: '女生宿舍' },
      events: [
        { date: '2025-09-01', type: 'relocation', severity: 1,
          title: { zh: '大一新生改為集中住校本部，只有藝術學院學生優先住南大' },
          by: { zh: '住宿分配調整（114 學年度起）' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
      ] },

    { id: 'shude', osm: 297888533, paper: { color: '#f4dc8a', trim: '#fbf8f1', windows: 'balcony' },
      name: { zh: '樹德樓', en: 'Shude Hall' }, built: null,
      note: { zh: '男生宿舍；齋長任期排到 2027 年 1 月，仍在運作' },
      events: [
        { date: '2025-09-01', type: 'relocation', severity: 1,
          title: { zh: '大一新生改為集中住校本部，只有藝術學院學生優先住南大' },
          by: { zh: '住宿分配調整（114 學年度起）' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
      ] },

    { id: 'juyue', osm: 302104712, paper: { color: '#a9b2b1', trim: '#f6b9b0', windows: 'balcony' },
      name: { zh: '掬月齋', en: 'Juyue Hall' }, built: null,
      note: { zh: '女生宿舍；齋長任期排到 2027 年 1 月，仍在運作' },
      events: [
        { date: '2025-09-01', type: 'relocation', severity: 1,
          title: { zh: '大一新生改為集中住校本部，只有藝術學院學生優先住南大' },
          by: { zh: '住宿分配調整（114 學年度起）' },
          source: 'https://nthulemonnews.com/zhu-shi-jiao-yu-xue-yuan-ban-qian-zhi-hou-shang-xin-kong-jian-de-mo-he-yu-shi-ying/' },
      ] },
  ],
};
