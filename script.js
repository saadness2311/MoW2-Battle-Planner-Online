// Инициализация Supabase, авторизация, экраны входа и список комнат.
// (Не трогаем визуал сайта — стили темно-серые сохраняются.)

/* --- Supabase и bcrypt --- */
const SUPABASE_URL = 'https://zqklzhipwiifrrbyentg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxa2x6aGlwd2lpZnJyYnllbnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzQ0ODYsImV4cCI6MjA3NjU1MDQ4Nn0.siMc2xCvoBEjwNVwaOVvjlOtDODs9yDo0IDyGl9uWso';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase и bcryptjs подключены');
  /* --- тут оставляй весь твой остальной код как есть --- */
}

// Вспомогательные утилиты (оставлены в том же стиле)
function $id(id){ return document.getElementById(id); }
function createEl(tag, cls){ const e = document.createElement(tag); if(cls) e.className = cls; return e; }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const nowIso = () => (new Date()).toISOString();
const uuidv4 = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-'+Math.random().toString(36).slice(2,9));

// лёгкий toast
function showToast(msg, ttl=2500){
  let container = document.getElementById('mow2_toast_container');
  if(!container){
    container = document.createElement('div'); container.id='mow2_toast_container';
    Object.assign(container.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:99999,display:'flex',flexDirection:'column',gap:'6px',alignItems:'flex-end',pointerEvents:'none'});
    document.body.appendChild(container);
  }
  const el = document.createElement('div'); el.textContent = msg;
  Object.assign(el.style,{background:'#222',color:'#eee',padding:'8px 10px',borderRadius:'6px',fontSize:'13px',pointerEvents:'auto',boxShadow:'0 6px 18px rgba(0,0,0,0.6)'});
  container.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity 300ms'; el.style.opacity=0; setTimeout(()=>el.remove(),300); }, ttl);
}

// ----------------- AUTH (простая регистрация/логин, никакие ограничения не требуются) -----------------
const Auth = {
  currentUser: null,
  async register(username, password){
    if(!supabaseClient) throw new Error('Supabase не доступен');
    if(!username) { showToast('Укажите ник'); return null; }
    // проверка уникальности ника
    const { data: existing, error: exErr } = await supabaseClient.from('users_mow2').select('id').eq('username', username).limit(1);
    if (exErr){ console.error(exErr); showToast('Ошибка проверки ника'); return null; }
    if (existing && existing.length>0){ showToast('Ник занят'); return null; }
    const hash = (typeof bcrypt !== 'undefined') ? bcrypt.hashSync(password || '', 10) : (password || '');
    const { data, error } = await supabaseClient.from('users_mow2').insert([{ username, password_hash: hash }]).select().single();
    if (error){ console.error(error); showToast('Ошибка регистрации'); return null; }
    this.currentUser = { id: data.id, username: data.username };
    localStorage.setItem('mow2_user', JSON.stringify(this.currentUser));
    showToast('Зарегистрирован');
    return this.currentUser;
  },
  async login(username, password){
    if(!supabaseClient) throw new Error('Supabase не доступен');
    const { data, error } = await supabaseClient.from('users_mow2').select('id,username,password_hash').eq('username', username).limit(1).single();
    if (error || !data){ showToast('Пользователь не найден'); return null; }
    const ok = (typeof bcrypt !== 'undefined') ? bcrypt.compareSync(password || '', data.password_hash) : (password === data.password_hash);
    if (!ok){ showToast('Неверный пароль'); return null; }
    this.currentUser = { id: data.id, username: data.username };
    localStorage.setItem('mow2_user', JSON.stringify(this.currentUser));
    showToast('Вход выполнен');
    return this.currentUser;
  },
  logout(){
    localStorage.removeItem('mow2_user'); this.currentUser = null; showAuthScreen();
  },
  loadFromStorage(){
    try{ const raw = localStorage.getItem('mow2_user'); if(!raw) return null; this.currentUser = JSON.parse(raw); return this.currentUser; }catch(e){return null;}
  }
};

// ----------------- UI: отдельные HTML-экраны auth + rooms -----------------
// Ожидаю, что в index.html нет элементов, поэтому создаю контейнеры динамически.
// Они минималистичные, темно-серые и не ломают основной дизайн.

