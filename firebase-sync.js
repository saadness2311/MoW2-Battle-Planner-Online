/*
  firebase-sync.js
  Lightweight Firebase Realtime Database integration for multi-user sync.
  - Firebase initialized in index.html
  - This file uses the already-initialized app
  - Implements rooms UI, creation/joining, participants presence,
    and entity sync under /rooms/{roomId}/entities/{entityId}
*/

let firebaseApp = null;
let firebaseDb = null;

// Try to get Firebase app initialized in index.html
function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn("Firebase SDK not loaded yet");
    return false;
  }
  if (firebase.apps && firebase.apps.length > 0) {
    firebaseApp = firebase.app(); // [DEFAULT]
    firebaseDb = firebase.database();
    console.log("Firebase connected (using existing app)", firebaseDb);
    return true;
  }
  return false;
}

// Try immediately
if (!initFirebase()) {
  // If not ready, try again after 100ms (in case index.html loads later)
  setTimeout(initFirebase, 100);
}

// ROOM PANEL HTML (unchanged)
const ROOM_PANEL_HTML = `
  <div class="room-panel-inner">
    <div class="room-panel-header">
      Комнаты
      <button id="room-panel-toggle" class="toggle-btn">down arrow</button>
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

// Add panel to page
const panel = document.getElementById('room-panel');
if (panel) {
  panel.innerHTML = ROOM_PANEL_HTML;
}

// Elements
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

// Toggle panel
toggleBtn?.addEventListener('click', () => {
  const p = document.getElementById('room-panel');
  p.classList.toggle('collapsed');
});

// Generate UID
let myUid = localStorage.getItem('mw2_uid');
if (!myUid) {
  myUid = 'uid_' + Math.random().toString(36).slice(2, 9);
  localStorage.setItem('mw2_uid', myUid);
}

// Firebase helper functions (global)
window.firebaseCreateEntity = function (entity) {
  if (!firebaseDb || !currentRoomId) return;
  const ref = firebaseDb.ref(`rooms/${currentRoomId}/entities/${entity.id}`);
  const payload = {
    id: entity.id,
    type: entity.type || 'unknown',
    data: entity,
    updatedAt: Date.now()
  };
  return ref.set(payload);
};

window.firebaseUpdateEntity = function (id, partial) {
  if (!firebaseDb || !currentRoomId || !id) return;
  const ref = firebaseDb.ref(`rooms/${currentRoomId}/entities/${id}/data`);
  const toSet = Object.assign({}, partial, { updatedAt: Date.now() });
  return ref.update(toSet);
};

window.firebaseDeleteEntity = function (id) {
  if (!firebaseDb || !currentRoomId || !id) return;
  const ref = firebaseDb.ref(`rooms/${currentRoomId}/entities/${id}`);
  return ref.remove();
};

// Refresh rooms list
async function refreshRooms() {
  if (!firebaseDb) {
    roomListEl.innerHTML = '<div class="error">Firebase не настроен</div>';
    return;
  }
  const snap = await firebaseDb.ref('rooms').once('value');
  const rooms = snap.val() || {};
  roomListEl.innerHTML = '';
  Object.entries(rooms).forEach(([rid, room]) => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `
      <div class="room-title">${escapeHtml(room.name || rid)}</div>
      <div class="room-meta">Пароль: ${room.password ? 'Да' : 'Нет'} · Участников: <span class="room-count">?</span></div>
      <div class="room-actions">
        <button class="join-room" data-rid="${rid}">Войти</button>
        <button class="del-room" data-rid="${rid}">Удалить</button>
      </div>`;
    roomListEl.appendChild(div);
    firebaseDb.ref(`rooms/${rid}/participants`).once('value').then(s => {
      const c = s.numChildren();
      div.querySelector('.room-count').textContent = c;
    });
  });
  if (Object.keys(rooms).length === 0) {
    roomListEl.innerHTML = '<div class="muted">Нет комнат. Создайте первую.</div>';
  }
}
btnRefresh?.addEventListener('click', refreshRooms);

// Create room
btnCreateRoom?.addEventListener('click', async () => {
  const name = roomNameInput.value.trim() || 'Комната без названия';
  const pass = roomPassInput.value;
  const nick = nickInput.value.trim() || ('Игрок_' + Math.random().toString(36).slice(2, 5));
  localStorage.setItem('mw2_nick', nick);

  if (!firebaseDb) return alert('Firebase не настроен');
  const newRoomRef = firebaseDb.ref('rooms').push();
  const rid = newRoomRef.key;
  await newRoomRef.set({ name, password: pass || '', createdAt: Date.now() });
  await refreshRooms();
  joinRoom(rid, pass, nick);
});

// Join room
async function joinRoom(roomId, pass, nick) {
  if (!firebaseDb) return alert('Firebase не настроен');
  const roomSnap = await firebaseDb.ref(`rooms/${roomId}`).once('value');
  if (!roomSnap.exists()) return alert('Комната не найдена');
  const room = roomSnap.val();
  if (room.password && room.password !== (pass || '')) return alert('Неверный пароль');

  currentRoomId = roomId;
  if (nick) {
    currentNick = nick;
    localStorage.setItem('mw2_nick', nick);
  }

  const partRef = firebaseDb.ref(`rooms/${currentRoomId}/participants/${myUid}`);
  await partRef.set({ nick: currentNick || nickInput.value || 'Anon', joinedAt: Date.now() });
  partRef.onDisconnect().remove();

  btnLeave.style.display = 'inline-block';
  subscribeRoom(currentRoomId);
}

// Room list click handlers
roomListEl?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const rid = btn.dataset.rid;
  if (btn.classList.contains('join-room')) {
    const pass = prompt('Пароль комнаты (если есть):') || '';
    joinRoom(rid, pass, nickInput.value.trim() || currentNick);
  } else if (btn.classList.contains('del-room')) {
    if (!confirm('Удалить комнату? Эта операция удалит все данные комнаты.')) return;
    firebaseDb.ref(`rooms/${rid}`).remove();
    refreshRooms();
  }
});

btnLeave?.addEventListener('click', () => {
  if (!currentRoomId) return;
  firebaseDb.ref(`rooms/${currentRoomId}/participants/${myUid}`).remove();
  unsubscribeRoom();
  currentRoomId = null;
  btnLeave.style.display = 'none';
  refreshRooms();
});

// Subscription
let entitiesRef = null, participantsRef = null;

function unsubscribeRoom() {
  if (entitiesRef) entitiesRef.off();
  if (participantsRef) participantsRef.off();
  window.dispatchEvent(new CustomEvent('remoteRoomLeft', { detail: { roomId: currentRoomId } }));
}

function subscribeRoom(rid) {
  unsubscribeRoom();
  currentRoomId = rid;
  entitiesRef = firebaseDb.ref(`rooms/${rid}/entities`);
  participantsRef = firebaseDb.ref(`rooms/${rid}/participants`);

  participantsRef.on('value', snap => {
    const parts = snap.val() || {};
    window.dispatchEvent(new CustomEvent('remoteParticipants', { detail: { participants: parts } }));
  });

  entitiesRef.on('child_added', snap => {
    const val = snap.val();
    if (!val) return;
    window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity: val.data || val } }));
  });

  entitiesRef.on('child_changed', snap => {
    const val = snap.val();
    if (!val) return;
    window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity: val.data || val } }));
  });

  entitiesRef.on('child_removed', snap => {
    const val = snap.val();
    if (!val) return;
    window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: snap.key } }));
  });
}

// Initial load
setTimeout(() => {
  refreshRooms();
  const lastRoom = localStorage.getItem('mw2_last_room');
  if (lastRoom) {
    // Optional: auto-rejoin (password required)
  }
}, 200);

// Helper
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

console.log("Connecting to Firebase...", firebaseDb?.ref().toString() || "Not connected");