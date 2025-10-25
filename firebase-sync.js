// firebase-sync.js — Финальная, исправленная и синтаксически корректная версия
// Предназначен для использования вместе с index.html, где Firebase v8 уже подключён и инициализирован.
// Сохраняет панель комнат (UI) практически без изменений, но заменяет грубую синхронизацию на событийную.
// Экспортирует глобальный API: window.syncJoinRoom, syncLeaveRoom, syncSetEchelon, syncAddEntity, syncUpdateEntity, syncRemoveEntity
// Также эмитит события: remoteEntityAdded, remoteEntityChanged, remoteEntityRemoved (window.dispatchEvent).

/* ------------- Конфигурация ------------- */
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

/* ------------- Утилиты ------------- */
function safeGetDb() {
  if (!window.firebase || !window.firebase.database) {
    throw new Error('Firebase not found. Make sure firebase is loaded and initialized in index.html');
  }
  return window.firebase.database();
}
function now() { return Date.now(); }
function uidRandom(prefix = 'u') { return prefix + '_' + Math.random().toString(36).slice(2,9); }
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

/* ------------- Компоненты UI (панель комнат) ------------- */
// Вставляем panel HTML в элемент #room-panel (он есть в index.html)
const ROOM_PANEL_HTML = `
  <div class="room-panel-inner">
    <div class="room-panel-header"><strong>Комнаты</strong> <button id="room-panel-toggle">▾</button></div>
    <div id="room-panel-body">
      <div id="room-list"></div><hr/>
      <input id="room-name" placeholder="Название"/><input id="room-pass" placeholder="Пароль"/><input id="my-nick" placeholder="Ник"/>
      <button id="btn-create-room">Создать</button>
      <button id="btn-refresh-rooms">Обновить</button>
      <button id="btn-leave-room" style="display:none">Выйти</button>
    </div>
  </div>`;

