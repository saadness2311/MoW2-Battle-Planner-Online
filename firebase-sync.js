// firebase-sync.js
// Final working version integrated with your script.js
// Uses Firebase v8 (already loaded and initialized in index.html).
// Stable player IDs: player_{team}_{index} as requested.

(function(){
  // --- Basic checks & helpers ---
  if (!window.firebase || !window.firebase.database) {
    console.error('firebase-sync.js: Firebase v8 not detected. Ensure firebase-app.js and firebase-database.js are loaded in index.html.');
    return;
  }
  const db = window.firebase.database();

  function now(){ return Date.now(); }
  function uid(prefix='u'){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // --- Client identity ---
  const CLIENT_ID = localStorage.getItem('mw2_uid') || uid('uid');
  localStorage.setItem('mw2_uid', CLIENT_ID);

  // --- Room/Echelon state ---
  let CURRENT_ROOM = null;
  let CURRENT_ECHELON = (typeof window.currentEchelon !== 'undefined') ? window.currentEchelon : 1;

  // --- Firebase refs and listeners ---
  let entitiesRef = null;
  let mapDataRef = null;
  let participantsRef = null;
  const listeners = { child_added:null, child_changed:null, child_removed:null, map:null, participants:null };

  // --- Local bookkeeping to avoid echoing our own writes ---
  const seen = new Set(); // stores `${key}:${updatedAt}` to avoid re-processing own or already processed updates

  // --- Throttle map for frequent updates (drag) ---
  const throttleMap = new Map(); // id -> { timeout, lastSent, pending }

  const MIN_UPDATE_MS = 250;
  const FINAL_FLUSH_MS = 120;

  // --- DB path helpers ---
  function pathRoom(r){ return `rooms/${encodeURIComponent(r)}`; }
  function pathEntities(r,e){ return `${pathRoom(r)}/echelons/e${e}/entities`; }
  function pathMapData(r){ return `${pathRoom(r)}/mapData`; }
  function pathParticipants(r){ return `${pathRoom(r)}/participants`; }

  // --- Attach/detach entity listeners ---
  function attachListeners(room, echelon){
    detachListeners(); // ensure clean start
    if (!room) return;
    try {
      entitiesRef = db.ref(pathEntities(room, echelon));
      listeners.child_added = entitiesRef.on('child_added', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        // ignore our own writes
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seen.has(marker)) return;
        seen.add(marker);
        const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt } };
        window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } }));
      });

      listeners.child_changed = entitiesRef.on('child_changed', snap => {
        const key = snap.key;
        const val = snap.val();
        if (!val) return;
        if (val.clientId === CLIENT_ID) return;
        const marker = `${key}:${val.updatedAt || 0}`;
        if (seen.has(marker)) return;
        seen.add(marker);
        const entity = { id: key, type: val.type, data: val.data || val, meta: { clientId: val.clientId, updatedAt: val.updatedAt } };
        window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } }));
      });

      listeners.child_removed = entitiesRef.on('child_removed', snap => {
        const key = snap.key;
        if (!key) return;
        window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: key } }));
      });

      // mapData listener
      mapDataRef = db.ref(pathMapData(room));
      listeners.map = mapDataRef.on('value', snap => {
        const md = snap.val();
        if(!md) return;
        // Only load map if file changed
        if (md.currentMapFile && md.currentMapFile !== window.currentMapFile) {
          try { window.loadMapByFile && window.loadMapByFile(md.currentMapFile); } catch(e){ console.warn('map load rm err', e); }
        }
        // center/zoom
        if (md.center && typeof md.zoom !== 'undefined' && window.map) {
          try { window.map.setView(md.center, md.zoom); } catch(e){/*ignore*/ }
        }
      });

      // participants (update counts in UI)
      participantsRef = db.ref(pathParticipants(room));
      listeners.participants = participantsRef.on('value', snap => {
        const parts = snap.val() || {};
        // update UI counts for room list items if present
        try {
          const els = document.querySelectorAll(`#room-list .room-list-item`);
          els.forEach(el => {
            const btn = el.querySelector('button.join');
            if (!btn) return;
            const id = btn.dataset.id;
            if (id === room) {
              const span = el.querySelector('.c');
              if (span) span.textContent = Object.keys(parts).length;
            }
          });
        } catch(e){}
      });

    } catch(e){ console.error('attachListeners err', e); }
  }

  function detachListeners(){
    try {
      if (entitiesRef && listeners.child_added) entitiesRef.off('child_added', listeners.child_added);
      if (entitiesRef && listeners.child_changed) entitiesRef.off('child_changed', listeners.child_changed);
      if (entitiesRef && listeners.child_removed) entitiesRef.off('child_removed', listeners.child_removed);
      if (mapDataRef && listeners.map) mapDataRef.off('value', listeners.map);
      if (participantsRef && listeners.participants) participantsRef.off('value', listeners.participants);
    } catch(e){}
    entitiesRef = mapDataRef = participantsRef = null;
    listeners.child_added = listeners.child_changed = listeners.child_removed = listeners.map = listeners.participants = null;
    seen.clear();
    throttleMap.forEach(v => v.timeout && clearTimeout(v.timeout));
    throttleMap.clear();
  }

  // --- Room management ---
  async function joinRoom(roomId, password = '', nick = '') {
    if (!roomId) throw new Error('joinRoom: roomId required');
    // leave old room cleanly
    if (CURRENT_ROOM) await leaveRoom();

    // ensure room exists and password OK
    const roomRef = db.ref(pathRoom(roomId));
    const snap = await roomRef.once('value');
    const val = snap.val();
    if (!val) {
      await roomRef.set({ name: roomId, password: password || '', createdAt: now() });
    } else if (val.password && val.password !== password) {
      throw new Error('Incorrect room password');
    }

    CURRENT_ROOM = roomId;
    // participants
    const uid = CLIENT_ID;
    const pRef = db.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`);
    await pRef.set({ nick: nick || localStorage.getItem('mw2_nick') || `Player_${uid.slice(-4)}`, joinedAt: now() });
    pRef.onDisconnect().remove();

    // Attach entity & map listeners for current echelon
    attachListeners(CURRENT_ROOM, CURRENT_ECHELON);

    // UI: show leave
    const leaveBtn = document.getElementById('btn-leave-room');
    if (leaveBtn) leaveBtn.style.display = 'inline-block';

    console.log('[sync] joined', CURRENT_ROOM);
    return true;
  }

  async function leaveRoom() {
    if (!CURRENT_ROOM) return;
    try {
      const uid = CLIENT_ID;
      await db.ref(`${pathRoom(CURRENT_ROOM)}/participants/${uid}`).remove();
    } catch(e){}
    detachListeners();
    CURRENT_ROOM = null;
    const leaveBtn = document.getElementById('btn-leave-room');
    if (leaveBtn) leaveBtn.style.display = 'none';
    console.log('[sync] left room');
  }

  function setEchelon(n) {
    const parsed = parseInt(n) || 1;
    if (parsed === CURRENT_ECHELON) return;
    CURRENT_ECHELON = parsed;
    // reattach entity listeners to new path
    if (CURRENT_ROOM) attachListeners(CURRENT_ROOM, CURRENT_ECHELON);
    console.log('[sync] switched to echelon', CURRENT_ECHELON);
  }

  // --- Entities CRUD (stable IDs for players) ---
  async function addEntity(type, data = {}, opts = {}) {
    if (!CURRENT_ROOM) throw new Error('addEntity: not in a room');
    const payload = { type, data, clientId: CLIENT_ID, updatedAt: now() };
    const base = db.ref(pathEntities(CURRENT_ROOM, CURRENT_ECHELON));
    if (opts && opts.id) {
      const ref = base.child(opts.id);
      await ref.set(payload);
      seen.add(`${opts.id}:${payload.updatedAt}`);
      return opts.id;
    } else {
      const p = base.push();
      await p.set(payload);
      seen.add(`${p.key}:${payload.updatedAt}`);
      return p.key;
    }
  }

  function updateEntity(id, partialData = {}) {
    if (!CURRENT_ROOM) return Promise.reject(new Error('updateEntity: not in a room'));
    if (!id) return Promise.reject(new Error('updateEntity: id required'));

    const key = id;
    const throttle = throttleMap.get(key) || { timeout: null, lastSent: 0, pending: {} };
    throttle.pending = Object.assign({}, throttle.pending || {}, partialData);
    throttleMap.set(key, throttle);

    function doSend() {
      const payload = {};
      for (const k in throttle.pending) {
        payload[`data/${k}`] = throttle.pending[k];
      }
      payload['clientId'] = CLIENT_ID;
      payload['updatedAt'] = now();
      const ref = db.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${key}`);
      return ref.update(payload).then(() => {
        throttle.lastSent = Date.now();
        throttle.pending = {};
        seen.add(`${key}:${payload.updatedAt}`);
      }).catch(e => console.warn('updateEntity err', e));
    }

    const since = Date.now() - (throttle.lastSent || 0);
    if (since >= MIN_UPDATE_MS) {
      if (throttle.timeout) { clearTimeout(throttle.timeout); throttle.timeout = null; }
      return doSend();
    } else {
      if (throttle.timeout) clearTimeout(throttle.timeout);
      throttle.timeout = setTimeout(() => { doSend(); }, Math.max(MIN_UPDATE_MS - since, FINAL_FLUSH_MS));
      throttleMap.set(key, throttle);
      return Promise.resolve();
    }
  }

  function removeEntity(id) {
    if (!CURRENT_ROOM) return Promise.reject(new Error('removeEntity: not in a room'));
    if (!id) return Promise.reject(new Error('removeEntity: id required'));
    return db.ref(`${pathEntities(CURRENT_ROOM, CURRENT_ECHELON)}/${id}`).remove();
  }

  // --- Map data update (called when map changes or loaded) ---
  function updateMapData(mapFile, center, zoom) {
    if (!CURRENT_ROOM) return Promise.reject(new Error('updateMapData: not in a room'));
    const payload = { currentMapFile: mapFile || null, center: center || null, zoom: zoom || null, updatedAt: now(), clientId: CLIENT_ID };
    return db.ref(pathMapData(CURRENT_ROOM)).update(payload);
  }

  // --- Integration with script.js (patch functions) ---
  function integrate() {
    // Wait for script.js to be available
    const tryAttach = () => {
      // patch placeMarker
      if (typeof window.placeMarker === 'function') {
        const orig = window.placeMarker;
        window.placeMarker = function(nick, nation, regimentFile, team, playerIndex) {
          const res = orig.apply(this, arguments);
          try {
            const stableId = `player_${team}_${playerIndex}`;
            // Try find marker in markerList
            const ml = window.markerList || [];
            const entry = ml.find(m => m.id === stableId || (m.team === team && m.playerIndex === playerIndex));
            const latlng = (entry && entry.marker && entry.marker.getLatLng) ? entry.marker.getLatLng() : (window.map ? window.map.getCenter() : {lat:0,lng:0});
            const data = { id: stableId, team, playerIndex, nick, nation, regimentFile, latlng: { lat: latlng.lat, lng: latlng.lng } };
            // Add to DB with stable id
            addEntity('player_marker', data, { id: stableId }).catch(e => console.warn('addEntity(player_marker) err', e));
            // Attach drag hooks
            if (entry && entry.marker) attachMarkerHooks(entry.marker, stableId);
          } catch(e){ console.warn('placeMarker patch err', e); }
          return res;
        };
      }

      // patch addCustomIcon
      if (typeof window.addCustomIcon === 'function') {
        const orig = window.addCustomIcon;
        window.addCustomIcon = function(url, latlng) {
          const marker = orig.apply(this, arguments);
          try {
            const pos = (latlng && latlng.lat!=null) ? latlng : (marker && marker.getLatLng ? marker.getLatLng() : {lat:0,lng:0});
            const data = { url, latlng: { lat: pos.lat, lng: pos.lng } };
            addEntity('custom_symbol', data).then(key => {
              try { marker._syncId = key; } catch(e){}
              attachMarkerHooks(marker, key);
            }).catch(e => console.warn('add custom_symbol err', e));
          } catch(e){ console.warn('addCustomIcon patch err', e); }
          return marker;
        };
      }

      // patch addSimpleSymbol
      if (typeof window.addSimpleSymbol === 'function') {
        const orig = window.addSimpleSymbol;
        window.addSimpleSymbol = function(type, latlng) {
          const marker = orig.apply(this, arguments);
          try {
            const pos = (latlng && latlng.lat!=null) ? latlng : (marker && marker.getLatLng ? marker.getLatLng() : {lat:0,lng:0});
            const data = { type, latlng: { lat: pos.lat, lng: pos.lng } };
            addEntity('simple_symbol', data).then(key => {
              try { marker._syncId = key; } catch(e){}
              attachMarkerHooks(marker, key);
            }).catch(e => console.warn('add simple_symbol err', e));
          } catch(e){ console.warn('addSimpleSymbol patch err', e); }
          return marker;
        };
      }

      // patch Draw events if map and drawnItems exist
      if (window.map && window.drawnItems) {
        map.on(L.Draw.Event.CREATED, e => {
          const layer = e.layer;
          try {
            let payload = null;
            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
              payload = { latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), type: 'polyline', options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Polygon) {
              const rings = layer.getLatLngs();
              const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
              payload = { latlngs, type: 'polygon', options: pickLayerOptions(layer) };
            } else if (layer instanceof L.Circle) {
              payload = { center: layer.getLatLng(), radius: layer.getRadius(), type: 'circle', options: pickLayerOptions(layer) };
            }
            if (payload) {
              addEntity('drawing', payload).then(key => { try { layer._syncId = key; } catch(e){} });
            }
          } catch(e){ console.warn('draw created patch err', e); }
        });

        map.on(L.Draw.Event.EDITED, e => {
          e.layers.eachLayer(layer => {
            if (!layer) return;
            const id = layer._syncId;
            if (!id) return;
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
            } catch(e){ console.warn('draw edited patch err', e); }
          });
        });

        map.on(L.Draw.Event.DELETED, e => {
          e.layers.eachLayer(layer => {
            if (!layer) return;
            const id = layer._syncId;
            if (id) removeEntity(id).catch(()=>{});
          });
        });
      }

      // patch loadMapByFile to update DB mapData
      if (typeof window.loadMapByFile === 'function') {
        const orig = window.loadMapByFile;
        window.loadMapByFile = function(fileName) {
          const res = orig.apply(this, arguments);
          // if returned promise, update after load
          if (res && res.then) {
            res.then(() => {
              try { if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map && window.map.getCenter && window.map.getCenter(), window.map && window.map.getZoom && window.map.getZoom()); } catch(e){}
            }).catch(()=>{});
          } else {
            try { if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map && window.map.getCenter && window.map.getCenter(), window.map && window.map.getZoom && window.map.getZoom()); } catch(e){}
          }
          return res;
        };
      }

      // attach moveend to update mapData when user pans/zooms
      if (window.map && !window.map._syncMoveHookAttached) {
        window.map.on('moveend', () => {
          try {
            if (CURRENT_ROOM && window.currentMapFile) updateMapData(window.currentMapFile, window.map.getCenter(), window.map.getZoom());
          } catch(e){}
        });
        window.map._syncMoveHookAttached = true;
      }

      // attach marker hooks for pre-existing markers
      setTimeout(() => {
        try {
          (window.markerList || []).forEach(entry => {
            if (entry && entry.marker) {
              const stableId = entry.id || `player_${entry.team}_${entry.playerIndex}`;
              attachMarkerHooks(entry.marker, stableId);
            }
          });
        } catch(e){}
      }, 400);

    }; // end tryAttach

    // We try to attach immediately and also periodically for a short time if script.js loads later
    tryAttach();
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      tryAttach();
      if (tries > 10) clearInterval(interval);
      // stop earlier if placeMarker patched
      if (typeof window.placeMarker === 'function' && window.placeMarker.toString().indexOf('orig')>-1) {
        clearInterval(interval);
      }
    }, 300);
  }

  // --- Marker drag hooks (throttled updates) ---
  function attachMarkerHooks(marker, syncId) {
    if (!marker || !marker.on) return;
    if (marker._syncHooksAttached) return;
    marker._syncHooksAttached = true;

    marker.on('dragstart', () => { marker._isDragging = true; });
    marker.on('drag', () => {
      if (!marker._isDragging) return;
      try {
        const latlng = marker.getLatLng();
        updateEntity(syncId, { latlng: { lat: latlng.lat, lng: latlng.lng } }).catch(()=>{});
      } catch(e){}
    });
    marker.on('dragend', () => {
      marker._isDragging = false;
      try {
        const latlng = marker.getLatLng();
        updateEntity(syncId, { latlng: { lat: latlng.lat, lng: latlng.lng } }).catch(()=>{});
      } catch(e){}
    });

    // click removal hook: if user clicks marker and confirms deletion, remove from DB
    marker.on('click', () => {
      // default script.js behavior may already confirm & remove; but if marker has _syncId, remove entity
      try {
        const id = marker._syncId || syncId;
        if (!id) return;
        // give script.js priority: if it removed already, no harm.
        if (confirm('Удалить этот символ?')) {
          removeEntity(id).catch(()=>{});
        }
      } catch(e){}
    });
  }

  // --- Panel injection (ensure collapse works) ---
  function injectPanel() {
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
    // Attach DOM handlers after short delay to ensure DOM ready
    setTimeout(() => {
      const toggle = document.getElementById('room-panel-toggle');
      const panelEl = document.getElementById('room-panel');
      if (toggle && panelEl) {
        toggle.addEventListener('click', () => {
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
          const snap = await db.ref('rooms').once('value');
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
            db.ref(`rooms/${id}/participants`).once('value').then(s => {
              const el = div.querySelector('.c');
              if (el) el.textContent = s.numChildren();
            }).catch(()=>{});
          });
        } catch(e){ console.warn('refreshRooms err', e); }
      }

      createBtn && (createBtn.onclick = async () => {
        const name = (nameInp && nameInp.value.trim()) || 'Без названия';
        const pass = (passInp && passInp.value) || '';
        const nick = (nickInp && nickInp.value.trim()) || (`Игрок_${Math.random().toString(36).slice(2,6)}`);
        localStorage.setItem('mw2_nick', nick);
        try {
          const ref = db.ref('rooms').push();
          await ref.set({ name, password: pass || '', createdAt: now() });
          await joinRoom(ref.key, pass, nick);
          setTimeout(refreshRooms, 200);
        } catch(err) { console.error('create room err', err); alert('Ошибка создания комнаты'); }
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
          try { localStorage.setItem('mw2_nick', nick); await joinRoom(id, p, nick); document.getElementById('btn-leave-room').style.display='inline-block'; }
          catch(err){ alert('Не получилось войти: ' + (err.message || err)); }
        } else if (btn.classList.contains('del')) {
          if (!confirm('Удалить комнату?')) return;
          try { await db.ref(`rooms/${id}`).remove(); setTimeout(refreshRooms, 200); } catch(e){ console.warn(e); }
        }
      });

    }, 120);
  }

  // --- Expose API and auto-init integration ---
  window.sync = {
    clientId: CLIENT_ID,
    joinRoom: async (roomId, pass, nick) => { return joinRoom(roomId, pass || '', nick || localStorage.getItem('mw2_nick') || 'anon'); },
    leaveRoom: async () => { return leaveRoom(); },
    setEchelon: (n) => { setEchelon(n); },
    addEntity: (type, data, opts) => { return addEntity(type, data, opts); },
    updateEntity: (id, partial) => { return updateEntity(id, partial); },
    removeEntity: (id) => { return removeEntity(id); },
    updateMapData: (mapFile, center, zoom) => { return updateMapData(mapFile, center, zoom); },
    getCurrentRoom: () => CURRENT_ROOM,
    getCurrentEchelon: () => CURRENT_ECHELON
  };

  // Initialize UI and integration
  injectPanel();
  integrate();

  // Auto restore last room prompt (non-blocking)
  setTimeout(() => {
    try {
      const last = localStorage.getItem('mw2_last_room');
      if (last && confirm('Восстановить последнюю комнату?')) {
        const nick = localStorage.getItem('mw2_nick') || '';
        window.sync.joinRoom(last, '', nick).catch(()=>{});
      }
    } catch(e){}
  }, 900);

  console.log('firebase-sync.js loaded. clientId=', CLIENT_ID);
})(); 
