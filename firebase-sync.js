// firebase-sync.js
// Полный файл — пароль отключён (join работает без проверки пароля).
// Включён патч против touchleave, автоотрисовка сущностей через функции script.js (Variant A),
// throttling drag, мгновенное удаление у всех, загрузка состояния при join.

(function(){
  'use strict';

  // ---------- PATCH: Prevent Leaflet from crashing on invalid events like 'touchleave' ----------
  (function() {
    try {
      const patch = () => {
        if (window.L && L.Evented && L.Evented.prototype && !L.Evented.prototype.__syncPatched) {
          const originalOn = L.Evented.prototype.on;
          L.Evented.prototype.on = function(types, fn, ctx) {
            try {
              if (typeof types === 'string') {
                const filtered = types.split(/\s+/).filter(t => {
                  const tl = String(t).toLowerCase();
                  if (tl.indexOf('touchleave') !== -1) return false;
                  return true;
                });
                if (filtered.length === 0) {
                  // drop silently
                  return this;
                }
                types = filtered.join(' ');
              }
            } catch(e){}
            return originalOn.call(this, types, fn, ctx);
          };
          L.Evented.prototype.__syncPatched = true;
          console.info('[sync] Leaflet patched: blocked invalid events like touchleave');
        }
      };
      if (window.L && L.Evented && L.Evented.prototype) patch();
      else {
        let tries = 0;
        const iv = setInterval(() => {
          tries++;
          if (window.L && L.Evented && L.Evented.prototype) {
            clearInterval(iv); patch();
          } else if (tries > 60) {
            clearInterval(iv);
            console.warn('[sync] Leaflet did not appear; cannot apply event patch automatically');
          }
        }, 250);
      }
    } catch(e){ console.warn('[sync] patch error', e); }
  })();

  // ---------- CONFIG ----------
  const DEBUG = false;
  const MIN_UPDATE_MS = 250;
  const FINAL_FLUSH_MS = 120;
  const WAIT_INTERVAL_MS = 200;
  const WAIT_MAX_TRIES = 150;

  function log(...a){ if(DEBUG) console.log('[sync]', ...a); }
  function warn(...a){ console.warn('[sync]', ...a); }
  function now(){ return Date.now(); }
  function uid(pref='u'){ return pref + '_' + Math.random().toString(36).slice(2,9); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // ---------- Firebase check ----------
  if (!window.firebase || !window.firebase.database) {
    console.error('firebase-sync.js: Firebase v8 not found. Подключи firebase-app.js и firebase-database.js.');
    return;
  }
  const DB = window.firebase.database();

  // ---------- State ----------
  const CLIENT_ID = localStorage.getItem('mw2_uid') || uid('uid');
  localStorage.setItem('mw2_uid', CLIENT_ID);
  let CURRENT_ROOM = null;
  let CURRENT_ECHELON = (typeof window.currentEchelon !== 'undefined') ? window.currentEchelon : 1;

  let entitiesRef = null;
  let mapDataRef = null;
  let participantsRef = null;
  const listeners = { added:null, changed:null, removed:null, map:null, participants:null };

  const seenRemote = new Set();
  const throttleMap = new Map();
  const localObjects = new Map(); // syncId -> { type, obj }

  // ---------- PATH HELPERS ----------
  function pathRoom(r){ return `rooms/${encodeURIComponent(r)}`; }
  function pathEntities(r,e){ return `${pathRoom(r)}/echelons/e${e}/entities`; }
  function pathMapData(r){ return `${pathRoom(r)}/mapData`; }
  function pathParticipants(r){ return `${pathRoom(r)}/participants`; }

  // ---------- waitFor ----------
  function waitFor(predicate, onReady, opts = {}) {
    const interval = opts.interval || WAIT_INTERVAL_MS;
    const maxTries = opts.maxTries || WAIT_MAX_TRIES;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      try {
        if (predicate()) {
          clearInterval(id);
          try { onReady(); } catch(e){ warn('waitFor onReady', e); }
        } else if (tries >= maxTries) {
          clearInterval(id);
          warn('waitFor: timeout waiting for predicate');
        }
      } catch(e){}
    }, interval);
  }

  // ---------- LISTENERS ----------
  function attachListeners(room, echelon) {
    detachListeners();
    if (!room) return;
    try {
      entitiesRef = DB.ref(pathEntities(room, echelon));

      listeners.added = entitiesRef.on('child_added', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        log('child_added', key, val.type);
        applyRemoteEntityCreate(key, val).catch(e => warn('applyRemoteEntityCreate', e));
      });

      listeners.changed = entitiesRef.on('child_changed', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        log('child_changed', key, val.type);
        applyRemoteEntityChanged(key, val).catch(e => warn('applyRemoteEntityChanged', e));
      });

      listeners.removed = entitiesRef.on('child_removed', snap => {
        const key = snap.key;
        if (!key) return;
        log('child_removed', key);
        applyRemoteEntityRemoved(key).catch(e => warn('applyRemoteEntityRemoved', e));
      });

      mapDataRef = DB.ref(pathMapData(room));
      listeners.map = mapDataRef.on('value', snap => {
        const md = snap.val();
        if (!md) return;
        try {
          if (md.currentMapFile && md.currentMapFile !== window.currentMapFile) {
            window.loadMapByFile && window.loadMapByFile(md.currentMapFile);
          }
          if (md.center && typeof md.zoom !== 'undefined' && window.map) {
            window.map.setView(md.center, md.zoom);
          }
        } catch(e){}
        log('mapData received', md && md.currentMapFile);
      });

      participantsRef = DB.ref(pathParticipants(room));
      listeners.participants = participantsRef.on('value', snap => {
        const parts = snap.val() || {};
        try {
          const list = document.getElementById('room-list');
          if (list) {
            const spans = list.querySelectorAll('.c');
            spans.forEach(s => {
              if (s.dataset && s.dataset.room === room) s.textContent = Object.keys(parts).length;
            });
          }
        } catch(e){}
      });

      log('listeners attached', room, echelon);
    } catch(e){ warn('attachListeners err', e); }
  }

  function detachListeners(){
    try {
      if (entitiesRef && listeners.added) entitiesRef.off('child_added', listeners.added);
      if (entitiesRef && listeners.changed) entitiesRef.off('child_changed', listeners.changed);
      if (entitiesRef && listeners.removed) entitiesRef.off('child_removed', listeners.removed);
      if (mapDataRef && listeners.map) mapDataRef.off('value', listeners.map);
      if (participantsRef && listeners.participants) participantsRef.off('value', listeners.participants);
    } catch(e){}
    entitiesRef = mapDataRef = participantsRef = null;
    listeners.added = listeners.changed = listeners.removed = listeners.map = listeners.participants = null;
    seenRemote.clear();
    throttleMap.forEach(v => { if (v.timeout) clearTimeout(v.timeout); });
    throttleMap.clear();
    log('listeners detached');
  }

  // ---------- CRUD ----------
  async function addEntity(type, data = {}, opts = {}) {
    if (!CURRENT_ROOM) throw new Error('addEntity: not in room');
    const payload = { type, data, clientId: CLIENT_ID, updatedAt: now() };
    const base = DB.ref(pathEntities(CURRENT_ROOM, CURRENT_ECHELON));
    if (opts && opts.id) {
      const ref = base.child(opts.id);
      await ref.set(payload);
      seenRemote.add(`${opts.id}:${payload.updatedAt}`);
      log('addEntity stable', opts.id);
      return opts.id;
    } else {
      const p = base.push();
      await p.set(payload);
      seenRemote.add(`${p.key}:${payload.updatedAt}`);
      log('addEntity push', p.key);
      return p.key;
    }
  }

  function updateEntity(id, partial = {}) {
    if (!CURRENT_ROOM) return Promise.reject(new Error('updateEntity: not in room'));
    if (!id) return Promise.reject(new Error('updateEntity: id required'));
    const key = id;
    const t = throttleMap.get(key) || { timeout: null, lastSent: 0, pending: {} };
    t.pending = Object.assign({}, t.pending || {}, partial);
    throttleMap.set(key, t);

    function sendNow() {
      const payload = {};
      for (const k in t.pending) payload[`data/${k}`] = t.pending[k];
      payload['clientId'] = CLIENT_ID;
      payload['updatedAt'] = now();
      const ref = DB.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${key}`);
      return ref.update(payload).then(() => {
        t.lastSent = Date.now();
        t.pending = {};
        seenRemote.add(`${key}:${payload.updatedAt}`);
        log('updateEntity sent', key);
      }).catch(e => warn('updateEntity err', e));
    }

    const since = Date.now() - (t.lastSent || 0);
    if (since >= MIN_UPDATE_MS) {
      if (t.timeout) { clearTimeout(t.timeout); t.timeout = null; }
      return sendNow();
    } else {
      if (t.timeout) clearTimeout(t.timeout);
      t.timeout = setTimeout(() => sendNow(), Math.max(MIN_UPDATE_MS - since, FINAL_FLUSH_MS));
      throttleMap.set(key, t);
      return Promise.resolve();
    }
  }

  function removeEntity(id) {
    if (!CURRENT_ROOM) return Promise.reject(new Error('removeEntity: not in room'));
    if (!id) return Promise.reject(new Error('removeEntity: id required'));
    return DB.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${id}`).remove().then(()=> log('removeEntity', id)).catch(e => warn('removeEntity err', e));
  }

  // ---------- Map data ----------
  function updateMapData(mapFile, center, zoom) {
    if (!CURRENT_ROOM) return Promise.reject(new Error('updateMapData: not in room'));
    const payload = { currentMapFile: mapFile || null, center: center || null, zoom: zoom || null, updatedAt: now(), clientId: CLIENT_ID };
    return DB.ref(pathMapData(CURRENT_ROOM)).update(payload).then(()=> log('mapData updated')).catch(e => warn('mapData update err', e));
  }

  // ---------- Room management (password disabled) ----------
  // joinRoom(roomId, maybePasswordOrNick, maybeNick) — we ignore password if passed; accept nick if present
  async function joinRoom(roomId, maybePassOrNick, maybeNick) {
    if (!roomId) throw new Error('joinRoom: roomId required');
    if (CURRENT_ROOM) await leaveRoom();

    // create room if missing (no password checks)
    const rref = DB.ref(pathRoom(roomId));
    const snap = await rref.once('value');
    const val = snap.val();
    if (!val) {
      await rref.set({ name: roomId, password: '', createdAt: now() });
    }

    CURRENT_ROOM = roomId;
    // participants
    const uid = CLIENT_ID;
    const nick = (typeof maybeNick === 'string' && maybeNick.length) ? maybeNick : ((typeof maybePassOrNick === 'string' && maybePassOrNick.length) ? maybePassOrNick : (localStorage.getItem('mw2_nick') || `Player_${uid.slice(-4)}`));
    localStorage.setItem('mw2_nick', nick);
    participantsRef = DB.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`);
    await participantsRef.set({ nick: nick, joinedAt: now() });
    participantsRef.onDisconnect().remove();

    // attach listeners & initial fetch
    attachListeners(CURRENT_ROOM, CURRENT_ECHELON);

    try {
      const entSnap = await DB.ref(pathEntities(CURRENT_ROOM, CURRENT_ECHELON)).once('value');
      const obj = entSnap.val() || {};
      Object.entries(obj).forEach(([key, val]) => {
        if (!val) return;
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        applyRemoteEntityCreate(key, val).catch(e => warn('initial apply', e));
      });
    } catch(e){ warn('initial fetch err', e); }

    try { const btn = document.getElementById('btn-leave-room'); if (btn) btn.style.display = 'inline-block'; } catch(e){}
    localStorage.setItem('mw2_last_room', CURRENT_ROOM);
    log('joined room', CURRENT_ROOM);
    return true;
  }

  async function leaveRoom() {
    if (!CURRENT_ROOM) return;
    try {
      const uid = CLIENT_ID;
      await DB.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`).remove();
    } catch(e){}
    detachListeners();
    CURRENT_ROOM = null;
    try { const btn = document.getElementById('btn-leave-room'); if (btn) btn.style.display = 'none'; } catch(e){}
    log('left room');
  }

  function setEchelon(n) {
    const p = parseInt(n) || 1;
    if (p === CURRENT_ECHELON) return;
    CURRENT_ECHELON = p;
    if (CURRENT_ROOM) attachListeners(CURRENT_ROOM, CURRENT_ECHELON);
    log('set echelon', CURRENT_ECHELON);
  }

  // ---------- APPLY remote entities (Variant A) ----------
  async function applyRemoteEntityCreate(key, val) {
    const type = val.type || (val.data && val.data.type) || 'unknown';
    const data = val.data || val;
    if (localObjects.has(key)) {
      return applyRemoteEntityChanged(key, val);
    }

    try {
      if (type === 'player_marker' || (data && data.id && String(data.id).startsWith('player_'))) {
        const t = data.team || (data.id ? data.id.split('_')[1] : null);
        const idx = data.playerIndex != null ? data.playerIndex : (data.id ? parseInt(String(data.id).split('_').pop()) : 0);
        const nick = data.nick || data.ownerNick || '';
        const nation = data.nation || '';
        const regimentFile = data.regimentFile || data.regiment || '';
        if (typeof window.placeMarker === 'function') {
          try {
            window.placeMarker(nick, nation, regimentFile, t, idx);
            setTimeout(() => {
              try {
                const ml = window.markerList || [];
                const entry = ml.find(m => m.id === data.id || (m.team === t && m.playerIndex === idx));
                if (entry && entry.marker) {
                  entry.marker._syncId = key;
                  localObjects.set(key, { type:'player_marker', obj: entry.marker, meta: entry });
                  attachMarkerLocalHooks(entry.marker, key);
                  if (data.latlng && entry.marker.setLatLng) entry.marker.setLatLng([data.latlng.lat, data.latlng.lng]);
                }
              } catch(e){ warn('post placeMarker attach err', e); }
            }, 140);
            return;
          } catch(e){ warn('placeMarker call error', e); }
        } else if (window.L && window.map) {
          const marker = L.marker([data.latlng.lat, data.latlng.lng], { draggable: true }).addTo(window.map);
          marker._syncId = key;
          localObjects.set(key, { type:'player_marker', obj: marker });
          attachMarkerLocalHooks(marker, key);
          return;
        }
      }

      if (type === 'custom_symbol' || type === 'simple_symbol') {
        const latlng = (data.latlng && data.latlng.lat != null) ? data.latlng : (data.lat && data.lat.lng ? data.lat : null);
        if (type === 'custom_symbol' && typeof window.addCustomIcon === 'function') {
          const marker = window.addCustomIcon(data.url, latlng);
          setTimeout(() => { try { if (marker) { marker._syncId = key; localObjects.set(key, { type, obj: marker }); attachMarkerLocalHooks(marker, key); } } catch(e){} }, 120);
          return;
        }
        if (type === 'simple_symbol' && typeof window.addSimpleSymbol === 'function') {
          const marker = window.addSimpleSymbol(data.simpleType || data.type || data.symbName || '', latlng);
          setTimeout(() => { try { if (marker) { marker._syncId = key; localObjects.set(key, { type, obj: marker }); attachMarkerLocalHooks(marker, key); } } catch(e){} }, 120);
          return;
        }
        if (window.L && window.map && latlng) {
          const marker = L.marker([latlng.lat, latlng.lng], { draggable: true }).addTo(window.map);
          marker._syncId = key;
          localObjects.set(key, { type, obj: marker });
          attachMarkerLocalHooks(marker, key);
          return;
        }
      }

      if (type === 'drawing') {
        if (!window.L || !window.map) return;
        let layer = null;
        if (data.type === 'polyline' && Array.isArray(data.latlngs)) {
          layer = L.polyline(data.latlngs.map(p=>[p.lat,p.lng]), pickLayerOptionsObj(data.options)).addTo(window.map);
        } else if (data.type === 'polygon' && Array.isArray(data.latlngs)) {
          layer = L.polygon(data.latlngs.map(p=>[p.lat,p.lng]), pickLayerOptionsObj(data.options)).addTo(window.map);
        } else if (data.type === 'circle' && data.center) {
          layer = L.circle([data.center.lat,data.center.lng], { radius: data.radius, ...pickLayerOptionsObj(data.options) }).addTo(window.map);
        }
        if (layer) {
          try { layer._syncId = key; } catch(e){}
          localObjects.set(key, { type:'drawing', obj: layer });
          try { if (window.drawnItems && drawnItems.addLayer) drawnItems.addLayer(layer); } catch(e){}
        }
        return;
      }

      localObjects.set(key, { type: type || 'unknown', obj: data });
    } catch(e){ warn('applyRemoteEntityCreate err', e); }
  }

  async function applyRemoteEntityChanged(key, val) {
    if (!localObjects.has(key)) return applyRemoteEntityCreate(key, val);
    const entry = localObjects.get(key);
    const type = val.type || entry.type;
    const data = val.data || val;

    try {
      if (type === 'player_marker') {
        const marker = entry.obj;
        if (marker && marker.setLatLng && data.latlng) marker.setLatLng([data.latlng.lat, data.latlng.lng]);
        return;
      }
      if (type === 'custom_symbol' || type === 'simple_symbol') {
        const marker = entry.obj;
        if (marker && marker.setLatLng && data.latlng) marker.setLatLng([data.latlng.lat, data.latlng.lng]);
        return;
      }
      if (type === 'drawing') {
        const layer = entry.obj;
        if (!layer) return;
        if (data.latlngs && (layer.setLatLngs || layer.setLatLng)) {
          if (layer.setLatLngs) layer.setLatLngs(data.latlngs.map(p=>[p.lat,p.lng]));
          else if (layer.setLatLng) layer.setLatLng([data.center.lat, data.center.lng]);
        }
        return;
      }
    } catch(e){ warn('applyRemoteEntityChanged err', e); }
  }

  async function applyRemoteEntityRemoved(key) {
    try {
      if (!localObjects.has(key)) {
        const ml = window.markerList || [];
        for (let m of ml) {
          try {
            if (m && m.marker && (m.marker._syncId === key || m.id === key)) {
              if (typeof window.removeMarkerById === 'function') {
                window.removeMarkerById(m.id || key);
              } else {
                if (m.marker && m.marker.remove) m.marker.remove();
              }
            }
          } catch(e){}
        }
        return;
      }
      const entry = localObjects.get(key);
      const obj = entry.obj;
      if (entry.type === 'player_marker') {
        try { if (typeof window.removeMarkerById === 'function') window.removeMarkerById(entry.obj._syncId || key); } catch(e){}
        try { if (obj && obj.remove) obj.remove(); } catch(e){}
      } else {
        if (obj && obj.remove) obj.remove();
        try { if (window.drawnItems && drawnItems.removeLayer) drawnItems.removeLayer(obj); } catch(e){}
      }
      localObjects.delete(key);
      log('removed local object', key);
    } catch(e){ warn('applyRemoteEntityRemoved err', e); }
  }

  // ---------- attach local hooks ----------
  function attachMarkerLocalHooks(marker, syncId) {
    if (!marker || !marker.on) return;
    if (marker._syncHooksAttached) return;
    marker._syncHooksAttached = true;

    marker.on('dragstart', function(){ marker._isDragging = true; });
    marker.on('drag', function(){
      if (!marker._isDragging) return;
      try {
        const ll = marker.getLatLng();
        updateEntity(syncId, { latlng: { lat: ll.lat, lng: ll.lng } }).catch(()=>{});
      } catch(e){}
    });
    marker.on('dragend', function(){
      marker._isDragging = false;
      try {
        const ll = marker.getLatLng();
        updateEntity(syncId, { latlng: { lat: ll.lat, lng: ll.lng } }).catch(()=>{});
      } catch(e){}
    });

    marker.on('contextmenu', function(){
      try {
        // remote deletions should remove immediately; local deletion uses removeEntity
        if (confirm('Удалить этот объект?')) removeEntity(syncId).catch(()=>{});
      } catch(e){}
    });
  }

  function pickLayerOptionsObj(opts) {
    if (!opts) return {};
    const r = {};
    if (opts.color) r.color = opts.color;
    if (opts.weight != null) r.weight = opts.weight;
    if (opts.fillColor) r.fillColor = opts.fillColor;
    if (opts.fillOpacity != null) r.fillOpacity = opts.fillOpacity;
    return r;
  }

  // ---------- Integration with script.js ----------
  function integrateWithScriptJs() {
    waitFor(() => typeof window.placeMarker === 'function', () => { log('placeMarker ready'); });
    waitFor(() => typeof window.addCustomIcon === 'function' || typeof window.addSimpleSymbol === 'function', () => { log('symbols ready'); });

    waitFor(() => typeof window.loadMapByFile === 'function', () => {
      const orig = window.loadMapByFile;
      if (orig && !orig._syncPatched) {
        window.loadMapByFile = function(fileName) {
          const res = orig.apply(this, arguments);
          try {
            if (res && typeof res.then === 'function') {
              res.then(() => { if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map && window.map.getCenter && window.map.getCenter(), window.map && window.map.getZoom && window.map.getZoom()); });
            } else {
              if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map && window.map.getCenter && window.map.getCenter(), window.map && window.map.getZoom && window.map.getZoom());
            }
          } catch(e){}
          return res;
        };
        window.loadMapByFile._syncPatched = true;
        log('loadMapByFile patched');
      }
    });

    waitFor(() => window.map && typeof window.map.on === 'function', () => {
      if (window.map._syncMoveAttached) return;
      try {
        window.map.on('moveend', () => {
          try { if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map.getCenter(), window.map.getZoom()); } catch(e){}
        });
        window.map._syncMoveAttached = true;
        log('map moveend attached');
      } catch(e){ warn('map attach err', e); }
    });

    waitFor(() => Array.isArray(window.markerList), () => {
      try {
        (window.markerList || []).forEach(entry => {
          try {
            const marker = entry.marker;
            const stableId = entry.id || `player_${entry.team}_${entry.playerIndex}`;
            if (marker && !marker._syncHooksAttached) attachMarkerLocalHooks(marker, stableId);
          } catch(e){}
        });
      } catch(e){}
    });

    waitFor(() => window.map && typeof window.map.on === 'function' && window.drawnItems, () => {
      log('draw ready (if used)');
    });
  }

  // ---------- Panel UI ----------
  function injectRoomPanel() {
    const panel = document.getElementById('room-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="room-panel-inner">
        <div class="room-panel-header"><strong>Комнаты</strong> <button id="room-panel-toggle" aria-label="toggle">▾</button></div>
        <div id="room-panel-body">
          <div id="room-list"></div><hr/>
          <input id="room-name" placeholder="Название"/><input id="room-pass" placeholder="Пароль (не используется)" style="opacity:.6"/><input id="my-nick" placeholder="Ник"/>
          <button id="btn-create-room">Создать</button>
          <button id="btn-refresh-rooms">Обновить</button>
          <button id="btn-leave-room" style="display:none">Выйти</button>
        </div>
      </div>
    `;
    setTimeout(() => {
      const toggle = document.getElementById('room-panel-toggle');
      const panelEl = document.getElementById('room-panel');
      const body = document.getElementById('room-panel-body');
      if (toggle && panelEl && body) {
        toggle.addEventListener('click', () => {
          panelEl.classList.toggle('collapsed');
          if (panelEl.classList.contains('collapsed')) body.style.display = 'none';
          else body.style.display = 'block';
        });
        body.style.display = panelEl.classList.contains('collapsed') ? 'none' : 'block';
      }

      const list = document.getElementById('room-list');
      const createBtn = document.getElementById('btn-create-room');
      const refreshBtn = document.getElementById('btn-refresh-rooms');
      const leaveBtn = document.getElementById('btn-leave-room');
      const nameInp = document.getElementById('room-name');
      const passInp = document.getElementById('room-pass');
      const nickInp = document.getElementById('my-nick');

      const storedNick = localStorage.getItem('mw2_nick') || '';
      if (nickInp) nickInp.value = storedNick;

      async function refreshRooms(){
        try {
          const snap = await DB.ref('rooms').once('value');
          const rooms = snap.val() || {};
          list.innerHTML = '';
          Object.entries(rooms).forEach(([id, r]) => {
            const div = document.createElement('div');
            div.className = 'room-list-item';
            div.innerHTML = `<div class="room-name">${escapeHtml(r.name || id)}</div>
              <div>Участников: <span class="c" data-room="${id}">?</span></div>
              <div style="margin-top:6px;">
                <button class="join" data-id="${id}">Войти</button>
                <button class="del" data-id="${id}">×</button>
              </div>`;
            list.appendChild(div);
            DB.ref(`rooms/${id}/participants`).once('value').then(s => {
              const el = div.querySelector('.c');
              if (el) el.textContent = s.numChildren();
              if (el) el.dataset.room = id;
            }).catch(()=>{});
          });
        } catch(e){ warn('refreshRooms err', e); }
      }

      createBtn && (createBtn.onclick = async () => {
        const name = (nameInp && nameInp.value.trim()) || 'Без названия';
        const nick = (nickInp && nickInp.value.trim()) || (`Игрок_${Math.random().toString(36).slice(2,6)}`);
        localStorage.setItem('mw2_nick', nick);
        try {
          const r = DB.ref('rooms').push();
          await r.set({ name, password: '', createdAt: now() });
          await joinRoom(r.key, nick);
          setTimeout(refreshRooms, 200);
        } catch(err){ warn('create room err', err); alert('Ошибка создания комнаты'); }
      });

      refreshBtn && (refreshBtn.onclick = refreshRooms);
      setTimeout(refreshRooms, 200);

      leaveBtn && (leaveBtn.onclick = async () => { try { await leaveRoom(); } catch(e){}; leaveBtn.style.display='none'; });

      list && (list.onclick = async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.classList.contains('join')) {
          const nick = (nickInp && nickInp.value.trim()) || localStorage.getItem('mw2_nick') || '';
          try {
            localStorage.setItem('mw2_nick', nick);
            await joinRoom(id, nick);
            document.getElementById('btn-leave-room').style.display = 'inline-block';
          } catch(err) {
            alert('Не получилось войти: ' + (err.message || err));
          }
        } else if (btn.classList.contains('del')) {
          if (!confirm('Удалить комнату?')) return;
          try { await DB.ref(`rooms/${id}`).remove(); setTimeout(refreshRooms, 200); } catch(e){ warn('del room err', e); }
        }
      });

    }, 120);
  }

  // ---------- Expose API ----------
  window.sync = {
    clientId: CLIENT_ID,
    joinRoom: async function(roomId, maybeNick){ return joinRoom(roomId, maybeNick); },
    leaveRoom: async function(){ return leaveRoom(); },
    setEchelon: function(n){ return setEchelon(n); },
    addEntity: addEntity,
    updateEntity: updateEntity,
    removeEntity: removeEntity,
    updateMapData: updateMapData,
    getCurrentRoom: () => CURRENT_ROOM,
    getCurrentEchelon: () => CURRENT_ECHELON
  };

  // ---------- Boot ----------
  try {
    injectRoomPanel();
    integrateWithScriptJs();
  } catch(e){ warn('boot err', e); }

  setTimeout(() => {
    try {
      const last = localStorage.getItem('mw2_last_room');
      if (last && confirm('Восстановить последнюю комнату?')) {
        const nick = localStorage.getItem('mw2_nick') || '';
        window.sync.joinRoom(last, nick).catch(()=>{});
      }
    } catch(e){}
  }, 900);

  log('firebase-sync.js loaded. clientId=', CLIENT_ID);

})(); // end file