/* ------------- Внутреннее состояние синхронизации ------------- */
const SyncEngine = (function(){
  // client identity
  const clientId = localStorage.getItem('mw2_uid') || uidRandom('cid');
  localStorage.setItem('mw2_uid', clientId);

  // room / echelon state
  let currentRoom = null;
  let currentEchelon = 1;

  // firebase refs / listeners
  let baseRef = null; // rooms/{roomId}
  let entitiesRef = null; // rooms/{roomId}/echelons/{echelon}/entities
  const listeners = { added: null, changed: null, removed: null, mapData: null, participants: null };

  // processed markers to avoid re-applying our own events
  const seenRemote = new Set(); // stores markers like `${key}:${updatedAt}`
  // local throttling queue for frequent updates (drag)
  const throttleMap = new Map(); // id -> {timeout, lastSent}

  // per-entity minimal interval (ms)
  const MIN_UPDATE_INTERVAL = 250;
  const FINAL_FLUSH_DELAY = 120;

  // expose events to UI
  function emitAdded(entity){ window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } })); }
  function emitChanged(entity){ window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } })); }
  function emitRemoved(id){ window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id } })); }

  /* ---------- Firebase path helpers ---------- */
  function pathForRoom(r){ return `rooms/${encodeURIComponent(r)}`; }
  function pathForEntities(r, e){ return `${pathForRoom(r)}/echelons/e${e}/entities`; }
  function pathForMapData(r){ return `${pathForRoom(r)}/mapData`; }
  function pathForParticipants(r){ return `${pathForRoom(r)}/participants`; }

  /* ---------- Attach/detach listeners ---------- */
  function attachListeners() {
    if(!currentRoom) return;
    baseRef = safeGetDb().ref(pathForRoom(currentRoom));
    // mapData listener
    listeners.mapData = baseRef.child('mapData').on('value', snap => {
      const md = snap.val();
      if(!md) return;
      // If map file changed — ask app to load it
      if(md.currentMapFile && md.currentMapFile !== window.currentMapFile) {
        try { window.loadMapByFile && window.loadMapByFile(md.currentMapFile); } catch(e) {}
      }
      // Apply center/zoom if provided
      if(md.center && typeof md.zoom !== 'undefined' && window.map) {
        try { window.map.setView(md.center, md.zoom); } catch(e) {}
      }
      // Optionally sync currentEchelon if remote changed (we do not auto-switch)
    });

    // participants listener (for list)
    listeners.participants = baseRef.child('participants').on('value', snap => {
      const participants = snap.val() || {};
      // update room list UI (if present)
      try {
        const el = document.querySelector(`#room-list .participants-info[data-room="${currentRoom}"]`);
        if(el) el.textContent = Object.keys(participants).length;
      } catch(e){}
    });

    // entities for the current echelon
    const entitiesPath = pathForEntities(currentRoom, currentEchelon);
    entitiesRef = safeGetDb().ref(entitiesPath);

    // child_added
    listeners.added = entitiesRef.on('child_added', snap => {
      const key = snap.key;
      const val = snap.val();
      if(!val) return;
      // ignore our own writes
      if(val.clientId === clientId) return;
      const marker = `${key}:${val.updatedAt || ''}`;
      if(seenRemote.has(marker)) return;
      seenRemote.add(marker);
      const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt || 0 } };
      emitAdded(entity);
    });

    // child_changed
    listeners.changed = entitiesRef.on('child_changed', snap => {
      const key = snap.key;
      const val = snap.val();
      if(!val) return;
      if(val.clientId === clientId) return;
      const marker = `${key}:${val.updatedAt || ''}`;
      if(seenRemote.has(marker)) return;
      seenRemote.add(marker);
      const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt || 0 } };
      emitChanged(entity);
    });

    // child_removed
    listeners.removed = entitiesRef.on('child_removed', snap => {
      const key = snap.key;
      if(!key) return;
      // Removals should be applied always
      emitRemoved(key);
    });
  }

  function detachListeners() {
    try {
      if(listeners.mapData && baseRef) baseRef.child('mapData').off('value', listeners.mapData);
      if(listeners.participants && baseRef) baseRef.child('participants').off('value', listeners.participants);
      if(entitiesRef) {
        if(listeners.added) entitiesRef.off('child_added', listeners.added);
        if(listeners.changed) entitiesRef.off('child_changed', listeners.changed);
        if(listeners.removed) entitiesRef.off('child_removed', listeners.removed);
      }
    } catch(e){
      console.warn('detachListeners error', e);
    } finally {
      listeners.added = listeners.changed = listeners.removed = listeners.mapData = listeners.participants = null;
      entitiesRef = null;
      baseRef = null;
      seenRemote.clear();
      // clear throttles
      throttleMap.forEach(v => { if(v.timeout) clearTimeout(v.timeout); });
      throttleMap.clear();
    }
  }

  /* ---------- CRUD API ---------- */

  // add entity (type: 'marker' | 'simple' | 'drawing' | 'other'), data: arbitrary serializable data
  async function addEntity(type, data = {}, opts = {}) {
    if(!currentRoom) throw new Error('addEntity: no room joined');
    const db = safeGetDb();
    const payload = {
      type,
      data,
      clientId,
      createdAt: now(),
      updatedAt: now()
    };
    // allow stable id (opts.id) — useful for player markers
    if(opts.id) {
      const ref = db.ref(`${pathForEntities(currentRoom, currentEchelon)}/${opts.id}`);
      await ref.set(payload);
      // mark as seen to avoid processing our own write
      seenRemote.add(`${opts.id}:${payload.updatedAt}`);
      return { key: opts.id, ref };
    } else {
      const p = db.ref(pathForEntities(currentRoom, currentEchelon)).push();
      await p.set(payload);
      seenRemote.add(`${p.key}:${payload.updatedAt}`);
      return { key: p.key, ref: p };
    }
  }

  // update entity partial (merges into /data/)
  function updateEntity(id, partialData = {}) {
    if(!currentRoom) return Promise.reject(new Error('updateEntity: no room joined'));
    if(!id) return Promise.reject(new Error('updateEntity: id required'));
    // throttle per id
    const throttle = throttleMap.get(id) || { timeout: null, lastSent: 0, pending: {} };
    throttle.pending = Object.assign({}, throttle.pending || {}, partialData);
    throttleMap.set(id, throttle);

    const attemptSend = () => {
      const db = safeGetDb();
      const ref = db.ref(`${pathForEntities(currentRoom, currentEchelon)}/${id}`);
      const payload = {};
      // set each field under data/
      for(const k in throttle.pending) payload[`data/${k}`] = throttle.pending[k];
      payload['clientId'] = clientId;
      payload['updatedAt'] = now();
      // update
      return ref.update(payload).then(() => {
        throttle.lastSent = Date.now();
        throttle.pending = {};
        // mark seen
        seenRemote.add(`${id}:${payload.updatedAt}`);
      }).catch(err => {
        console.warn('updateEntity error', err);
      });
    };

    const nowTs = Date.now();
    const since = nowTs - (throttle.lastSent || 0);
    if(since >= MIN_UPDATE_INTERVAL) {
      // send immediately
      if(throttle.timeout) { clearTimeout(throttle.timeout); throttle.timeout = null; }
      return attemptSend();
    } else {
      // schedule
      if(throttle.timeout) clearTimeout(throttle.timeout);
      throttle.timeout = setTimeout(() => {
        attemptSend();
      }, Math.max(MIN_UPDATE_INTERVAL - since, FINAL_FLUSH_DELAY));
      throttleMap.set(id, throttle);
      return Promise.resolve();
    }
  }

  // remove entity
  function removeEntity(id) {
    if(!currentRoom) return Promise.reject(new Error('removeEntity: no room joined'));
    if(!id) return Promise.reject(new Error('removeEntity: id required'));
    const db = safeGetDb();
    const ref = db.ref(`${pathForEntities(currentRoom, currentEchelon)}/${id}`);
    return ref.remove();
  }

  /* ---------- Room control ---------- */
  async function joinRoom(roomId, password = '', nick = '') {
    // leave previous
    if(currentRoom) {
      await leaveRoom();
    }
    // Validate / create room if missing
    const db = safeGetDb();
    const roomRef = db.ref(pathForRoom(roomId));
    const snap = await roomRef.once('value');
    const roomVal = snap.val();
    if(!roomVal) {
      // create new room
      await roomRef.set({ name: roomId, createdAt: now(), password: password || '' });
    } else if(roomVal.password && roomVal.password !== password) {
      throw new Error('Incorrect room password');
    }
    currentRoom = roomId;
    // default echelon stays as-is or 1
    // register participant
    const uid = clientId;
    const partRef = db.ref(`${pathForRoom(currentRoom)}/participants/${uid}`);
    await partRef.set({ nick: nick || localStorage.getItem('mw2_nick') || `Player_${uid.slice(-4)}`, joinedAt: now() });
    partRef.onDisconnect().remove();
    // attach listeners
    attachListeners();
    // update UI: show leave
    try { document.getElementById('btn-leave-room').style.display = 'inline-block'; } catch(e){}
    console.log(`[sync] joined room ${currentRoom}`);
    return true;
  }

  async function leaveRoom() {
    if(!currentRoom) return;
    try {
      const uid = clientId;
      const db = safeGetDb();
      await db.ref(`${pathForRoom(currentRoom)}/participants/${uid}`).remove();
    } catch(e){ /* ignore */ }
    detachListeners();
    // hide leave UI
    try { document.getElementById('btn-leave-room').style.display = 'none'; } catch(e){}
    console.log(`[sync] left room ${currentRoom}`);
    currentRoom = null;
    return true;
  }

  function setEchelon(n) {
    const parsed = parseInt(n) || 1;
    if(parsed === currentEchelon) return;
    // detach & reattach to new path
    detachListeners();
    currentEchelon = parsed;
    attachListeners();
    console.log(`[sync] switched to echelon e${currentEchelon}`);
  }

  /* ---------- Map data helpers ---------- */
  function updateMapData(mapFile, center, zoom) {
    if(!currentRoom) return Promise.reject(new Error('updateMapData: no room joined'));
    const db = safeGetDb();
    const payload = { currentMapFile: mapFile || null, center: center || null, zoom: zoom || null, currentEchelon, updatedAt: now(), clientId };
    return db.ref(pathForMapData(currentRoom)).update(payload);
  }

  /* ---------- Public API ---------- */
  return {
    clientId,
    get currentRoom() { return currentRoom; },
    get currentEchelon() { return currentEchelon; },
    joinRoom,
    leaveRoom,
    setEchelon,
    addEntity,
    updateEntity,
    removeEntity,
    updateMapData
  };
})();

