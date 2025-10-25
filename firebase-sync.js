let firebaseApp = null;
let firebaseDb = null;

function initFirebase() {
  if (typeof firebase === 'undefined') return false;
  if (firebase.apps?.length > 0) {
    firebaseApp = firebase.app();
    firebaseDb = firebase.database();
    console.log("Firebase connected");
    return true;
  }
  return false;
}
if (!initFirebase()) setTimeout(initFirebase, 100);

// === ROOM UI (оставляем как есть) ===
const ROOM_PANEL_HTML = `...`; // (всё как у тебя)
document.getElementById('room-panel').innerHTML = ROOM_PANEL_HTML;
// ... (весь код панели — не меняем)

// === UID & NICK ===
let myUid = localStorage.getItem('mw2_uid') || ('uid_' + Math.random().toString(36).slice(2,9));
localStorage.setItem('mw2_uid', myUid);
let currentNick = localStorage.getItem('mw2_nick') || '';
document.getElementById('my-nick').value = currentNick;

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ script.js ===
window.firebaseCreateEntity = function(entity, echelon = 1) {
  if (!firebaseDb || !currentRoomId) return;
  const path = `rooms/${currentRoomId}/echelons/${echelon}/entities/${entity.id}`;
  const payload = {
    id: entity.id,
    type: entity.type,
    data: entity.data,
    updatedAt: entity.updatedAt || Date.now(),
    echelon: echelon
  };
  return firebaseDb.ref(path).set(payload);
};

window.firebaseUpdateEntity = function(id, partial, echelon = 1) {
  if (!firebaseDb || !currentRoomId) return;
  const path = `rooms/${currentRoomId}/echelons/${echelon}/entities/${id}/data`;
  const update = { ...partial, updatedAt: Date.now() };
  return firebaseDb.ref(path).update(update);
};

window.firebaseDeleteEntity = function(id, echelon = 1) {
  if (!firebaseDb || !currentRoomId) return;
  const path = `rooms/${currentRoomId}/echelons/${echelon}/entities/${id}`;
  return firebaseDb.ref(path).remove();
};

// === УНИВЕРСАЛЬНОЕ ЧТЕНИЕ (поддержка обеих структур) ===
let entitiesRef = null;
let participantsRef = null;
let currentRoomId = null;

function unsubscribeRoom() {
  if (entitiesRef) entitiesRef.off();
  if (participantsRef) participantsRef.off();
  window.dispatchEvent(new CustomEvent('remoteRoomLeft'));
}

function subscribeRoom(roomId) {
  unsubscribeRoom();
  currentRoomId = roomId;

  participantsRef = firebaseDb.ref(`rooms/${roomId}/participants`);
  participantsRef.on('value', snap => {
    const parts = snap.val() || {};
    window.dispatchEvent(new CustomEvent('remoteParticipants', { detail: { participants: parts } }));
  });

  // === ГЛАВНОЕ: УНИВЕРСАЛЬНЫЙ СЛУШАТЕЛЬ ===
  const roomRef = firebaseDb.ref(`rooms/${roomId}`);

  // 1. Новая структура: echelons -> {1: {entities}, 2: {...}}
  const echelonsRef = roomRef.child('echelons');
  echelonsRef.on('child_added', handleEchelonChange);
  echelonsRef.on('child_changed', handleEchelonChange);
  echelonsRef.on('child_removed', snap => {
    const echelonId = snap.key;
    console.log('Echelon removed:', echelonId);
  });

  // 2. Старая структура: entities напрямую
  const legacyRef = roomRef.child('entities');
  legacyRef.on('child_added', snap => {
    const entity = snap.val();
    if (!entity || !entity.id) return;
    entity.echelon = 1; // по умолчанию
    window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } }));
  });
  legacyRef.on('child_changed', snap => {
    const entity = snap.val();
    if (!entity || !entity.id) return;
    entity.echelon = 1;
    window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } }));
  });
  legacyRef.on('child_removed', snap => {
    const id = snap.key;
    window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id } }));
  });

  entitiesRef = { echelons: echelonsRef, legacy: legacyRef };
}

function handleEchelonChange(snap) {
  const echelonId = parseInt(snap.key);
  if (isNaN(echelonId)) return;

  const entitiesSnap = snap.val();
  if (!entitiesSnap || typeof entitiesSnap !== 'object') return;

  Object.entries(entitiesSnap).forEach(([entityId, entityVal]) => {
    if (!entityVal || !entityVal.id) return;

    const entity = {
      id: entityVal.id,
      type: entityVal.type,
      data: entityVal.data || entityVal,
      updatedAt: entityVal.updatedAt || Date.now(),
      echelon: echelonId
    };

    const eventType = snap.type === 'child_added' ? 'remoteEntityAdded' : 'remoteEntityChanged';
    window.dispatchEvent(new CustomEvent(eventType, { detail: { entity } }));
  });
}

// === Присоединение к комнате ===
async function joinRoom(roomId, pass, nick) {
  const roomSnap = await firebaseDb.ref(`rooms/${roomId}`).once('value');
  if (!roomSnap.exists()) return alert('Комната не найдена');
  const room = roomSnap.val();
  if (room.password && room.password !== pass) return alert('Неверный пароль');

  currentRoomId = roomId;
  currentNick = nick || 'Anon';
  localStorage.setItem('mw2_nick', currentNick);

  const partRef = firebaseDb.ref(`rooms/${roomId}/participants/${myUid}`);
  await partRef.set({ nick: currentNick, joinedAt: Date.now() });
  partRef.onDisconnect().remove();

  document.getElementById('btn-leave-room').style.display = 'inline-block';
  subscribeRoom(roomId);
}

// === Остальной UI (создание, удаление, refresh) — без изменений ===
// (всё как у тебя — оставь)

setTimeout(refreshRooms, 300);