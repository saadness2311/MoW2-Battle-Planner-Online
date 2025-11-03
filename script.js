// Инициализация Supabase, авторизация, экраны входа и список комнат.

/* --- Supabase и bcrypt --- */
const supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
  ? supabase.createClient(
      'https://zqklzhipwiifrrbyentg.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxa2x6aGlwd2lpZnJyYnllbnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzQ0ODYsImV4cCI6MjA3NjU1MDQ4Nn0.siMc2xCvoBEjwNVwaOVvjlOtDODs9yDo0IDyGl9uWso'
    )
  : null;

// --- Вспомогательные утилиты ---
function $id(id){ return document.getElementById(id); }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const uuidv4 = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-'+Math.random().toString(36).slice(2,9));

// --- Уведомление ---
function showToast(msg, ttl=2500){
  let container = document.getElementById('mow2_toast_container');
  if(!container){
    container = document.createElement('div');
    container.id='mow2_toast_container';
    Object.assign(container.style,{
      position:'fixed',right:'12px',bottom:'12px',zIndex:99999,
      display:'flex',flexDirection:'column',gap:'6px',alignItems:'flex-end',pointerEvents:'none'
    });
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style,{
    background:'#222',color:'#eee',padding:'8px 10px',
    borderRadius:'6px',fontSize:'13px',pointerEvents:'auto',
    boxShadow:'0 6px 18px rgba(0,0,0,0.6)'
  });
  container.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity 300ms'; el.style.opacity=0; setTimeout(()=>el.remove(),300); }, ttl);
}

// ----------------- AUTH OBJECT -----------------
const Auth = {
  currentUser: null,
  async register(username, password){
    if(!supabaseClient) throw new Error('Supabase не доступен');
    if(!username) { showToast('Укажите ник'); return null; }
    const { data: existing } = await supabaseClient.from('users_mow2').select('id').eq('username', username).limit(1);
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
    const { data, error } = await supabaseClient.from('users_mow2').select('id,username,password_hash').eq('username', username).single();
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
    try{ const raw = localStorage.getItem('mow2_user'); if(!raw) return null;
      this.currentUser = JSON.parse(raw); return this.currentUser;
    }catch(e){return null;}
  }
};

// --- Создание экранов ---
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
      </div>`;
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
      </div>`;
    document.body.appendChild(rooms);

    // кнопка создания комнаты
    $id('mow2_btn_create_room').onclick = async ()=>{
      const name = $id('mow2_room_name').value.trim();
      const pwd = $id('mow2_room_pwd').value || null;
      if (!name) return alert('Введите название комнаты');

      const { data: owned } = await supabaseClient.from('rooms').select('id').eq('owner_user_id', Auth.currentUser.id);
      if (owned && owned.length >= 4) return alert('Лимит: максимум 4 комнаты');

      const password_hash = pwd ? (typeof bcrypt!=='undefined'?bcrypt.hashSync(pwd,10):pwd) : null;
      const { data, error } = await supabaseClient.from('rooms').insert([{
        name, password_hash, owner_user_id: Auth.currentUser.id, current_echelon:1, max_players:50, settings:{}
      }]).select().single();
      if (error){ console.error(error); alert('Ошибка создания комнаты'); return; }

      await supabaseClient.from('room_members').upsert(
        [{ room_id:data.id, user_id:Auth.currentUser.id, is_owner:true }],
        { onConflict:['room_id','user_id'] }
      );
      alert('Комната создана'); loadRoomsList();
    };

    $id('mow2_btn_logout').onclick = ()=>Auth.logout();
  }
}

function showAuthScreen(){
  ensureAuthAndRoomsContainers();
  $id('mow2_auth_container').style.display='flex';
  $id('mow2_rooms_container').style.display='none';
  document.querySelectorAll('.app,#map').forEach(el=>el.style.pointerEvents='none');
}

