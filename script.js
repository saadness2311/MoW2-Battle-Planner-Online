
/* Multiplayer-enabled script.js (skeleton + integration)
   - Connects to Supabase using CUSTOM AUTH (users_mow2)
   - Provides registration/login basics (bcrypt used client-side)
   - Implements room list UI skeleton and realtime subscription placeholders
   - Note: heavy original logic lives in script.orig.js; integrate functions as needed.
*/

const SUPABASE_URL = 'https://zqklzhipwiifrrbyentg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxa2x6aGlwd2lpZnJyYnllbnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzQ0ODYsImV4cCI6MjA3NjU1MDQ4Nn0.siMc2xCvoBEjwNVwaOVvjlOtDODs9yDo0IDyGl9uWso';

// Initialize Supabase client (global)
const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentRoom = null;
let roomChannel = null;

// Utilities for toast notifications (minimal, non-intrusive)
function showToast(msg, timeout = 3000) {
  let t = document.createElement('div');
  t.className = 'mow2-toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', right: '12px', bottom: '12px', background: '#222', color: '#ddd',
    padding: '8px 12px', borderRadius: '6px', zIndex: 99999, fontSize: '13px', opacity: '0.95'
  });
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), timeout);
}

// AUTH UI and functions
function renderAuthScreen() {
  const el = document.getElementById('auth-screen');
  el.innerHTML = `
    <div class="auth-panel" style="max-width:420px;margin:60px auto;padding:20px;background:#1f1f1f;color:#eee;border-radius:8px;">
      <h2 style="margin-top:0">MoW2 Battle Planner — Вход / Регистрация</h2>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input id="auth-username" placeholder="Ник" style="flex:1;padding:8px;background:#2a2a2a;border:1px solid #444;color:#eee"/>
        <input id="auth-password" placeholder="Пароль" type="password" style="flex:1;padding:8px;background:#2a2a2a;border:1px solid #444;color:#eee"/>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="btn-login" class="btn">Войти</button>
        <button id="btn-register" class="btn">Зарегистрироваться</button>
      </div>
      <p style="font-size:12px;color:#aaa;margin-top:10px">Пароль хранится в виде хэша (bcrypt) в базе данных.</p>
    </div>
  `;
  el.style.display = 'block';
  document.getElementById('btn-login').onclick = async ()=> {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value || '';
    if (!u) return showToast('Введите ник');
    await login(u,p);
  };
  document.getElementById('btn-register').onclick = async ()=> {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value || '';
    if (!u) return showToast('Введите ник');
    await register(u,p);
  };
}

async function register(username, password) {
  try {
    // client-side bcrypt hashing
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password || '', salt);
    const { data, error } = await supabase.from('users_mow2').insert([{ username, password_hash: hash }]).select();
    if (error) {
      console.error(error);
      showToast('Ошибка регистрации: ' + (error.message||error));
      return;
    }
    showToast('Регистрация успешна, вы авторизованы');
    currentUser = data[0];
    localStorage.setItem('mow2_user', JSON.stringify(currentUser));
    enterRoomsScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка регистрации');
  }
}

async function login(username, password) {
  try {
    const { data, error } = await supabase.from('users_mow2').select('*').eq('username', username).limit(1).single();
    if (error || !data) {
      showToast('Пользователь не найден');
      return;
    }
    const hash = data.password_hash || '';
    const match = bcrypt.compareSync(password || '', hash);
    if (!match) {
      showToast('Неверный пароль');
      return;
    }
    currentUser = data;
    localStorage.setItem('mow2_user', JSON.stringify(currentUser));
    showToast('Успешный вход');
    enterRoomsScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка входа');
  }
}

function loadSavedUser() {
  try {
    const j = localStorage.getItem('mow2_user');
    if (!j) return null;
    return JSON.parse(j);
  } catch(e){ return null; }
}

// ROOMS UI
function renderRoomsScreen(rooms) {
  const el = document.getElementById('rooms-screen');
  el.style.display = 'block';
  el.innerHTML = `
    <div style="max-width:1000px;margin:20px auto;color:#eee">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>Комнаты</h2>
        <div>
          <input id="new-room-name" placeholder="Имя комнаты" style="padding:6px;background:#2a2a2a;border:1px solid #444;color:#eee"/>
          <input id="new-room-pass" placeholder="Пароль (опц.)" style="padding:6px;background:#2a2a2a;border:1px solid #444;color:#eee"/>
          <button id="btn-create-room" class="btn">Создать</button>
          <button id="btn-logout" class="btn">Выйти</button>
        </div>
      </div>
      <div id="rooms-list" style="margin-top:12px"></div>
    </div>
  `;
  const list = document.getElementById('rooms-list');
  list.innerHTML = rooms.map(r=>`
    <div class="room-card" data-room="${r.id}" style="padding:8px;margin-bottom:8px;background:#171717;border:1px solid #333;border-radius:6px;display:flex;justify-content:space-between">
      <div><b>${escapeHtml(r.name)}</b><div style="font-size:12px;color:#aaa">Создатель: ${r.owner_username || r.owner_user_id}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="font-size:13px;color:#bbb">${r.count || r.members_count || 0} игроков</div>
        <button class="btn-join" data-id="${r.id}">Войти</button>
        ${r.owner_user_id === currentUser.id ? `<button class="btn-delete" data-id="${r.id}">Удалить</button>` : ''}
      </div>
    </div>
  `).join('');
  document.getElementById('btn-create-room').onclick = createRoom;
  document.getElementById('btn-logout').onclick = ()=> { localStorage.removeItem('mow2_user'); location.reload(); };
  document.querySelectorAll('.btn-join').forEach(b=> b.onclick = ()=> joinRoom(b.dataset.id));
  document.querySelectorAll('.btn-delete').forEach(b=> b.onclick = ()=> deleteRoom(b.dataset.id));
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

async function fetchRooms() {
  const { data, error } = await supabase.from('rooms').select('id,name,owner_user_id,created_at').order('created_at', {ascending:false});
  if (error) { console.error(error); showToast('Ошибка загрузки комнат'); return []; }
  // enrich with counts and owner username
  const rooms = [];
  for (const r of data) {
    const { count } = await supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', r.id);
    const owner = await supabase.from('users_mow2').select('username').eq('id', r.owner_user_id).maybeSingle();
    rooms.push({ id: r.id, name: r.name, owner_user_id: r.owner_user_id, owner_username: owner.data ? owner.data.username : r.owner_user_id, count: count || 0 });
  }
  return rooms;
}

async function enterRoomsScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  const rooms = await fetchRooms();
  renderRoomsScreen(rooms);
  // subscribe to changes in rooms table to refresh list (simple)
  supabase.channel('rooms_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, payload => {
    fetchRooms().then(r=> renderRoomsScreen(r));
  }).subscribe();
}

