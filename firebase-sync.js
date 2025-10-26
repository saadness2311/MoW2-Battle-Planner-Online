// firebase-sync.js
// Полный файл — интеграция с script.js, Variant A (вызов твоих функций для отрисовки)
// Особенности:
// - Stable player IDs: player_{team}_{index}
// - Автоподгрузка всех сущностей при joinRoom
// - Приход child_added/child_changed/child_removed автоматически вызывает твои функции (placeMarker, addCustomIcon, addSimpleSymbol, и т.д.)
// - Throttle drag updates (MIN_UPDATE_MS) + финальный flush на dragend
// - Панель комнат: сворачивание/разворачивание работает
// - Никаких записей в БД без явно выбранной комнаты

(function(){
  'use strict';

  // ---------- CONFIG ----------
  const DEBUG = false;               // включи для подробных логов
  const MIN_UPDATE_MS = 250;         // минимальный интервал отправки обновлений для одного объекта
  const FINAL_FLUSH_MS = 120;        // максимум ожидания для flush
  const WAIT_INTERVAL_MS = 200;      // интервал ожидания доступности внешних функций/объектов
  const WAIT_MAX_TRIES = 150;        // сколько раз пытаться ждать (~30s)

  // ---------- HELPERS ----------
  function log(...args){ if(DEBUG) console.log('[sync]', ...args); }
  function warn(...args){ console.warn('[sync]', ...args); }
  function now(){ return Date.now(); }
  function uid(pref='u'){ return pref + '_' + Math.random().toString(36).slice(2,9); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // ---------- Firebase check ----------
  if (!window.firebase || !window.firebase.database) {
    console.error('firebase-sync.js: Firebase v8 not found. Подключи firebase-app.js и firebase-database.js в index.html.');
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

  const seenRemote = new Set();      // marker `${key}:${updatedAt}` to avoid double processing
  const throttleMap = new Map();     // id -> { timeout, lastSent, pending }

  // ---------- DB PATH HELPERS ----------
  function pathRoom(r){ return `rooms/${encodeURIComponent(r)}`; }
  function pathEntities(r,e){ return `${pathRoom(r)}/echelons/e${e}/entities`; }
  function pathMapData(r){ return `${pathRoom(r)}/mapData`; }
  function pathParticipants(r){ return `${pathRoom(r)}/participants`; }

  // ---------- UTIL: waitFor ----------
  function waitFor(predicate, onReady, opts = {}) {
    const interval = opts.interval || WAIT_INTERVAL_MS;
    const maxTries = opts.maxTries || WAIT_MAX_TRIES;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      try {
        if (predicate()) {
          clearInterval(id);
          try { onReady(); } catch(e){ warn('waitFor onReady error', e); }
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

      // child_added
      listeners.added = entitiesRef.on('child_added', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        // ignore own writes
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        log('child_added', key, val.type);
        // draw entity immediately via your functions (Variant A)
        applyRemoteEntityCreate(key, val).catch(e => warn('applyRemoteEntityCreate err', e));
      });

      // child_changed
      listeners.changed = entitiesRef.on('child_changed', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        log('child_changed', key, val.type);
        applyRemoteEntityChanged(key, val).catch(e => warn('applyRemoteEntityChanged err', e));
      });

      // child_removed
      listeners.removed = entitiesRef.on('child_removed', snap => {
        const key = snap.key;
        if (!key) return;
        log('child_removed', key);
        applyRemoteEntityRemoved(key).catch(e => warn('applyRemoteEntityRemoved err', e));
      });

      // mapData
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

      // participants
      participantsRef = DB.ref(pathParticipants(room));
      listeners.participants = participantsRef.on('value', snap => {
        const parts = snap.val() || {};
        try {
          const list = document.getElementById('room-list');
          if (list) {
            // update matched item counts
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

  // ---------- Room management ----------
  async function joinRoom(roomId, password = '', nick = '') {
    if (!roomId) throw new Error('joinRoom: roomId required');
    if (CURRENT_ROOM) await leaveRoom();

    // ensure room exists and password ok
    const ref = DB.ref(pathRoom(roomId));
    const snap = await ref.once('value');
    const val = snap.val();
    if (!val) {
      await ref.set({ name: roomId, password: password || '', createdAt: now() });
    } else if (val.password && val.password !== password) {
      throw new Error('Incorrect room password');
    }

    CURRENT_ROOM = roomId;
    // participants
    const uid = CLIENT_ID;
    participantsRef = DB.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`);
    await participantsRef.set({ nick: nick || localStorage.getItem('mw2_nick') || `Player_${uid.slice(-4)}`, joinedAt: now() });
    participantsRef.onDisconnect().remove();

    // attach listeners & initial fetch
    attachListeners(CURRENT_ROOM, CURRENT_ECHELON);

    // initial fetch: draw all existing entities right away
    try {
      const entSnap = await DB.ref(pathEntities(CURRENT_ROOM, CURRENT_ECHELON)).once('value');
      const obj = entSnap.val() || {};
      Object.entries(obj).forEach(([key, val]) => {
        if (!val) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (val.clientId === CLIENT_ID) return; // skip own
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        applyRemoteEntityCreate(key, val).catch(e => warn('initial apply err', e));
      });
    } catch(e){ warn('initial fetch err', e); }

    // attach mapData listener already done in attachListeners
    // show leave button
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

  // ---------- APPLY remote entities via your functions (Variant A) ----------
  // We assume these functions exist in script.js:
  // - placeMarker(nick,nation,regimentFile,team,playerIndex)
  // - addCustomIcon(url, latlng)
  // - addSimpleSymbol(type, latlng)
  // For drawings we'll use map/drawnItems and create appropriate layers if possible.
  // We always try to attach _syncId to created objects so later updates/removals work.

  // Map of syncId -> local object references
  const localObjects = new Map(); // id -> { type, obj } where obj is marker/layer/etc.

  async function applyRemoteEntityCreate(key, val) {
    const type = val.type || val.data && val.data.type || 'unknown';
    const data = val.data || val;
    // If already existing locally, update instead
    if (localObjects.has(key)) {
      // already present; do a safe update
      return applyRemoteEntityChanged(key, val);
    }

    // Decide by type
    if (type === 'player_marker' || (data && data.id && String(data.id).startsWith('player_'))) {
      // ensure we call placeMarker with proper params
      try {
        const t = data.team || (data.id ? data.id.split('_')[1] : null);
        const idx = data.playerIndex != null ? data.playerIndex : (data.id ? parseInt(String(data.id).split('_').pop()) : 0);
        const nick = data.nick || data.ownerNick || data.playerName || '';
        const nation = data.nation || data.nation || '';
        const regimentFile = data.regimentFile || data.regiment || '';
        // call placeMarker to create local marker (script.js will add to markerList)
        if (typeof window.placeMarker === 'function') {
          try {
            window.placeMarker(nick, nation, regimentFile, t, idx);
            // Try to find newly created entry in markerList
            setTimeout(() => {
              try {
                const ml = window.markerList || [];
                const entry = ml.find(m => m.id === data.id || (m.team === t && m.playerIndex === idx));
                if (entry && entry.marker) {
                  entry.marker._syncId = key;
                  localObjects.set(key, { type:'player_marker', obj: entry.marker, meta: entry });
                  attachMarkerLocalHooks(entry.marker, key);
                  // ensure position matches remote (in case)
                  if (data.latlng && entry.marker.setLatLng) {
                    entry.marker.setLatLng(data.latlng);
                  }
                }
              } catch(e){ warn('post placeMarker attach err', e); }
            }, 150);
          } catch(e){ warn('placeMarker call error', e); }
        } else {
          // fallback: try to create marker directly if Leaflet available
          if (window.L && window.map) {
            const marker = L.marker([data.latlng.lat, data.latlng.lng], { draggable: true }).addTo(window.map);
            marker._syncId = key;
            localObjects.set(key, { type:'player_marker', obj: marker });
            attachMarkerLocalHooks(marker, key);
          }
        }
        return;
      } catch(e){ warn('apply player_marker err', e); }
    }

    if (type === 'custom_symbol' || type === 'simple_symbol') {
      try {
        const latlng = (data.latlng && data.latlng.lat != null) ? data.latlng : (data.lat && data.lat.lng ? data.lat : null);
        if (typeof window.addCustomIcon === 'function' && type === 'custom_symbol') {
          const marker = window.addCustomIcon(data.url, latlng);
          // store sync id after short delay in case script sets marker reference later
          setTimeout(() => {
            try { if (marker) { marker._syncId = key; localObjects.set(key, { type, obj: marker }); attachMarkerLocalHooks(marker, key); } } catch(e){}
          }, 120);
          return;
        }
        if (typeof window.addSimpleSymbol === 'function' && type === 'simple_symbol') {
          const marker = window.addSimpleSymbol(data.simpleType || data.type || data.symbName || '', latlng);
          setTimeout(() => {
            try { if (marker) { marker._syncId = key; localObjects.set(key, { type, obj: marker }); attachMarkerLocalHooks(marker, key); } } catch(e){}
          }, 120);
          return;
        }
        // fallback: create simple marker via Leaflet
        if (window.L && window.map) {
          const marker = L.marker([latlng.lat, latlng.lng], { draggable: true }).addTo(window.map);
          marker._syncId = key;
          localObjects.set(key, { type, obj: marker });
          attachMarkerLocalHooks(marker, key);
          return;
        }
      } catch(e){ warn('apply symbol err', e); }
    }

    if (type === 'drawing') {
      try {
        // data may contain latlngs, type: polyline/polygon/circle
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
          // if using Leaflet.draw, also add to drawnItems if exists
          try { if (window.drawnItems && drawnItems.addLayer) drawnItems.addLayer(layer); } catch(e){}
        }
        return;
      } catch(e){ warn('apply drawing err', e); }
    }

    // fallback: store raw data
    localObjects.set(key, { type: type || 'unknown', obj: data });
  }

  async function applyRemoteEntityChanged(key, val) {
    if (!localObjects.has(key)) {
      // if we don't have it locally, create it
      return applyRemoteEntityCreate(key, val);
    }
    const entry = localObjects.get(key);
    const type = val.type || entry.type;
    const data = val.data || val;

    try {
      if (type === 'player_marker') {
        const marker = entry.obj;
        if (marker && marker.setLatLng && data.latlng) {
          marker.setLatLng([data.latlng.lat, data.latlng.lng]);
        }
        // other updates (nick, nation) are ignored visually here
        return;
      }
      if (type === 'custom_symbol' || type === 'simple_symbol') {
        const marker = entry.obj;
        if (marker && marker.setLatLng && data.latlng) {
          marker.setLatLng([data.latlng.lat, data.latlng.lng]);
        }
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
    } catch(e){ warn('applyRemoteEntityChanged error', e); }
  }

  async function applyRemoteEntityRemoved(key) {
    // remove local object if present
    try {
      if (!localObjects.has(key)) {
        // maybe it was a player marker with stable id in markerList
        // attempt to find markerList entry that has marker._syncId == key
        const ml = window.markerList || [];
        for (let m of ml) {
          try {
            if (m && m.marker && (m.marker._syncId === key || m.id === key)) {
              // remove using script.js removal if available (script handles UI removal)
              if (typeof window.removeMarkerById === 'function') {
                window.removeMarkerById(m.id || key);
              } else {
                // fallback: remove marker from map
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
        // script.js probably manages markerList, so try to remove using provided function
        try { if (typeof window.removeMarkerById === 'function') { window.removeMarkerById(entry.obj._syncId || key); } } catch(e){}
        try { if (obj && obj.remove) obj.remove(); } catch(e){}
      } else {
        if (obj && obj.remove) obj.remove();
        // if drawing present in drawnItems, remove
        try { if (window.drawnItems && drawnItems.removeLayer) drawnItems.removeLayer(obj); } catch(e){}
      }
      localObjects.delete(key);
      log('removed local object', key);
    } catch(e){ warn('applyRemoteEntityRemoved err', e); }
  }

  // ---------- Helpers: attach local hooks to markers for drag/update/delete ----------
  function attachMarkerLocalHooks(marker, syncId) {
    if (!marker || !marker.on) return;
    if (marker._syncHooksAttached) return;
    marker._syncHooksAttached = true;

    marker.on('dragstart', function(){
      marker._isDragging = true;
    });

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
        // guaranteed final flush
        updateEntity(syncId, { latlng: { lat: ll.lat, lng: ll.lng } }).catch(()=>{});
      } catch(e){}
    });

    // For deletion: if marker clicked and script removes it, ensure DB remove is called
    marker.on('contextmenu', function(){ // right-click removal possibility
      try {
        if (confirm('Удалить этот объект?')) {
          removeEntity(syncId).catch(()=>{});
        }
      } catch(e){}
    });
  }

  // ---------- pickLayerOptions fallback ----------
  function pickLayerOptionsObj(opts) {
    if (!opts) return {};
    const r = {};
    if (opts.color) r.color = opts.color;
    if (opts.weight != null) r.weight = opts.weight;
    if (opts.fillColor) r.fillColor = opts.fillColor;
    if (opts.fillOpacity != null) r.fillOpacity = opts.fillOpacity;
    return r;
  }

  // ---------- Integration with script.js: patch functions safely ----------
  function integrateWithScriptJs() {
    // patch placeMarker: when remote creates, we call placeMarker ourselves.
    waitFor(() => typeof window.placeMarker === 'function', () => {
      log('placeMarker available for use');
      // no need to override placeMarker globally here; we only call it when remote entity arrives
    });

    // patch addCustomIcon / addSimpleSymbol presence check
    waitFor(() => typeof window.addCustomIcon === 'function' || typeof window.addSimpleSymbol === 'function', () => {
      log('addCustomIcon/addSimpleSymbol ready');
    });

    // patch loadMapByFile to update mapData in DB after load
    waitFor(() => typeof window.loadMapByFile === 'function', () => {
      const orig = window.loadMapByFile;
      if (orig._syncPatched) return;
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
    });

    // attach map moveend update
    waitFor(() => window.map && typeof window.map.on === 'function', () => {
      if (window.map._syncMoveAttached) return;
      try {
        window.map.on('moveend', () => {
          try {
            if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map.getCenter(), window.map.getZoom());
          } catch(e){}
        });
        window.map._syncMoveAttached = true;
        log('map moveend attached');
      } catch(e){ warn('map move attach err', e); }
    });

    // attach hooks to existing markerList entries when they appear
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

    // attach draw hooks only when map & drawnItems exist
    waitFor(() => window.map && typeof window.map.on === 'function' && window.drawnItems, () => {
      try {
        // If script.js already handles Draw events, we rely on that; remote drawings will be created directly by us
        log('draw support ready');
      } catch(e){}
    });
  }

  // ---------- Panel UI injection (preserve UX) ----------
  function injectRoomPanel() {
    const panel = document.getElementById('room-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="room-panel-inner">
        <div class="room-panel-header"><strong>Комнаты</strong> <button id="room-panel-toggle" aria-label="toggle">▾</button></div>
        <div id="room-panel-body">
          <div id="room-list"></div><hr/>
          <input id="room-name" placeholder="Название"/><input id="room-pass" placeholder="Пароль"/><input id="my-nick" placeholder="Ник"/>
          <button id="btn-create-room">Создать</button>
          <button id="btn-refresh-rooms">Обновить</button>
          <button id="btn-leave-room" style="display:none">Выйти</button>
        </div>
      </div>
    `;
    // safe attach after small delay
    setTimeout(() => {
      const toggle = document.getElementById('room-panel-toggle');
      const panelEl = document.getElementById('room-panel');
      const body = document.getElementById('room-panel-body');
      if (toggle && panelEl && body) {
        // Ensure accessible collapse (toggle class .collapsed and set display)
        toggle.addEventListener('click', () => {
          panelEl.classList.toggle('collapsed');
          if (panelEl.classList.contains('collapsed')) body.style.display = 'none';
          else body.style.display = 'block';
        });
        // initialize state to visible
        body.style.display = panelEl.classList.contains('collapsed') ? 'none' : 'block';
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
              // also set data-room attribute for later updates
              if (el) el.dataset.room = id;
            }).catch(()=>{});
          });
        } catch(e){ warn('refreshRooms err', e); }
      }

      createBtn && (createBtn.onclick = async () => {
        const name = (nameInp && nameInp.value.trim()) || 'Без названия';
        const pass = (passInp && passInp.value) || '';
        const nick = (nickInp && nickInp.value.trim()) || (`Игрок_${Math.random().toString(36).slice(2,6)}`);
        localStorage.setItem('mw2_nick', nick);
        try {
          const r = DB.ref('rooms').push();
          await r.set({ name, password: pass || '', createdAt: now() });
          await joinRoom(r.key, pass, nick);
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
          const p = prompt('Пароль:') || '';
          const nick = (nickInp && nickInp.value.trim()) || localStorage.getItem('mw2_nick') || '';
          try {
            localStorage.setItem('mw2_nick', nick);
            await joinRoom(id, p, nick);
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
    joinRoom: async function(roomId, pass, nick){ return joinRoom(roomId, pass || '', nick || localStorage.getItem('mw2_nick') || 'anon'); },
    leaveRoom: async function(){ return leaveRoom(); },
    setEchelon: function(n){ return setEchelon(n); },
    addEntity: addEntity,
    updateEntity: updateEntity,
    removeEntity: removeEntity,
    updateMapData: updateMapData,
    getCurrentRoom: () => CURRENT_ROOM,
    getCurrentEchelon: () => CURRENT_ECHELON
  };

  // ---------- Boot: inject panel & integrate ----------
  try {
    injectRoomPanel();
    integrateWithScriptJs();
  } catch(e){ warn('boot err', e); }

  // Auto restore last room
  setTimeout(() => {
    try {
      const last = localStorage.getItem('mw2_last_room');
      if (last && confirm('Восстановить последнюю комнату?')) {
        const nick = localStorage.getItem('mw2_nick') || '';
        window.sync.joinRoom(last, '', nick).catch(()=>{});
      }
    } catch(e){}
  }, 900);

  log('firebase-sync.js loaded. clientId=', CLIENT_ID);

})(); // end file