/* ------------- UI wiring: inject panel and attach handlers (preserve exact UX) ------------- */
(function initRoomPanel(){
  // Inject HTML into #room-panel if exists
  const panel = document.getElementById('room-panel');
  if(panel) panel.innerHTML = ROOM_PANEL_HTML;
  // Wire up elements if present
  document.addEventListener('DOMContentLoaded', () => {
    const panelEl = document.getElementById('room-panel');
    if(!panelEl) return;
    const list = document.getElementById('room-list');
    const createBtn = document.getElementById('btn-create-room');
    const refreshBtn = document.getElementById('btn-refresh-rooms');
    const leaveBtn = document.getElementById('btn-leave-room');
    const nameInp = document.getElementById('room-name');
    const passInp = document.getElementById('room-pass');
    const nickInp = document.getElementById('my-nick');
    const toggle = document.getElementById('room-panel-toggle');

    // collapse toggle
    toggle && (toggle.onclick = () => panelEl.classList.toggle('collapsed'));

    // restore nick if exists
    const storedNick = localStorage.getItem('mw2_nick') || '';
    if(nickInp) nickInp.value = storedNick;

    // refresh function
    async function refreshRooms() {
      try {
        const db = safeGetDb();
        const snap = await db.ref('rooms').once('value');
        const rooms = snap.val() || {};
        list.innerHTML = '';
        Object.entries(rooms).forEach(([id, r]) => {
          const div = document.createElement('div');
          div.className = 'room-list-item';
          const participantsCountSpan = `<span class="c" data-room="${id}">?</span>`;
          div.innerHTML = `<div class="room-name">${escapeHtml(r.name || id)}</div>
            <div>Участников: ${participantsCountSpan}</div>
            <div style="margin-top:6px;">
              <button class="join" data-id="${id}">Войти</button>
              <button class="del" data-id="${id}">×</button>
            </div>`;
          list.appendChild(div);
          // update participants count async
          db.ref(`rooms/${id}/participants`).once('value').then(s => {
            const el = div.querySelector('.c');
            if(el) el.textContent = s.numChildren();
          }).catch(()=>{});
        });
      } catch(err) { console.warn('refreshRooms err', err); }
    }

    // create
    createBtn && (createBtn.onclick = async () => {
      const name = (nameInp && nameInp.value.trim()) || 'Без названия';
      const pass = (passInp && passInp.value) || '';
      const nick = (nickInp && nickInp.value.trim()) || (`Игрок_${Math.random().toString(36).slice(2,6)}`);
      localStorage.setItem('mw2_nick', nick);
      try {
        const db = safeGetDb();
        const ref = db.ref('rooms').push();
        await ref.set({ name, password: pass || '', createdAt: Date.now() });
        // join created room
        await SyncEngine.joinRoom(ref.key, pass, nick);
        // refresh list
        refreshRooms();
      } catch(err) {
        console.error('create room err', err);
        alert('Ошибка создания комнаты: ' + (err.message || err));
      }
    });

    // refresh
    refreshBtn && (refreshBtn.onclick = refreshRooms);
    // initial refresh
    setTimeout(() => refreshRooms(), 250);

    // leave
    leaveBtn && (leaveBtn.onclick = async () => {
      try {
        await SyncEngine.leaveRoom();
        // hide leave button
        leaveBtn.style.display = 'none';
      } catch(e){ console.warn('leave err', e); }
    });

    // joins & deletes in list
    list && (list.onclick = async (e) => {
      const btn = e.target.closest('button');
      if(!btn) return;
      const id = btn.dataset.id;
      if(!id) return;
      if(btn.classList.contains('join')) {
        const p = prompt('Пароль:') || '';
        const nick = (nickInp && nickInp.value.trim()) || localStorage.getItem('mw2_nick') || '';
        try {
          localStorage.setItem('mw2_nick', nick);
          await SyncEngine.joinRoom(id, p, nick);
          document.getElementById('btn-leave-room').style.display = 'inline-block';
        } catch(err) {
          alert('Не получилось войти: ' + (err.message || err));
        }
      } else if(btn.classList.contains('del')) {
        if(!confirm('Удалить комнату?')) return;
        try {
          const db = safeGetDb();
          await db.ref(`rooms/${id}`).remove();
          setTimeout(() => refreshRooms(), 200);
        } catch(err) { console.warn('delete room err', err); }
      }
    });
  });
})();