// Room actions
async function createRoom() {
  const name = document.getElementById('new-room-name').value.trim() || 'Комната';
  const pass = document.getElementById('new-room-pass').value || '';
  let pass_hash = null;
  if (pass) {
    const salt = bcrypt.genSaltSync(10);
    pass_hash = bcrypt.hashSync(pass, salt);
  }
  // check rooms count for current user handled by DB trigger
  const { data, error } = await supabase.from('rooms').insert([{ name, password_hash: pass_hash, owner_user_id: currentUser.id }]).select().single();
  if (error) { showToast('Ошибка создания комнаты: ' + (error.message||error)); console.error(error); return; }
  // auto join as member
  await supabase.from('room_members').insert([{ room_id: data.id, user_id: currentUser.id, is_owner: true }]);
  showToast('Комната создана');
  enterRoomsScreen();
}

async function joinRoom(roomId) {
  // try to join; if room has password, prompt
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room) return showToast('Комната не найдена');
  if (room.password_hash) {
    const pass = prompt('Введите пароль комнаты (если знаете):') || '';
    if (!bcrypt.compareSync(pass, room.password_hash)) { showToast('Неверный пароль'); return; }
  }
  // insert membership
  try {
    await supabase.from('room_members').insert([{ room_id: roomId, user_id: currentUser.id }]);
  } catch (e) { /* ignore - maybe already member */ }
  // open game screen
  currentRoom = room;
  openGameScreen(roomId);
}

async function deleteRoom(roomId) {
  // only owner can delete - DB trigger/policy should enforce; double-check client-side
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!data) return showToast('Комната не найдена');
  if (data.owner_user_id !== currentUser.id) return showToast('Только создатель может удалить комнату');
  const confirmed = confirm('Удалить комнату? Это удалит все связанные данные.');
  if (!confirmed) return;
  await supabase.from('rooms').delete().eq('id', roomId);
  showToast('Комната удалена');
  enterRoomsScreen();
}

// GAME screen skeleton
function openGameScreen(roomId) {
  document.getElementById('rooms-screen').style.display = 'none';
  // show existing index.html content (assumes original layout present)
  // Initialize map and load markers from DB for this room, subscribe to changes.
  setupMapAndSync(roomId);
  renderRoomPanel();
}

function renderRoomPanel() {
  // top-center collapsible panel
  let panel = document.getElementById('room-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'room-panel';
    Object.assign(panel.style, { position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', background:'#202020', color:'#eee', padding:'8px 12px', borderRadius:'6px', zIndex: 99990 });
    document.body.appendChild(panel);
  }
  panel.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
    <div id="rp-name"><b>${escapeHtml(currentRoom.name || 'Комната')}</b></div>
    <div id="rp-players" style="font-size:13px;color:#ccc">Игроков: ...</div>
    <div id="rp-current" style="font-size:13px;color:#cfc">Ход: ...</div>
    <button id="rp-toggle" class="btn" style="margin-left:8px">Свернуть</button>
  </div>`;
  document.getElementById('rp-toggle').onclick = ()=> {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };
}

// Map & sync (skeleton: integrate original map code from script.orig.js)
async function setupMapAndSync(roomId) {
  // load initial markers
  const { data: markers } = await supabase.from('markers').select('*').eq('room_id', roomId);
  // TODO: integrate original marker rendering code using markers data
  console.log('loaded markers', markers && markers.length);
  // subscribe to realtime changes for this room - markers and drawings and members
  if (roomChannel) { try { roomChannel.unsubscribe(); } catch(e){} }
  roomChannel = supabase.channel('public:markers:room='+roomId);
  // generic subscription for markers table (filter client-side)
  supabase.channel('room-'+roomId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'markers' }, payload => {
      // payload has .eventType and .new/.old
      // handle insert/update/delete accordingly: create marker, animate move, remove marker
      console.log('markers payload', payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drawings' }, payload => {
      console.log('drawings payload', payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, payload => {
      console.log('members payload', payload);
      // update rp-players
    })
    .subscribe();
}

// On page load
window.addEventListener('load', ()=> {
  const saved = loadSavedUser();
  if (saved) { currentUser = saved; enterRoomsScreen(); } else { renderAuthScreen(); }
});

/* NOTES:
 - The original project logic is preserved in script.orig.js for reference.
 - To complete the migration, integrate functions from script.orig.js for:
   * marker rendering and leaflet map init
   * marker drag/create handlers (adapt to send DB updates instead of local)
   * echelon switching, copy/paste, drawings, export, etc.
 - Remove or comment out the "наступление противника" feature in script.orig.js before full integration.
 - Use batch inserts for initial large placements to avoid realtime flooding.
*/
