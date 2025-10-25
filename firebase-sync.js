// firebase-sync.js — исправленная финальная версия
// Требования: firebase v8 подключён и инициализирован в index.html (как у тебя).
// Не меняет script.js — интегрируется поверх него (патчит функции).

/* CONFIG */
const FIREBASE_DB = (() => {
  if (!window.firebase || !window.firebase.database) {
    console.error('Firebase not found. Ensure firebase v8 is loaded and initialized in index.html');
    return null;
  }
  return window.firebase.database();
})();

if (!FIREBASE_DB) {
  // nothing to do
} else {

(function(){

const CLIENT_ID = localStorage.getItem('mw2_uid') || ('uid_' + Math.random().toString(36).slice(2,9));
localStorage.setItem('mw2_uid', CLIENT_ID);

let CURRENT_ROOM = null;
let CURRENT_ECHELON = typeof window.currentEchelon !== 'undefined' ? window.currentEchelon : 1;

// helpers
const nowTs = () => Date.now();
const pathRoom = r => `rooms/${encodeURIComponent(r)}`;
const pathEntities = (r,e) => `${pathRoom(r)}/echelons/e${e}/entities`;
const pathMapData = r => `${pathRoom(r)}/mapData`;

const seenMarkers = new Set(); // to avoid processing our own writes repeatedly
const throttleMap = new Map(); // id -> { timeout, pending }

// throttling params
const MIN_UPDATE_MS = 250;
const FINAL_FLUSH_MS = 100;

// UI panel HTML (kept same UX)
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

/* ----------------- Panel injection and wiring (preserve UX) ----------------- */
function injectRoomPanel() {
  const panel = document.getElementById('room-panel');
  if (!panel) return;
  panel.innerHTML = ROOM_PANEL_HTML;

  // After DOM ready, attach behavior
  document.addEventListener('DOMContentLoaded', () => {
    const panelEl = document.getElementById('room-panel');
    const toggleBtn = document.getElementById('room-panel-toggle');
    if (toggleBtn && panelEl) {
      toggleBtn.addEventListener('click', () => {
        panelEl.classList.toggle('collapsed');
      });
    }

    const list = document.getElementById('room-list');
    const createBtn = document.getElementById('btn-create-room');
    const refreshBtn = document.getElementById('btn-refresh-rooms');
    const leaveBtn = document.getElementById('btn-leave-room');
    const nameInp = document.getElementById('room-name');
    const passInp = document.getElementById('room-pass');
    const nickInp = document.getElementById('my-nick');

    // restore nick
    const storedNick = localStorage.getItem('mw2_nick') || '';
    if (nickInp) nickInp.value = storedNick;

    async function refreshRooms(){
      try {
        const snap = await FIREBASE_DB.ref('rooms').once('value');
        const rooms = snap.val() || {};
        list.innerHTML = '';
        for (const id of Object.keys(rooms)) {
          const r = rooms[id];
          const div = document.createElement('div');
          div.className = 'room-list-item';
          div.innerHTML = `<div class="room-name">${escapeHtml(r.name || id)}</div>
            <div>Участников: <span class="c" data-room="${id}">?</span></div>
            <div style="margin-top:6px;">
              <button class="join" data-id="${id}">Войти</button>
              <button class="del" data-id="${id}">×</button>
            </div>`;
          list.appendChild(div);
          // participants count
          FIREBASE_DB.ref(`rooms/${id}/participants`).once('value').then(s => {
            const el = div.querySelector('.c');
            if (el) el.textContent = s.numChildren();
          }).catch(()=>{});
        }
      } catch(e){ console.warn('refreshRooms err', e); }
    }

    createBtn && (createBtn.onclick = async () => {
      const name = (nameInp && nameInp.value.trim()) || 'Без названия';
      const pass = (passInp && passInp.value) || '';
      const nick = (nickInp && nickInp.value.trim()) || (`Игрок_${Math.random().toString(36).slice(2,6)}`);
      localStorage.setItem('mw2_nick', nick);
      try {
        const ref = FIREBASE_DB.ref('rooms').push();
        await ref.set({ name, password: pass || '', createdAt: nowTs() });
        await joinRoom(ref.key, pass, nick);
        setTimeout(refreshRooms, 200);
      } catch(err) { console.error(err); alert('Ошибка создания комнаты'); }
    });

    refreshBtn && (refreshBtn.onclick = refreshRooms);
    setTimeout(refreshRooms, 200);

    leaveBtn && (leaveBtn.onclick = async () => {
      try { await leaveRoom(); } catch(e){ console.warn(e); }
      leaveBtn.style.display = 'none';
    });

    list && (list.onclick = async (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.classList.contains('join')) {
        const pass = prompt('Пароль:') || '';
        const nick = (nickInp && nickInp.value.trim()) || localStorage.getItem('mw2_nick') || '';
        try {
          localStorage.setItem('mw2_nick', nick);
          await joinRoom(id, pass, nick);
          document.getElementById('btn-leave-room').style.display = 'inline-block';
        } catch(err) {
          alert('Не получилось войти: ' + (err.message || err));
        }
      } else if (btn.classList.contains('del')) {
        if (!confirm('Удалить комнату?')) return;
        try { await FIREBASE_DB.ref(`rooms/${id}`).remove(); setTimeout(refreshRooms, 200); } catch(e){ console.warn(e); }
      }
    });
  });
}

/* ----------------- Core sync engine ----------------- */
let entitiesRef = null;
let mapDataRef = null;
let participantsRef = null;

function attachEntityListeners(room, echelon) {
  if (!room) return;
  detachEntityListeners();
  entitiesRef = FIREBASE_DB.ref(pathEntities(room, echelon));

  entitiesRef.on('child_added', snap => {
    const key = snap.key;
    const val = snap.val();
    if (!val) return;
    if (val.clientId === CLIENT_ID) return; // ignore own writes
    const marker = `${key}:${val.updatedAt || 0}`;
    if (seenMarkers.has(marker)) return;
    seenMarkers.add(marker);
    const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt } };
    window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } }));
  });

  entitiesRef.on('child_changed', snap => {
    const key = snap.key;
    const val = snap.val();
    if (!val) return;
    if (val.clientId === CLIENT_ID) return;
    const marker = `${key}:${val.updatedAt || 0}`;
    if (seenMarkers.has(marker)) return;
    seenMarkers.add(marker);
    const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt } };
    window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } }));
  });

  entitiesRef.on('child_removed', snap => {
    const key = snap.key;
    if (!key) return;
    window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: key } }));
  });
}

