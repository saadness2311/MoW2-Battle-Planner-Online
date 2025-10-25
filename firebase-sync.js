/*
  firebase-sync.js
  Lightweight Firebase Realtime Database integration for multi-user sync.
  - Requires Firebase SDKs (compat) included in the page.
  - Configure firebaseConfig in index.html (already done).
  - Implements rooms UI, room creation/joining, participants presence,
    and entity sync under /rooms/{roomId}/entities/{entityId}.
*/

// Ждём инициализации приложения из index.html
let firebaseApp = null;
let firebaseDb = null;

// Пытаемся получить уже инициализированное приложение
function initFirebaseFromGlobal() {
  if (typeof firebase === 'undefined') {
    console.warn("Firebase SDK не загружен");
    return false;
  }
  if (firebase.apps && firebase.apps.length > 0) {
    firebaseApp = firebase.app(); // Берём [DEFAULT]
    firebaseDb = firebase.database();
    console.log("Firebase подключён (используется существующее приложение)", firebaseDb);
    return true;
  } else {
    console.warn("Firebase app ещё не инициализирован (возможно, index.html не сработал)");
    return false;
  }
}

// Пытаемся сразу
initFirebaseFromGlobal();

// Если не получилось — пробуем через 100мс (на случай асинхронной загрузки)
if (!firebaseDb) {
  setTimeout(initFirebaseFromGlobal, 100);
}

// --- Остальной код без изменений до ROOM_PANEL_HTML ---

const ROOM_PANEL_HTML = `
  <div class="room-panel-inner">
    <div class="room-panel-header">
      <strong>Комнаты</strong>
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

// add to page
const panel = document.getElementById('room-panel');
if(panel){
  panel.innerHTML = ROOM_PANEL_HTML;
}

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
if(nickInput) nickInput.value = currentNick;

toggleBtn && toggleBtn.addEventListener('click', ()=>{
  const p = document.getElementById('room-panel');
  p.classList.toggle('collapsed');
});

// generate simple uid and persist
let myUid = localStorage.getItem('mw2_uid');
if(!myUid){
  myUid = 'uid_'+Math.random().toString(36).slice(2,9);
  localStorage.setItem('mw2_uid', myUid);
}

// firebase helper wrappers — теперь с проверкой firebaseDb
window.firebaseCreateEntity = function(entity){
  if(!firebaseDb || !currentRoomId) return;
  const ref = firebaseDb.ref(`rooms/${currentRoomId}/entities/${entity.id}`);
  const payload = {
    id: entity.id,
    type: entity.type || 'unknown',
    data: entity,
    updatedAt: Date.now()
  };
  return ref.set(payload);
};

window.firebaseUpdateEntity = function(id, partial){
  if(!firebaseDb || !currentRoomId || !id) return;
  const ref = firebaseDb.ref(`rooms/${currentRoomId}/entities/${id}/data`);
  const toSet = Object.assign({}, partial, { updatedAt: Date