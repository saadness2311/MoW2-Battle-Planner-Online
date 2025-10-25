// firebase-sync.js — ФИНАЛЬНАЯ ВЕРСИЯ
// Подходит для firebase v8, index.html уже должен вызывать firebase.initializeApp(firebaseConfig).
// Этот файл сохраняет панель комнат (UX неизменён), и реализует событийную, оптимизированную синхронизацию:
// - комнаты / participants / mapData
// - entities per echelon: rooms/{roomId}/echelons/e{n}/entities/{entityId}
// - entity types: player_marker, simple_symbol, custom_symbol, drawing, ... (любые)
// - защита от эхо (clientId), throttle для частых обновлений (drag), консистентность по updatedAt/seq
// - выдает события: remoteEntityAdded, remoteEntityChanged, remoteEntityRemoved (для совместимости с script.js)
// - публичный API: joinRoom, leaveRoom, setEchelon, firebaseAddEntity, firebaseUpdateEntity, firebaseRemoveEntity

/* eslint-disable no-console */

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

// ----------------- State & constants -----------------
const SYNC_MODULE = (function(){
  // client unique id to avoid processing our own events
  const clientId = `c_${Date.now().toString(36)}_${Math.floor(Math.random()*1e6).toString(36)}`;
  let roomId = null;
  let currentEchelon = 1;
  const defaultEchelonCount = 3;

  // firebase refs
  let db = null;
  let roomRef = null;
  let entitiesRef = null;
  let mapDataRef = null;
  let participantsRef = null;

  // listeners stored to detach later
  let listeners = { added: null, changed: null, removed: null, mapData: null };

  // local caches & queues
  const processedMarkers = new Set(); // markers of applied remote updates: key = `${entityKey}:${updatedAt}`
  const pendingUpdates = new Map(); // id -> { timer, payload, lastSentAt }
  let localSeq = 0;

  // throttle params for frequent updates (drag)
  const THROTTLE_MS = 250; // send updates at most every 250ms per entity
  const FINAL_FLUSH_DELAY = 80; // ensure final update is flushed shortly after last call

  // helpers
  function now(){ return Date.now(); }
  function getDb(){
    if (!db){
      if (!window.firebase || !window.firebase.database) throw new Error('Firebase not found — ensure firebase scripts loaded and initialized in index.html');
      db = window.firebase.database();
    }
    return db;
  }

  function entitiesPath(rId, echelon){
    return `rooms/${encodeURIComponent(rId)}/echelons/e${echelon}/entities`;
  }
  function mapDataPath(rId){ return `rooms/${encodeURIComponent(rId)}/mapData`; }
  function participantsPath(rId){ return `rooms/${encodeURIComponent(rId)}/participants`; }

  // ----------------- CRUD API -----------------
  // Add entity. opts: { id: optional stable id (string), applyLocally: boolean (default true) }
  async function firebaseAddEntity(type, data, opts = {}){
    if(!roomId) throw new Error('Not in a room. Call joinRoom(roomId, nick) first.');
    const db = getDb();
    const baseRef = db.ref(entitiesPath(roomId, currentEchelon));

    const payload = {
      type,
      data: data || {},
      clientId,
      seq: ++localSeq,
      updatedAt: now()
    };

    if (opts.id){
      const key = String(opts.id);
      await baseRef.child(key).set(payload);
      // mark as processed so we won't reapply our own child_added
      processedMarkers.add(`${key}:${payload.updatedAt}`);
      return { key, ref: baseRef.child(key) };
    } else {
      const pushRef = baseRef.push();
      await pushRef.set(payload);
      processedMarkers.add(`${pushRef.key}:${payload.updatedAt}`);
      return { key: pushRef.key, ref: pushRef };
    }
  }

  // Partial update with throttling per entity id (merging into /data/)
  function firebaseUpdateEntity(id, partialData){
    if(!roomId) return Promise.reject(new Error('Not in a room.'));
    if(!id) return Promise.reject(new Error('id required'));
    const key = String(id);

    const entry = pendingUpdates.get(key) || { payload: {}, timer: null, lastSentAt: 0 };
    // merge partialData into payload.data (shallow)
    entry.payload = Object.assign({}, entry.payload, partialData);

    const sendNowIfAllowed = () => {
      const since = now() - (entry.lastSentAt || 0);
      if (since >= THROTTLE_MS){
        // send
        const payloadToSend = {
          data: entry.payload,
          clientId,
          seq: ++localSeq,
          updatedAt: now()
        };
        // Build update object that patches /data/<k>
        const updates = {};
        for(const k in payloadToSend.data){
          updates[`data/${k}`] = payloadToSend.data[k];
        }
        updates['clientId'] = payloadToSend.clientId;
        updates['seq'] = payloadToSend.seq;
        updates['updatedAt'] = payloadToSend.updatedAt;

        const ref = getDb().ref(entitiesPath(roomId, currentEchelon) + `/${key}`);
        ref.update(updates).catch(err => console.warn('firebaseUpdateEntity update error', err));

        entry.lastSentAt = Date.now();
        entry.payload = {};
        if(entry.timer){ clearTimeout(entry.timer); entry.timer = null; }
        pendingUpdates.set(key, entry);
      } else {
        // schedule flush for final
        if(entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          sendNowIfAllowed();
        }, Math.max(THROTTLE_MS - since, FINAL_FLUSH_DELAY));
        pendingUpdates.set(key, entry);
      }
    };

    // immediate attempt
    sendNowIfAllowed();
    return Promise.resolve();
  }

  function firebaseRemoveEntity(id){
    if(!roomId) return Promise.reject(new Error('Not in a room.'));
    if(!id) return Promise.reject(new Error('id required'));
    const ref = getDb().ref(entitiesPath(roomId, currentEchelon) + `/${id}`);
    return ref.remove().catch(err => console.warn('firebaseRemoveEntity error', err));
  }

  // ----------------- Listeners / incoming processing -----------------
  function attachEntityListeners(){
    if(!roomId) return;
    const db = getDb();
    entitiesRef = db.ref(entitiesPath(roomId, currentEchelon));
    // detach existing if any
    detachEntityListeners();

    listeners.added = entitiesRef.on('child_added', snap => {
      const key = snap.key; const val = snap.val();
      if (!val) return;
      // ignore our own writes
      if (val.clientId === clientId) return;
      // dedupe by key+updatedAt
      const marker = `${key}:${val.updatedAt || ''}`;
      if (processedMarkers.has(marker)) return;
      processedMarkers.add(marker);
      const entity = { id: key, type: val.type, data: val.data, meta: { clientId: val.clientId, seq: val.seq, updatedAt: val.updatedAt } };
      window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } }));
    });

    listeners.changed = entitiesRef.on('child_changed', snap => {
      const key = snap.key; const val = snap.val();
      if (!val) return;
      if (val.clientId === clientId) return;
      const marker = `${key}:${val.updatedAt || ''}`;
      if (processedMarkers.has(marker)) return;
      processedMarkers.add(marker);
      const entity = { id: key, type: val.type, data: val.data, meta: { clientId: val.clientId, seq: val.seq, updatedAt: val.updatedAt } };
      window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } }));
    });

    listeners.removed = entitiesRef.on('child_removed', snap => {
      const key = snap.key;
      if (!key) return;
      window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: key } }));
    });
  }

  function detachEntityListeners(){
    try{
      if(entitiesRef){
        if(listeners.added) entitiesRef.off('child_added', listeners.added);
        if(listeners.changed) entitiesRef.off('child_changed', listeners.changed);
        if(listeners.removed) entitiesRef.off('child_removed', listeners.removed);
      }
    }catch(e){ /* ignore */ }
    listeners.added = listeners.changed = listeners.removed = null;
  }

  // MapData listener
  function attachMapDataListener(){
    if(!roomId) return;
    const db = getDb();
    mapDataRef = db.ref(mapDataPath(roomId));
    if(listeners.mapData) {
      try { mapDataRef.off('value', listeners.mapData); } catch(e){}
      listeners.mapData = null;
    }
    listeners.mapData = mapDataRef.on('value', snap => {
      const data = snap.val();
      if(!data) return;
      // ignore trivial echoes: if mapData.clientId === our clientId we may still want to apply (e.g., map switched by us)
      // We'll apply only when updatedAt is newer than last known (we store lastMapUpdatedAt on window)
      const lastKnown = window._sync_lastMapUpdatedAt || 0;
      if (data.updatedAt && data.updatedAt <= lastKnown) return;
      window._sync_lastMapUpdatedAt = data.updatedAt || now();

      // Apply map changes if different
      try {
        // loadMapByFile is defined in script.js to load image overlay. Use it if present.
        if (data.currentMapFile && typeof loadMapByFile === 'function' && data.currentMapFile !== window.currentMapFile) {
          loadMapByFile(data.currentMapFile).catch(()=>{});
        }
        if (data.center && typeof map !== 'undefined' && map && typeof map.setView === 'function') {
          map.setView(data.center, data.zoom || map.getZoom());
        }
        if (typeof data.currentEchelon !== 'undefined') {
          // switch local echelon if needed
          try {
            if (typeof setEchelon === 'function') setEchelon(data.currentEchelon);
            else window.currentEchelon = data.currentEchelon;
          } catch(e){}
        }
      } catch(e){ console.warn('apply mapData error', e); }
    });
  }

  function detachMapDataListener(){
    try{ if(mapDataRef && listeners.mapData) mapDataRef.off('value', listeners.mapData); } catch(e){}
    listeners.mapData = null;
  }

  // ----------------- Room control -----------------
  async function joinRoom(id, pass = '', nick = '') {
    if(!id) throw new Error('joinRoom requires id');
    // initialize db
    getDb();
    roomId = String(id);
    currentEchelon = Number(window.currentEchelon || 1);
    roomRef = db.ref(`rooms/${roomId}`);

    // check password if exists
    try {
      const snap = await roomRef.once('value');
      const room = snap.val() || {};
      if (room.password && room.password !== pass) throw new Error('Invalid password');
    } catch(e){
      throw e;
    }

    // add participant
    const myUid = localStorage.getItem('mw2_uid') || `uid_${Math.random().toString(36).slice(2,9)}`;
    localStorage.setItem('mw2_uid', myUid);
    if (!nick) nick = localStorage.getItem('mw2_nick') || '';
    if (nick) localStorage.setItem('mw2_nick', nick);

    participantsRef = db.ref(participantsPath(roomId));
    await participantsRef.child(myUid).set({ nick: nick || 'Player', joinedAt: now() });
    participantsRef.child(myUid).onDisconnect().remove();

    // attach listeners
    attachEntityListeners();
    attachMapDataListener();

    // Also, attach participant list updates (optional)
    db.ref(participantsPath(roomId)).on('value', s => {
      // keep UI participants count if needed (panel uses a once fetch on refresh)
    });

    console.log(`[sync] joined room ${roomId} as ${nick} (${myUid}), clientId=${clientId}`);
    // publish event
    window.dispatchEvent(new CustomEvent('sync:joined', { detail: { roomId, nick, myUid } }));
    return { roomId };
  }

  async function leaveRoom(){
    // detach listeners
    detachEntityListeners();
    detachMapDataListener();
    // remove participant entry
    try {
      const myUid = localStorage.getItem('mw2_uid');
      if (roomId && myUid) {
        const pRef = getDb().ref(participantsPath(roomId) + `/${myUid}`);
        await pRef.remove();
      }
    } catch(e){}
    // clear caches and refs
    processedMarkers.clear();
    for(const [k, v] of pendingUpdates.entries()){
      if(v.timer) clearTimeout(v.timer);
    }
    pendingUpdates.clear();

    roomId = null;
    roomRef = null;
    mapDataRef = null;
    entitiesRef = null;
    participantsRef = null;
    window.dispatchEvent(new CustomEvent('sync:left', {}));
    console.log('[sync] left room');
  }

  function setEchelon(n){
    const num = Number(n) || 1;
    if (num === currentEchelon) return;
    // detach old entity listeners and attach for new echelon
    detachEntityListeners();
    currentEchelon = num;
    if (roomId) attachEntityListeners();
    window.currentEchelon = currentEchelon;
    window.dispatchEvent(new CustomEvent('sync:echelonChanged', { detail: { echelon: currentEchelon } }));
  }

  // publish mapData (atomic set)
  function publishMapData(obj){
    if(!roomId) return Promise.reject(new Error('Not in a room.'));
    const payload = Object.assign({}, obj, { clientId, seq: ++localSeq, updatedAt: now() });
    return getDb().ref(mapDataPath(roomId)).set(payload).catch(e => console.warn('publishMapData error', e));
  }

  // ----------------- Integration helpers (attach to UI and common functions) -----------------
  // Keep the room panel HTML exactly as provided previously (UX preserved)
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

  function initRoomPanel(){
    // Insert panel HTML into #room-panel if exists
    try {
      const panel = document.getElementById('room-panel');
      if (!panel) return;
      panel.innerHTML = ROOM_PANEL_HTML;

      const list = document.getElementById('room-list');
      const createBtn = document.getElementById('btn-create-room');
      const refreshBtn = document.getElementById('btn-refresh-rooms');
      const leaveBtn = document.getElementById('btn-leave-room');
      const nameInp = document.getElementById('room-name');
      const passInp = document.getElementById('room-pass');
      const nickInp = document.getElementById('my-nick');
      const toggle = document.getElementById('room-panel-toggle');

      toggle.onclick = () => panel.classList.toggle('collapsed');

      const myUid = localStorage.getItem('mw2_uid') || 'uid_' + Math.random().toString(36).slice(2,9);
      localStorage.setItem('mw2_uid', myUid);
      let nick = localStorage.getItem('mw2_nick') || '';
      if (nickInp) nickInp.value = nick;

      createBtn.onclick = async () => {
        const name = (nameInp.value || 'Без названия').trim();
        const pass = passInp.value || '';
        const n = (nickInp.value || ('Игрок_' + Math.random().toString(36).slice(2,5))).trim();
        localStorage.setItem('mw2_nick', n);
        // create room node
        const ref = getDb().ref('rooms').push();
        await ref.set({ name, password: pass || '', createdAt: now() });
        // join
        try { await joinRoom(ref.key, pass, n); } catch(e){ alert(e.message || e); }
        if (leaveBtn) leaveBtn.style.display = 'inline-block';
      };

      async function joinHandler(id){
        const p = prompt('Пароль:') || '';
        try {
          await joinRoom(id, p, nickInp.value);
          if (leaveBtn) leaveBtn.style.display = 'inline-block';
        } catch(e){
          alert(e.message || 'Ошибка входа в комнату');
        }
      }

      list.onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('join')) {
          joinHandler(id);
        } else if (btn.classList.contains('del')) {
          if (confirm('Удалить?')) getDb().ref(`rooms/${id}`).remove();
        }
      };

      leaveBtn.onclick = async () => {
        try {
          const myUid = localStorage.getItem('mw2_uid');
          if (CURRENT_ROOM_ID) {
            await leaveRoom();
            // hide
            leaveBtn.style.display = 'none';
          } else {
            await leaveRoom();
            leaveBtn.style.display = 'none';
          }
        } catch(e){}
      };

      refreshBtn.onclick = async () => {
        const snap = await getDb().ref('rooms').once('value');
        const rooms = snap.val() || {};
        list.innerHTML = '';
        Object.entries(rooms).forEach(([id, r]) => {
          const div = document.createElement('div');
          div.innerHTML = `<div>${r.name}</div><div>Участников: <span class="c">?</span></div>
            <button class="join" data-id="${id}">Войти</button>
            <button class="del" data-id="${id}">×</button>`;
          list.appendChild(div);
          getDb().ref(`rooms/${id}/participants`).once('value').then(s => { const el = div.querySelector('.c'); if(el) el.textContent = s.numChildren(); });
        });
      };

      // initial refresh
      setTimeout(() => { refreshBtn.click(); }, 200);
    } catch(e){
      console.warn('initRoomPanel error', e);
    }
  }

  // ----------------- Auto hooks for common script.js functions (best-effort) -----------------
  // These integrations are non-invasive: if the host page defines placeMarker, addCustomIcon, addSimpleSymbol,
  // or uses Leaflet Draw events, we try to attach hooks to emit updates to Firebase automatically.
  function initIntegrationHooks(){
    // patch placeMarker: when called, create stable id and push to db
    try {
      if (typeof window.placeMarker === 'function') {
        const orig = window.placeMarker;
        window.placeMarker = function(nick, nation, regimentFile, team, playerIndex){
          orig.apply(this, arguments);
          // stable id for players: player_{team}_{index}
          const stableId = `player_${team}_${playerIndex}`;
          // try to find marker in global markerList (script.js uses markerList)
          try {
            const ml = window.markerList || [];
            const found = ml.find(m => m.id === stableId || (m.team === team && m.playerIndex === playerIndex));
            const latlng = (found && found.marker && found.marker.getLatLng) ? found.marker.getLatLng() : (map ? map.getCenter() : {lat:0,lng:0});
            const data = {
              id: stableId,
              team,
              playerIndex,
              nick,
              nation,
              regimentFile,
              latlng: { lat: latlng.lat, lng: latlng.lng }
            };
            firebaseAddEntity('player_marker', data, { id: stableId }).catch(()=>{});
            // attach drag hooks if marker exists
            if (found && found.marker && found.marker.on) attachMarkerDragHooks(found.marker, stableId);
          } catch(e){ console.warn('integration placeMarker error', e); }
        };
      }
    } catch(e){ /* ignore */ }

    // patch addCustomIcon
    try {
      if (typeof window.addCustomIcon === 'function') {
        const orig = window.addCustomIcon;
        window.addCustomIcon = function(url, latlng){
          const marker = orig.apply(this, arguments);
          try {
            const data = { url, latlng: latlng && latlng.lat ? {lat: latlng.lat, lng: latlng.lng} : latlng };
            firebaseAddEntity('custom_symbol', data).then(res => {
              try { marker._syncId = res.key; } catch(e){}
            }).catch(()=>{});
            if (marker && marker.on) {
              marker.on('dragend', () => {
                const id = marker._syncId;
                if (id) firebaseUpdateEntity(id, { latlng: marker.getLatLng() }).catch(()=>{});
              });
              marker.on('move', () => {
                const id = marker._syncId;
                if (id) firebaseUpdateEntity(id, { latlng: marker.getLatLng() }).catch(()=>{});
              });
            }
          } catch(e){ console.warn('integration addCustomIcon error', e); }
          return marker;
        };
      }
    } catch(e){ /* ignore */ }

    // patch addSimpleSymbol
    try {
      if (typeof window.addSimpleSymbol === 'function') {
        const orig = window.addSimpleSymbol;
        window.addSimpleSymbol = function(type, latlng){
          const marker = orig.apply(this, arguments);
          try {
            const data = { type, latlng: latlng && latlng.lat ? {lat: latlng.lat, lng: latlng.lng} : latlng };
            firebaseAddEntity('simple_symbol', data).then(res => {
              try { marker._syncId = res.key; } catch(e){}
            }).catch(()=>{});
            if (marker && marker.on) {
              marker.on('dragend', () => {
                const id = marker._syncId;
                if (id) firebaseUpdateEntity(id, { latlng: marker.getLatLng() }).catch(()=>{});
              });
              marker.on('move', () => {
                const id = marker._syncId;
                if (id) firebaseUpdateEntity(id, { latlng: marker.getLatLng() }).catch(()=>{});
              });
            }
          } catch(e){ console.warn('integration addSimpleSymbol error', e); }
          return marker;
        };
      }
    } catch(e){ /* ignore */ }

    // Leaflet Draw hooks — created/edited/deleted
    try {
      if (typeof map !== 'undefined') {
        map.on && map.on(L.Draw.Event.CREATED, function(e){
          const layer = e.layer;
          // serialize
          try {
            let payload = null;
            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
              payload = { type: 'polyline', latlngs: layer.getLatLngs().map(p => ({lat:p.lat,lng:p.lng})), options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Polygon) {
              const rings = layer.getLatLngs();
              const latlngs = Array.isArray(rings[0]) ? rings[0].map(p => ({lat:p.lat,lng:p.lng})) : rings.map(p => ({lat:p.lat,lng:p.lng}));
              payload = { type: 'polygon', latlngs, options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Circle) {
              payload = { type: 'circle', center: layer.getLatLng(), radius: layer.getRadius(), options: pickLayerOptions(layer) };
            }
            if (payload) {
              firebaseAddEntity('drawing', payload).then(res => { try{ layer._syncId = res.key; }catch(e){} }).catch(()=>{});
            }
          } catch(e){ console.warn('draw created integration error', e); }
        });

        map.on && map.on(L.Draw.Event.EDITED, function(e){
          const layers = e.layers;
          layers.eachLayer(layer => {
            try {
              const id = layer._syncId;
              if (!id) return;
              let payload = null;
              if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) payload = { latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})) , type: 'polyline' };
              else if (layer instanceof L.Polygon) {
                const rings = layer.getLatLngs();
                const latlngs = Array.isArray(rings[0]) ? rings[0].map(p => ({lat:p.lat,lng:p.lng})) : rings.map(p => ({lat:p.lat,lng:p.lng}));
                payload = { latlngs, type: 'polygon' };
              } else if (layer instanceof L.Circle) payload = { center: layer.getLatLng(), radius: layer.getRadius(), type: 'circle' };
              if (payload) firebaseUpdateEntity(id, payload).catch(()=>{});
            } catch(e){ console.warn('draw edited integration error', e); }
          });
        });

        map.on && map.on(L.Draw.Event.DELETED, function(e){
          const layers = e.layers;
          layers.eachLayer(layer => {
            const id = layer._syncId;
            if (id) firebaseRemoveEntity(id).catch(()=>{});
          });
        });
      }
    } catch(e){ /* ignore */ }

    // attach drag hooks for markers existing in markerList
    function attachMarkerQueueWatcher(){
      if (!window.markerList || !Array.isArray(window.markerList)) return;
      for(const entry of window.markerList){
        try {
          const marker = entry.marker;
          const stableId = entry.id || `player_${entry.team}_${entry.playerIndex}`;
          if (!marker || !marker.on || marker._syncHooksAttached) continue;
          attachMarkerDragHooks(marker, stableId);
          marker._syncHooksAttached = true;
        } catch(e){ /* ignore */ }
      }
    }
    // try periodically for a short time to attach hooks to markers created later
    let tries = 0;
    const watcher = setInterval(() => {
      try{ attachMarkerQueueWatcher(); }catch(e){}
      tries++;
      if (tries > 60) clearInterval(watcher); // stop after ~24s
    }, 400);
  }

  function attachMarkerDragHooks(marker, stableId){
    if (!marker || !marker.on) return;
    marker.on('dragstart', () => { marker._isDragging = true; });
    marker.on('dragend', () => {
      marker._isDragging = false;
      try {
        const latlng = marker.getLatLng();
        firebaseUpdateEntity(stableId, { latlng: { lat: latlng.lat, lng: latlng.lng } }).catch(()=>{});
      } catch(e){}
    });
   