function detachEntityListeners() {
  try {
    if (entitiesRef) entitiesRef.off();
    if (mapDataRef) mapDataRef.off();
    if (participantsRef) participantsRef.off();
  } catch(e){ /* ignore */ }
  entitiesRef = mapDataRef = participantsRef = null;
  seenMarkers.clear();
  throttleMap.forEach(v => v.timeout && clearTimeout(v.timeout));
  throttleMap.clear();
}

/* ----------------- Room join/leave and map data ----------------- */
async function joinRoom(roomId, password = '', nick = '') {
  if (!roomId) throw new Error('roomId required');
  // leave old
  if (CURRENT_ROOM) await leaveRoom();

  // ensure room exists and password OK
  const baseRef = FIREBASE_DB.ref(pathRoom(roomId));
  const snap = await baseRef.once('value');
  const val = snap.val();
  if (!val) {
    await baseRef.set({ name: roomId, createdAt: nowTs(), password: password || '' });
  } else if (val.password && val.password !== password) {
    throw new Error('Incorrect password');
  }

  CURRENT_ROOM = roomId;
  // participant
  const uid = CLIENT_ID;
  participantsRef = FIREBASE_DB.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`);
  await participantsRef.set({ nick: nick || localStorage.getItem('mw2_nick') || `Player_${uid.slice(-4)}`, joinedAt: nowTs() });
  participantsRef.onDisconnect().remove();

  // mapData listener & entities listener for current echelon
  mapDataRef = FIREBASE_DB.ref(pathMapData(CURRENT_ROOM));
  mapDataRef.on('value', snap => {
    const md = snap.val();
    if (!md) return;
    // load map if different
    if (md.currentMapFile && md.currentMapFile !== window.currentMapFile) {
      try { window.loadMapByFile && window.loadMapByFile(md.currentMapFile); } catch(e){}
    }
    if (md.center && typeof md.zoom !== 'undefined' && window.map) {
      try { window.map.setView(md.center, md.zoom); } catch(e){}
    }
  });

  attachEntityListeners(CURRENT_ROOM, CURRENT_ECHELON);
  // UI show leave button
  try { document.getElementById('btn-leave-room').style.display = 'inline-block'; } catch(e){}
  console.log('[sync] joined', CURRENT_ROOM);
  return true;
}

async function leaveRoom() {
  if (!CURRENT_ROOM) return;
  try {
    const uid = CLIENT_ID;
    await FIREBASE_DB.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`).remove();
  } catch(e){}
  detachEntityListeners();
  CURRENT_ROOM = null;
  try { document.getElementById('btn-leave-room').style.display = 'none'; } catch(e){}
  console.log('[sync] left room');
}

