/*
  firebase-sync.js — УЛУЧШЕННАЯ СИНХРОНИЗАЦИЯ С ЭШЕЛОНАМИ
  Структура: rooms/{roomId}/echelons/{echelonId}/... + mapData
  - Без дублей init.
  - Реaltime для всех эшелонов.
*/

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBRbEyiNS5lFfk6YApSM1Xt30I33uW_mo8",
  authDomain: "mow2-battle-planner.firebaseapp.com",
  databaseURL: "https://mow2-battle-planner-default-rtdb.firebaseio.com",
  projectId: "mow2-battle-planner",
  storageBucket: "mow2-battle-planner.firebasestorage.app",
  messagingSenderId: "131172830575",
  appId: "1:131172830575:web:fff7cecadd4e62830fac9a",
  measurementId: "G-CFZTLVEYW0"
};

// Используем существующий app из index.html
let firebaseApp, firebaseDb;
try {
  firebaseApp = firebase.app('[DEFAULT]');
  firebaseDb = firebase.database();
} catch (e) {
  console.warn("Firebase app not found", e);
}

const ROOM_PANEL_HTML = `
  <div class="room-panel-inner">
    <div class="room-panel-header">
      <strong>Комнаты</strong>
      <button id="room-panel-toggle" class="toggle-btn">▾</button>
    </div>
    <div id="room-panel-body" class="room-panel-body">
      <div id="room-list"></div>
      <hr/>
      <div class="room-create">
        <input id="room-name" placeholder="Название комнаты"/>
        <input id="room-pass" placeholder="Пароль (опционально)"/>
        <input id="my-nick" placeholder="Никнейм"/>
        <button id="btn-create-room">Создать</button>
      </div>
      <div style="margin-top:6px;">
        <button id="btn-refresh-rooms">Обновить</button>
        <button id="btn-leave-room" style="display:none">Выйти</button>
      </div>
    </div>
  </div>
`;