// --- Комнаты: загрузка списка ---
async function loadRoomsList() {
  const list = $id('mow2_rooms_list');
  if (!list) return;

  list.innerHTML = '<div style="color:#999;padding:8px">Загрузка...</div>';
  try {
    const { data: rooms, error } = await supabaseClient
      .from('rooms')
      .select('id,name,owner_user_id')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!rooms || rooms.length === 0) {
      list.innerHTML = '<div style="color:#888;padding:8px">Пока нет комнат</div>';
      return;
    }

    // Получаем всех владельцев, чтобы вывести ник
    const ownerIds = [...new Set(rooms.map(r => r.owner_user_id))];
    const { data: owners } = await supabaseClient
      .from('users_mow2')
      .select('id,username')
      .in('id', ownerIds);
    const ownerMap = {};
    (owners || []).forEach(o => ownerMap[o.id] = o.username);

    list.innerHTML = '';
    for (const room of rooms) {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.background = 'rgba(15,15,15,0.6)';
      div.style.padding = '8px';
      div.style.marginBottom = '6px';
      div.style.borderRadius = '6px';

      const left = document.createElement('div');
      left.innerHTML = `<div style="font-size:15px">${escapeHtml(room.name)}</div>
                        <div style="font-size:12px;color:#aaa">Создатель: ${escapeHtml(ownerMap[room.owner_user_id] || room.owner_user_id)}</div>`;
      div.appendChild(left);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '8px';

      const joinBtn = document.createElement('button');
      joinBtn.textContent = 'Войти';
      joinBtn.onclick = async () => {
        const { data: members } = await supabaseClient.from('room_members')
          .select('user_id').eq('room_id', room.id);
        const exists = (members || []).find(m => m.user_id === Auth.currentUser.id);
        if (!exists) {
          await supabaseClient.from('room_members').upsert([
            { room_id: room.id, user_id: Auth.currentUser.id, is_owner: false }
          ], { onConflict: ['room_id', 'user_id'] });
        }
        CURRENT_ROOM_ID = room.id;
        showRoomPanelOnEnter();
        $id('mow2_rooms_container').style.display = 'none';
      };
      right.appendChild(joinBtn);

      if (room.owner_user_id === Auth.currentUser.id) {
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Удалить';
        delBtn.onclick = async () => {
          if (!confirm('Удалить комнату?')) return;
          await supabaseClient.from('rooms').delete().eq('id', room.id);
          await supabaseClient.from('room_members').delete().eq('room_id', room.id);
          loadRoomsList();
        };
        right.appendChild(delBtn);
      }

      div.appendChild(right);
      list.appendChild(div);
    }
  } catch (err) {
    console.error(err);
    list.innerHTML = '<div style="color:#f88;padding:8px">Ошибка загрузки списка комнат</div>';
  }
}

function showRoomsScreen(){
  ensureAuthAndRoomsContainers();
  $id('mow2_auth_container').style.display='none';
  $id('mow2_rooms_container').style.display='flex';
  document.querySelectorAll('.app,#map').forEach(el=>el.style.pointerEvents='auto');
  if ($id('mow2_user_label')) $id('mow2_user_label').textContent = Auth.currentUser ? escapeHtml(Auth.currentUser.username) : '';
  loadRoomsList();
}

function bindAuthUI(){
  ensureAuthAndRoomsContainers();
  $id('mow2_btn_login').onclick = async ()=>{
    const u = await Auth.login($id('mow2_in_username').value.trim(), $id('mow2_in_password').value);
    if(u) showRoomsScreen();
  };
  $id('mow2_btn_register').onclick = async ()=>{
    const u = await Auth.register($id('mow2_in_username').value.trim(), $id('mow2_in_password').value);
    if(u) showRoomsScreen();
  };
  $id('mow2_btn_guest').onclick = async ()=>{
    const guest = 'guest_'+Math.random().toString(36).slice(2,8);
    const u = await Auth.register(guest, uuidv4());
    if(u) showRoomsScreen();
  };
}

// --- Комнаты ---
let ROOM_PANEL_STATE = { open: false };
let CURRENT_ROOM_ID = null; // глобальная переменная комнаты
// markerList, simpleMarkers, map, currentEchelon, drawnItems, echelonStates assumed defined elsewhere in your original script

