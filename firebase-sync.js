// firebase-sync.js
// Синхронизация карты / символов / маркеров / рисунков через Firebase Realtime Database
// Подходит для firebase v8 (как в index.html).
// Конфигурация (для справки; инициализация в index.html)
// НЕ ИНИЦИАЛИЗИРУЕМ Firebase здесь, index.html делает это.
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

// ---- Константы / состояние ----
const SYNC = (function(){
  // приватно
  const clientId = `c_${Date.now().toString(36)}_${Math.floor(Math.random()*1e6).toString(36)}`;
  let roomId = 'lobby';
  let echelon = 1;
  let dbRootRef = null;
  let entitiesRef = null;
  let listeners = { added: null, changed: null, removed: null };
  // локальные кеши и защита от дублей
  const processedRemote = new Set(); // firebase keys we've applied (ключи DB)
  const localPending = new Map(); // entityId -> { lastSentAt, timeoutId, pendingUpdate }
  // для последовательной отправки команд — seq per client
  let localSeq = 0;

  // throttle/debounce params
  const THROTTLE_MS = 300; // минимальный интервал отправки обновлений для одной сущности
  const FINAL_FLUSH_DELAY = 120; // гарантия отправки финального обновления

  // helper: доступ к firebase.database()
  function getDb(){
    if(!window.firebase || !window.firebase.database) throw new Error('Firebase не найден. Убедись, что firebase подключён в index.html и инициализирован.');
    return window.firebase.database();
  }

  function pathForRoom(roomIdArg, echelonArg){
    const r = encodeURIComponent(roomIdArg || roomId);
    const e = echelonArg || echelon;
    return `/rooms/${r}/echelons/e${e}/entities`;
  }

  function ensureRefs(){
    dbRootRef = getDb().ref();
    entitiesRef = getDb().ref(pathForRoom(roomId, echelon));
  }

  // --- подписки на DB ---
  function attachListeners(){
    detachListeners();
    ensureRefs();
    listeners.added = entitiesRef.on('child_added', snap => {
      const key = snap.key;
      const val = snap.val();
      if(!val) return;
      // Защита от собственных сообщений: если clientId === мой, игнорируем (локально уже применили)
      if(val.clientId === clientId) return;
      // Защита от повторной обработки
      const marker = `${key}:${val.updatedAt || ''}`;
      if(processedRemote.has(marker)) return;
      processedRemote.add(marker);
      // Собираем entity объект удобный для скрипта
      const entity = { id: key, type: val.type, data: val.data, meta: { clientId: val.clientId, seq: val.seq, updatedAt: val.updatedAt } };
      // Emit событие для script.js
      window.dispatchEvent(new CustomEvent('remoteEntityAdded', { detail: { entity } }));
    });

    listeners.changed = entitiesRef.on('child_changed', snap => {
      const key = snap.key;
      const val = snap.val();
      if(!val) return;
      if(val.clientId === clientId) return; // наше - уже применили
      const marker = `${key}:${val.updatedAt || ''}`;
      if(processedRemote.has(marker)) return;
      processedRemote.add(marker);
      const entity = { id: key, type: val.type, data: val.data, meta: { clientId: val.clientId, seq: val.seq, updatedAt: val.updatedAt } };
      window.dispatchEvent(new CustomEvent('remoteEntityChanged', { detail: { entity } }));
    });

    listeners.removed = entitiesRef.on('child_removed', snap => {
      const key = snap.key;
      // удаление — важно применить всегда, даже если клиент сам удалял
      window.dispatchEvent(new CustomEvent('remoteEntityRemoved', { detail: { id: key } }));
    });
  }

  function detachListeners(){
    try{
      if(listeners.added && entitiesRef) entitiesRef.off('child_added', listeners.added);
      if(listeners.changed && entitiesRef) entitiesRef.off('child_changed', listeners.changed);
      if(listeners.removed && entitiesRef) entitiesRef.off('child_removed', listeners.removed);
    }catch(e){ /* ignore */ }
    listeners = { added: null, changed: null, removed: null };
  }

  // --- CRUD (API) ---
  // Создать сущность. opts: { id (string) - optional stable id, applyLocally:true/false }
  async function firebaseAddEntity(type, data, opts = {}){
    ensureRefs();
    const now = Date.now();
    const seq = ++localSeq;
    const payload = {
      type,
      data,
      clientId,
      seq,
      updatedAt: now
    };

    if(opts.id){
      // используем фиксированный ID (для player markers и т.п.)
      const ref = getDb().ref(pathForRoom(roomId, echelon) + `/${opts.id}`);
      await ref.set(payload);
      // пометим как отправленное нашим клиентом, чтобы не обрабатывать при on('child_added')
      processedRemote.add(`${opts.id}:${now}`);
      return { key: opts.id, ref };
    } else {
      const p = await getDb().ref(pathForRoom(roomId, echelon)).push(payload);
      processedRemote.add(`${p.key}:${now}`);
      return { key: p.key, ref: p };
    }
  }

  // Частичное обновление: применяем через "throttled queue" чтобы не перегружать сеть
  function firebaseUpdateEntity(id, updates){
    if(!id) return Promise.reject(new Error('firebaseUpdateEntity: id required'));

    // merge and schedule
    const existing = localPending.get(id) || { pendingUpdate: {}, lastSentAt: 0, timeout: null };
    existing.pendingUpdate = Object.assign({}, existing.pendingUpdate, updates);
    localPending.set(id, existing);

    // если прошло достаточно времени — отправляем сразу, иначе откладываем
    const now = Date.now();
    const timeSince = now - (existing.lastSentAt || 0);

    function doSend(){
      const payload = {
        data: existing.pendingUpdate,
        clientId,
        seq: ++localSeq,
        updatedAt: Date.now()
      };
      // делаем частичный update (null-safe)
      const ref = getDb().ref(pathForRoom(roomId, echelon) + `/${id}`);
      // atomic update: обновляем поле data (замерджим на сервере)
      const updatesForDb = {};
      // Применяем под data/... для частичной merge
      for(const k in payload.data) {
        updatesForDb[`/data/${k}`] = payload.data[k];
      }
      updatesForDb['/clientId'] = payload.clientId;
      updatesForDb['/seq'] = payload.seq;
      updatesForDb['/updatedAt'] = payload.updatedAt;
      // выполняем update
      ref.update(updatesForDb).catch(err => console.warn('firebaseUpdateEntity: update error', err));
      existing.lastSentAt = Date.now();
      existing.pendingUpdate = {};
      if(existing.timeout){ clearTimeout(existing.timeout); existing.timeout = null; }
      localPending.set(id, existing);
    }

    if(timeSince >= THROTTLE_MS) {
      doSend();
    } else {
      // отложим и гарантируем финальный flush
      if(existing.timeout) clearTimeout(existing.timeout);
      existing.timeout = setTimeout(doSend, Math.max(THROTTLE_MS - timeSince, FINAL_FLUSH_DELAY));
      localPending.set(id, existing);
    }

    return Promise.resolve();
  }

  function firebaseRemoveEntity(id){
    if(!id) return Promise.reject(new Error('firebaseRemoveEntity: id required'));
    const ref = getDb().ref(pathForRoom(roomId, echelon) + `/${id}`);
    // удаляем
    return ref.remove().catch(err => console.warn('firebaseRemoveEntity: remove error', err));
  }

  // --- room / echelon control ---
  function joinRoom(rId){
    if(!rId) throw new Error('joinRoom: roomId required');
    leaveRoom(); // clean old
    roomId = String(rId);
    ensureRefs();
    attachListeners();
    console.log(`[sync] joined room "${roomId}", echelon e${echelon}, clientId=${clientId}`);
  }

  function leaveRoom(){
    detachListeners();
    processedRemote.clear();
    // flush pending
    for(const [id, val] of localPending.entries()){
      if(val.timeout) { clearTimeout(val.timeout); val.timeout = null; }
      // try to send pending now (best-effort)
      if(val.pendingUpdate && Object.keys(val.pendingUpdate).length) {
        const ref = getDb().ref(pathForRoom(roomId, echelon) + `/${id}`);
        const payload = { clientId, seq: ++localSeq, updatedAt: Date.now() };
        const updatesForDb = {};
        for(const k in val.pendingUpdate) updatesForDb[`/data/${k}`] = val.pendingUpdate[k];
        updatesForDb['/clientId'] = payload.clientId; updatesForDb['/seq'] = payload.seq; updatesForDb['/updatedAt'] = payload.updatedAt;
        ref.update(updatesForDb).catch(()=>{});
      }
    }
    localPending.clear();
    console.log('[sync] left room (listeners detached)');
  }

  function setEchelon(n){
    if(!n || isNaN(n)) throw new Error('setEchelon: numeric echelon required');
    // save current pending and detach
    leaveRoom();
    echelon = Number(n);
    // rejoin same room at new echelon
    joinRoom(roomId);
  }

  // --- Integration helpers: patch client functions (best-effort)
  // После загрузки script.js будем пытаться обернуть некоторые глобальные функции, чтобы автоматом отправлять
  // операции в firebase при создании/перемещении сущностей.
  function initAfterScript(){
    // 1) patch placeMarker (оповещение при создании маркера игрока)
    try{
      if(typeof window.placeMarker === 'function'){
        const orig = window.placeMarker;
        window.placeMarker = function(nick, nation, regimentFile, team, playerIndex){
          // вызываем оригинал — он добавит маркер локально
          orig.apply(this, arguments);
          // синхронизируем: используем стабильный id для игрока
          const stableId = `player_${team}_${playerIndex}`;
          // определим маркер позицию — получим из markerList (script.js хранит markerList глобально)
          try {
            const ml = window.markerList || [];
            const entry = ml.find(m => m.id === stableId || (m.team === team && m.playerIndex === playerIndex));
            const latlng = entry && entry.marker && entry.marker.getLatLng ? entry.marker.getLatLng() : map.getCenter();
            const data = {
              id: stableId,
              team,
              playerIndex,
              nick,
              nation,
              regimentFile,
              latlng: { lat: latlng.lat, lng: latlng.lng }
            };
            // сохраняем в DB с фиксированным id
            firebaseAddEntity('player_marker', data, { id: stableId }).catch(e => console.warn('sync add player_marker err', e));
            // также: если marker draggable -> подписываем dragend для обновлений (скоро ниже)
          } catch(e){ console.warn('sync.placeMarker integration error', e); }
        };
      }
    }catch(e){ console.warn('patch placeMarker failed', e); }

    // 2) patch addCustomIcon and addSimpleSymbol (символы)
    try{
      if(typeof window.addCustomIcon === 'function'){
        const orig = window.addCustomIcon;
        window.addCustomIcon = function(url, latlng){
          const marker = orig.apply(this, arguments);
          try {
            const data = { url, latlng: { lat: latlng.lat || latlng[0] || 0, lng: latlng.lng || latlng[1] || 0 } };
            firebaseAddEntity('custom_symbol', data).then(res => {
              // сохранение ссылки на entityId внутри маркера
              try{ marker._syncId = res.key; }catch(e){}
            }).catch(e => console.warn('sync add custom_symbol err', e));
            // при dragend нужно обновлять позицию
            if(marker && marker.on){
              marker.on('dragend', function(){
                const id = marker._syncId;
                if(id) firebaseUpdateEntity(id, { latlng: marker.getLatLng() }).catch(()=>{});
              });
            }
          } catch(e){ console.warn('sync.addCustomIcon integration error', e); }
          return marker;
        };
      }
    } catch(e){ console.warn('patch addCustomIcon failed', e); }

    try{
      if(typeof window.addSimpleSymbol === 'function'){
        const orig = window.addSimpleSymbol;
        window.addSimpleSymbol = function(type, latlng){
          const marker = orig.apply(this, arguments);
          try {
            const data = { type, latlng: { lat: latlng.lat || latlng[0] || 0, lng: latlng.lng || latlng[1] || 0 } };
            firebaseAddEntity('simple_symbol', data).then(res => {
              try{ marker._syncId = res.key; }catch(e){}
            }).catch(e=>console.warn('sync add simple_symbol err', e));
            if(marker && marker.on){
              marker.on('dragend', ()=> {
                const id = marker._syncId;
                if(id) firebaseUpdateEntity(id, { latlng: marker.getLatLng() }).catch(()=>{});
              });
            }
          } catch(e){ console.warn('sync.addSimpleSymbol integration error', e); }
          return marker;
        };
      }
    } catch(e){ console.warn('patch addSimpleSymbol failed', e); }

    // 3) Hook для L.Draw событий — чтобы синхронизировать рисунки (polyline/polygon/circle)
    try{
      if(window.map && window.drawnItems){
        map.on(L.Draw.Event.CREATED, function(e){
          const layer = e.layer;
          // сериализация (как в script.js)
          let payload = null;
          if(layer instanceof L.Polyline && !(layer instanceof L.Polygon)){
            payload = { type: 'polyline', latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), options: {} };
          } else if(layer instanceof L.Polygon){
            const rings = layer.getLatLngs();
            const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
            payload = { type: 'polygon', latlngs, options: {} };
          } else if(layer instanceof L.Circle){
            payload = { type: 'circle', center: layer.getLatLng(), radius: layer.getRadius(), options: {} };
          }
          if(payload){
            // добавляем в DB
            firebaseAddEntity('drawing', payload).then(res => {
              // сохраним syncId в layer для возможного удаления/изменения
              try{ layer._syncId = res.key; }catch(e){}
            }).catch(e=>console.warn('sync add drawing err', e));
          }
        });

        // редактирование: подписаться на EDITED и обновлять все слои, которые имеют _syncId
        map.on(L.Draw.Event.EDITED, function(e){
          const layers = e.layers;
          layers.eachLayer(function(layer){
            if(!layer) return;
            const id = layer._syncId;
            if(!id) return;
            // формируем payload как выше
            let payload = null;
            if(layer instanceof L.Polyline && !(layer instanceof L.Polygon)){
              payload = { latlngs: layer.getLatLngs().map(p=>({lat:p.lat,lng:p.lng})), type:'polyline' };
            } else if(layer instanceof L.Polygon){
              const rings = layer.getLatLngs();
              const latlngs = Array.isArray(rings[0]) ? rings[0].map(p=>({lat:p.lat,lng:p.lng})) : rings.map(p=>({lat:p.lat,lng:p.lng}));
              payload = { latlngs, type:'polygon' };
            } else if(layer instanceof L.Circle){
              payload = { center: layer.getLatLng(), radius: layer.getRadius(), type:'circle' };
            }
            if(payload) firebaseUpdateEntity(id, payload).catch(()=>{});
          });
        });

        // удаление: если layer._syncId существует — удаляем и в Firebase
        map.on(L.Draw.Event.DELETED, function(e){
          const layers = e.layers;
          layers.eachLayer(function(layer){
            const id = layer._syncId;
            if(id) firebaseRemoveEntity(id).catch(()=>{});
          });
        });
      }
    } catch(e){ console.warn('draw hooks attach error', e); }

    // 4) Отслеживаем dragstart/dragend для маркеров (чтобы гарантировать финальную синхронизацию)
    try{
      // Если markerList существует и содержит маркеры (script.js)
      const attachMarkerHooks = () => {
        if(!window.markerList) return;
        window.markerList.forEach(entry => {
          try{
            const marker = entry.marker;
            if(marker && marker.on && !marker._syncHooksAttached){
              marker._syncHooksAttached = true;
              marker.on('dragstart', ()=> {
                marker._isDragging = true;
              });
              marker.on('dragend', ()=> {
                marker._isDragging = false;
                // соберём id. Если entry.id — локальный (например player_blue_0) — используем её.
                const stable = entry.id || `player_${entry.team}_${entry.playerIndex}`;
                const latlng = marker.getLatLng();
                const payload = { latlng: { lat: latlng.lat, lng: latlng.lng } };
                // отправляем финальное обновление (прямо)
                firebaseUpdateEntity(stable, payload).catch(()=>{});
              });
              // throttled updating during drag (position updates)
              marker.on('move', ()=> {
                if(!marker._isDragging) return;
                const stable = entry.id || `player_${entry.team}_${entry.playerIndex}`;
                const latlng = marker.getLatLng();
                // частично обновляем, внутренний throttle применится
                firebaseUpdateEntity(stable, { latlng: { lat: latlng.lat, lng: latlng.lng } });
              });
            }
          }catch(e){}
        });
      };
      // ставим интервал, чтобы поймать динамические маркеры (в script.js они создаются позже)
      const intervalId = setInterval(()=>{
        try{ attachMarkerHooks(); if(window.markerList && window.markerList.length>0) { clearInterval(intervalId); } }catch(e){}
      }, 400);
    } catch(e){ console.warn('marker hooks attach error', e); }
  }

  // --- init: ждём полной загрузки script.js (он подключён после firebase-sync.js в index.html) ---
  window.addEventListener('load', function(){
    setTimeout(() => {
      try{ initAfterScript(); } catch(e){ console.warn('initAfterScript failed', e); }
    }, 100); // небольшая задержка чтобы script.js гарантированно выполнился
  });

  // --- публичный API экспортим в window для использования из script.js ---
  const api = {
    joinRoom,
    leaveRoom,
    setEchelon,
    firebaseAddEntity,
    firebaseUpdateEntity,
    firebaseRemoveEntity,
    clientId,
    get room(){ return roomId; },
    get echelon(){ return echelon; }
  };

  // auto-join default room once firebase exists
  try{
    if(window.firebase && window.firebase.database){
      // небольшая задержка: если index.html инициализировал Firebase — всё готово
      setTimeout(()=>{ try{ joinRoom(roomId); }catch(e){ console.warn('auto join failed', e); } }, 200);
    } else {
      // если firebase ещё не загружен — поставить watch
      const checkInt = setInterval(()=>{
        if(window.firebase && window.firebase.database){
          clearInterval(checkInt);
          try{ joinRoom(roomId); } catch(e){ console.warn('auto join failed', e); }
        }
      }, 200);
    }
  } catch(e){ console.warn('sync auto init error', e); }

  return api;
})();

// Expose API onto window for script.js to call if needed.
window.sync = SYNC;
window.firebaseAddEntity = SYNC.firebaseAddEntity;
window.firebaseUpdateEntity = SYNC.firebaseUpdateEntity;
window.firebaseRemoveEntity = SYNC.firebaseRemoveEntity;
window.joinRoom = SYNC.joinRoom;
window.leaveRoom = SYNC.leaveRoom;
window.setEchelon = SYNC.setEchelon;

// End of firebase-sync.js
