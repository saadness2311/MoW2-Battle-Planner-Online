/*
  Модуль синхронизации для многопользовательского режима
  Обрабатывает realtime обновления через Supabase
*/

let realtimeChannels = [];
let syncEnabled = false;
let lastMarkerUpdate = {};

function enableSync() {
  syncEnabled = true;
}

function disableSync() {
  syncEnabled = false;
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

async function canEdit() {
  if (!CURRENT_ROOM_ID || !Auth.currentUser) return false;
  try {
    const { data } = await supabaseClient
      .from('rooms')
      .select('turn_owner_user_id')
      .eq('id', CURRENT_ROOM_ID)
      .single();
    return data && data.turn_owner_user_id === Auth.currentUser.id;
  } catch(e) {
    return false;
  }
}

async function syncMarkerPosition(markerId, latlng) {
  if (!syncEnabled || !CURRENT_ROOM_ID) return;
  if (!await canEdit()) return;

  const now = Date.now();
  if (lastMarkerUpdate[markerId] && (now - lastMarkerUpdate[markerId]) < 500) return;
  lastMarkerUpdate[markerId] = now;

  try {
    await supabaseClient
      .from('markers')
      .update({
        x: String(latlng.lat),
        y: String(latlng.lng),
        updated_at: new Date().toISOString(),
        last_moved_by: Auth.currentUser.id
      })
      .eq('id', markerId)
      .eq('room_id', CURRENT_ROOM_ID);
  } catch(e) {
    console.warn('syncMarkerPosition error:', e);
  }
}

async function createMarkerInDB(marker, meta = {}) {
  if (!syncEnabled || !CURRENT_ROOM_ID) return null;
  if (!await canEdit()) {
    showToast('Не ваш ход');
    return null;
  }

  const id = crypto.randomUUID();
  const latlng = marker.getLatLng();

  try {
    await supabaseClient.from('markers').insert([{
      id,
      room_id: CURRENT_ROOM_ID,
      echelon: currentEchelon,
      symb_name: marker._symbName || meta.regimentFile || null,
      x: String(latlng.lat),
      y: String(latlng.lng),
      rotation: 0,
      meta: { ...meta, created_by: Auth.currentUser.id },
      created_at: new Date().toISOString()
    }]);
    return id;
  } catch(e) {
    console.warn('createMarkerInDB error:', e);
    return null;
  }
}

async function deleteMarkerInDB(markerId) {
  if (!syncEnabled || !CURRENT_ROOM_ID) return;
  if (!await canEdit()) return;

  try {
    await supabaseClient
      .from('markers')
      .delete()
      .eq('id', markerId)
      .eq('room_id', CURRENT_ROOM_ID);
  } catch(e) {
    console.warn('deleteMarkerInDB error:', e);
  }
}

function animateMarkerMovement(marker, targetLatLng, duration = 300) {
  if (!marker || !marker.getLatLng) return;

  const start = marker.getLatLng();
  const startTime = performance.now();
  const dx = targetLatLng[0] - start.lat;
  const dy = targetLatLng[1] - start.lng;

  function animate(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

    const lat = start.lat + dx * eased;
    const lng = start.lng + dy * eased;

    try {
      marker.setLatLng([lat, lng]);
    } catch(e) {}

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

function setupRealtimeSync() {
  if (!CURRENT_ROOM_ID || !supabaseClient) return;

  teardownRealtimeSync();

  const markersChannel = supabaseClient
    .channel(`room-${CURRENT_ROOM_ID}-markers`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'markers',
      filter: `room_id=eq.${CURRENT_ROOM_ID}`
    }, (payload) => {
      const m = payload.new;
      if (!m || m.echelon !== currentEchelon) return;

      if (markerList.find(ml => ml.id === m.id)) return;

      try {
        const latlng = [Number(m.x), Number(m.y)];
        let marker;

        if (m.meta && m.meta.team && m.meta.nick) {
          const icon = createRegDivIcon(
            m.meta.nick,
            m.meta.nation || 'ussr',
            m.meta.regimentFile || 'reg1.png',
            m.meta.team
          );
          marker = L.marker(latlng, { icon, draggable: false }).addTo(map);
        } else {
          const iconUrl = m.symb_name ? `assets/symbols/${m.symb_name}.png` : 'assets/symbols/symb1.png';
          marker = L.marker(latlng, {
            icon: L.icon({ iconUrl, iconSize: [48, 48], iconAnchor: [24, 24] }),
            draggable: false
          }).addTo(map);
        }

        markerList.push({ id: m.id, marker, meta: m.meta });
      } catch(e) {
        console.warn('Insert marker error:', e);
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'markers',
      filter: `room_id=eq.${CURRENT_ROOM_ID}`
    }, (payload) => {
      const m = payload.new;
      if (!m || m.echelon !== currentEchelon) return;

      const entry = markerList.find(ml => ml.id === m.id);
      if (!entry) return;

      const targetLatLng = [Number(m.x), Number(m.y)];
      animateMarkerMovement(entry.marker, targetLatLng);
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'markers',
      filter: `room_id=eq.${CURRENT_ROOM_ID}`
    }, (payload) => {
      const old = payload.old;
      if (!old) return;

      const idx = markerList.findIndex(ml => ml.id === old.id);
      if (idx === -1) return;

      try {
        map.removeLayer(markerList[idx].marker);
      } catch(e) {}
      markerList.splice(idx, 1);
    })
    .subscribe();

  realtimeChannels.push(markersChannel);

  const roomsChannel = supabaseClient
    .channel(`room-${CURRENT_ROOM_ID}-rooms`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${CURRENT_ROOM_ID}`
    }, async (payload) => {
      const r = payload.new;
      if (!r) return;

      const turnLabel = document.getElementById('mow2_room_turn_label');
      if (turnLabel && r.turn_owner_user_id) {
        try {
          const { data: user } = await supabaseClient
            .from('users_mow2')
            .select('username')
            .eq('id', r.turn_owner_user_id)
            .single();
          turnLabel.textContent = user ? user.username : r.turn_owner_user_id;
        } catch(e) {
          turnLabel.textContent = r.turn_owner_user_id;
        }
      }

      if (r.settings && r.settings.mapName && r.settings.mapName !== currentMapFile) {
        await loadMapByFile(r.settings.mapName).catch(e => console.warn(e));
      }
    })
    .subscribe();

  realtimeChannels.push(roomsChannel);

  const membersChannel = supabaseClient
    .channel(`room-${CURRENT_ROOM_ID}-members`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'room_members',
      filter: `room_id=eq.${CURRENT_ROOM_ID}`
    }, () => {
      if (typeof refreshRoomPanel === 'function') {
        debounce(refreshRoomPanel, 1000)();
      }
    })
    .subscribe();

  realtimeChannels.push(membersChannel);

  enableSync();
}

function teardownRealtimeSync() {
  disableSync();
  realtimeChannels.forEach(ch => {
    try {
      if (supabaseClient.removeChannel) {
        supabaseClient.removeChannel(ch);
      }
      if (ch.unsubscribe) {
        ch.unsubscribe();
      }
    } catch(e) {}
  });
  realtimeChannels = [];
}

async function loadMarkersFromDB() {
  if (!CURRENT_ROOM_ID) return;

  try {
    const { data: markers } = await supabaseClient
      .from('markers')
      .select('*')
      .eq('room_id', CURRENT_ROOM_ID)
      .eq('echelon', currentEchelon);

    markerList.forEach(m => {
      try { map.removeLayer(m.marker); } catch(e) {}
    });
    markerList = [];

    (markers || []).forEach(m => {
      try {
        const latlng = [Number(m.x), Number(m.y)];
        let marker;

        if (m.meta && m.meta.team && m.meta.nick) {
          const icon = createRegDivIcon(
            m.meta.nick,
            m.meta.nation || 'ussr',
            m.meta.regimentFile || 'reg1.png',
            m.meta.team
          );
          marker = L.marker(latlng, { icon, draggable: false }).addTo(map);
        } else {
          const iconUrl = m.symb_name ? `assets/symbols/${m.symb_name}.png` : 'assets/symbols/symb1.png';
          marker = L.marker(latlng, {
            icon: L.icon({ iconUrl, iconSize: [48, 48], iconAnchor: [24, 24] }),
            draggable: false
          }).addTo(map);
        }

        markerList.push({ id: m.id, marker, meta: m.meta });
      } catch(e) {
        console.warn('Load marker error:', e);
      }
    });
  } catch(e) {
    console.warn('loadMarkersFromDB error:', e);
  }
}

if (typeof window !== 'undefined') {
  window.setupRealtimeSync = setupRealtimeSync;
  window.teardownRealtimeSync = teardownRealtimeSync;
  window.syncMarkerPosition = syncMarkerPosition;
  window.createMarkerInDB = createMarkerInDB;
  window.deleteMarkerInDB = deleteMarkerInDB;
  window.canEdit = canEdit;
  window.loadMarkersFromDB = loadMarkersFromDB;
}