async function initRoomPanel() {
  // если уже есть — обновим
  if (document.getElementById('mow2_room_panel')) return refreshRoomPanel();

  const panel = document.createElement('div');
  panel.id = 'mow2_room_panel';
  Object.assign(panel.style, {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(20,20,20,0.9)',
    color: '#ddd',
    padding: '8px',
    borderRadius: '10px',
    zIndex: 99999,
    minWidth: '360px',
    fontFamily: 'sans-serif',
    boxShadow: '0 6px 18px rgba(0,0,0,0.6)'
  });

  // header: room name + toggle
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.gap = '8px';

  const title = document.createElement('div');
  title.id = 'mow2_room_panel_title';
  title.textContent = 'Комната';
  title.style.fontWeight = '700';
  header.appendChild(title);

  const rightControls = document.createElement('div');
  rightControls.style.display = 'flex';
  rightControls.style.gap = '6px';
  // collapse button
  const toggle = document.createElement('button');
  toggle.id = 'mow2_room_panel_toggle';
  toggle.textContent = '▾';
  toggle.style.background = 'none';
  toggle.style.border = 'none';
  toggle.style.color = '#ddd';
  toggle.style.cursor = 'pointer';
  toggle.onclick = () => {
    ROOM_PANEL_STATE.open = !ROOM_PANEL_STATE.open;
    body.style.display = ROOM_PANEL_STATE.open ? 'block' : 'none';
    toggle.textContent = ROOM_PANEL_STATE.open ? '▴' : '▾';
  };
  rightControls.appendChild(toggle);
  header.appendChild(rightControls);
  panel.appendChild(header);

  // body: info + players + owner controls
  const body = document.createElement('div');
  body.id = 'mow2_room_panel_body';
  body.style.marginTop = '8px';
  body.style.display = ROOM_PANEL_STATE.open ? 'block' : 'none';

  // room info row
  const infoRow = document.createElement('div');
  infoRow.style.display = 'flex';
  infoRow.style.justifyContent = 'space-between';
  infoRow.style.alignItems = 'center';
  infoRow.style.gap = '8px';

  const infoLeft = document.createElement('div');
  infoLeft.innerHTML = `<div style="font-size:13px">Название: <span id="mow2_room_name_label">—</span></div>
                        <div style="font-size:12px;color:#aaa">Создатель: <span id="mow2_room_owner_label">—</span></div>`;
  infoRow.appendChild(infoLeft);

  // who has turn
  const turnDiv = document.createElement('div');
  turnDiv.style.textAlign = 'right';
  turnDiv.innerHTML = `<div style="font-size:13px;color:#ffb;">Ход: <span id="mow2_room_turn_label">—</span></div>`;
  infoRow.appendChild(turnDiv);

  body.appendChild(infoRow);

  // players list
  const playersTitle = document.createElement('div');
  playersTitle.textContent = 'Игроки:';
  playersTitle.style.marginTop = '8px';
  playersTitle.style.fontSize = '13px';
  playersTitle.style.color = '#ddd';
  body.appendChild(playersTitle);

  const playersList = document.createElement('div');
  playersList.id = 'mow2_room_players';
  playersList.style.display = 'flex';
  playersList.style.flexDirection = 'column';
  playersList.style.gap = '6px';
  playersList.style.maxHeight = '150px';
  playersList.style.overflowY = 'auto';
  playersList.style.marginTop = '6px';
  body.appendChild(playersList);

  // owner action row
  const ownerRow = document.createElement('div');
  ownerRow.style.display = 'flex';
  ownerRow.style.justifyContent = 'flex-end';
  ownerRow.style.gap = '6px';
  ownerRow.style.marginTop = '8px';

  const btnSaveState = document.createElement('button');
  btnSaveState.textContent = 'Сохранить (созд.)';
  btnSaveState.style.padding = '6px';
  btnSaveState.style.cursor = 'pointer';
  btnSaveState.onclick = async () => {
    // Только для владельца -> сохраняем snapshot всех эшелонов (hook)
    if (!await amIOwner()) return showToast('Только создатель может сохранить');
    try {
      // HOOK: создаём snapshot (серилизация карты) — вызываем captureMapState для каждого эшелона
      const snapshot = {
        e1: (typeof echelonStates !== 'undefined' && echelonStates[1]) ? echelonStates[1] : null,
        e2: (typeof echelonStates !== 'undefined' && echelonStates[2]) ? echelonStates[2] : null,
        e3: (typeof echelonStates !== 'undefined' && echelonStates[3]) ? echelonStates[3] : null
      };
      await supabaseClient.from('echelon_snapshots').insert([{ room_id: CURRENT_ROOM_ID, echelon: 0, snapshot }]);
      showToast('Сохранено создателем');
    } catch (e) { console.warn(e); showToast('Ошибка сохранения'); }
  };
  ownerRow.appendChild(btnSaveState);

  const btnClearMap = document.createElement('button');
  btnClearMap.textContent = 'Очистить карту';
  btnClearMap.style.padding = '6px';
  btnClearMap.style.cursor = 'pointer';
  btnClearMap.onclick = async () => {
    if (!await amIOwner()) return showToast('Только создатель может очищать карту');
    // HOOK: очистка карты локально — также сохранить удаление в БД при необходимости
    clearMapAll();
    showToast('Карта очищена (локально)');
    // возможно: удалить markers/drawings в БД - если реализовано
  };
  ownerRow.appendChild(btnClearMap);

  body.appendChild(ownerRow);
  panel.appendChild(body);

  document.body.appendChild(panel);

  // initial load
  refreshRoomPanel();
}