// Ждём DOM
window.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('room-panel');
  if (panel) panel.innerHTML = ROOM_PANEL_HTML;

  const roomListEl = document.getElementById('room-list');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnRefresh = document.getElementById('btn-refresh-rooms');
  const btnLeave = document.getElementById('btn-leave-room');
  const roomNameInput = document.getElementById('room-name');
  const roomPassInput = document.getElementById('room-pass');
  const nickInput = document.getElementById('my-nick');
  const toggleBtn = document.getElementById('room-panel-toggle');

  let currentRoomId = null;
  let currentNick = localStorage.getItem('mw2_nick') || '';
  if (nickInput) nickInput.value = currentNick;

  toggleBtn?.addEventListener('click', () => {
    document.getElementById('room-panel').classList.toggle('collapsed');
  });

  let myUid = localStorage.getItem('mw2_uid');
  if (!myUid) {
    myUid = 'uid_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('mw2_uid', myUid);
  }

  // Функции для script.js (с эшелоном)
  window.firebaseCreateEntity = function(entity, echelon = 1) {
    if (!firebaseDb || !currentRoomId) return;
    const ref = firebaseDb.ref(`rooms/${currentRoomId}/echelons/${echelon}/entities/${entity.id}`);
    const payload = {
      id: entity.id,
      type: entity.type || 'unknown',
      data: entity,
      updatedAt: Date.now()
    };
    return ref.set(payload);
  };

  window.firebaseUpdateEntity = function(id, partial, echelon = 1) {
    if (!firebaseDb || !currentRoomId || !id) return;
    const ref = firebaseDb.ref(`rooms/${currentRoomId}/echelons/${echelon}/entities/${id}/data`);
    const toSet = Object.assign({}, partial, { updatedAt: Date.now() });
    return ref.update(toSet);
  };

  window.firebaseDeleteEntity = function(id, echelon = 1) {
    if (!firebaseDb || !currentRoomId || !id) return;
    const ref = firebaseDb.ref(`rooms/${currentRoomId}/echelons/${echelon}/entities/${id}`);
    return ref.remove();
  };

  // Функция для обновления комнатных данных (карта, state)
  window.firebaseUpdateRoom = function(partial) {
    if (!firebaseDb || !currentRoomId) return;
    return firebaseDb.ref(`rooms/${currentRoomId}`).update(partial);
  };

  async function refreshRooms() {
    if (!firebaseDb) {
      roomListEl.innerHTML = '<div class="error">Firebase не настроен</div>';
      return;
    }
    const snap = await firebaseDb.ref('rooms').once('value');
    const rooms = snap.val() || {};
    roomListEl.innerHTML = '';
    Object.entries(rooms).forEach(([rid, room])=>{
      const div = document.createElement('div');
      div.className = 'room-item';
      div.innerHTML = `<div class="room-title">${escapeHtml(room.name||rid)}</div>
        <div class="room-meta">Пароль: ${room.password? 'Да':'Нет'} · Участников: <span class="room-count">?</span></div>
        <div class="room-actions">
          <button class="join-room" data-rid="${rid}">Войти</button>
          <button class="del-room" data-rid="${rid}">Удалить</button>
        </div>`;
      roomListEl.appendChild(div);
      firebaseDb.ref(`rooms/${rid}/participants`).once('value').then(s=> {
        const c = s.numChildren();
        div.querySelector('.room-count').textContent = c;
      });
    });
    if(Object.keys(rooms).length===0) roomListEl.innerHTML = '<div class="muted">Нет комнат. Создайте первую.</div>';
  }
  btnRefresh && btnRefresh.addEventListener('click', refreshRooms);

  btnCreateRoom && btnCreateRoom.addEventListener('click', async ()=>{
    const name = roomNameInput.value.trim() || 'Комната без названия';
    const pass = roomPassInput.value;
    const nick = nickInput.value.trim() || ('Игрок_' + Math.random().toString(36).slice(2,5));
    localStorage.setItem('mw2_nick', nick);
    if(!firebaseDb) return alert('Firebase не настроен');
    const newRoomRef = firebaseDb.ref('rooms').push();
    const rid = newRoomRef.key;
    await newRoomRef.set({ name, password: pass||'', createdAt: Date.now() });
    await refreshRooms();
    joinRoom(rid, pass, nick);
  });

  async function joinRoom(roomId, pass, nick){
    if(!firebaseDb) return alert('Firebase не настроен');
    const roomSnap = await firebaseDb.ref(`rooms/${roomId}`).once('value');
    if(!roomSnap.exists()) return alert('Комната не найдена');
    const room = roomSnap.val();
    if(room.password && room.password !== (pass||'')) return alert('Неверный пароль');
    currentRoomId = roomId;
    if(nick) { currentNick = nick; localStorage.setItem('mw2_nick', nick); }
    const partRef = firebaseDb.ref(`rooms/${currentRoomId}/participants/${myUid}`);
    await partRef.set({ nick: currentNick || nickInput.value || 'Anon', joinedAt: Date.now() });
    partRef.onDisconnect().remove();
    btnLeave.style.display = 'inline-block';
    subscribeRoom(currentRoomId);
  }

  roomListEl.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if(!btn) return;
    const rid = btn.dataset.rid;
    if(btn.classList.contains('join-room')){
      const pass = prompt('Пароль комнаты (если есть):') || '';
      joinRoom(rid, pass, nickInput.value.trim() || currentNick);
    } else if(btn.classList.contains('del-room')){
      if(!confirm('Удалить комнату? Эта операция удалит все данные комнаты.')) return;
      firebaseDb.ref(`rooms/${rid}`).remove();
      refreshRooms();
    }
  });

  btnLeave.addEventListener('click', ()=>{
    if(!currentRoomId) return;
    firebaseDb.ref(`rooms/${currentRoomId}/participants/${myUid}`).remove();
    unsubscribeRoom();
    currentRoomId = null;
    btnLeave.style.display='none';
    refreshRooms();
  });

  let entitiesRef = null, participantsRef = null;
  function unsubscribeRoom(){
    if(entitiesRef) entitiesRef.off();
    if(participantsRef) participantsRef.off();
    // dispatch event to clear local entities
    window.dispatchEvent(new CustomEvent('remoteRoomLeft', { detail: { roomId: currentRoomId } }));
  }

  function subscribeRoom(rid){
    // unsubscribe previous
    unsubscribeRoom();
    currentRoomId = rid;
    entitiesRef = firebaseDb.ref(`rooms/${rid}/entities`);
    participantsRef = firebaseDb.ref(`rooms/${rid}/participants`);

    // participants listener -> update UI
    participantsRef.on('value', snap=>{
      const parts = snap.val() || {};
      // update room item display or create one
      // dispatch event
      window.dispatchEvent(new CustomEvent('remoteParticipants', { detail: { participants: parts } }));
    });

    // entities child listeners
    entitiesRef.on('child_added', snap=>{
      const val = snap.val();
      if(!val) return;
      window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity: val.data || val } }));
    });
    entitiesRef.on('child_changed', snap=>{
      const val = snap.val();
      if(!val) return;
      window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity: val.data || val } }));
    });
    entitiesRef.on('child_removed', snap=>{
      const val = snap.val();
      if(!val) return;
      window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: snap.key } }));
    });
  }

  // initial load
  setTimeout(()=> {
    refreshRooms();
    // if user has last room in localStorage, try to rejoin
    const lastRoom = localStorage.getItem('mw2_last_room');
    if(lastRoom) {
      // try to autojoin without password; user may need to join manually
      // joinRoom(lastRoom, '', nickInput.value.trim()||currentNick);
    }
  }, 200);

// small helper
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

console.log("Connecting to Firebase...", FIREBASE_CONFIG.databaseURL);
});