function ensureAuthAndRoomsContainers(){
  if (!$id('mow2_auth_container')){
    const auth = document.createElement('div'); auth.id='mow2_auth_container';
    Object.assign(auth.style,{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(6,6,6,0.7)',zIndex:9998});
    auth.innerHTML = `
      <div style="width:380px;background:#1b1b1b;padding:18px;border-radius:10px;color:#ddd;font-family:sans-serif">
        <h2 style="margin:0 0 12px 0">MoW2 Battle Planner — Вход</h2>
        <input id="mow2_in_username" placeholder="Ник" style="width:100%;padding:8px;border-radius:6px;background:#222;color:#fff;border:1px solid #333;margin-bottom:8px" />
        <input id="mow2_in_password" type="password" placeholder="Пароль" style="width:100%;padding:8px;border-radius:6px;background:#222;color:#fff;border:1px solid #333;margin-bottom:12px" />
        <div style="display:flex;gap:8px">
          <button id="mow2_btn_login" style="flex:1;padding:8px">Войти</button>
          <button id="mow2_btn_register" style="flex:1;padding:8px">Регистрация</button>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button id="mow2_btn_guest" style="flex:1;padding:8px">Войти как гость</button>
        </div>
      </div>
    `;
    document.body.appendChild(auth);
  }

  if (!$id('mow2_rooms_container')){
    const rooms = document.createElement('div'); rooms.id='mow2_rooms_container';
    Object.assign(rooms.style,{position:'fixed',left:0,top:0,right:0,bottom:0,display:'none',alignItems:'center',justifyContent:'center',background:'rgba(6,6,6,0.6)',zIndex:9998});
    rooms.innerHTML = `
      <div style="width:820px;background:#111;padding:16px;border-radius:10px;color:#ddd;font-family:sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0">Комнаты</h2>
          <div><span id="mow2_user_label" style="margin-right:12px;color:#bbb"></span><button id="mow2_btn_logout">Выйти</button></div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <input id="mow2_room_name" placeholder="Название комнаты" style="flex:1;padding:8px;border-radius:6px;background:#222;color:#fff;border:1px solid #333" />
          <input id="mow2_room_pwd" placeholder="Пароль (опционально)" style="width:220px;padding:8px;border-radius:6px;background:#222;color:#fff;border:1px solid #333" />
          <button id="mow2_btn_create_room" style="padding:8px">Создать</button>
        </div>
        <div id="mow2_rooms_list" style="margin-top:12px;max-height:360px;overflow:auto"></div>
      </div>
    `;
    document.body.appendChild(rooms);
  }
}

function showAuthScreen(){
  ensureAuthAndRoomsContainers();
  $id('mow2_auth_container').style.display='flex';
  $id('mow2_rooms_container').style.display='none';
  // hide main map / app area to avoid user interacting until logged in
  document.querySelectorAll('.app, #map').forEach(el=>{ if(el) el.style.pointerEvents='none'; });
}

function showRoomsScreen(){
  ensureAuthAndRoomsContainers();
  $id('mow2_auth_container').style.display='none';
  $id('mow2_rooms_container').style.display='flex';
  document.querySelectorAll('.app, #map').forEach(el=>{ if(el) el.style.pointerEvents='none'; });
  // fill user label
  const u = Auth.currentUser || Auth.loadFromStorage();
  if (u) $id('mow2_user_label').textContent = `Пользователь: ${u.username}`;
  loadRoomsList();
}

// --------- Bind auth UI handlers ----------
function bindAuthUI(){
  ensureAuthAndRoomsContainers();
  $id('mow2_btn_login').onclick = async ()=> {
    const username = $id('mow2_in_username').value.trim();
    const password = $id('mow2_in_password').value;
    const u = await Auth.login(username, password);
    if (u) showRoomsScreen();
  };
  $id('mow2_btn_register').onclick = async ()=> {
    const username = $id('mow2_in_username').value.trim();
    const password = $id('mow2_in_password').value;
    const u = await Auth.register(username, password);
    if (u) showRoomsScreen();
  };
  $id('mow2_btn_guest').onclick = async ()=> {
    const guest = 'guest_' + Math.random().toString(36).slice(2,8);
    const u = await Auth.register(guest, uuidv4());
    if (u) showRoomsScreen();
  };
}

// --------- Rooms list / creation ----------
async function loadRoomsList(){
  const container = $id('mow2_rooms_list');
  if (!container) return;
  container.innerHTML = '<div style="color:#999;padding:8px">Загрузка...</div>';
  const { data: rooms, error } = await supabaseClient.from('rooms').select('id,name,owner_user_id,max_players,created_at');
  if (error){ console.error(error); container.innerHTML = '<div style="color:#faa">Ошибка загрузки</div>'; return; }
  // fetch owners
  const ownerIds = Array.from(new Set((rooms||[]).map(r=>r.owner_user_id).filter(Boolean)));
  const owners = {};
  if (ownerIds.length){
    const { data: users } = await supabaseClient.from('users_mow2').select('id,username').in('id', ownerIds);
    (users||[]).forEach(u=> owners[u.id]=u.username);
  }
  // build list
  container.innerHTML = (rooms||[]).map(r=>{
    const owner = owners[r.owner_user_id] || '—';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-radius:6px;background:#151515;margin-bottom:8px">
      <div>
        <div style="font-weight:600">${escapeHtml(r.name)}</div>
        <div style="font-size:12px;color:#999">Создатель: ${escapeHtml(owner)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="mow2_join" data-id="${r.id}">Войти</button>
        <button class="mow2_view" data-id="${r.id}">Просмотр</button>
      </div>
    </div>`;
  }).join('');
  // bind
  container.querySelectorAll('.mow2_join').forEach(b=> b.onclick = async (e)=> { const id=b.dataset.id; await attemptJoinRoom(id); });
  container.querySelectorAll('.mow2_view').forEach(b=> b.onclick = async (e)=> { const id=b.dataset.id; await enterRoomAsViewer(id); });
}

$id && $id('mow2_btn_create_room') && $id('mow2_btn_create_room').addEventListener('click', async ()=>{
  const name = $id('mow2_room_name').value.trim();
  const pwd = $id('mow2_room_pwd').value || null;
  if (!name) return showToast('Введите название комнаты');
  // check owned rooms count
  const { data: owned } = await supabaseClient.from('rooms').select('id').eq('owner_user_id', Auth.currentUser.id);
  if (owned && owned.length >= 4) { showToast('Лимит: вы уже создали 4 комнаты'); return; }
  const password_hash = pwd ? (typeof bcrypt !== 'undefined' ? bcrypt.hashSync(pwd,10) : pwd) : null;
  const { data, error } = await supabaseClient.from('rooms').insert([{
    name, password_hash, owner_user_id: Auth.currentUser.id, current_echelon:1, max_players:50, settings: {}
  }]).select().single();
  if (error){ console.error(error); showToast('Ошибка создания комнаты'); return; }
  // add membership
  await supabaseClient.from('room_members').insert([{ room_id: data.id, user_id: Auth.currentUser.id, is_owner:true }]);
  showToast('Комната создана');
  loadRoomsList();
});

// пытаемся присоединиться (если пароль есть — запросить)
async function attemptJoinRoom(roomId){
  const { data: room, error } = await supabaseClient.from('rooms').select('id,name,password_hash,owner_user_id').eq('id', roomId).single();
  if (error || !room) return showToast('Комната не найдена');
  if (room.password_hash){
    const pwd = prompt('Введите пароль комнаты:') || '';
    const ok = (typeof bcrypt !== 'undefined') ? bcrypt.compareSync(pwd, room.password_hash) : (pwd === room.password_hash);
    if (!ok) return showToast('Неверный пароль');
  }
  // add member if not exists
  try{ await supabaseClient.from('room_members').insert([{ room_id: roomId, user_id: Auth.currentUser.id, is_owner: room.owner_user_id===Auth.currentUser.id }]); }catch(e){}
  await enterRoom(roomId); // см. Part 3: enterRoom интегрирован с картой
}

async function enterRoomAsViewer(roomId){
  try{ await supabaseClient.from('room_members').insert([{ room_id: roomId, user_id: Auth.currentUser.id, is_owner:false }]); }catch(e){}
  await enterRoom(roomId);
}

// logout
$id && $id('mow2_btn_logout') && $id('mow2_btn_logout').addEventListener('click', ()=>{ Auth.logout(); });

// Инициализация: если пользователь сохранён — открыть rooms, иначе auth
(function bootAuth(){
  bindAuthUI();
  const saved = Auth.loadFromStorage();
  if (saved) showRoomsScreen(); else showAuthScreen();
})();

// ====================== Part 2 ======================
// script_full.js — ЧАСТЬ 2/3
// Твой оригинальный script.js — инициализация карты, эшелоны, маркеры, UI, сохранение/загрузка.
// Небольшие правки: добавлены хук-вызовы в местах создания/перемещения маркеров
// чтобы интегрировать с Supabase, если пользователь в комнате.


// ------------ Конфигурация ------------
const MAP_COUNT = 25; // теперь map1..map25
const MAP_FILE_PREFIX = "map"; // map1.jpg
const MAP_FOLDER = "assets/maps/";
const ICON_FOLDER = "assets/"; // assets/{nation}/regX.png

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

// ------------ Draw control: цвет/толщина остаются ------------
function getDrawColor(){ return $id('drawColor') ? $id('drawColor').value : '#ff0000'; }
function getDrawWeight(){ return $id('drawWeight') ? Number($id('drawWeight').value) : 3; }

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

map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;
  if (layer.setStyle) {
    const style = { color: getDrawColor(), weight: getDrawWeight() };
    if (layer instanceof L.Polygon) {
      style.fillColor = getDrawColor();
      style.fillOpacity = 0.15;
    }
    layer.setStyle(style);
  }
  if (layer instanceof L.Circle) {
    layer.setStyle && layer.setStyle({ color: getDrawColor(), weight: getDrawWeight() });
  }
  drawnItems.addLayer(layer);
});

map.on(L.Draw.Event.EDITED, function (e) {});
map.on(L.Draw.Event.DELETED, function (e) {});

// === SimpleSymbols контроль ===
const SimpleSymbols = L.Control.extend({
  onAdd: function(map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    container.style.background = 'rgba(20,20,20,0.6)';
    container.style.border = '1px solid rgba(255,255,255,0.15)';
    container.style.cursor = 'pointer';
    container.style.padding = '4px';

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

      const menu = L.DomUtil.create('div', '', container);
      menu.style.display = 'none';
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
      menu.style.display = 'none';

      menus[key] = menu;

      L.DomEvent.on(btn, 'click', () => {
        for (const k in menus) {
          if (k === key) {
            menus[k].style.display = menus[k].style.display === 'none' ? 'grid' : 'none';
          } else {
            menus[k].style.display = 'none';
          }
        }
      });
    }

    for (const category in ICON_CATEGORIES) {
      const menu = menus[category];
      menu.style.display = 'none';
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
          // integrate with supabase if in room (see Part 3)
          if (typeof onLocalMarkerCreated === 'function') {
            onLocalMarkerCreated(mk);
          }
        });
      });
    }

    return container;
  }
});

map.addControl(new SimpleSymbols({ position: 'topleft' }));

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

  marker._simpleType = type;

  marker.on('click', () => {
    if(confirm('Удалить этот символ?')){
      map.removeLayer(marker);
      const idx = simpleMarkers.indexOf(marker);
      if(idx!==-1) simpleMarkers.splice(idx,1);
    }
  });

  // integration hook
  if (typeof onLocalMarkerCreated === 'function') onLocalMarkerCreated(marker);

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

  // integration hook
  if (typeof onLocalMarkerCreated === 'function') onLocalMarkerCreated(marker);

  return marker;
}

//------------ Заполнение списка карт автоматически ------------
const mapSelect = $id('mapSelect');
for (let i = 1; i <= MAP_COUNT; i++) {
  const baseName = MAP_NAMES[i] || `map${i}`;
  const optA = createEl('option');
  optA.value = `${MAP_FILE_PREFIX}${i}.jpg`;
  optA.textContent = `${i}. ${baseName}-a`;
  mapSelect.appendChild(optA);
  const optB = createEl('option');
  optB.value = `${MAP_FILE_PREFIX}${i}-alt.jpg`;
  optB.textContent = `${i}. ${baseName}-b`;
  mapSelect.appendChild(optB);
}

//------------ Загрузка карты (imageOverlay) ------------
function loadMapByFile(fileName){
  return new Promise((resolve, reject) => {
    if(imageOverlay) {
      try { map.removeLayer(imageOverlay); } catch(e){}
      imageOverlay = null; imageBounds = null; currentMapFile = null;
    }
    const url = MAP_FOLDER + fileName;
    const img = new Image();
    img.onload = function(){
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      imageBounds = [[0,0],[h,w]];
      imageOverlay = L.imageOverlay(url, imageBounds).addTo(map);
      if (imageOverlay && typeof imageOverlay.bringToBack === 'function') imageOverlay.bringToBack();
      map.fitBounds(imageBounds);
      currentMapFile = fileName;
      resolve();
    };
    img.onerror = function(){ reject(new Error('Не удалось загрузить файл карты: ' + url)); };
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
  map.setView([0,0], 0);
});

//------------ UI игроков (2 команды по 5) ------------
const RED_PLAYERS = $id('redPlayers');
const BLUE_PLAYERS = $id('bluePlayers');
const NATIONS = ['ussr','germany','usa'];

function makePlayerRow(team, index){
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
  const nationSel = row.querySelector(`#${nationId}`);
  NATIONS.forEach(n => {
    const o = createEl('option'); o.value = n; o.textContent = n.toUpperCase(); nationSel.appendChild(o);
  });
  const regSel = row.querySelector(`#${regId}`);
  function fillRegOptions(nation){
    regSel.innerHTML = '';
    const regs = REG_NAMES[nation] || {};
    for(let i=1;i<=17;i++){
      const opt = createEl('option');
      opt.value = `reg${i}.png`;
      opt.textContent = (regs[i] || `Полк ${i}`);
      regSel.appendChild(opt);
    }
  }
  fillRegOptions(nationSel.value);
  nationSel.addEventListener('change', ()=> fillRegOptions(nationSel.value));
  const btn = row.querySelector(`#${team}-place-${index}`);
  btn.addEventListener('click', ()=> {
    const nick = (row.querySelector(`#${nickId}`).value || `Игрок ${index}`);
    const nation = row.querySelector(`#${nationId}`).value;
    const regiment = row.querySelector(`#${regId}`).value;
    placeMarker(nick, nation, regiment, team, index-1);
  });
  return row;
}

for(let i=1;i<=5;i++){
  RED_PLAYERS.appendChild(makePlayerRow('red', i));
  BLUE_PLAYERS.appendChild(makePlayerRow('blue', i));
}

//------------ Управление маркерами ------------
function generateMarkerId(team, idx){ return `${team}-${idx}`; }

function createRegDivIcon(nick, nation, regimentFile, team) {
  const iconUrl = `${ICON_FOLDER}${nation}/${regimentFile}`;
  const size = 56;
  const teamClass = team === 'blue' ? 'blue-marker' : team === 'red' ? 'red-marker' : '';
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
  const existingIndex = markerList.findIndex(m => m.id === id);
  if (existingIndex !== -1) {
    try { map.removeLayer(markerList[existingIndex].marker); } catch(e){}
    markerList.splice(existingIndex, 1);
  }
  const pos = map.getCenter();
  const icon = createRegDivIcon(nick, nation, regimentFile, team);
  const marker = L.marker(pos, { icon, draggable: true }).addTo(map);
  marker.on('dragend', ()=> {
    // hook to sync position (Part 3 will attach handler)
    if (typeof onLocalMarkerMoved === 'function') onLocalMarkerMoved(marker);
  });
  const entry = { id, team, playerIndex, nick, nation, regimentFile, marker };
  markerList.push(entry);
  // create in db if in room (Part 3 hook)
  if (typeof onLocalMarkerCreated === 'function') onLocalMarkerCreated(entry);
}

//------------ Кнопки готовых символов ------------
$id('btnFront').addEventListener('click', ()=>{
  if(!imageBounds) return alert('Загрузите карту перед добавлением символов (кнопка "Загрузить карту").');
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
  drawnItems.clearLayers();
  markerList.forEach(m => { try { map.removeLayer(m.marker); } catch(e){} });
  markerList = [];
  simpleMarkers.forEach(m => { try { map.removeLayer(m); } catch(e){} });
  simpleMarkers = [];
  (state.markers||[]).forEach(m=>{
    const pos = m.latlng || {lat:0,lng:0};
    const marker = L.marker([pos.lat,pos.lng], { icon:createRegDivIcon(m.nick,m.nation,m.regimentFile,m.team), draggable:true }).addTo(map);
    marker.on('dragend', ()=> { if (typeof onLocalMarkerMoved === 'function') onLocalMarkerMoved(marker); });
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
  markerList.forEach(m => { try { map.removeLayer(m.marker); } catch(e){} });
  markerList = [];
  simpleMarkers.forEach(m => { try { map.removeLayer(m); } catch(e){} });
  simpleMarkers = [];
  drawnItems.clearLayers();
});

//------------ Полоса толщины ------------
$id('drawWeight').addEventListener('input', (e)=>{
  $id('weightVal').textContent = e.target.value;
});

// ------------ Сохранение плана в JSON ------------
$id('btnSave').addEventListener('click', () => {
  if (!currentMapFile && !confirm('Карта не загружена. Сохранить план без карты?')) return;
  saveCurrentEchelonState();
  const plan = {
    meta: { createdAt: new Date().toISOString(), mapFile: currentMapFile || null, echelonCount: ECHELON_COUNT },
    echelons: {},
    mapState: { center: map.getCenter(), zoom: map.getZoom() }
  };
  for (let e = 1; e <= ECHELON_COUNT; e++) {
    const state = echelonStates[e];
    if (!state) continue;
    plan.echelons[e] = { markers: state.markers || [], simple: state.simple || [], drawings: state.drawings || [] };
  }
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (currentMapFile || 'plan').replace(/\.[^/.]+$/, '') + '_plan.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

// ------------ Загрузка плана из JSON ------------
function loadPlanData(plan) {
  if (!plan) return;
  const mapFile = plan.meta?.mapFile || 'map1.jpg';
  if (mapSelect) mapSelect.value = mapFile;
  loadMapByFile(mapFile).then(() => {
    if (plan.echelons) {
      for (let e = 1; e <= (plan.meta?.echelonCount || 3); e++) {
        const state = plan.echelons[e];
        if (!state) continue;
        echelonStates[e] = {
          markers: (state.markers || []).map(m => ({ ...m, marker: null })),
          simple: state.simple || [],
          drawings: state.drawings || []
        };
      }
      currentEchelon = 1;
      loadEchelonState(currentEchelon);
    } else {
      echelonStates = {
        1: { markers: plan.markers || [], simple: plan.simple || [], drawings: plan.drawings || [] },
        2: { markers: [], simple: [], drawings: [] },
        3: { markers: [], simple: [], drawings: [] }
      };
      currentEchelon = 1;
      loadEchelonState(1);
    }
    if (plan.mapState && plan.mapState.center && plan.mapState.zoom) map.setView(plan.mapState.center, plan.mapState.zoom);
    alert('✅ План успешно загружен!');
  }).catch(err => {
    console.error('Ошибка при загрузке карты:', err);
    alert('Ошибка при загрузке карты/плана: ' + (err.message || err));
  });
}

document.getElementById("loadPlan").addEventListener("click", () => {
  const input = document.getElementById("planFileInput");
  input.value = null;
  input.click();
});

document.getElementById("planFileInput").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      loadPlanData(data);
    } catch(err) {
      console.error(err);
      alert("Ошибка при загрузке файла плана!");
    } finally {
      e.target.value = null;
    }
  };
  reader.readAsText(file);
});

map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('');

$id('btnFillLower').addEventListener('click', () => {
  if (!imageBounds) return alert('Сначала загрузите карту.');
  const color = getDrawColor();
  const top = imageBounds[0][0];
  const bottom = imageBounds[1][0];
  const left = imageBounds[0][1];
  const right = imageBounds[1][1];
  const midY = (top + bottom) / 2;
  L.polygon([
    [midY, left],
    [midY, right],
    [bottom, right],
    [bottom, left]
  ], {
    color: color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.10
  }).addTo(drawnItems);
});

// ---------- Наступление (DEACTIVATED) ----------
// В ТЗ разрешено удалить механику "наступление противника". Отключаю кнопку.
// Функция сохраняется, но кнопка вызова отключена.
let assaultTimer = null;
function toggleAssault() {
  // intentionally disabled in multiplayer edition
  showToast('Механика наступления отключена для многопользовательского режима (по ТЗ).');
}
if ($id('btnAssault')) {
  $id('btnAssault').removeEventListener && $id('btnAssault').removeEventListener('click', toggleAssault);
  // не вешаем обработчик, чтобы кнопка визуально осталась, но не включала таймер
}

// ------------ Сохранение как изображение ------------
function saveMapAsScreenshot() {
  if (!imageOverlay) return alert("Карта не загружена — нечего сохранять!");
  const mapContainer = document.getElementById('map');
  const tooltips = mapContainer.querySelectorAll('.leaflet-tooltip');
  tooltips.forEach(t => t.style.display = 'none');
  html2canvas(mapContainer, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: true,
    scale: 2
  }).then(canvas => {
    tooltips.forEach(t => t.style.display = '');
    const link = document.createElement('a');
    const fileName = currentMapFile ? currentMapFile.replace(/\.[^/.]+$/, '') + '_plan.png' : 'map_plan.png';
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(err => {
    console.error("Ошибка при создании скриншота карты:", err);
    alert("Не удалось сохранить карту как изображение.");
  });
}
$id('btnSaveImage').addEventListener('click', saveMapAsScreenshot);