/* ----------------- Entity CRUD from client-side actions ----------------- */
/*
Entity shape in DB:
  { type: 'player_marker'|'simple'|'drawing'|..., data: {...}, clientId, updatedAt }
*/

async function addEntity(type, data, opts = {}) {
  if (!CURRENT_ROOM) throw new Error('Not in a room');
  const payload = { type, data, clientId: CLIENT_ID, updatedAt: nowTs() };
  const db = FIREBASE_DB;
  const path = pathEntities(CURRENT_ROOM, CURRENT_ECHELON);
  if (opts && opts.id) {
    const ref = db.ref(`${path}/${opts.id}`);
    await ref.set(payload);
    seenMarkers.add(`${opts.id}:${payload.updatedAt}`);
    return opts.id;
  } else {
    const p = db.ref(path).push();
    await p.set(payload);
    seenMarkers.add(`${p.key}:${payload.updatedAt}`);
    return p.key;
  }
}

function updateEntity(id, partial) {
  if (!CURRENT_ROOM) return Promise.reject(new Error('Not in a room'));
  if (!id) return Promise.reject(new Error('id required'));
  const key = id;
  const t = throttleMap.get(key) || { timeout: null, lastSent: 0, pending: {} };
  Object.assign(t.pending, partial);
  throttleMap.set(key, t);

  const sendNow = () => {
    const payload = {};
    for (const k in t.pending) payload[`data/${k}`] = t.pending[k];
    payload['clientId'] = CLIENT_ID;
    payload['updatedAt'] = nowTs();
    const ref = FIREBASE_DB.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${key}`);
    return ref.update(payload).then(() => {
      t.lastSent = Date.now();
      t.pending = {};
      seenMarkers.add(`${key}:${payload.updatedAt}`);
    }).catch(e => console.warn('updateEntity err', e));
  };

  const since = Date.now() - (t.lastSent || 0);
  if (since >= MIN_UPDATE_MS) {
    if (t.timeout) { clearTimeout(t.timeout); t.timeout = null; }
    return sendNow();
  } else {
    if (t.timeout) clearTimeout(t.timeout);
    t.timeout = setTimeout(() => { sendNow(); }, Math.max(MIN_UPDATE_MS - since, FINAL_FLUSH_MS));
    throttleMap.set(key, t);
    return Promise.resolve();
  }
}

function removeEntity(id) {
  if (!CURRENT_ROOM) return Promise.reject(new Error('Not in a room'));
  if (!id) return Promise.reject(new Error('id required'));
  return FIREBASE_DB.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${id}`).remove();
}

/* ----------------- Map data update ----------------- */
function updateMapData(mapFile, center, zoom) {
  if (!CURRENT_ROOM) return Promise.reject(new Error('Not in a room'));
  const payload = { currentMapFile: mapFile || null, center: center || null, zoom: zoom || null, updatedAt: nowTs(), clientId: CLIENT_ID };
  return FIREBASE_DB.ref(pathMapData(CURRENT_ROOM)).update(payload);
}

