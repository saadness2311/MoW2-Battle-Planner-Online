// ИСПРАВЛЕННЫЙ СКРИПТ С ПРАВИЛЬНОЙ СИНХРОНИЗАЦИЕЙ

const supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
  ? supabase.createClient(
      'https://qevtrgxjlditqmgqlgnn.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFldnRyZ3hqbGRpdHFtZ3FsZ25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQxNjAsImV4cCI6MjA3NzgyMDE2MH0.1HBbNY8fv-MTQlp6nlzqRYVAKXrHkWAkmEdyKvS-CN4'
    )
  : null;

function $id(id){ return document.getElementById(id); }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const uuidv4 = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-'+Math.random().toString(36).slice(2,9));

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
    background:'#222',color:'#eee',padding:'6px 8px',
    borderRadius:'4px',fontSize:'12px',pointerEvents:'auto',
    boxShadow:'0 4px 12px rgba(0,0,0,0.5)'
  });
  container.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity 300ms'; el.style.opacity=0; setTimeout(()=>el.remove(),300); }, ttl);
}

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
    showToast('Регистрация выполнена');
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

    $id('mow2_btn_create_room').onclick = async ()=>{
      const name = $id('mow2_room_name').value.trim();
      const pwd = $id('mow2_room_pwd').value || null;
      if (!name) return alert('Введите название комнаты');

      const { data: owned } = await supabaseClient.from('rooms').select('id').eq('owner_user_id', Auth.currentUser.id);
      if (owned && owned.length >= 4) return alert('Лимит: максимум 4 комнаты');

      const password_hash = pwd ? (typeof bcrypt!=='undefined'?bcrypt.hashSync(pwd,10):pwd) : null;
      const { data, error } = await supabaseClient.from('rooms').insert([{
        name,
        password_hash,
        owner_user_id: Auth.currentUser.id,
        turn_owner_user_id: Auth.currentUser.id,
        current_echelon: 1,
        max_players: 50,
        settings: {}
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

let ROOM_PANEL_STATE = { open: false };
let CURRENT_ROOM_ID = null;

async function initRoomPanel() {
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

  const body = document.createElement('div');
  body.id = 'mow2_room_panel_body';
  body.style.marginTop = '8px';
  body.style.display = ROOM_PANEL_STATE.open ? 'block' : 'none';

  const infoRow = document.createElement('div');
  infoRow.style.display = 'flex';
  infoRow.style.justifyContent = 'space-between';
  infoRow.style.alignItems = 'center';
  infoRow.style.gap = '8px';

  const infoLeft = document.createElement('div');
  infoLeft.innerHTML = `<div style="font-size:13px">Название: <span id="mow2_room_name_label">—</span></div>
                        <div style="font-size:12px;color:#aaa">Создатель: <span id="mow2_room_owner_label">—</span></div>`;
  infoRow.appendChild(infoLeft);

  const turnDiv = document.createElement('div');
  turnDiv.style.textAlign = 'right';
  turnDiv.innerHTML = `<div style="font-size:13px;color:#ffb;">Ход: <span id="mow2_room_turn_label">—</span></div>`;
  infoRow.appendChild(turnDiv);

  body.appendChild(infoRow);

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

  const ownerRow = document.createElement('div');
  ownerRow.style.display = 'flex';
  ownerRow.style.justifyContent = 'flex-end';
  ownerRow.style.gap = '6px';
  ownerRow.style.marginTop = '8px';

  const btnClearMap = document.createElement('button');
  btnClearMap.textContent = 'Очистить карту';
  btnClearMap.style.padding = '6px';
  btnClearMap.style.cursor = 'pointer';
  btnClearMap.onclick = async () => {
    if (!await amIOwner()) return showToast('Только создатель может очищать карту');
    clearMapAll();
    showToast('Карта очищена');
  };
  ownerRow.appendChild(btnClearMap);

  body.appendChild(ownerRow);
  panel.appendChild(body);

  document.body.appendChild(panel);

  refreshRoomPanel();
}

async function amIOwner() {
  if (!CURRENT_ROOM_ID || !Auth.currentUser) return false;
  try {
    const { data } = await supabaseClient.from('rooms').select('owner_user_id').eq('id', CURRENT_ROOM_ID).single();
    return data && data.owner_user_id === Auth.currentUser.id;
  } catch (e) { console.warn(e); return false; }
}

async function refreshRoomPanel() {
  const titleEl = $id('mow2_room_name_label');
  const ownerEl = $id('mow2_room_owner_label');
  const turnEl = $id('mow2_room_turn_label');
  const playersContainer = $id('mow2_room_players');
  if (!playersContainer) return;

  try {
    const { data: room } = await supabaseClient.from('rooms').select('*').eq('id', CURRENT_ROOM_ID).single();
    if (room) {
      if (titleEl) titleEl.textContent = room.name || '—';
      if (ownerEl) {
        const { data: owner } = await supabaseClient.from('users_mow2').select('username').eq('id', room.owner_user_id).limit(1).single();
        ownerEl.textContent = owner? owner.username : '—';
      }
      if (turnEl) {
        if (room.turn_owner_user_id) {
          try {
            const { data: u } = await supabaseClient.from('users_mow2').select('username').eq('id', room.turn_owner_user_id).limit(1).single();
            turnEl.textContent = u ? u.username : room.turn_owner_user_id;
          } catch(e) { turnEl.textContent = room.turn_owner_user_id; }
        } else {
          turnEl.textContent = '—';
        }
      }

      try {
        if (room && !room.turn_owner_user_id && room.owner_user_id === Auth.currentUser.id) {
          await supabaseClient.from('rooms').update({ turn_owner_user_id: room.owner_user_id }).eq('id', CURRENT_ROOM_ID);
          if (turnEl) {
            const { data: owner } = await supabaseClient.from('users_mow2').select('username').eq('id', room.owner_user_id).limit(1).single();
            turnEl.textContent = owner && owner.username ? owner.username : room.owner_user_id;
          }
        }
      } catch (e) {
        console.warn('backfill turn_owner_user_id failed', e);
      }

      try {
        const mapName = room.settings && room.settings.mapName;
        if (mapName && mapName !== currentMapFile) {
          await loadMapByFile(mapName).catch(e => console.warn(e));
        }
      } catch(e){ console.warn('applyMapFromSettings err', e); }
    }
  } catch (e) { console.warn('loadRoom info', e); }

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

      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Выгнать';
      kickBtn.style.padding = '4px';
      kickBtn.style.cursor = 'pointer';
      kickBtn.onclick = async () => {
        if (!await amIOwner()) return showToast('Только создатель может выгнать');
        if (m.user_id === Auth.currentUser.id) return showToast('Нельзя выгнать себя');
        try {
          await supabaseClient.from('room_members').delete().match({ room_id: CURRENT_ROOM_ID, user_id: m.user_id });
          showToast('Игрок выгнан');
          refreshRoomPanel();
        } catch (e) { console.warn(e); showToast('Ошибка'); }
      };

      const giveBtn = document.createElement('button');
      giveBtn.textContent = 'Дать ход';
      giveBtn.style.padding = '4px';
      giveBtn.style.cursor = 'pointer';
      giveBtn.onclick = async () => {
        if (!await amIOwner()) return showToast('Только создатель может передавать ход');
        try {
          await supabaseClient.from('rooms').update({ turn_owner_user_id: m.user_id }).eq('id', CURRENT_ROOM_ID);
          showToast('Ход передан');
          refreshRoomPanel();
        } catch (e) { console.warn(e); showToast('Ошибка передачи'); }
      };

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

async function showRoomPanelOnEnter() {
  await initRoomPanel();
  await refreshRoomPanel();
  setupRealtimeForRoom();
  setTimeout(refreshRoomPanel, 1000);
}

function clearMapAll() {
  try {
    if (typeof markerList !== 'undefined') {
      markerList.forEach(m=> {
        try{ map.removeLayer(m.marker); }catch(e){}
      });
      markerList = [];
    }
    if (typeof drawnItems !== 'undefined') drawnItems.clearLayers();
    if (typeof simpleMarkers !== 'undefined') {
      simpleMarkers.forEach(s=>{ try{ map.removeLayer(s.layer || s); }catch(e){} });
      simpleMarkers = [];
    }
    echelonStates = {1:{markers:[],simple:[],drawings:[]},2:{markers:[],simple:[],drawings:[]},3:{markers:[],simple:[],drawings:[]}};
  } catch (e) { console.warn('clearMapAll', e); }
}

window.addEventListener('DOMContentLoaded', async () => {
  ensureAuthAndRoomsContainers();
  const saved = Auth.loadFromStorage();
  bindAuthUI();
  if (saved) {
    if ($id('mow2_user_label')) {
      $id('mow2_user_label').textContent = Auth.currentUser.username;
    }
    showRoomsScreen();
  } else {
    showAuthScreen();
  }
});

// REALTIME SYNC
let _realtimeChannels = [];

function teardownRealtime(){
  try{
    _realtimeChannels.forEach(ch => {
      try{ supabaseClient.removeChannel && supabaseClient.removeChannel(ch); }catch(e){}
      try{ ch.unsubscribe && ch.unsubscribe(); }catch(e){}
    });
  }catch(e){ console.warn('teardownRealtime err', e); }
  _realtimeChannels = [];
}

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

async function writeFinalMarkerPosition(markerOrEntry){
  function isValidUUID(u){ return typeof u === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(u); }

  if(!CURRENT_ROOM_ID || !Auth.currentUser) return;
  const haveTurn = await ensureMyTurn();
  if(!haveTurn) {
    return;
  }

  try{
    let id = null;
    let latlng = null;
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
      try{
        if(!isValidUUID(id)){
          throw { code: 'LOCAL_ID_NOT_UUID' };
        }
        const { error } = await supabaseClient.from('markers').update({
          x: String(latlng.lat),
          y: String(latlng.lng),
          updated_at: new Date().toISOString(),
          status: 'idle',
          last_moved_by: Auth.currentUser.id
        }).eq('id', id).eq('room_id', CURRENT_ROOM_ID);
        if(error) { console.warn('writeFinalMarkerPosition update error', error); }
      }catch(upErr){
        try{
          const fallbackId = uuidv4();
          const payloadFallback = {
            id: fallbackId,
            room_id: CURRENT_ROOM_ID,
            echelon: (typeof currentEchelon !== 'undefined' ? currentEchelon : 1),
            symb_name: (markerOrEntry._symbName || (markerOrEntry._simpleType || null)),
            x: String(latlng.lat),
            y: String(latlng.lng),
            rotation: 0,
            meta: { created_by: Auth.currentUser.id, migrated_from: id },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          const { error: insErr } = await supabaseClient.from('markers').insert([payloadFallback]);
          if(insErr){ console.warn('writeFinalMarkerPosition fallback insert error', insErr); }
          else {
            try{
              const found = (typeof simpleMarkers !== 'undefined') ? simpleMarkers.find(s=> s._leaflet_id === markerOrEntry._leaflet_id) : null;
              if(found) markerList.push({ id: fallbackId, marker: found, regimentFile: payloadFallback.symb_name });
            }catch(e){}
          }
        }catch(finalErr){ console.warn('writeFinalMarkerPosition final fallback failed', finalErr); }
      }
    } else {
      const newId = uuidv4();
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
      if(error) { console.warn('writeFinalMarkerPosition insert error', error); }
      else {
        try{
          const found = (typeof simpleMarkers !== 'undefined') ? simpleMarkers.find(s=> s._leaflet_id === markerOrEntry._leaflet_id) : null;
          if(found) markerList.push({ id: newId, marker: found, regimentFile: payload.symb_name });
        }catch(e){}
      }
    }
  }catch(e){ console.warn('writeFinalMarkerPosition exception', e); }
}

async function onLocalMarkerCreated(marker){
  if(!marker) return;
  if(!Auth.currentUser) return;
  const haveTurn = await ensureMyTurn();
  if(!haveTurn){
    return;
  }
  await writeFinalMarkerPosition(marker);
}

function onLocalMarkerMoved(marker){
  writeFinalMarkerPosition(marker).catch(e=>console.warn(e));
}

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

  try{
    const markersChan = channelFor('markers');
    if(markersChan){
      markersChan
        .on('postgres_changes', { event: 'INSERT', schema:'public', table:'markers', filter: `room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          const m = payload.new; if(!m) return;
          if(typeof markerList !== 'undefined' && markerList.find(mm=>mm.id===m.id)) return;
          try{
            const lat = Number(m.x), lng = Number(m.y);
            const canDrag = (Auth.currentUser && m.last_moved_by === Auth.currentUser.id);
            const marker = L.marker([lat,lng], { draggable: canDrag }).addTo(map);
            marker.on('dragend', ()=>{ if (typeof onLocalMarkerMoved === 'function') onLocalMarkerMoved(marker); });
            marker.on('dblclick', async ()=>{
              if(!await ensureMyTurn()) return showToast('Не ваш ход');
              if(confirm('Удалить маркер?')){
                await supabaseClient.from('markers').delete().eq('id', m.id).eq('room_id', CURRENT_ROOM_ID);
              }
            });
            markerList.push({ id: m.id, marker, regimentFile: m.symb_name, meta: m.meta });
          }catch(e){ console.warn(e); }
        })
        .on('postgres_changes', { event: 'UPDATE', schema:'public', table:'markers', filter: `room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          const m = payload.new; if(!m) return;
          const idx = (typeof markerList!=='undefined') ? markerList.findIndex(mm=>mm.id===m.id) : -1;
          if(idx === -1) {
            try{
              const lat = Number(m.x), lng = Number(m.y);
              const canDrag = (Auth.currentUser && m.last_moved_by === Auth.currentUser.id);
              const marker = L.marker([lat,lng], { draggable: canDrag }).addTo(map);
              marker.on('dragend', ()=>{ if (typeof onLocalMarkerMoved === 'function') onLocalMarkerMoved(marker); });
              marker.on('dblclick', async ()=>{
                if(!await ensureMyTurn()) return showToast('Не ваш ход');
                if(confirm('Удалить маркер?')){
                  await supabaseClient.from('markers').delete().eq('id', m.id).eq('room_id', CURRENT_ROOM_ID);
                }
              });
              markerList.push({ id: m.id, marker, regimentFile: m.symb_name, meta: m.meta });
            }catch(e){}
          } else {
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
        .subscribe()
      .catch(err=>console.warn('markers subscribe err', err));
    }
  }catch(e){ console.warn('markers chan err', e); }

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
          try{
            const mapName = r.settings && r.settings.mapName;
            if(mapName && mapName !== currentMapFile){
              loadMapByFile(mapName).catch(e => console.warn(e));
            }
          }catch(e){ console.warn('apply map on rooms update err', e); }
        })
        .subscribe()
        .catch(err=>console.warn('rooms subscribe err', err));
    }
  }catch(e){ console.warn('rooms chan err', e); }

  try{
    const memChan = channelFor('room_members');
    if(memChan){
      memChan
        .on('postgres_changes', { event:'*', schema:'public', table:'room_members', filter:`room_id=eq.${CURRENT_ROOM_ID}` }, (payload) => {
          try{ setTimeout(refreshRoomPanel, 500); }catch(e){}
        })
        .subscribe()
        .catch(err=>console.warn('room_members subscribe err', err));
    }
  }catch(e){ console.warn('room_members chan err', e); }
}

if (typeof window.onLocalMarkerCreated !== 'function') window.onLocalMarkerCreated = onLocalMarkerCreated;
if (typeof window.onLocalMarkerMoved !== 'function') window.onLocalMarkerMoved = onLocalMarkerMoved;
