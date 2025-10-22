// script.js
// ------------ Конфигурация ------------
const MAP_COUNT = 25; // теперь map1..map25
const MAP_FILE_PREFIX = "map"; // map1.jpg
const MAP_FOLDER = "assets/maps/";
const ICON_FOLDER = "assets/"; // assets/{nation}/regX.png

// placeholder SVG data URI (показываем если иконка не найдена)
const PLACEHOLDER_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
     <rect width="100%" height="100%" fill="#444"/>
     <text x="50%" y="54%" font-size="18" fill="#fff" text-anchor="middle" font-family="Arial">no</text>
     <text x="50%" y="70%" font-size="12" fill="#ddd" text-anchor="middle" font-family="Arial">image</text>
   </svg>`);

// === Иконки в папке assets/symbols ===
const ICON_NAMES = [
  'symb1','symb2','symb3','symb4','symb5','symb6',
  'symb7','symb8','symb9','symb10','symb11','symb12',
  'symb13','symb14','symb15','symb16','symb17','symb18',
  'symb19','symb20','symb21','symb22','symb23','symb24','symb25','symb26',
  'symb27','symb28','symb29','symb30','symb31','symb32','symb33','symb34',
  'symb35'
];

const ICON_CATEGORIES = {
  unit: ['symb1','symb2','symb3','symb4','symb5','symb6',
         'symb7','symb8','symb9','symb10','symb11','symb12',
         'symb13','symb14','symb15','symb16','symb17','symb18'],
  engineer: ['symb19','symb20','symb21','symb22','symb23','symb24','symb25','symb26',
             'symb27','symb28','symb29'],
  signs: ['symb31','symb32','symb33','symb34','symb35']
};

const ICON_LABELS = {
  symb1:  'Бронеавтомобиль',
  symb2:  'Гаубица',
  symb3:  'Противотанковая пушка',
  symb4:  'Противовоздушная оборона',
  symb5:  'Основная пехота',
  symb6:  'Тяжелая пехота',
  symb7:  'Специальная пехота',
  symb8:  'Вспомогательная пехота',
  symb9:  'Подразделение поддержки',
  symb10: 'Тяжелый танк',
  symb11: 'Противотанковая САУ',
  symb12: 'Легкий танк',
  symb13: 'Средний танк',
  symb14: 'Штурмовая САУ',
  symb15: 'Самостоятельный пехотный отряд',
  symb16: 'Парашютисты',
  symb17: 'Фронтовая авиация',
  symb18: 'Вспомогательная техника'
};

// Короткие подписи для всплывающей подсказки (используются при наведении)
const ICON_SHORT = {
  symb1:  'Бронеавто',
  symb2:  'Гаубица',
  symb3:  'ПТ пушка',
  symb4:  'ПВО',
  symb5:  'Пехота',
  symb6:  'Тяж. пех.',
  symb7:  'Спецпех.',
  symb8:  'Всп. пех.',
  symb9:  'Поддержка',
  symb10: 'Тяж. танк',
  symb11: 'ПТ САУ',
  symb12: 'Лёг. танк',
  symb13: 'Сред. танк',
  symb14: 'Штурм. САУ',
  symb15: 'Пех. отряд',
  symb16: 'Десант',
  symb17: 'Авиация',
  symb18: 'Всп. тех.'
};

// Отображаемые имена карт (в порядке map1..map25)
const MAP_NAMES = {
  1: "Airfield",
  2: "Bazerville",
  3: "Borovaya River",
  4: "Carpathians",
  5: "Champagne",
  6: "Coast",
  7: "Dead River",
  8: "Estate",
  9: "Farm Land",
 10: "Hunting Grounds",
 11: "Kursk Fields",
 12: "Nameless Height",
 13: "Polesie",
 14: "Port",
 15: "Saint Lo",
 16: "Suburb",
 17: "Valley of Death",
 18: "Village",
 19: "Volokalamsk Highway",
 20: "Witches Vale",
 21: "Winter March",
 22: "Chepel",
 23: "Crossroads",
 24: "Sandy Path",
 25: "Marl"
};

// Регистры (отображаемые названия полков) для каждой нации (reg1..reg17)
const REG_NAMES = {
  germany: {
    1: "Самоходный",
    2: "Развед",
    3: "Механка",
    4: "Гаубицы",
    5: "Моторизованная пехота",
    6: "Огнеметный",
    7: "ПВО",
    8: "Саперка",
    9: "Гренадерский",
    10: "Минометный",
    11: "Штурмовой",
    12: "Тяжелый танковый",
    13: "Противотанковый",
    14: "Средний танковый",
    15: "Первый артиллерийский",
    16: "Первый пехотный",
    17: "Первый танковый"
  },
  usa: {
    1: "Самоходный",
    2: "Развед",
    3: "Механка",
    4: "Гаубицы",
    5: "Моторизованная пехота",
    6: "Огнеметный",
    7: "ПВО",
    8: "Десантный",
    9: "Тяжелый танковый",
    10: "Минометный",
    11: "Саперный",
    12: "Средний танковый",
    13: "Противотанковый",
    14: "Штурмовой",
    15: "Первый артиллерийский",
    16: "Первый пехотный",
    17: "Первый танковый"
  },
  ussr: {
    1: "Самоходный",
    2: "Развед",
    3: "Механка",
    4: "Гаубицы",
    5: "Моторизованная пехота",
    6: "Огнеметный",
    7: "ПВО",
    8: "Саперка",
    9: "Тяжелый танковый",
    10: "Минометный",
    11: "Штурмовой",
    12: "Средний танковый",
    13: "Противотанковый",
    14: "88-ой штурмовой",
    15: "Первый артиллерийский",
    16: "Первый пехотный",
    17: "Первый танковый"
  }
};

//------------ Полезные утилиты ------------
function $id(id){ return document.getElementById(id); }
function createEl(tag, cls){ const e = document.createElement(tag); if(cls) e.className = cls; return e; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

//--------------------Исправление рисунков в эшелонах

function pickLayerOptions(layer) {
  const opts = {};
  if (layer.options) {
    if (layer.options.color) opts.color = layer.options.color;
    if (layer.options.weight != null) opts.weight = layer.options.weight;
    if (layer.options.fillColor) opts.fillColor = layer.options.fillColor;
    if (layer.options.fillOpacity != null) opts.fillOpacity = layer.options.fillOpacity;
  }
  return opts;
}

//------------ Инициализация карты и слоёв ------------
let imageOverlay = null;
let imageBounds = null;
let currentMapFile = null;

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -1,
  maxZoom: 4,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
});
map.setView([0,0], 0);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// ------------ Эшелоны (3 состояния карты) ------------
const ECHELON_COUNT = 3;
let currentEchelon = 1;
let echelonStates = {
  1: { markers: [], simple: [], drawings: [] },
  2: { markers: [], simple: [], drawings: [] },
  3: { markers: [], simple: [], drawings: [] }
};

// Контейнеры для маркеров/символов
let markerList = []; // {id, team, playerIndex, nick, nation, regimentFile, marker}
let simpleMarkers = []; // symbols from SimpleSymbols or others
// keep track of player markers separately for easier removal
// (we're using markerList as canonical list)

// ------------ Draw control: ensure color/weight are applied ------------
function getDrawColor(){ return $id('drawColor') ? $id('drawColor').value : '#ff0000'; }
function getDrawWeight(){ return $id('drawWeight') ? Number($id('drawWeight').value) : 3; }

// Create draw control with default options, but we will set style on created layers
const drawControl = new L.Control.Draw({
  position: 'topleft',
  draw: {
    marker: false,
    polyline: true,
    polygon: true,
    rectangle: false,
    circle: false,
    circlemarker: false
  },
  edit: { featureGroup: drawnItems, remove: true }
});
map.addControl(drawControl);

// ------------ Панель управления эшелонами ------------
const echelonControl = L.control({ position: 'topright' });

echelonControl.onAdd = function(map) {
  const container = L.DomUtil.create('div', 'leaflet-bar echelon-control');
  container.style.background = 'rgba(25,25,25,0.75)';
  container.style.color = 'white';
  container.style.padding = '6px 10px';
  container.style.border = '1px solid rgba(255,255,255,0.2)';
  container.style.borderRadius = '8px';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.userSelect = 'none';
  container.style.fontFamily = 'sans-serif';
  container.style.fontSize = '14px';

  const leftBtn = L.DomUtil.create('button','',container);
  leftBtn.innerHTML = '⟵';
  leftBtn.style.background = 'none';
  leftBtn.style.color = 'white';
  leftBtn.style.border = 'none';
  leftBtn.style.cursor = 'pointer';
  leftBtn.title = 'Предыдущий эшелон';

  const label = L.DomUtil.create('span','',container);
  label.textContent = `Эшелон ${currentEchelon}/${ECHELON_COUNT}`;
  label.style.minWidth = '80px';
  label.style.textAlign = 'center';

  const rightBtn = L.DomUtil.create('button','',container);
  rightBtn.innerHTML = '⟶';
  rightBtn.style.background = 'none';
  rightBtn.style.color = 'white';
  rightBtn.style.border = 'none';
  rightBtn.style.cursor = 'pointer';
  rightBtn.title = 'Следующий эшелон';

  const copyBtn = L.DomUtil.create('button','',container);
  copyBtn.innerHTML = '📋';
  copyBtn.style.background = 'none';
  copyBtn.style.color = 'white';
  copyBtn.style.border = 'none';
  copyBtn.style.cursor = 'pointer';
  copyBtn.title = 'Копировать текущее состояние в следующий эшелон';

  // обработчики
  L.DomEvent.on(leftBtn, 'click', e => {
    L.DomEvent.stopPropagation(e);
    saveCurrentEchelonState();
    currentEchelon = currentEchelon <= 1 ? ECHELON_COUNT : currentEchelon - 1;
    loadEchelonState(currentEchelon);
    label.textContent = `Эшелон ${currentEchelon}/${ECHELON_COUNT}`;
  });

  L.DomEvent.on(rightBtn, 'click', e => {
    L.DomEvent.stopPropagation(e);
    saveCurrentEchelonState();
    currentEchelon = currentEchelon >= ECHELON_COUNT ? 1 : currentEchelon + 1;
    loadEchelonState(currentEchelon);
    label.textContent = `Эшелон ${currentEchelon}/${ECHELON_COUNT}`;
  });

  L.DomEvent.on(copyBtn, 'click', e => {
    L.DomEvent.stopPropagation(e);
    saveCurrentEchelonState();
    const next = currentEchelon >= ECHELON_COUNT ? 1 : currentEchelon + 1;
    echelonStates[next] = JSON.parse(JSON.stringify(echelonStates[currentEchelon]));
    alert(`Скопировано в эшелон ${next}`);
  });

  return container;
};

map.addControl(echelonControl);

// When a new shape is created via Draw, apply current color/weight and add to drawnItems
map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;
  // apply style for polylines / polygons / circle
  if (layer.setStyle) {
    const style = { color: getDrawColor(), weight: getDrawWeight() };
    if (layer instanceof L.Polygon) {
      style.fillColor = getDrawColor();
      style.fillOpacity = 0.15;
    }
    layer.setStyle(style);
  }
  if (layer instanceof L.Circle) {
    // circle has options.radius already
    // ensure stroke color/weight set
    layer.setStyle && layer.setStyle({ color: getDrawColor(), weight: getDrawWeight() });
  }
  drawnItems.addLayer(layer);
});

// Ensure edits keep styles intact (nothing special needed, but keep handler)
map.on(L.Draw.Event.EDITED, function (e) {
  // no-op - layers are already in drawnItems
});
map.on(L.Draw.Event.DELETED, function (e) {
  // no-op
});

// === SimpleSymbols с тремя вкладками ===
const SimpleSymbols = L.Control.extend({
  onAdd: function(map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    container.style.background = 'rgba(20,20,20,0.6)';
    container.style.border = '1px solid rgba(255,255,255,0.15)';
    container.style.cursor = 'pointer';
    container.style.padding = '4px';

    // Верхняя панель вкладок
    const tabs = L.DomUtil.create('div', '', container);
    tabs.style.display = 'flex';
    tabs.style.justifyContent = 'space-between';
    tabs.style.marginBottom = '4px';

    const tabNames = { unit: 'Арм', engineer: 'Инж', signs: 'Сим' };
    const menus = {};

    for (const key in tabNames) {
      const btn = L.DomUtil.create('a', '', tabs);
      btn.textContent = tabNames[key];
      btn.style.flex = '1';
      btn.style.textAlign = 'center';
      btn.style.padding = '2px 0';
      btn.style.cursor = 'pointer';
      btn.style.background = 'rgba(40,40,40,0.6)';
      btn.style.color = 'white';
      btn.style.border = '1px solid rgba(255,255,255,0.1)';
      btn.style.userSelect = 'none';

      // Меню символов
      const menu = L.DomUtil.create('div', '', container);
      menu.style.display = 'none';               // свернуто по умолчанию
      menu.classList.add('symbol-menu');     
      menu.style.marginTop = '2px';
      menu.style.background = 'rgba(0,0,0,0.7)';
      menu.style.border = '1px solid rgba(255,255,255,0.1)';
      menu.style.borderRadius = '6px';
      menu.style.padding = '4px';
      menu.style.width = '80px';
      menu.style.gridTemplateColumns = 'repeat(2, 34px)';
      menu.style.gridAutoRows = '34px';
      menu.style.gridGap = '4px';
      menu.style.overflow = 'hidden';
      menu.style.display = 'none';              // главное — скрыто

      menus[key] = menu;

      // Клик по вкладке: показать/скрыть только нужное меню
      btn.addEventListener('click', () => {
        for (const k in menus) {
          if (k === key) {
            menus[k].style.display = menus[k].style.display === 'none' ? 'grid' : 'none';
          } else {
            menus[k].style.display = 'none';
          }
        }
      });
    }

    // Добавляем символы в каждое меню
    for (const category in ICON_CATEGORIES) {
      const menu = menus[category];
      menu.style.display = 'none'; // по умолчанию скрыто

      ICON_CATEGORIES[category].forEach(name => {
        const btn = L.DomUtil.create('a', '', menu);
        btn.style.width = '34px';
        btn.style.height = '34px';
        btn.style.margin = '0';
        btn.style.textAlign = 'center';
        btn.style.verticalAlign = 'middle';
        btn.innerHTML = `<img src="assets/symbols/${name}.png" 
                          alt="${name}" 
                          title="${ICON_LABELS[name] || name}" 
                          style="width:28px;height:28px;pointer-events:none">`;

        L.DomEvent.on(btn, 'click', e => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          const mk = addCustomIcon(`assets/symbols/${name}.png`, map.getCenter());
          if (mk) mk._symbName = name;
          simpleMarkers.push(mk);
        });
      });
    }

    return container;
  }
});

map.addControl(new SimpleSymbols({ position: 'topleft' }));
// === addSimpleSymbol с масштабируемыми иконками ===
function addSimpleSymbol(type, latlng) {
  const color = getDrawColor(); 
  const size = 60;

  let char = '?';
  switch(type){
    case 'dot': char='●'; break;
    case 'x': char='✖'; break;
    case 'arrow': char='↑'; break;
    case 'triangle': char='▲'; break;
    case 'diamond': char='◆'; break;
    case 'skull': char='☠'; break;
    case 'cross': char='☧'; break;
  }

  const marker = L.marker(latlng, {
    icon: L.divIcon({
      html: `<div style="color:${color};font-size:${size}px;">${char}</div>`,
      className: 'symbol-marker',
      iconSize: [size,size],
      iconAnchor: [size/2,size/2]
    }),
    draggable: true
  }).addTo(map);

  // НЕ добавляем tooltip для простых символов
  marker._simpleType = type; // чтобы при сохранении/загрузке восстановить тип

  marker.on('click', () => {
    if(confirm('Удалить этот символ?')){
      map.removeLayer(marker);
      const idx = simpleMarkers.indexOf(marker);
      if(idx!==-1) simpleMarkers.splice(idx,1);
    }
  });

  return marker;
}

function addCustomIcon(url, latlng) {
  const marker = L.marker(latlng, {
    icon: L.icon({
      iconUrl: url,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    }),
    draggable: true
  }).addTo(map);

  try {
    const file = String(url).split('/').pop() || '';
    const key = file.replace(/\.[^/.]+$/, '');
    marker._symbName = key;

    // --- Только если для символа есть label ---
    if(ICON_LABELS[key]){
      const label = ICON_SHORT[key] || ICON_LABELS[key];
      marker.bindTooltip(label, {
        permanent: false,
        direction: "top",
        offset: [0, -26],
        opacity: 0.95,
        className: 'symb-tooltip'
      });
    }
  } catch (e) { console.warn('tooltip bind error', e); }

  marker.on('click', () => {
    if (confirm('Удалить этот символ?')) {
      map.removeLayer(marker);
      const idx = simpleMarkers.indexOf(marker);
      if (idx !== -1) simpleMarkers.splice(idx, 1);
    }
  });

  return marker;
}

//------------ Заполнение списка карт автоматически ------------
const mapSelect = $id('mapSelect');
for (let i = 1; i <= MAP_COUNT; i++) {
  const baseName = MAP_NAMES[i] || `map${i}`;

  // --- Вариант A ---
  const optA = createEl('option');
  optA.value = `${MAP_FILE_PREFIX}${i}.jpg`;
  optA.textContent = `${i}. ${baseName}-a`;
  mapSelect.appendChild(optA);

  // --- Вариант B ---
  const optB = createEl('option');
  optB.value = `${MAP_FILE_PREFIX}${i}-alt.jpg`;
  optB.textContent = `${i}. ${baseName}-b`;
  mapSelect.appendChild(optB);
}

//------------ Загрузка карты (imageOverlay) ------------
function loadMapByFile(fileName){
  // Возвращаем Promise, чтобы можно было дождаться загрузки
  return new Promise((resolve, reject) => {
    // удаляем старую
    if(imageOverlay) {
      try { map.removeLayer(imageOverlay); } catch(e){}
      imageOverlay = null; imageBounds = null; currentMapFile = null;
    }

    const url = MAP_FOLDER + fileName;
    // загружаем картинку чтобы узнать размеры
    const img = new Image();
    img.onload = function(){
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // bounds: top-left [0,0], bottom-right [h, w] (lat,lng order for CRS.Simple)
      imageBounds = [[0,0],[h,w]];
      // сбрасываем CRS и view: для простоты используем CRS.Simple and set view to center
      imageOverlay = L.imageOverlay(url, imageBounds).addTo(map);
      // ensure overlay is behind markers/drawn items
      if (imageOverlay && typeof imageOverlay.bringToBack === 'function') {
        imageOverlay.bringToBack();
      }
      map.fitBounds(imageBounds);
      currentMapFile = fileName;
      resolve();
    };
    img.onerror = function(){
      reject(new Error('Не удалось загрузить файл карты: ' + url + '. Проверьте, что файл существует и название/регистр совпадают.'));
    };
    img.src = url;
  });
}

$id('btnLoadMap').addEventListener('click', ()=> {
  const sel = mapSelect.value;
  if(!sel) return alert('Выберите карту в списке.');
  loadMapByFile(sel).catch(err => alert(err.message));
});

$id('btnResetMap').addEventListener('click', ()=>{
  if(imageOverlay) map.removeLayer(imageOverlay);
  imageOverlay = null; imageBounds = null; currentMapFile = null;
  // сброс view
  map.setView([0,0], 0);
});

//------------ Создание UI для игроков (2 команды по 5) ------------
const RED_PLAYERS = $id('redPlayers');
const BLUE_PLAYERS = $id('bluePlayers');
const NATIONS = ['ussr','germany','usa'];

function makePlayerRow(team, index){
  // keep original indexing as in your code (index passed 1..5 earlier) - we'll use 1-based here for label but store 0-based where needed
  const row = createEl('div','player-row');
  const nickId = `${team}-nick-${index}`;
  const nationId = `${team}-nation-${index}`;
  const regId = `${team}-reg-${index}`;
  row.innerHTML = `
    <input id="${nickId}" type="text" placeholder="Ник" />
    <select id="${nationId}" class="nation-select"></select>
    <select id="${regId}" class="reg-select"></select>
    <button id="${team}-place-${index}">Поставить</button>
  `;
  // заполним нации
  const nationSel = row.querySelector(`#${nationId}`);
  NATIONS.forEach(n => {
    const o = createEl('option'); o.value = n; o.textContent = n.toUpperCase(); nationSel.appendChild(o);
  });
  // при смене нации обновим полки
  const regSel = row.querySelector(`#${regId}`);
  function fillRegOptions(nation){
    regSel.innerHTML = '';
    const regs = REG_NAMES[nation] || {};
    // добавляем до 17
    for(let i=1;i<=17;i++){
      const opt = createEl('option');
      opt.value = `reg${i}.png`;
      opt.textContent = (regs[i] || `Полк ${i}`);
      regSel.appendChild(opt);
    }
  }
  fillRegOptions(nationSel.value);
  nationSel.addEventListener('change', ()=> fillRegOptions(nationSel.value));

  // кнопка поставить
  const btn = row.querySelector(`#${team}-place-${index}`);
  btn.addEventListener('click', ()=>{
    const nick = (row.querySelector(`#${nickId}`).value || `Игрок ${index}`);
    const nation = row.querySelector(`#${nationId}`).value;
    const regiment = row.querySelector(`#${regId}`).value;
    placeMarker(nick, nation, regiment, team, index-1); // store 0-based index internally
  });

  return row;
}