/* ----------------- Integration: patch script.js functions to auto-sync ----------------- */
function integrateWithScriptJs() {
  // wait a bit for script.js to register globals
  setTimeout(() => {
    try {
      // patch placeMarker to write player_marker with stable id
      if (typeof window.placeMarker === 'function') {
        const origPlace = window.placeMarker;
        window.placeMarker = function(nick, nation, regimentFile, team, playerIndex) {
          // call original to create local marker
          const res = origPlace.apply(this, arguments);
          try {
            const stableId = `player_${team}_${playerIndex}`; // matches generateMarkerId in script.js => team-index
            // find marker in markerList to get position (script.js populates markerList)
            const ml = window.markerList || [];
            const entry = ml.find(m => m.id === stableId || (m.team === team && m.playerIndex === playerIndex));
            const latlng = (entry && entry.marker && entry.marker.getLatLng) ? entry.marker.getLatLng() : (window.map ? window.map.getCenter() : {lat:0,lng:0});
            const data = { id: stableId, team, playerIndex, nick, nation, regimentFile, latlng: { lat: latlng.lat, lng: latlng.lng } };
            addEntity('player_marker', data, { id: stableId }).catch(e => console.warn('addEntity player_marker err', e));
            // attach drag hooks on the marker if exists
            if (entry && entry.marker && entry.marker.on) {
              attachMarkerDragHooks(entry.marker, stableId);
            }
          } catch(e){ console.warn('placeMarker patch error', e); }
          return res;
        };
      }
    } catch(e){ console.warn('placeMarker patch failed', e); }

    // patch addCustomIcon
    try {
      if (typeof window.addCustomIcon === 'function') {
        const orig = window.addCustomIcon;
        window.addCustomIcon = function(url, latlng) {
          const marker = orig.apply(this, arguments);
          try {
            const pos = (latlng && latlng.lat != null) ? latlng : (marker && marker.getLatLng ? marker.getLatLng() : {lat:0,lng:0});
            const data = { url, latlng: { lat: pos.lat, lng: pos.lng } };
            addEntity('custom_symbol', data).then(key => {
              try { marker._syncId = key; } catch(e){}
              // attach drag hooks
              if (marker && marker.on) attachMarkerDragHooks(marker, key);
            }).catch(e => console.warn('add custom_symbol err', e));
          } catch(e){ console.warn('addCustomIcon patch error', e); }
          return marker;
        };
      }
    } catch(e){ console.warn('patch addCustomIcon failed', e); }

    // patch addSimpleSymbol
    try {
      if (typeof window.addSimpleSymbol === 'function') {
        const orig = window.addSimpleSymbol;
        window.addSimpleSymbol = function(type, latlng) {
          const marker = orig.apply(this, arguments);
          try {
            const pos = (latlng && latlng.lat != null) ? latlng : (marker && marker.getLatLng ? marker.getLatLng() : {lat:0,lng:0});
            const data = { type, latlng: { lat: pos.lat, lng: pos.lng } };
            addEntity('simple_symbol', data).then(key => {
              try { marker._syncId = key; } catch(e){}
              if (marker && marker.on) attachMarkerDragHooks(marker, key);
            }).catch(e => console.warn('add simple_symbol err', e));
          } catch(e){ console.warn('addSimpleSymbol patch error', e); }
          return marker;
        };
      }
    } catch(e){ console.warn('patch addSimpleSymbol failed', e); }

    // patch Draw created/edited/deleted
    try {
      if (window.map && window.drawnItems) {
        map.on(L.Draw.Event.CREATED, function(e) {
          const layer = e.layer;
          // serialize
          try {
            let payload = null;
            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
              payload = { type: 'polyline', latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Polygon) {
              const rings = layer.getLatLngs();
              const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
              payload = { type: 'polygon', latlngs, options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Circle) {
              payload = { type: 'circle', center: layer.getLatLng(), radius: layer.getRadius(), options: pickLayerOptions(layer) };
            }
            if (payload) {
              addEntity('drawing', payload).then(key => { try { layer._syncId = key; } catch(e){} });
            }
          } catch(e){ console.warn('draw.create patch err', e); }
        });

        map.on(L.Draw.Event.EDITED, function(e) {
          e.layers.eachLayer(layer => {
            if (!layer) return;
            const id = layer._syncId;
            if (!id) return;
            // reserialize and update
            try {
              if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
                updateEntity(id, { latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), type: 'polyline' });
              } else if (layer instanceof L.Polygon) {
                const rings = layer.getLatLngs();
                const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
                updateEntity(id, { latlngs, type: 'polygon' });
              } else if (layer instanceof L.Circle) {
                updateEntity(id, { center: layer.getLatLng(), radius: layer.getRadius(), type: 'circle' });
              }
            } catch(e){ console.warn('draw.edit patch err', e); }
          });
        });

        map.on(L.Draw.Event.DELETED, function(e) {
          e.layers.eachLayer(layer => {
            if (!layer) return;
            const id = layer._syncId;
            if (id) removeEntity(id).catch(()=>{});
          });
        });
      }
    } catch(e){ console.warn('draw hooks attach err', e); }

    // patch loadMapByFile to update mapData in DB after successful load
    try {
      if (typeof window.loadMapByFile === 'function') {
        const origLoadMap = window.loadMapByFile;
        window.loadMapByFile = function(fileName) {
          // call original and then update mapData if joined
          const p = origLoadMap.apply(this, arguments);
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try {
                if (CURRENT_ROOM && window.currentMapFile) {
                  updateMapToDb(window.currentMapFile);
                }
              } catch(e){}
            }).catch(()=>{});
          } else {
            try { if (CURRENT_ROOM && window.currentMapFile) updateMapToDb(window.currentMapFile); } catch(e){}
          }
          return p;
        };
      }
    } catch(e){ console.warn('patch loadMapByFile failed', e); }

    // attach marker hooks for existing markers (if any)
    setTimeout(() => {
      try {
        (window.markerList || []).forEach(entry => {
          if (entry && entry.marker && !entry.marker._syncHooksAttached) {
            const stableId = entry.id || `player_${entry.team}_${entry.playerIndex}`;
            attachMarkerDragHooks(entry.marker, stableId);
          }
        });
      } catch(e){/*ignore*/}
    }, 600);
  }, 200);
}

