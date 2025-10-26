// firebase-sync.js
// Final full-file for MoW2 Battle Planner
// Assumes Firebase v8 (firebase-app.js + firebase-database.js) already loaded and initialized in index.html.
// This file integrates with script.js without requiring changes to script.js.
// Stable player IDs: player_{team}_{index}
// Writes only when a room is explicitly joined.

(function(){
  'use strict';

  // ------------ CONFIG/FLAGS ------------
  const DEBUG = false; // set true for verbose logs
  const MIN_UPDATE_MS = 250;   // throttle for frequent updates (drag)
  const FINAL_FLUSH_MS = 120;  // max wait before flush
  const WAIT_INTERVAL_MS = 220; // polling interval while waiting for global objects
  const WAIT_MAX_TRIES = 120;  // how long to wait (120 * 220ms ~ 26s)

  // ------------ UTILITIES ------------
  function log(...args){ if(DEBUG) console.log('[sync]', ...args); }
  function warn(...args){ console.warn('[sync]', ...args); }
  function now(){ return Date.now(); }
  function uid(pref='u'){ return pref + '_' + Math.random().toString(36).slice(2,9); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // ------------ Firebase check ------------
  if (!window.firebase || !window.firebase.database) {
    console.error('firebase-sync.js: Firebase v8 not found. Ensure firebase-app.js and firebase-database.js are included and initialized in index.html.');
    return;
  }
  const DB = window.firebase.database();

  // ------------ Client identity & state ------------
  const CLIENT_ID = localStorage.getItem('mw2_uid') || uid('uid');
  localStorage.setItem('mw2_uid', CLIENT_ID);

  let CURRENT_ROOM = null;
  let CURRENT_ECHELON = (typeof window.currentEchelon !== 'undefined') ? window.currentEchelon : 1;

  // Refs & listeners
  let entitiesRef = null;
  let mapDataRef = null;
  let participantsRef = null;
  const listeners = { added:null, changed:null, removed:null, map:null, participants:null };

  // Local protection maps
  const seenRemote = new Set(); // stores `${key}:${updatedAt}`
  const throttleMap = new Map(); // id -> {timeout, lastSent, pending}

  // ------------ DB PATH HELPERS ------------
  function pathRoom(r){ return `rooms/${encodeURIComponent(r)}`; }
  function pathEntities(r,e){ return `${pathRoom(r)}/echelons/e${e}/entities`; }
  function pathMapData(r){ return `${pathRoom(r)}/mapData`; }
  function pathParticipants(r){ return `${pathRoom(r)}/participants`; }

  // ------------ CORE: listeners management ------------
  function attachListeners(room, echelon){
    detachListeners(); // clean first
    if (!room) return;
    try {
      entitiesRef = DB.ref(pathEntities(room, echelon));
      // child_added
      listeners.added = entitiesRef.on('child_added', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        if (val.clientId === CLIENT_ID) return; // ignore our own writes
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seenRemote.has(marker)) return;
        seenRemote.add(marker);
        const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt || 0 } };
        window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } }));
        log('remote added', entity.id, entity.type);
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
        const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt || 0 } };
        window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } }));
        log('remote changed', entity.id, entity.type);
      });

      // child_removed
      listeners.removed = entitiesRef.on('child_removed', snap => {
        const key = snap.key;
        if (!key) return;
        window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: key } }));
        log('remote removed', key);
      });

      // mapData
      mapDataRef = DB.ref(pathMapData(room));
      listeners.map = mapDataRef.on('value', snap => {
        const md = snap.val();
        if (!md) return;
        // if map changed — ask app to load
        try {
          if (md.currentMapFile && md.currentMapFile !== window.currentMapFile) {
            window.loadMapByFile && window.loadMapByFile(md.currentMapFile);
          }
          if (md.center && typeof md.zoom !== 'undefined' && window.map) {
            window.map.setView(md.center, md.zoom);
          }
        } catch(e){ /* ignore errors from app */ }
        log('mapData received', md && md.currentMapFile);
      });

      // participants count (for UI)
      participantsRef = DB.ref(pathParticipants(room));
      listeners.participants = participantsRef.on('value', snap => {
        const parts = snap.val() || {};
        // Update list UI if present
        try {
          const el = document.querySelector(`#room-list .room-list-item .c[data-room="${room}"]`);
          if (el) el.textContent = Object.keys(parts).length;
        } catch(e){}
      });

      log('listeners attached', room, echelon);
    } catch(err){
      warn('attachListeners err', err);
    }
  }

  function detachListeners(){
    try {
      if (entitiesRef && listeners.added) entitiesRef.off('child_added', listeners.added);
      if (entitiesRef && listeners.changed) entitiesRef.off('child_changed', listeners.changed);
      if (entitiesRef && listeners.removed) entitiesRef.off('child_removed', listeners.removed);
      if (mapDataRef && listeners.map) mapDataRef.off('value', listeners.map);
      if (participantsRef && listeners.participants) participantsRef.off('value', listeners.participants);
    } catch(e){ /* ignore */ }
    entitiesRef = mapDataRef = participantsRef = null;
    listeners.added = listeners.changed = listeners.removed = listeners.map = listeners.participants = null;
    seenRemote.clear();
    throttleMap.forEach(v => { if (v.timeout) clearTimeout(v.timeout); });
    throttleMap.clear();
    log('listeners detached');
  }

  // ------------ CRUD for entities ------------
  async function addEntity(type, data = {}, opts = {}){
    if (!CURRENT_ROOM) throw new Error('addEntity: not joined to a room');
    const payload = { type, data, clientId: CLIENT_ID, updatedAt: now() };
    const base = DB.ref(pathEntities(CURRENT_ROOM, CURRENT_ECHELON));
    if (opts && opts.id) {
      const ref = base.child(opts.id);
      await ref.set(payload);
      seenRemote.add(`${opts.id}:${payload.updatedAt}`);
      log('addEntity stable', opts.id, type);
      return opts.id;
    } else {
      const p = base.push();
      await p.set(payload);
      seenRemote.add(`${p.key}:${payload.updatedAt}`);
      log('addEntity push', p.key, type);
      return p.key;
    }
  }

  function updateEntity(id, partial = {}){
    if (!CURRENT_ROOM) return Promise.reject(new Error('updateEntity: not in a room'));
    if (!id) return Promise.reject(new Error('updateEntity: id required'));
    const key = id;
    const t = throttleMap.get(key) || { timeout: null, lastSent: 0, pending: {} };
    t.pending = Object.assign({}, t.pending || {}, partial);
    throttleMap.set(key, t);

    function sendNow(){
      const payload = {};
      for (const k in t.pending) payload[`data/${k}`] = t.pending[k];
      payload['clientId'] = CLIENT_ID;
      payload['updatedAt'] = now();
      const ref = DB.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${key}`);
      return ref.update(payload).then(()=>{
        t.lastSent = Date.now();
        t.pending = {};
        seenRemote.add(`${key}:${payload.updatedAt}`);
        log('updateEntity sent', key);
      }).catch(err => warn('updateEntity err', err));
    }

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

  function removeEntity(id){
    if (!CURRENT_ROOM) return Promise.reject(new Error('removeEntity: not in a room'));
    if (!id) return Promise.reject(new Error('removeEntity: id required'));
    return DB.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${id}`).remove().then(()=> log('removeEntity', id)).catch(err => warn('removeEntity err', err));
  }

  // ------------ Map data update ------------
  function updateMapData(mapFile, center, zoom){
    if (!CURRENT_ROOM) return Promise.reject(new Error('updateMapData: not in a room'));
    const payload = { currentMapFile: mapFile || null, center: center || null, zoom: zoom || null, updatedAt: now(), clientId: CLIENT_ID };
    return DB.ref(pathMapData(CURRENT_ROOM)).update(payload).then(()=> log('mapData updated', payload.currentMapFile)).catch(e=>warn('mapData update err', e));
  }

  // ------------ Room management ------------
  async function joinRoom(roomId, password = '', nick = ''){
    if (!roomId) throw new Error('joinRoom: roomId required');
    // leave previous
    if (CURRENT_ROOM) await leaveRoom();
    // ensure room exists and check password
    const rref = DB.ref(pathRoom(roomId));
    const snap = await rref.once('value');
    const val = snap.val();
    if (!val) {
      await rref.set({ name: roomId, password: password || '', createdAt: now() });
    } else if (val.password && val.password !== password) {
      throw new Error('Incorrect room password');
    }
    CURRENT_ROOM = roomId;
    // participants registration
    const uid = CLIENT_ID;
    participantsRef = DB.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`);
    await participantsRef.set({ nick: nick || localStorage.getItem('mw2_nick') || `Player_${uid.slice(-4)}`, joinedAt: now() });
    participantsRef.onDisconnect().remove();
    // attach listeners for entities/map
    attachListeners(CURRENT_ROOM, CURRENT_ECHELON);
    // show leave button if exists
    try { const btn = document.getElementById('btn-leave-room'); if (btn) btn.style.display = 'inline-block'; } catch(e){}
    localStorage.setItem('mw2_last_room', CURRENT_ROOM);
    log('joined room', CURRENT_ROOM);
    return true;
  }

  async function leaveRoom(){
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

  function setEchelon(n){
    const p = parseInt(n) || 1;
    if (p === CURRENT_ECHELON) return;
    CURRENT_ECHELON = p;
    if (CURRENT_ROOM) attachListeners(CURRENT_ROOM, CURRENT_ECHELON);
    log('set echelon', CURRENT_ECHELON);
  }

  // ------------ Integration: safe wait helpers ------------
  function waitFor(predicate, onReady, opts = {}){
    const interval = opts.interval || WAIT_INTERVAL_MS;
    const maxTries = opts.maxTries || WAIT_MAX_TRIES;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      try {
        if (predicate()) {
          clearInterval(id);
          try { onReady(); } catch(e){ warn('onReady threw', e); }
        } else if (tries >= maxTries) {
          clearInterval(id);
          // timeout — do nothing
          warn('waitFor: timeout waiting for predicate');
        }
      } catch(e){}
    }, interval);
  }

  // ------------ Integration: patching script.js functions safely ------------
  function integrateWithScript(){
    // placeMarker
    waitFor(() => typeof window.placeMarker === 'function', () => {
      if (window.placeMarker._syncPatched) { log('placeMarker already patched'); return; }
      const orig = window.placeMarker;
      window.placeMarker = function(nick, nation, regimentFile, team, playerIndex){
        const res = orig.apply(this, arguments);
        try {
          const stableId = `player_${team}_${playerIndex}`;
          // try to find marker entry
          const ml = window.markerList || [];
          const entry = ml.find(m => m.id === stableId || (m.team === team && m.playerIndex === playerIndex));
          const latlng = (entry && entry.marker && entry.marker.getLatLng) ? entry.marker.getLatLng() : (window.map ? window.map.getCenter() : {lat:0,lng:0});
          const data = { id: stableId, team, playerIndex, nick, nation, regimentFile, latlng: { lat: latlng.lat, lng: latlng.lng } };
          // add entity with stable id
          addEntity('player_marker', data, { id: stableId }).catch(e => warn('addEntity player_marker err', e));
          // attach drag hooks to marker if available
          if (entry && entry.marker) attachMarkerHooks(entry.marker, stableId);
        } catch(e){ warn('placeMarker patch err', e); }
        return res;
      };
      window.placeMarker._syncPatched = true;
      log('placeMarker patched');
    });

    // addCustomIcon
    waitFor(() => typeof window.addCustomIcon === 'function', () => {
      if (window.addCustomIcon._syncPatched) { log('addCustomIcon already patched'); return; }
      const orig = window.addCustomIcon;
      window.addCustomIcon = function(url, latlng){
        const marker = orig.apply(this, arguments);
        try {
          const pos = (latlng && latlng.lat != null) ? latlng : (marker && marker.getLatLng ? marker.getLatLng() : {lat:0,lng:0});
          const data = { url, latlng: { lat: pos.lat, lng: pos.lng } };
          addEntity('custom_symbol', data).then(key => {
            try { marker._syncId = key; } catch(e){}
            attachMarkerHooks(marker, key);
          }).catch(e => warn('addEntity custom_symbol err', e));
        } catch(e){ warn('addCustomIcon patch err', e); }
        return marker;
      };
      window.addCustomIcon._syncPatched = true;
      log('addCustomIcon patched');
    });

    // addSimpleSymbol
    waitFor(() => typeof window.addSimpleSymbol === 'function', () => {
      if (window.addSimpleSymbol._syncPatched) { log('addSimpleSymbol already patched'); return; }
      const orig = window.addSimpleSymbol;
      window.addSimpleSymbol = function(type, latlng){
        const marker = orig.apply(this, arguments);
        try {
          const pos = (latlng && latlng.lat != null) ? latlng : (marker && marker.getLatLng ? marker.getLatLng() : {lat:0,lng:0});
          const data = { type, latlng: { lat: pos.lat, lng: pos.lng } };
          addEntity('simple_symbol', data).then(key => {
            try { marker._syncId = key; } catch(e){}
            attachMarkerHooks(marker, key);
          }).catch(e => warn('addEntity simple_symbol err', e));
        } catch(e){ warn('addSimpleSymbol patch err', e); }
        return marker;
      };
      window.addSimpleSymbol._syncPatched = true;
      log('addSimpleSymbol patched');
    });

    // Leaflet.Draw events (created/edited/deleted)
    waitFor(() => (window.map && typeof window.map.on === 'function' && window.drawnItems), () => {
      try {
        if (!window.map || !window.drawnItems) { warn('draw patch: map/drawnItems missing'); return; }
        map.on(L.Draw.Event.CREATED, function(e){
          const layer = e.layer;
          try {
            let payload = null;
            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
              payload = { type:'polyline', latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Polygon) {
              const rings = layer.getLatLngs();
              const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
              payload = { type:'polygon', latlngs, options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Circle) {
              payload = { type:'circle', center: layer.getLatLng(), radius: layer.getRadius(), options: pickLayerOptions(layer) };
            }
            if (payload) {
              addEntity('drawing', payload).then(key => { try { layer._syncId = key; } catch(e){} }).catch(e=>warn('add drawing err', e));
            }
          } catch(e){ warn('Draw CREATED handler err', e); }
        });

        map.on(L.Draw.Event.EDITED, function(e){
          e.layers.eachLayer(layer => {
            if (!layer) return;
            const id = layer._syncId;
            if (!id) return;
            try {
              if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
                updateEntity(id, { latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), type:'polyline' });
              } else if (layer instanceof L.Polygon) {
                const rings = layer.getLatLngs();
                const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
                updateEntity(id, { latlngs, type:'polygon' });
              } else if (layer instanceof L.Circle) {
                updateEntity(id, { center: layer.getLatLng(), radius: layer.getRadius(), type:'circle' });
              }
            } catch(e){ warn('Draw EDITED handler err', e); }
          });
        });

        map.on(L.Draw.Event.DELETED, function(e){
          e.layers.eachLayer(layer => {
            if (!layer) return;
            const id = layer._syncId;
            if (id) removeEntity(id).catch(()=>{});
          });
        });

        log('draw events patched');
      } catch(e){ warn('draw patch err', e); }
    });

    // loadMapByFile patch: after successful load update mapDB
    waitFor(() => typeof window.loadMapByFile === 'function', () => {
      const orig = window.loadMapByFile;
      window.loadMapByFile = function(fileName){
        const res = orig.apply(this, arguments);
        try {
          if (res && typeof res.then === 'function') {
            res.then(() => { try { if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map && window.map.getCenter && window.map.getCenter(), window.map && window.map.getZoom && window.map.getZoom()); } catch(e){} });
          } else {
            try { if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map && window.map.getCenter && window.map.getCenter(), window.map && window.map.getZoom && window.map.getZoom()); } catch(e){}
          }
        } catch(e){ warn('loadMapByFile patched err', e); }
        return res;
      };
      window.loadMapByFile._syncPatched = true;
      log('loadMapByFile patched');
    });

    // attach moveend to update mapData (safe)
    waitFor(() => window.map && typeof window.map.on === 'function', () => {
      if (window.map._syncMoveAttached) { log('map moveend already attached'); return; }
      try {
        window.map.on('moveend', () => {
          try {
            if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map.getCenter(), window.map.getZoom());
          } catch(e){}
        });
        window.map._syncMoveAttached = true;
        log('map moveend attached');
      } catch(e){ warn('attach map moveend err', e); }
    });
  } // integrateWithScript

  // ------------ Helper: attach drag hooks for marker-like objects ------------
  function attachMarkerHooks(marker, syncId){
    if (!marker || !marker.on) return;
    if (marker._syncHooksAttached) return;
    marker._syncHooksAttached = true;
    marker.on('dragstart', () => { marker._isDragging = true; });
    marker.on('drag', () => {
      if (!marker._isDragging) return;
      try {
        const ll = marker.getLatLng();
        updateEntity(syncId, { latlng: { lat: ll.lat, lng: ll.lng } }).catch(()=>{});
      } catch(e){}
    });
    marker.on('dragend', () => {
      marker._isDragging = false;
      try {
        const ll = marker.getLatLng();
        updateEntity(syncId, { latlng: { lat: ll.lat, lng: ll.lng } }).catch(()=>{});
      } catch(e){}
    });
    // click to delete (safeguarded)
    marker.on('click', () => {
      try {
        const id = marker._syncId || syncId;
        if (!id) return;
        if (confirm('Удалить этот символ?')) {
          removeEntity(id).catch(()=>{});
        }
      } catch(e){}
    });
  }

  // ------------ Panel injection (keeps UX) ------------
  function injectRoomPanel(){
    const panel = document.getElementById('room-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="room-panel-inner">
        <div class="room-panel-header"><strong>Комнаты</strong> <button id="room-panel-toggle">▾</button></div>
        <div id="room-panel-body">
          <div id="room-list"></div><hr/>
          <input id="room-name" placeholder="Название"/><input id="room-pass" placeholder="Пароль"/><input id="my-nick" placeholder="Ник"/>
          <button id="btn-create-room">Создать</button>
          <button id="btn-refresh-rooms">Обновить</button>
          <button id="btn-leave-room" style="display:none">Выйти</button>
        </div>
      </div>
    `;

    // attach handlers after short delay to allow DOM ready
    setTimeout(()=> {
      const toggle = document.getElementById('room-panel-toggle');
      const panelEl = document.getElementById('room-panel');
      if (toggle && panelEl) {
        toggle.addEventListener('click', () => panelEl.classList.toggle('collapsed'));
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

    }, 140);
  }

  // ------------ Public API on window.sync ------------
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

  // ------------ Boot: inject UI + integrate with script.js ------------
  try {
    injectRoomPanel();
    integrateWithScript();
  } catch(e){
    warn('boot err', e);
  }

  // Auto-restore last room (non-blocking prompt)
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

  // ---------- Utility used from script.js (kept local to avoid globals) ----------
  // pickLayerOptions used when serializing drawings (script.js includes pickLayerOptions but we keep safe fallback)
  function pickLayerOptions(layer) {
    const opts = {};
    if (layer && layer.options) {
      if (layer.options.color) opts.color = layer.options.color;
      if (layer.options.weight != null) opts.weight = layer.options.weight;
      if (layer.options.fillColor) opts.fillColor = layer.options.fillColor;
      if (layer.options.fillOpacity != null) opts.fillOpacity = layer.options.fillOpacity;
    }
    return opts;
  }

})(); // end file