// helper: am I owner of current room?
async function amIOwner() {
  if (!CURRENT_ROOM_ID || !Auth.currentUser) return false;
  try {
    const { data } = await supabaseClient.from('rooms').select('owner_user_id').eq('id', CURRENT_ROOM_ID).single();
    return data && data.owner_user_id === Auth.currentUser.id;
  } catch (e) { console.warn(e); return false; }
}

// refresh players and room info
async function refreshRoomPanel() {
  const titleEl = $id('mow2_room_name_label');
  const ownerEl = $id('mow2_room_owner_label');
  const turnEl = $id('mow2_room_turn_label');
  const playersContainer = $id('mow2_room_players');
  if (!playersContainer) return;

  // load room info
  try {
    const { data: room } = await supabaseClient.from('rooms').select('*').eq('id', CURRENT_ROOM_ID).single();
    if (room) {
      if (titleEl) titleEl.textContent = room.name || '—';
      if (ownerEl) {
        // fetch owner's username
        const { data: owner } = await supabaseClient.from('users_mow2').select('username').eq('id', room.owner_user_id).limit(1).single();
        ownerEl.textContent = owner? owner.username : '—';
      }
      if (turnEl) {
        // if rooms.settings includes mapName or turn_owner_username — display appropriately
        if (room.turn_owner_user_id) {
          // attempt to get username
          try {
            const { data: u } = await supabaseClient.from('users_mow2').select('username').eq('id', room.turn_owner_user_id).limit(1).single();
            turnEl.textContent = u ? u.username : room.turn_owner_user_id;
          } catch(e) { turnEl.textContent = room.turn_owner_user_id; }
        } else {
          turnEl.textContent = '—';
        }
      }
      // apply map if set and function exists
      try {
        const mapName = room.settings && room.settings.mapName;
        if (mapName && typeof applyMapFromSettings === 'function') {
          applyMapFromSettings(mapName);
        } else if (mapName && typeof window.applyMap === 'function') {
          window.applyMap(mapName);
        }
      } catch(e){ console.warn('applyMapFromSettings err', e); }
    }
  } catch (e) { console.warn('loadRoom info', e); }

  // list members
  playersContainer.innerHTML = '<div style="color:#999">Загрузка...</div>';
  try {
    const { data: members } = await supabaseClient.from('room_members').select('user_id,is_owner').eq('room_id', CURRENT_ROOM_ID);
    const userIds = (members||[]).map(m=>m.user_id);
    const { data: users } = await supabaseClient.from('users_mow2').select('id,username').in('id', userIds);
    const usersMap = {};
    (users||[]).forEach(u=> usersMap[u.id] = u.username);

    playersContainer.innerHTML = '';
    for (const m of (members||[])) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.background = 'rgba(15,15,15,0.6)';
      row.style.padding = '6px';
      row.style.borderRadius = '6px';
      const name = document.createElement('div');
      name.textContent = usersMap[m.user_id] || m.user_id;
      if (m.is_owner) name.textContent += ' (создатель)';
      row.appendChild(name);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      // kick button (visible to owner, not to self)
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Выгнать';
      kickBtn.style.padding = '4px';
      kickBtn.style.cursor = 'pointer';
      kickBtn.onclick = async () => {
        if (!await amIOwner()) return showToast('Только создатель может выгнать');
        if (m.user_id === Auth.currentUser.id) return showToast('Нельзя выгнать себя');
        // remove from room_members
        try {
          await supabaseClient.from('room_members').delete().match({ room_id: CURRENT_ROOM_ID, user_id: m.user_id });
          showToast('Игрок выгнан');
          refreshRoomPanel();
        } catch (e) { console.warn(e); showToast('Ошибка'); }
      };

      // transfer turn button (visible to owner)
      const giveBtn = document.createElement('button');
      giveBtn.textContent = 'Дать ход';
      giveBtn.style.padding = '4px';
      giveBtn.style.cursor = 'pointer';
      giveBtn.onclick = async () => {
        if (!await amIOwner()) return showToast('Только создатель может передавать ход');
        try {
          await requestGiveTurn(m.user_id);
          showToast('Ход передан');
          refreshRoomPanel();
        } catch (e) { console.warn(e); showToast('Ошибка передачи'); }
      };

      // show buttons only for owner (not for regular players)
      const iAmOwner = await amIOwner();
      if (iAmOwner) {
        if (m.user_id !== Auth.currentUser.id) actions.appendChild(kickBtn);
        actions.appendChild(giveBtn);
      }

      row.appendChild(actions);
      playersContainer.appendChild(row);
    }
  } catch (e) { console.warn('load members', e); playersContainer.innerHTML = '<div style="color:#faa">Ошибка</div>'; }
}