/* ----------------- Helpers: marker drag hooks ----------------- */
function attachMarkerDragHooks(marker, syncId) {
  if (!marker || !marker.on) return;
  if (marker._syncHooksAttached) return;
  marker._syncHooksAttached = true;

  marker.on('dragstart', () => { marker._isDragging = true; });
  marker.on('drag', () => {
    if (!marker._isDragging) return;
    // throttled update
    const latlng = marker.getLatLng();
    updateEntity(syncId, { latlng: { lat: latlng.lat, lng: latlng.lng } }).catch(()=>{});
  });
  marker.on('dragend', () => {
    marker._isDragging = false;
    const latlng = marker.getLatLng();
    updateEntity(syncId, { latlng: { lat: latlng.lat, lng: latlng.lng } }).catch(()=>{});
  });
}

/* ----------------- Helpers: update map DB ----------------- */
function updateMapToDb(mapFile) {
  if (!CURRENT_ROOM) return;
  try {
    const center = (window.map && window.map.getCenter) ? window.map.getCenter() : null;
    const zoom = (window.map && window.map.getZoom) ? window.map.getZoom() : null;
    const payload = { currentMapFile: mapFile || null, center: center || null, zoom: zoom || null, updatedAt: nowTs(), clientId: CLIENT_ID };
    FIREBASE_DB.ref(pathMapData(CURRENT_ROOM)).update(payload).catch(e=>console.warn('mapData update error', e));
  } catch(e){ console.warn('updateMapToDb err', e); }
}

/* ----------------- Public API on window ----------------- */
window.sync = {
  joinRoom: async function(roomId, pass, nick) { await joinRoom(roomId, pass || '', nick || localStorage.getItem('mw2_nick') || 'anon'); localStorage.setItem('mw2_last_room', roomId); },
  leaveRoom: async function(){ await leaveRoom(); },
  setEchelon: function(n){ CURRENT_ECHELON = parseInt(n) || 1; attachEntityListeners(CURRENT_ROOM, CURRENT_ECHELON); },
  addEntity: addEntity,
  updateEntity: updateEntity,
  removeEntity: removeEntity,
  updateMapData: updateMapToDb,
  clientId: CLIENT_ID,
  getCurrentRoom: () => CURRENT_ROOM,
  getCurrentEchelon: () => CURRENT_ECHELON
};

/* ----------------- Start: inject UI and integrate ----------------- */
injectRoomPanel();
integrateWithScriptJs();

// Auto-restore last room prompt non-blocking
setTimeout(() => {
  try {
    const last = localStorage.getItem('mw2_last_room');
    if (last && confirm('Восстановить последнюю комнату?')) {
      const nick = localStorage.getItem('mw2_nick') || '';
      sync.joinRoom(last, '', nick).catch(()=>{});
    }
  } catch(e){}
}, 900);

console.log('firebase-sync.js initialized. clientId=', CLIENT_ID);

})(); // end wrapper
} // end if FIREBASE_DB

/* small helper */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