/* ------------- Integration helpers for script.js compatibility ------------- */
/*
  script.js expects to receive events:
    remoteEntityAdded (detail.entity)
    remoteEntityChanged (detail.entity)
    remoteEntityRemoved (detail.id)
  We'll dispatch those in SyncEngine listeners.
*/

/* ------------- Expose simple global API ------------- */
window.sync = {
  joinRoom: async function(roomId, password, nick) {
    return SyncEngine.joinRoom(roomId, password, nick);
  },
  leaveRoom: async function() { return SyncEngine.leaveRoom(); },
  setEchelon: function(n) { return SyncEngine.setEchelon(n); },
  addEntity: function(type, data, opts) { return SyncEngine.addEntity(type, data, opts); },
  updateEntity: function(id, partial) { return SyncEngine.updateEntity(id, partial); },
  removeEntity: function(id) { return SyncEngine.removeEntity(id); },
  updateMapData: function(mapFile, center, zoom) { return SyncEngine.updateMapData(mapFile, center, zoom); },
  clientId: SyncEngine.clientId,
  get currentRoom(){ return SyncEngine.currentRoom; },
  get currentEchelon(){ return SyncEngine.currentEchelon; }
};

/* ------------- Small helper to escape HTML used in room list (to avoid injection) ------------- */
function escapeHtml(s) {
  if(!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ------------- Auto-restore last room prompt (non-blocking) ------------- */
setTimeout(() => {
  try {
    const last = localStorage.getItem('mw2_last_room');
    if(last && confirm('Восстановить последнюю комнату?')) {
      const nick = localStorage.getItem('mw2_nick') || '';
      // attempt join without password (user will be prompted if password required)
      SyncEngine.joinRoom(last, '', nick).catch(()=>{});
    }
  } catch(e){ /* ignore */ }
}, 900);

/* ------------- Notes for integration (read-only comments) -------------
- script.js will receive events and should handle them.
- To perform local writes:
    window.sync.addEntity('marker', {...}, { id: 'player_blue_0' })
    window.sync.updateEntity('entityId', { latlng: {...} })
    window.sync.removeEntity('entityId')
- To update map info:
    window.sync.updateMapData(currentMapFile, map.getCenter(), map.getZoom())
------------------------------------------------------------------------ */

console.log('firebase-sync.js loaded. ClientId=', SyncEngine.clientId);