// helper: call when entering room
async function showRoomPanelOnEnter() {
  await initRoomPanel();
  await refreshRoomPanel();
  setupRealtimeForRoom();
  // add a lightweight subscription to room_members/rooms if desired (real-time)
  // e.g. supabaseClient.from(`room_members:room_id=eq.${CURRENT_ROOM_ID}`).on('INSERT', ...).subscribe()
}

// small util: clear map -- hook into your map clearing logic
function clearMapAll() {
  // HOOK: replace with your existing clearing functions
  try {
    // remove markers
    if (typeof markerList !== 'undefined') {
      markerList.forEach(m=> {
        try{ map.removeLayer(m.marker); }catch(e){}
      });
      markerList = [];
    }
    // clear drawn items
    if (typeof drawnItems !== 'undefined') drawnItems.clearLayers();
    // optionally clear simpleMarkers array and leaflet layers
    if (typeof simpleMarkers !== 'undefined') {
      simpleMarkers.forEach(s=>{ try{ map.removeLayer(s.layer); }catch(e){} });
      simpleMarkers = [];
    }
    // reset echelon states
    echelonStates = {1:{markers:[],simple:[],drawings:[]},2:{markers:[],simple:[],drawings:[]},3:{markers:[],simple:[],drawings:[]}};
  } catch (e) { console.warn('clearMapAll', e); }
}
// --- Инициализация ---
// --- Финальная инициализация ---
window.addEventListener('DOMContentLoaded', async () => {
  // гарантируем, что контейнеры созданы
  ensureAuthAndRoomsContainers();

  // восстанавливаем пользователя
  const saved = Auth.loadFromStorage();

  // назначаем кнопки и обработчики
  bindAuthUI();

  // теперь можно показать экран
  if (saved) {
    // обновляем подпись пользователя
    if ($id('mow2_user_label')) {
      $id('mow2_user_label').textContent = Auth.currentUser.username;
    }
    // показываем список комнат
    showRoomsScreen();
  } else {
    showAuthScreen();
  }
});