for(let i=1;i<=5;i++){
  RED_PLAYERS.appendChild(makePlayerRow('red', i));
  BLUE_PLAYERS.appendChild(makePlayerRow('blue', i));
}

//------------ Управление маркерами ------------
function generateMarkerId(team, idx){ return `${team}-${idx}`; }

// создаём divIcon с <img onerror=...> чтобы показывать заглушку если не нашлось
function createRegDivIcon(nick, nation, regimentFile, team) {
  const iconUrl = `${ICON_FOLDER}${nation}/${regimentFile}`;
  const size = 56;

  // Назначаем класс в зависимости от выбранной команды
  const teamClass =
    team === 'blue' ? 'blue-marker' : team === 'red' ? 'red-marker' : '';

  const html = `
    <div class="mw2-reg ${teamClass}">
      <img src="${iconUrl}" 
           onerror="this.src='${PLACEHOLDER_SVG}'; this.style.width='56px'; this.style.height='56px'"
           style="width:${size}px;height:${size}px;object-fit:contain;" />
      <div class="mw2-label">${escapeHtml(nick)}</div>
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size + 18],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
  });
}
function placeMarker(nick, nation, regimentFile, team, playerIndex){
  const id = generateMarkerId(team, playerIndex);

  // удалим старый маркер этого игрока, если есть
  const existingIndex = markerList.findIndex(m => m.id === id);
  if (existingIndex !== -1) {
    try { map.removeLayer(markerList[existingIndex].marker); } catch(e){}
    markerList.splice(existingIndex, 1);
  }

  // позиция: центр карты (или центр изображения)
  const pos = map.getCenter();
  const icon = createRegDivIcon(nick, nation, regimentFile, team);
  const marker = L.marker(pos, { icon, draggable: true }).addTo(map);

  // не добавляем tooltip (как ты попросил удалить)
  marker.on('dragend', ()=> {
    // можно отлавливать новые координаты при необходимости
  });

  const entry = { id, team, playerIndex, nick, nation, regimentFile, marker };
  markerList.push(entry);
}

//------------ Кнопки готовых символов ------------
$id('btnFront').addEventListener('click', ()=>{
  if(!imageBounds) return alert('Загрузите карту перед добавлением символов (кнопка "Загрузить карту").');
  // фронт: прямая линия через центр горизонтально
  const b = imageBounds;
  const y = (b[0][0] + b[1][0]) / 2;
  const left = [y, b[0][1]];
  const right = [y, b[1][1]];
  const color = getDrawColor();
  const weight = getDrawWeight();
  const line = L.polyline([left, right], { color, weight }).addTo(drawnItems);
});

//-------------Сохранение и загрузка состояния эшелона----------

function saveCurrentEchelonState() {
  echelonStates[currentEchelon] = {
    markers: markerList.map(m => ({
      id: m.id,
      team: m.team,
      playerIndex: m.playerIndex,
      nick: m.nick,
      nation: m.nation,
      regimentFile: m.regimentFile,
      latlng: m.marker.getLatLng()
    })),
    simple: simpleMarkers.map(m => {
      const latlng = m.getLatLng ? m.getLatLng() : {lat:0,lng:0};
      const type = m._symbName || m._simpleType || null;
      const html = m.getElement ? m.getElement().innerHTML : '';
      return { latlng, type, html };
    }),
    drawings: (() => {
      const drawings = [];
      drawnItems.eachLayer(layer=>{
        try{
          if(layer instanceof L.Polyline && !(layer instanceof L.Polygon)){
            drawings.push({type:'polyline', latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), options: pickLayerOptions(layer)});
          } else if(layer instanceof L.Polygon){
            const rings = layer.getLatLngs();
            const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
            drawings.push({type:'polygon', latlngs, options: pickLayerOptions(layer)});
          } else if(layer instanceof L.Circle){
            drawings.push({type:'circle', center: layer.getLatLng(), radius: layer.getRadius(), options: pickLayerOptions(layer)});
          }
        } catch(e){console.warn('serialize drawing error', e);}
      });
      return drawings;
    })()
  };
}

function loadEchelonState(echelon) {
  if(!echelonStates[echelon]) return;
  const state = echelonStates[echelon];

  // очистить текущее
  drawnItems.clearLayers();
  markerList.forEach(m => { try { map.removeLayer(m.marker); } catch(e){} });
  markerList = [];
  simpleMarkers.forEach(m => { try { map.removeLayer(m); } catch(e){} });
  simpleMarkers = [];

  // восстановить
  (state.markers||[]).forEach(m=>{
    const pos = m.latlng || {lat:0,lng:0};
    const marker = L.marker([pos.lat,pos.lng], { icon:createRegDivIcon(m.nick,m.nation,m.regimentFile,m.team), draggable:true }).addTo(map);
    markerList.push({...m, marker});
  });

  (state.simple||[]).forEach(s=>{
    const latlng = s.latlng || {lat:0,lng:0};
    let marker;
    if(s.type && ICON_NAMES.includes(s.type)){
      marker = addCustomIcon(`assets/symbols/${s.type}.png`, latlng);
      marker._symbName = s.type;
    } else {
      marker = L.marker([latlng.lat, latlng.lng], {
        icon: L.divIcon({ html: s.html || '', className: 'symbol-marker' }),
        draggable: true
      }).addTo(map);
    }
    simpleMarkers.push(marker);
  });

  (state.drawings||[]).forEach(d=>{
    try{
      if(d.type==='polyline') L.polyline(d.latlngs.map(p=>[p.lat,p.lng]), d.options||{}).addTo(drawnItems);
      else if(d.type==='polygon') L.polygon(d.latlngs.map(p=>[p.lat,p.lng]), d.options||{}).addTo(drawnItems);
      else if(d.type==='circle') L.circle([d.center.lat,d.center.lng], { radius:d.radius, ...(d.options||{}) }).addTo(drawnItems);
    } catch(e){console.warn('Ошибка восстановления рисунка:',e);}
  });
}

//------------ Ластик и очистка ------------
$id('btnEraser').addEventListener('click', ()=>{
  if(!confirm('Удалить ВСЕ рисунки на карте?')) return;
  drawnItems.clearLayers();
});

$id('btnClearAll').addEventListener('click', ()=>{
  if(!confirm('Очистить карту полностью? (иконки и рисунки)')) return;
  // удалить маркеры
  markerList.forEach(m => { try { map.removeLayer(m.marker); } catch(e){} });
  markerList = [];
  // удалить простые символы
  simpleMarkers.forEach(m => { try { map.removeLayer(m); } catch(e){} });
  simpleMarkers = [];
  // удалить рисунки
  drawnItems.clearLayers();
});

//------------ Полоса толщины (связываем с UI) ------------
$id('drawWeight').addEventListener('input', (e)=>{
  $id('weightVal').textContent = e.target.value;
});

// ------------ Сохранение плана в JSON (обновлено с учётом эшелонов) ------------
$id('btnSave').addEventListener('click', () => {
  if (!currentMapFile && !confirm('Карта не загружена. Сохранить план без карты?')) return;

  // Перед сохранением актуализируем текущий эшелон
  saveCurrentEchelonState();

  const plan = {
    meta: {
      createdAt: new Date().toISOString(),
      mapFile: currentMapFile || null,
      echelonCount: ECHELON_COUNT
    },
    echelons: {},
    mapState: { center: map.getCenter(), zoom: map.getZoom() }
  };

  // Сохраняем данные по каждому эшелону
  for (let e = 1; e <= ECHELON_COUNT; e++) {
    const state = echelonStates[e];
    if (!state) continue;

    plan.echelons[e] = {
      markers: state.markers || [],
      simple: state.simple || [],
      drawings: state.drawings || []
    };
  }

  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (currentMapFile || 'plan').replace(/\.[^/.]+$/, '') + '_plan.json';
  a.click();
  URL.revokeObjectURL(a.href);
});


// ------------ Загрузка плана из JSON (обновлено с учётом эшелонов) ------------
function loadPlanData(plan) {
  if (!plan) return;

  const mapFile = plan.meta?.mapFile || 'map1.jpg';
  if (mapSelect) mapSelect.value = mapFile;

  loadMapByFile(mapFile).then(() => {
    // Если план содержит эшелоны
    if (plan.echelons) {
      // Восстанавливаем все эшелоны
      for (let e = 1; e <= (plan.meta?.echelonCount || 3); e++) {
        const state = plan.echelons[e];
        if (!state) continue;
        echelonStates[e] = {
          markers: (state.markers || []).map(m => ({
            ...m,
            marker: null // создадим позже при активации эшелона
          })),
          simple: state.simple || [],
          drawings: state.drawings || []
        };
      }

      // Загружаем первый эшелон по умолчанию
      currentEchelon = 1;
      loadEchelonState(currentEchelon);
    } else {
      // Старые планы без эшелонов — грузим как один общий эшелон
      echelonStates = {
        1: {
          markers: plan.markers || [],
          simple: plan.simple || [],
          drawings: plan.drawings || []
        },
        2: { markers: [], simple: [], drawings: [] },
        3: { markers: [], simple: [], drawings: [] }
      };
      currentEchelon = 1;
      loadEchelonState(1);
    }

    // Восстанавливаем позицию карты
    if (plan.mapState && plan.mapState.center && plan.mapState.zoom)
      map.setView(plan.mapState.center, plan.mapState.zoom);

    alert('✅ План успешно загружен!');
  }).catch(err => {
    console.error('Ошибка при загрузке карты:', err);
    alert('Ошибка при загрузке карты/плана: ' + (err.message || err));
  });
}

// === Обработчик кнопки загрузки плана ===
document.getElementById("loadPlan").addEventListener("click", () => {
  const input = document.getElementById("planFileInput");
  input.value = null; // сброс предыдущего выбора
  input.click();
});

document.getElementById("planFileInput").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      loadPlanData(data);  // <-- функция загрузки плана
    } catch(err) {
      console.error(err);
      alert("Ошибка при загрузке файла плана!");
    } finally {
      e.target.value = null; // сброс input после загрузки
    }
  };
  reader.readAsText(file);
});

map.attributionControl.setPrefix(false); // убирает "Leaflet"
map.attributionControl.addAttribution(''); // очищает оставшийся текст

$id('btnFillLower').addEventListener('click', () => {
  if (!imageBounds) return alert('Сначала загрузите карту.');

  const color = getDrawColor();

  const top = imageBounds[0][0];    // верх карты = 0
  const bottom = imageBounds[1][0]; // низ карты = высота изображения
  const left = imageBounds[0][1];   // левый край = 0
  const right = imageBounds[1][1];  // правый край = ширина изображения

  const midY = (top + bottom) / 2;

  L.polygon([
    [midY, left],    // середина слева
    [midY, right],   // середина справа
    [bottom, right], // низ справа
    [bottom, left]   // низ слева
  ], {
    color: color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.10
  }).addTo(drawnItems);
});

let assaultTimer = null;

function toggleAssault() {
  if (assaultTimer) {
    clearInterval(assaultTimer);
    assaultTimer = null;
    alert("Наступление остановлено");
    return;
  }

  if (!imageBounds) return alert("Сначала загрузите карту!");

  const top = imageBounds[0][0];    // верх карты
  const bottom = imageBounds[1][0]; // низ карты
  const left = imageBounds[0][1];
  const right = imageBounds[1][1];

  const waveInterval = 30000;  // каждые 30 секунд
  const frontDuration = 8000;  // длительность движения

  function spawnArrowSVG() {
    const xMid = left + Math.random() * (right - left); // случайно по горизонтали
    const yStart = bottom - 5;                           // чуть выше низа
    const yEnd = top + (bottom - top) * 0.45;           // чуть ниже верхнего края / до середины

    // SVG стрелка (вершина стрелки смотрит вверх)
    const svg = `
      <svg width="40" height="60" viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,60 35,10 20,20 5,10" fill="#ff3300" fill-opacity="0.35"/>
      </svg>
    `;

    const icon = L.divIcon({
      html: svg,
      className: 'assault-arrow',
      iconSize: [40, 60],
      iconAnchor: [20, 60], // нижняя точка стрелки на маркере
    });

    const marker = L.marker([yStart, xMid], { icon, interactive: false }).addTo(drawnItems);

    const startTime = performance.now();
    function animate() {
      const now = performance.now();
      const progress = Math.min((now - startTime) / frontDuration, 1);
      const newY = yStart - (yStart - yEnd) * progress; // движение вверх

      marker.setLatLng([newY, xMid]);

      if (progress < 1) requestAnimationFrame(animate);
      else setTimeout(() => drawnItems.removeLayer(marker), 2000);
    }
    requestAnimationFrame(animate);
  }

  // первый запуск сразу
  spawnArrowSVG();
  assaultTimer = setInterval(spawnArrowSVG, waveInterval);
}

// кнопка
document.getElementById("btnAssault").addEventListener("click", toggleAssault);

// ------------ Сохранить карту как изображение (исправлено: без сдвигов полигонов) ------------

function saveMapAsScreenshot() {
  if (!imageOverlay) return alert("Карта не загружена — нечего сохранять!");

  const mapContainer = document.getElementById('map');

  // Скрываем всплывающие окна Leaflet (если есть)
  const tooltips = mapContainer.querySelectorAll('.leaflet-tooltip');
  tooltips.forEach(t => t.style.display = 'none');

  html2canvas(mapContainer, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: true,
    scale: 2 // повышаем разрешение
  }).then(canvas => {
    // Восстанавливаем tooltips
    tooltips.forEach(t => t.style.display = '');

    const link = document.createElement('a');
    const fileName = currentMapFile
      ? currentMapFile.replace(/\.[^/.]+$/, '') + '_plan.png'
      : 'map_plan.png';
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(err => {
    console.error("Ошибка при создании скриншота карты:", err);
    alert("Не удалось сохранить карту как изображение.");
  });
}

// Привязка к кнопке
document.getElementById('btnSaveImage').addEventListener('click', saveMapAsScreenshot);


/*
  Safe Plan Sync Module (non-invasive)

  Usage:
    1) Include this file after your main script (or load it via console).
    2) From console, call: window._planSyncSafe.init({ autoRestore: false });
       - autoRestore: if true, attempts to call loadPlanData(plan) on init (default false).
    3) You can also call window._planSyncSafe.persistPlan() manually after map changes.

  This module intentionally:
    - DOES NOT auto-run on page load.
    - DOES NOT wrap or replace your existing functions.
    - DOES NOT listen to UI DOM elements.
    - Provides safe persist/restore functions you can call when ready.
*/

(function(window){
  const module = {};
  function getRoomId() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('room') || params.get('roomId') || 'default';
    } catch(e){ return 'default'; }
  }
  const ROOM_ID = getRoomId();
  const STORAGE_KEY = 'plan:' + ROOM_ID;
  const BC_NAME = 'plan-sync-' + ROOM_ID;
  let broadcast = null;
  try { if ('BroadcastChannel' in window) broadcast = new BroadcastChannel(BC_NAME); } catch(e){ broadcast = null; }

  function cloneEchelonsForStorage(echelonStatesObj) {
    const out = {};
    if (!echelonStatesObj) return out;
    for (const k in echelonStatesObj) {
      const s = echelonStatesObj[k];
      if (!s) continue;
      out[k] = {
        markers: (s.markers || []).map(m => {
          const copy = Object.assign({}, m);
          if (copy.marker !== undefined) delete copy.marker;
          return copy;
        }),
        simple: s.simple || [],
        drawings: s.drawings || []
      };
    }
    return out;
  }

  function buildPlanObject() {
    try { if (typeof saveCurrentEchelonState === 'function') saveCurrentEchelonState(); } catch(e){}
    const plan = {
      meta: {
        savedAt: new Date().toISOString(),
        mapFile: (typeof currentMapFile !== 'undefined') ? currentMapFile : null,
        echelonCount: (typeof ECHELON_COUNT !== 'undefined') ? ECHELON_COUNT : null
      },
      echelons: (typeof echelonStates !== 'undefined') ? cloneEchelonsForStorage(echelonStates) : {},
      mapState: {}
    };
    try {
      if (typeof map !== 'undefined' && map && typeof map.getCenter === 'function') {
        const c = map.getCenter();
        plan.mapState = { center: {lat: c.lat, lng: c.lng}, zoom: map.getZoom() };
      }
    } catch(e){}
    return plan;
  }

  const SYNC_THROTTLE_MS = 500;
  let lastPersist = 0;
  function persistPlan(force){
    const now = Date.now();
    if (!force && now - lastPersist < SYNC_THROTTLE_MS) return;
    lastPersist = now;
    const plan = buildPlanObject();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch(e){ console.warn('planSafe: localStorage write failed', e); }
    try {
      if (broadcast) broadcast.postMessage({ type: 'plan', plan });
      else localStorage.setItem(STORAGE_KEY + ':ping', Date.now().toString());
    } catch(e){ console.warn('planSafe: broadcast failed', e); }
  }

  function tryRestoreFromStorage(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const plan = JSON.parse(raw);
      return plan;
    } catch(e){
      console.warn('planSafe: restore failed', e);
      return null;
    }
  }

  function setupBroadcastListener(onPlanReceived){
    if (!broadcast) return;
    broadcast.onmessage = (ev) => {
      try {
        if (!ev.data) return;
        if (ev.data.type === 'plan' && ev.data.plan) {
          onPlanReceived && onPlanReceived(ev.data.plan);
        }
      } catch(e){ console.warn(e); }
    };
  }

  // storage event listener (other tabs)
  function setupStorageListener(onPlanReceived){
    window.addEventListener('storage', (ev) => {
      if (!ev.key) return;
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          const plan = JSON.parse(ev.newValue);
          onPlanReceived && onPlanReceived(plan);
        } catch(e){ console.warn(e); }
      } else if (ev.key === STORAGE_KEY + ':ping') {
        // ping - re-read main key
        const plan = tryRestoreFromStorage();
        if (plan) onPlanReceived && onPlanReceived(plan);
      }
    });
  }

  // Public API
  module.init = function(opts){
    opts = opts || {};
    const autoRestore = !!opts.autoRestore;
    const onPlanReceived = opts.onPlanReceived || function(plan){
      // default behavior: call existing loadPlanData(plan) if present
      try {
        if (typeof loadPlanData === 'function') {
          console.log('[planSafe] loadPlanData called for room', ROOM_ID);
          loadPlanData(plan);
        } else {
          console.log('[planSafe] plan received but loadPlanData() not found', plan);
        }
      } catch(e){ console.warn('planSafe: onPlanReceived error', e); }
    };
    setupBroadcastListener(onPlanReceived);
    setupStorageListener(onPlanReceived);
    if (autoRestore) {
      const plan = tryRestoreFromStorage();
      if (plan) onPlanReceived(plan);
    }
    console.log('[planSafe] initialized for room', ROOM_ID, 'autoRestore=', autoRestore);
  };

  module.persistPlan = persistPlan;
  module.restorePlan = function(){
    return tryRestoreFromStorage();
  };
  module.storageKey = STORAGE_KEY;
  module.roomId = ROOM_ID;

  window._planSyncSafe = module;
})(window);