/* =================== MULTIPLAYER / SUPABASE HOOKS (INSERT AT EOF) ===================
   Автономный блок, который реализует:
   - подписки Realtime (supabase-js v2)
   - запись маркеров только по dragend (финальное положение)
   - плавная анимация при получении обновлений
   - синхронизация выбора карты (rooms.settings.mapName)
   Требует существования: supabaseClient, Auth, map, markerList, simpleMarkers, currentEchelon, CURRENT_ROOM_ID
*/

///// helpers
function debounce(fn, ms){
  let t;
  return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), ms); };
}

const uuidLocal = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-'+Math.random().toString(36).slice(2,9));

let _realtimeChannels = []; // active supabase channels

// Проверка: текущий пользователь имеет ли ход в комнате
async function ensureMyTurn(){
  if(!CURRENT_ROOM_ID) return false;
  if(!Auth || !Auth.currentUser) return false;
  try{
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('turn_owner_user_id')
      .eq('id', CURRENT_ROOM_ID)
      .limit(1)
      .single();
    if(error){
      console.warn('ensureMyTurn: supabase error', error);
      return false;
    }
    return data && data.turn_owner_user_id === Auth.currentUser.id;
  }catch(e){
    console.warn('ensureMyTurn exception', e);
    return false;
  }
}

// Owner-only: заменить владельца хода
async function requestGiveTurn(targetUserId){
  if(!CURRENT_ROOM_ID) {
    showToast('Не указана комната');
    return false;
  }
  if(!Auth || !Auth.currentUser) {
    showToast('Необходим вход');
    return false;
  }

  try{
    const payload = { turn_owner_user_id: targetUserId || null };
    const res = await supabaseClient
      .from('rooms')
      .update(payload)
      .eq('id', CURRENT_ROOM_ID)
      .select();

    if(res.error){
      console.error('requestGiveTurn error', res.error);
      showToast('Ошибка при передаче хода: ' + (res.error.message || 'unknown'));
      return false;
    }

    // обновим UI метку (без лишнего запроса)
    if(Array.isArray(res.data) && res.data.length){
      const room = res.data[0];
      const turnLabel = document.getElementById('mow2_room_turn_label');
      if(turnLabel){
        if(room.turn_owner_user_id){
          // попытка получить username
          supabaseClient.from('users_mow2').select('username').eq('id', room.turn_owner_user_id).limit(1).single()
            .then(r => { if(r.data && r.data.username) turnLabel.textContent = r.data.username; else turnLabel.textContent = room.turn_owner_user_id; })
            .catch(()=> { turnLabel.textContent = room.turn_owner_user_id; });
        } else {
          turnLabel.textContent = '—';
        }
      }
    }

    return true;
  }catch(e){
    console.error('requestGiveTurn exception', e);
    showToast('Исключение при передаче хода');
    return false;
  }
}

// Удаляем все активные каналы
function teardownRealtime(){
  try{
    _realtimeChannels.forEach(ch => {
      try{ supabaseClient.removeChannel && supabaseClient.removeChannel(ch); }catch(e){}
      try{ ch.unsubscribe && ch.unsubscribe(); }catch(e){}
    });
  }catch(e){ console.warn('teardownRealtime err', e); }
  _realtimeChannels = [];
}

// Анимация движения маркера (плавный переход)
function animateMarkerTo(marker, targetLatLng, duration = 350){
  if(!marker) return;
  const start = marker.getLatLng();
  const sx = start.lat, sy = start.lng;
  const ex = Number(targetLatLng[0]), ey = Number(targetLatLng[1]);
  const startTime = performance.now();

  function step(t){
    const dt = Math.min(1, (t - startTime) / duration);
    const nx = sx + (ex - sx) * dt;
    const ny = sy + (ey - sy) * dt;
    try{ marker.setLatLng([nx, ny]); }catch(e){}
    if(dt < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Запись финальной позиции маркера (вызов по dragend)
// если markerOrEntry - leaflet marker, пытаемся найти id в markerList
async function writeFinalMarkerPosition(markerOrEntry){
  if(!CURRENT_ROOM_ID || !Auth.currentUser) return;
  const haveTurn = await ensureMyTurn();
  if(!haveTurn) {
    showToast('Изменения не сохранены, потому что не ваш ход');
    return;
  }

  try{
    let id = null;
    let latlng = null;
    // возможные формы аргумента:
    // 1) object из markerList: {id, marker, ...}
    // 2) leaflet marker object
    if(markerOrEntry && markerOrEntry.id && markerOrEntry.marker){
      id = markerOrEntry.id;
      latlng = markerOrEntry.marker.getLatLng();
    } else if (markerOrEntry && typeof markerOrEntry.getLatLng === 'function'){
      latlng = markerOrEntry.getLatLng();
      const found = (typeof markerList !== 'undefined') ? markerList.find(m=> m.marker === markerOrEntry || m.marker._leaflet_id === markerOrEntry._leaflet_id) : null;
      if(found) id = found.id;
    }

    if(!latlng) return;

    if(id){
      // UPDATE существующего маркера
      const { error } = await supabaseClient.from('markers').update({
        x: String(latlng.lat),
        y: String(latlng.lng),
        updated_at: new Date().toISOString(),
        status: 'idle',
        last_moved_by: Auth.currentUser.id
      }).eq('id', id).eq('room_id', CURRENT_ROOM_ID);
      if(error) { console.warn('writeFinalMarkerPosition update error', error); showToast('Ошибка сохранения позиции'); }
    } else {
      // INSERT новый маркер
      const newId = uuidLocal();
      const payload = {
        id: newId,
        room_id: CURRENT_ROOM_ID,
        echelon: (typeof currentEchelon !== 'undefined' ? currentEchelon : 1),
        symb_name: markerOrEntry._symbName || (markerOrEntry._simpleType || null),
        x: String(latlng.lat),
        y: String(latlng.lng),
        rotation: 0,
        meta: { created_by: Auth.currentUser.id },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { error } = await supabaseClient.from('markers').insert([payload]);
      if(error) { console.warn('writeFinalMarkerPosition insert error', error); showToast('Ошибка создания маркера'); }
      else {
        // attach id locally if we can
        try{
          const found = (typeof simpleMarkers !== 'undefined') ? simpleMarkers.find(s=> s._leaflet_id === markerOrEntry._leaflet_id) : null;
          if(found) markerList.push({ id: newId, marker: found, regimentFile: payload.symb_name });
        }catch(e){}
      }
    }
  }catch(e){ console.warn('writeFinalMarkerPosition exception', e); }
}

// Вызвать при создании маркера локально (если нужно — попытаться записать немедленно, только если у пользователя ход)
async function onLocalMarkerCreated(marker){
  // маркер создаётся локально; сохраняем только если наш ход
  if(!marker) return;
  if(!Auth.currentUser) return;
  const haveTurn = await ensureMyTurn();
  if(!haveTurn){
    showToast('Сохранить изменение можно только если у вас ход');
    return;
  }
  await writeFinalMarkerPosition(marker);
}

// Вызвать на dragend — маркер уже отпущен, записываем финальную позицию
function onLocalMarkerMoved(marker){
  // marker: leaflet marker or wrapper
  writeFinalMarkerPosition(marker).catch(e=>console.warn(e));
}

// Подписки Realtime через Supabase v2 channel+postgres_changes
function setupRealtimeForRoom(){
  teardownRealtime();
  if(!CURRENT_ROOM_ID) return;

  function channelFor(name){
    const topic = `room-${CURRENT_ROOM_ID}-${name}`;
    const ch = (supabaseClient.channel ? supabaseClient.channel(topic) : null);
    if(!ch) {
      console.warn('Realtime not available on supabaseClient');
      return null;
    }
    _realtimeChannels.push(ch);
    return ch;
  }

  // MARKERS
  try{
    const markersChan = channelFor('markers');
    if(markersChan){
      markersChan
        .on('postgres_changes', { event: 'INSERT', schema:'public', table:'markers', filter: `room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          const m = payload.new; if(!m) return;
          // если уже есть - пропускаем (локально)
          if(typeof markerList !== 'undefined' && markerList.find(mm=>mm.id===m.id)) return;
          try{
            const lat = Number(m.x), lng = Number(m.y);
            const marker = L.marker([lat,lng], { draggable: true }).addTo(map);
            marker.on('dragend', ()=>{ if (typeof onLocalMarkerMoved === 'function') onLocalMarkerMoved(marker); });
            // сохраняем минимальную инфу
            markerList.push({ id: m.id, marker, regimentFile: m.symb_name, meta: m.meta });
          }catch(e){ console.warn(e); }
        })
        .on('postgres_changes', { event: 'UPDATE', schema:'public', table:'markers', filter: `room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          const m = payload.new; if(!m) return;
          const idx = (typeof markerList!=='undefined') ? markerList.findIndex(mm=>mm.id===m.id) : -1;
          if(idx === -1) {
            // если нет локально - создаём
            try{
              const lat = Number(m.x), lng = Number(m.y);
              const marker = L.marker([lat,lng], { draggable: true }).addTo(map);
              marker.on('dragend', ()=>{ if (typeof onLocalMarkerMoved === 'function') onLocalMarkerMoved(marker); });
              markerList.push({ id: m.id, marker, regimentFile: m.symb_name, meta: m.meta });
            }catch(e){}
          } else {
            // плавная анимация к новой позиции
            const target = [Number(m.x), Number(m.y)];
            try{ animateMarkerTo(markerList[idx].marker, target, 350); }catch(e){ console.warn(e); }
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema:'public', table:'markers', filter: `room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          const old = payload.old; if(!old) return;
          const idx = (typeof markerList!=='undefined') ? markerList.findIndex(mm=>mm.id===old.id) : -1;
          if(idx !== -1){
            try{ map.removeLayer(markerList[idx].marker); }catch(e){}
            markerList.splice(idx,1);
          }
        })
        .subscribe();
    }
  }catch(e){ console.warn('markers chan err', e); }

  // ROOMS: observe turn_owner_user_id and settings.mapName
  try{
    const roomsChan = channelFor('rooms');
    if(roomsChan){
      roomsChan
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          const r = payload.new; if(!r) return;
          const turnLabel = document.getElementById('mow2_room_turn_label');
          if(turnLabel){
            if(r.turn_owner_user_id){
              supabaseClient.from('users_mow2').select('username').eq('id', r.turn_owner_user_id).limit(1).single()
                .then(res => { if(res.data && res.data.username) turnLabel.textContent = res.data.username; else turnLabel.textContent = r.turn_owner_user_id; })
                .catch(()=> { turnLabel.textContent = r.turn_owner_user_id; });
            } else {
              turnLabel.textContent = '—';
            }
          }
          // sync map selection if changed
          try{
            const mapName = r.settings && r.settings.mapName;
            if(mapName){
              if(typeof applyMapFromSettings === 'function'){
                applyMapFromSettings(mapName);
              } else if (typeof window.applyMap === 'function'){
                window.applyMap(mapName);
              } else {
                // optional fallback: if you have a function to set base image tile, call it
                if (typeof window.setMapByName === 'function') window.setMapByName(mapName);
              }
            }
          }catch(e){ console.warn('apply map on rooms update err', e); }
        })
        .subscribe();
    }
  }catch(e){ console.warn('rooms chan err', e); }

  // ROOM_MEMBERS: refresh UI
  try{
    const memChan = channelFor('room_members');
    if(memChan){
      memChan
        .on('postgres_changes', { event:'*', schema:'public', table:'room_members', filter:`room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          try{ refreshRoomPanel(); }catch(e){}
        })
        .subscribe();
    }
  }catch(e){ console.warn('room_members chan err', e); }
}

// если остальные части кода вызывают window.onLocalMarkerCreated/onLocalMarkerMoved — подставляем
if (typeof window.onLocalMarkerCreated !== 'function') window.onLocalMarkerCreated = onLocalMarkerCreated;
if (typeof window.onLocalMarkerMoved !== 'function') window.onLocalMarkerMoved = onLocalMarkerMoved;

/* ================= End of MULTIPLAYER HOOKS =================== */


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
