// script.js — MULTIPLAYER scaffold for MoW2 Battle Planner
// Replaces original client-only script with Supabase-based multiplayer behavior
// Preserves UI and existing DOM structure. Do not include script.orig.js in index.html.

(function () {
  // --------- CONFIG: replace with your Supabase details if necessary -----------
  const SUPABASE_URL = 'https://zqklzhipwiifrrbyentg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxa2x6aGlwd2lpZnJyYnllbnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzQ0ODYsImV4cCI6MjA3NjU1MDQ4Nn0.siMc2xCvoBEjwNVwaOVvjlOtDODs9yDo0IDyGl9uWso';
  // ---------------------------------------------------------------------------

  // Globals
  const { createClient } = supabase; // UMD bundle exposes global `supabase`
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Utils
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowIso = () => new Date().toISOString();
  const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36));

  // Basic toast (non-intrusive)
  const showToast = (msg, ttl = 3000) => {
    let container = document.getElementById('mow2_toast_container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mow2_toast_container';
      Object.assign(container.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'flex-end',
        pointerEvents: 'none'
      });
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      background: '#2b2b2b',
      color: '#fff',
      padding: '8px 10px',
      borderRadius: '6px',
      fontSize: '13px',
      pointerEvents: 'auto',
      boxShadow: '0 6px 18px rgba(0,0,0,0.5)'
    });
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 300ms';
      el.style.opacity = 0;
      setTimeout(() => el.remove(), 300);
    }, ttl);
    return el;
  };

  // -------------------- AUTH (Custom: users_mow2 table) -----------------------
  const auth = {
    currentUser: null,

    async register(username, password) {
      if (!username) {
        showToast('Укажите имя пользователя');
        return null;
      }
      // allow any password length; hash with bcrypt
      const hash = bcrypt.hashSync(password || '', 10);
      // try insert, but check unique username
      const { data: existing } = await supabaseClient
        .from('users_mow2')
        .select('id, username')
        .eq('username', username)
        .limit(1);

      if (existing && existing.length > 0) {
        showToast('Ник уже занят');
        return null;
      }

      const { data, error } = await supabaseClient
        .from('users_mow2')
        .insert([{ username, password_hash: hash }])
        .select()
        .single();

      if (error) {
        console.error('register error', error);
        showToast('Ошибка регистрации');
        return null;
      }
      this.currentUser = { id: data.id, username: data.username };
      localStorage.setItem('mow2_user', JSON.stringify(this.currentUser));
      showToast('Регистрация успешна');
      return this.currentUser;
    },

    async login(username, password) {
      const { data, error } = await supabaseClient
        .from('users_mow2')
        .select('id, username, password_hash')
        .eq('username', username)
        .limit(1)
        .single();

      if (error || !data) {
        showToast('Пользователь не найден');
        return null;
      }
      const ok = bcrypt.compareSync(password || '', data.password_hash);
      if (!ok) {
        showToast('Неверный пароль');
        return null;
      }
      this.currentUser = { id: data.id, username: data.username };
      localStorage.setItem('mow2_user', JSON.stringify(this.currentUser));
      showToast('Вход успешно выполнен');
      return this.currentUser;
    },

    logout() {
      localStorage.removeItem('mow2_user');
      this.currentUser = null;
      showToast('Выход');
      // show auth screen
      showAuthScreen();
    },

    loadFromStorage() {
      try {
        const raw = localStorage.getItem('mow2_user');
        if (!raw) return null;
        this.currentUser = JSON.parse(raw);
        return this.currentUser;
      } catch (e) {
        console.error(e);
        return null;
      }
    }
  };

  // -------------------- UI: AUTH & ROOMS screens -----------------------------
  // We inject two simple screens into #auth-screen and #rooms-screen containers.
  function showAuthScreen() {
    const authContainer = document.getElementById('auth-screen');
    const roomsContainer = document.getElementById('rooms-screen');
    const app = document.querySelector('.app');
    if (authContainer) authContainer.style.display = 'block';
    if (roomsContainer) roomsContainer.style.display = 'none';
    if (app) app.style.display = 'none';

    authContainer.innerHTML = `
      <div style="width:360px;margin:60px auto;background:#1f1f1f;padding:20px;border-radius:8px;color:#ddd">
        <h2 style="margin:0 0 10px 0">MoW2 Battle Planner — Вход / Регистрация</h2>
        <div style="display:flex;flex-direction:column;gap:8px">
          <input id="mow2_input_username" placeholder="Ник" style="padding:8px;border-radius:6px;background:#2b2b2b;color:#fff;border:1px solid #444" />
          <input id="mow2_input_password" placeholder="Пароль" type="password" style="padding:8px;border-radius:6px;background:#2b2b2b;color:#fff;border:1px solid #444" />
          <div style="display:flex;gap:8px">
            <button id="mow2_btn_login" style="flex:1;padding:8px">Войти</button>
            <button id="mow2_btn_register" style="flex:1;padding:8px">Регистрация</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="mow2_btn_guest" style="flex:1;padding:8px">Войти как гость</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mow2_btn_login').onclick = async () => {
      const username = document.getElementById('mow2_input_username').value.trim();
      const password = document.getElementById('mow2_input_password').value;
      const u = await auth.login(username, password);
      if (u) showRoomsScreen();
    };

    document.getElementById('mow2_btn_register').onclick = async () => {
      const username = document.getElementById('mow2_input_username').value.trim();
      const password = document.getElementById('mow2_input_password').value;
      const u = await auth.register(username, password);
      if (u) showRoomsScreen();
    };

    document.getElementById('mow2_btn_guest').onclick = async () => {
      // Create ephemeral guest user with unique name
      const guestName = `guest_${Math.random().toString(36).slice(2,8)}`;
      const u = await auth.register(guestName, uuid()); // random password
      if (u) showRoomsScreen();
    };
  }

  async function showRoomsScreen() {
    const authContainer = document.getElementById('auth-screen');
    const roomsContainer = document.getElementById('rooms-screen');
    const app = document.querySelector('.app');
    if (authContainer) authContainer.style.display = 'none';
    if (roomsContainer) roomsContainer.style.display = 'block';
    if (app) app.style.display = 'none';

    // Build rooms UI
    roomsContainer.innerHTML = `
      <div style="max-width:900px;margin:24px auto;color:#ddd">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0">Комнаты — MoW2 Battle Planner</h2>
          <div>
            <span style="margin-right:12px">Пользователь: <b>${auth.currentUser.username}</b></span>
            <button id="mow2_btn_logout">Выйти</button>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:12px">
          <input id="mow2_new_room_name" placeholder="Название комнаты" style="flex:1;padding:8px;border-radius:6px;background:#2b2b2b;color:#fff;border:1px solid #444" />
          <input id="mow2_new_room_pwd" placeholder="Пароль (опционально)" style="width:220px;padding:8px;border-radius:6px;background:#2b2b2b;color:#fff;border:1px solid #444" />
          <button id="mow2_btn_create_room">Создать комнату</button>
        </div>
        <div id="mow2_rooms_list" style="margin-top:16px"></div>
      </div>
    `;

    document.getElementById('mow2_btn_logout').onclick = () => {
      auth.logout();
    };

    document.getElementById('mow2_btn_create_room').onclick = async () => {
      const name = document.getElementById('mow2_new_room_name').value.trim();
      const pwd = document.getElementById('mow2_new_room_pwd').value;
      if (!name) {
        showToast('Введите имя комнаты');
        return;
      }
      // Check user hasn't created 4 rooms
      const { data: ownedRooms } = await supabaseClient
        .from('rooms')
        .select('id')
        .eq('owner_user_id', auth.currentUser.id);

      if (ownedRooms && ownedRooms.length >= 4) {
        showToast('Вы уже создали 4 комнаты (лимит)');
        return;
      }

      const password_hash = pwd ? bcrypt.hashSync(pwd, 10) : null;
      const { data, error } = await supabaseClient
        .from('rooms')
        .insert([{
          name,
          password_hash,
          owner_user_id: auth.currentUser.id,
          current_echelon: 1,
          settings: {}
        }])
        .select()
        .single();

      if (error) {
        console.error('create room error', error);
        showToast('Ошибка создания комнаты');
        return;
      }

      // Add creator to room_members
      await supabaseClient.from('room_members').insert([{
        room_id: data.id,
        user_id: auth.currentUser.id,
        is_owner: true
      }]);

      showToast('Комната создана');
      await loadRoomsList();
    };

    await loadRoomsList();
  }

  async function loadRoomsList() {
    const container = document.getElementById('mow2_rooms_list');
    container.innerHTML = '<div style="color:#aaa">Загрузка...</div>';
    // join room_members count
    const { data: rooms, error } = await supabaseClient
      .from('rooms')
      .select('id, name, owner_user_id, created_at, max_players, settings');

    if (error) {
      console.error('loadRoomsList error', error);
      container.innerHTML = '<div style="color:#faa">Ошибка загрузки комнат</div>';
      return;
    }

    // For each room, get member count + owner username
    const rows = await Promise.all(rooms.map(async (r) => {
      const [{ count }] = await supabaseClient
        .from('room_members')
        .select('id', { count: 'exact', head: false })
        .eq('room_id', r.id);
      const { data: ownerData } = await supabaseClient
        .from('users_mow2')
        .select('username')
        .eq('id', r.owner_user_id)
        .limit(1);
      return {
        id: r.id,
        name: r.name,
        owner_username: ownerData && ownerData[0] ? ownerData[0].username : '—',
        members: count || 0,
        max_players: r.max_players || 50
      };
    }));

    container.innerHTML = rows.map(r => {
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-radius:6px;background:#1b1b1b;margin-bottom:8px">
          <div>
            <div style="font-weight:600">${escapeHtml(r.name)}</div>
            <div style="font-size:12px;color:#999">Создатель: ${escapeHtml(r.owner_username)} · ${r.members}/${r.max_players} игроков</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="mow2_btn_join_room" data-roomid="${r.id}">Войти</button>
            <button class="mow2_btn_view_room" data-roomid="${r.id}">Просмотр</button>
          </div>
        </div>
      `;
    }).join('');

    // bind
    container.querySelectorAll('.mow2_btn_join_room').forEach(btn => {
      btn.onclick = async (e) => {
        const roomId = btn.getAttribute('data-roomid');
        // check if room has password
        const { data: room } = await supabaseClient.from('rooms').select('id,name,password_hash,owner_user_id').eq('id', roomId).single();
        if (!room) { showToast('Комната не найдена'); await loadRoomsList(); return; }
        if (room.password_hash) {
          const pwd = prompt('Введите пароль для комнаты:') || '';
          const ok = bcrypt.compareSync(pwd, room.password_hash);
          if (!ok) {
            showToast('Неверный пароль');
            return;
          }
        }
        // try to insert into room_members
        try {
          await supabaseClient.from('room_members').insert([{
            room_id: roomId,
            user_id: auth.currentUser.id,
            is_owner: room.owner_user_id === auth.currentUser.id
          }]);
        } catch (err) {
          // could be unique constraint error, ignore
        }
        enterRoom(roomId);
      };
    });

    container.querySelectorAll('.mow2_btn_view_room').forEach(btn => {
      btn.onclick = async () => {
        const roomId = btn.getAttribute('data-roomid');
        // View mode: enter room but in spectator mode (still a member)
        try {
          await supabaseClient.from('room_members').insert([{
            room_id: roomId,
            user_id: auth.currentUser.id,
            is_owner: false
          }]);
        } catch (err) { }
        enterRoom(roomId);
      };
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
  }

  // -------------------- MAP + ROOM STATE + SYNC -----------------------------

  // Leaflet map
  let map = null;
  let markersLayer = null; // L.LayerGroup for markers
  let localMarkerMap = new Map(); // markerId -> { leafletMarker, meta }
  let currentRoom = null; // room object from DB
  let roomChannel = null;   // supabase realtime channel for this room

  // Prevent duplicate creations
  const recentActionUUIDs = new Set();

  // Debounce create marker button
  let createMarkerDebounce = false;

  // Initialize Leaflet map (keeps previous visual settings)
  function initMap() {
    if (map) return;
    map = L.map('map', { center: [51.505, -0.09], zoom: 3, preferCanvas: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    // Integrate original controls: If original code had draw controls, add them here as needed
    // /* INTEGRATE WITH ORIGINAL: adding leaflet-draw control / toolbar if present in original script */
  }

  // Create leaflet marker with proper icon
  function createLeafletMarker(markerRow) {
    // markerRow: { id, symb_name, x, y, rotation, meta }
    const lat = parseFloat(markerRow.y);
    const lng = parseFloat(markerRow.x);
    const id = markerRow.id;
    // Determine icon — try to use meta.icon_url or construct from symb_name/ assets folder
    let iconUrl = (markerRow.meta && markerRow.meta.icon_url) ? markerRow.meta.icon_url :
      `assets/symbols/${markerRow.symb_name}.png`; // fallback path; adapt to your assets structure

    const icon = L.icon({
      iconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([lat, lng], {
      draggable: true,
      rotationAngle: markerRow.rotation || 0,
      icon: icon
    });

    marker.on('dragstart', () => {
      marker._draggingFrom = marker.getLatLng();
    });

    marker.on('dragend', async (ev) => {
      // commit only if user has the turn or is owner of room
      const newLatLng = marker.getLatLng();
      await commitMarkerMove(id, newLatLng.lng, newLatLng.lat, marker);
    });

    marker.on('click', (e) => {
      // optionally show small info near cursor
      showTempInfo(`ID: ${id}`, e.latlng);
    });

    return marker;
  }

  function showTempInfo(text, latlng) {
    // tiny transient tooltip near cursor
    const info = L.popup({
      closeButton: false,
      autoClose: true,
      className: 'mow2-mini-info'
    }).setLatLng(latlng).setContent(`<div style="color:#fff;font-size:12px">${escapeHtml(text)}</div>`);
    info.openOn(map);
    setTimeout(() => map.closePopup(info), 1200);
  }

  // Add marker locally and to map (but DB insert is separate)
  function addMarkerToMapLocally(markerRow) {
    if (localMarkerMap.has(markerRow.id)) {
      // update existing
      const entry = localMarkerMap.get(markerRow.id);
      const leafletMarker = entry.leafletMarker;
      // animate movement
      animateMarkerTo(leafletMarker, [parseFloat(markerRow.y), parseFloat(markerRow.x)], 300);
      return;
    }
    const leafletMarker = createLeafletMarker(markerRow);
    leafletMarker.addTo(markersLayer);
    localMarkerMap.set(markerRow.id, { leafletMarker, meta: markerRow.meta || {} });
  }

  function animateMarkerTo(leafletMarker, latlngArr, duration = 400) {
    // simple linear interpolation
    if (!leafletMarker) return;
    const from = leafletMarker.getLatLng();
    const to = L.latLng(latlngArr[0], latlngArr[1]);
    const steps = Math.max(6, Math.round(duration / 40));
    let i = 0;
    const stepLat = (to.lat - from.lat) / steps;
    const stepLng = (to.lng - from.lng) / steps;

    const iv = setInterval(() => {
      i++;
      const next = L.latLng(from.lat + stepLat * i, from.lng + stepLng * i);
      leafletMarker.setLatLng(next);
      if (i >= steps) clearInterval(iv);
    }, duration / steps);
  }

  // Remove marker locally
  function removeMarkerLocally(markerId) {
    if (!localMarkerMap.has(markerId)) return;
    const entry = localMarkerMap.get(markerId);
    try {
      markersLayer.removeLayer(entry.leafletMarker);
    } catch (e) { }
    localMarkerMap.delete(markerId);
  }

  // -------------------- DB OPERATIONS: markers, room enter/leave ---------------
  async function enterRoom(roomId) {
    // fetch room info
    const { data: room, error } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .limit(1)
      .single();

    if (error || !room) {
      showToast('Комната не найдена');
      console.error(error);
      return;
    }
    currentRoom = room;
    // switch UI: hide rooms screen, show main app
    document.getElementById('rooms-screen').style.display = 'none';
    document.querySelector('.app').style.display = 'flex';

    initMap();
    // center / zoom logic: optionally use settings
    if (currentRoom.settings && currentRoom.settings.center) {
      try {
        const c = currentRoom.settings.center;
        map.setView([c[0], c[1]], c[2] || 3);
      } catch (e) {}
    }

    // set up room panel (top center)
    buildRoomPanel();

    // subscribe to realtime events for this room
    await subscribeToRoom(roomId);

    // fetch current markers and draw them (for current echelon)
    await loadMarkersForRoom(roomId, currentRoom.current_echelon || 1);

    // fetch members and display
    await loadRoomMembers(roomId);
  }

  async function leaveRoom() {
    // unsubscribe and cleanup
    if (roomChannel) {
      try {
        await supabaseClient.removeChannel(roomChannel);
      } catch (e) {
        // older API fallback
        try { roomChannel.unsubscribe(); } catch (e2) {}
      }
      roomChannel = null;
    }
    currentRoom = null;
    // clear map layers
    localMarkerMap.forEach((v, k) => {
      try { markersLayer.removeLayer(v.leafletMarker); } catch (e) {}
    });
    localMarkerMap.clear();
    // show rooms screen
    document.querySelector('.app').style.display = 'none';
    document.getElementById('rooms-screen').style.display = 'block';
    // reload rooms list
    await loadRoomsList();
  }

  async function loadMarkersForRoom(roomId, echelon = 1) {
    // fetch markers for this room and echelon
    const { data: rows, error } = await supabaseClient
      .from('markers')
      .select('*')
      .eq('room_id', roomId)
      .eq('echelon', echelon);

    if (error) {
      console.error('loadMarkersForRoom error', error);
      return;
    }
    // clear current local map
    localMarkerMap.forEach((v, k) => {
      try { markersLayer.removeLayer(v.leafletMarker); } catch (e) {}
    });
    localMarkerMap.clear();

    rows.forEach(r => addMarkerToMapLocally(r));
  }

  async function loadRoomMembers(roomId) {
    const { data: members } = await supabaseClient
      .from('room_members')
      .select('id,user_id,is_owner,joined_at,users_mow2(username)')
      .eq('room_id', roomId);

    // show in panel
    renderMembersInPanel(members || []);
  }

  // commit marker move to DB (dragend)
  async function commitMarkerMove(markerId, x, y, leafletMarker = null) {
    if (!currentRoom) {
      showToast('Не в комнате');
      // revert if possible
      if (leafletMarker && leafletMarker._draggingFrom) leafletMarker.setLatLng(leafletMarker._draggingFrom);
      return;
    }
    // permission check
    const meId = auth.currentUser.id;
    if (currentRoom.current_turn_user_id && currentRoom.current_turn_user_id !== meId && currentRoom.owner_user_id !== meId) {
      showToast('Сейчас не ваш ход');
      // revert marker
      if (leafletMarker && leafletMarker._draggingFrom) leafletMarker.setLatLng(leafletMarker._draggingFrom);
      return;
    }

    // update in DB
    try {
      const { data, error } = await supabaseClient
        .from('markers')
        .update({ x: parseFloat(x), y: parseFloat(y), updated_at: nowIso() })
        .eq('id', markerId)
        .select();

      if (error) {
        console.error('commitMarkerMove error', error);
        showToast('Не удалось переместить маркер');
        // revert
        if (leafletMarker && leafletMarker._draggingFrom) leafletMarker.setLatLng(leafletMarker._draggingFrom);
        return;
      }
      // update was applied; server will send realtime event and animate others
    } catch (e) {
      console.error(e);
    }
  }

  // create marker (UI/toolbar should call this). Adds marker to DB (only if player has turn)
  async function createMarker(symb_name, x, y, rotation = 0, meta = {}) {
    if (!currentRoom) {
      showToast('Вы не в комнате');
      return null;
    }
    // permission: only current turn or owner
    const meId = auth.currentUser.id;
    if (currentRoom.current_turn_user_id && currentRoom.current_turn_user_id !== meId && currentRoom.owner_user_id !== meId) {
      showToast('Не ваш ход');
      return null;
    }

    if (createMarkerDebounce) {
      showToast('Подождите...');
      return null;
    }
    createMarkerDebounce = true;
    setTimeout(() => createMarkerDebounce = false, 250);

    // generate action_uuid and store in meta to avoid duplicates
    const action_uuid = uuid();
    meta.action_uuid = action_uuid;
    recentActionUUIDs.add(action_uuid);

    // Insert into DB
    const payload = {
      room_id: currentRoom.id,
      echelon: currentRoom.current_echelon || 1,
      owner_user_id: meId,
      symb_name,
      x: parseFloat(x),
      y: parseFloat(y),
      rotation: rotation || 0,
      meta
    };

    try {
      const { data, error } = await supabaseClient
        .from('markers')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('createMarker error', error);
        showToast('Ошибка создания маркера');
        return null;
      }
      // Created — server will broadcast insert, local map will update
      return data;
    } catch (e) {
      console.error(e);
      showToast('Ошибка создания маркера');
      return null;
    }
  }

  // bulk create markers (array of {symb_name,x,y,rotation,meta})
  async function bulkCreateMarkers(items) {
    if (!currentRoom) { showToast('Не в комнате'); return; }
    const meId = auth.currentUser.id;
    if (currentRoom.current_turn_user_id && currentRoom.current_turn_user_id !== meId && currentRoom.owner_user_id !== meId) {
      showToast('Не ваш ход');
      return;
    }
    if (!Array.isArray(items) || items.length === 0) return;
    // add action_uuid if missing for each
    items = items.map(it => {
      const a = Object.assign({}, it);
      if (!a.meta) a.meta = {};
      if (!a.meta.action_uuid) a.meta.action_uuid = uuid();
      return a;
    });
    // batch insert
    const payload = items.map(it => ({
      room_id: currentRoom.id,
      echelon: currentRoom.current_echelon || 1,
      owner_user_id: meId,
      symb_name: it.symb_name,
      x: parseFloat(it.x),
      y: parseFloat(it.y),
      rotation: it.rotation || 0,
      meta: it.meta || {}
    }));
    try {
      // Insert array
      const { data, error } = await supabaseClient
        .from('markers')
        .insert(payload)
        .select();

      if (error) {
        console.error('bulkCreateMarkers error', error);
        showToast('Ошибка массовой вставки');
        return;
      }
      showToast(`Добавлено ${data.length} символов`);
    } catch (e) {
      console.error(e);
      showToast('Ошибка массовой вставки');
    }
  }

  // delete all markers in room (owner only)
  async function clearAllMarkersInRoom() {
    if (!currentRoom) return;
    const meId = auth.currentUser.id;
    if (currentRoom.owner_user_id !== meId) { showToast('Только создатель может очищать карту'); return; }
    try {
      await supabaseClient.from('markers').delete().eq('room_id', currentRoom.id);
      await supabaseClient.from('drawings').delete().eq('room_id', currentRoom.id);
      showToast('Карта очищена');
    } catch (e) {
      console.error(e);
      showToast('Ошибка очистки');
    }
  }

  // -------------------- RealTime: subscription per-room ---------------------
  async function subscribeToRoom(roomId) {
    // remove old channel
    if (roomChannel) {
      try {
        await supabaseClient.removeChannel(roomChannel);
      } catch (e) { }
      roomChannel = null;
    }

    // using new channel API
    try {
      // channel name
      const channel = supabaseClient.channel(`room-${roomId}`);

      // subscribe to markers changes filtered by room_id
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'markers',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        const ev = payload.eventType; // INSERT | UPDATE | DELETE
        const record = payload.new || payload.old;
        if (ev === 'INSERT') {
          // prevent duplicate apply
          if (record.meta && record.meta.action_uuid && recentActionUUIDs.has(record.meta.action_uuid)) {
            // we created this locally recently; still render
            recentActionUUIDs.delete(record.meta.action_uuid);
          }
          addMarkerToMapLocally(record);
        } else if (ev === 'UPDATE') {
          addMarkerToMapLocally(record);
        } else if (ev === 'DELETE') {
          removeMarkerLocally(record.id);
        }
      });

      // drawings
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'drawings', filter: `room_id=eq.${roomId}` }, (payload) => {
        // TODO: handle drawings (polylines/polygons)
        // For now, simply reload drawings if needed
      });

      // room members changes
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, (payload) => {
        // reload members
        loadRoomMembers(roomId);
      });

      // room meta changes (current_turn_user_id etc.)
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          currentRoom = Object.assign({}, currentRoom, payload.new);
          updateRoomPanelCurrentTurn();
        }
      });

      await channel.subscribe();
      roomChannel = channel;
    } catch (e) {
      console.error('subscribeToRoom error', e);
      showToast('Realtime subscription failed');
    }
  }

  // -------------------- ROOM PANEL (top center) -----------------------------
  function buildRoomPanel() {
    // Remove existing panel if any
    const existing = document.getElementById('mow2_room_panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'mow2_room_panel';
    Object.assign(panel.style, {
      position: 'fixed',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      background: '#1c1c1c',
      color: '#ddd',
      padding: '8px 12px',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
      minWidth: '360px'
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div>
          <div style="font-weight:700">${escapeHtml(currentRoom.name || 'Комната')}</div>
          <div id="mow2_panel_room_info" style="font-size:12px;color:#aaa">Идёт загрузка...</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button id="mow2_toggle_panel_btn" title="Свернуть/развернуть">—</button>
          <button id="mow2_leave_room_btn" title="Выйти">Выйти</button>
        </div>
      </div>
      <div id="mow2_panel_players" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto"></div>
      <div id="mow2_panel_owner_actions" style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end"></div>
    `;

    document.body.appendChild(panel);

    document.getElementById('mow2_toggle_panel_btn').onclick = () => {
      const playersDiv = document.getElementById('mow2_panel_players');
      if (!playersDiv) return;
      if (playersDiv.style.display === 'none') {
        playersDiv.style.display = 'flex';
        document.getElementById('mow2_toggle_panel_btn').textContent = '—';
      } else {
        playersDiv.style.display = 'none';
        document.getElementById('mow2_toggle_panel_btn').textContent = '+';
      }
    };

    document.getElementById('mow2_leave_room_btn').onclick = async () => {
      // remove from room_members
      try {
        await supabaseClient.from('room_members').delete().eq('room_id', currentRoom.id).eq('user_id', auth.currentUser.id);
      } catch (e) {}
      await leaveRoom();
    };

    // owner actions container: kick, transfer turn, delete room
    const ownerActions = document.getElementById('mow2_panel_owner_actions');
    ownerActions.innerHTML = `
      <button id="mow2_btn_transfer_turn" title="Передать ход">Передать ход</button>
      <button id="mow2_btn_clear_map" title="Очистить карту">Очистить</button>
      <button id="mow2_btn_delete_room" title="Удалить комнату">Удалить комнату</button>
    `;

    document.getElementById('mow2_btn_transfer_turn').onclick = async () => {
      // show quick select of users
      const members = await getRoomMembersList();
      const user = prompt(`Передать ход кому? Введите ник из списка:\n${members.map(m=>m.username).join(', ')}`);
      if (!user) return;
      const target = members.find(m => m.username === user);
      if (!target) { showToast('Игрок не найден'); return; }
      // only owner can transfer
      if (auth.currentUser.id !== currentRoom.owner_user_id) { showToast('Только создатель может передавать ход'); return; }
      await supabaseClient.from('rooms').update({ current_turn_user_id: target.user_id }).eq('id', currentRoom.id);
      showToast(`Ход передан ${target.username}`);
    };

    document.getElementById('mow2_btn_clear_map').onclick = async () => {
      if (auth.currentUser.id !== currentRoom.owner_user_id) { showToast('Только создатель может очищать'); return; }
      if (!confirm('Очистить карту (все маркеры и рисунки)?')) return;
      await clearAllMarkersInRoom();
    };

    document.getElementById('mow2_btn_delete_room').onclick = async () => {
      if (auth.currentUser.id !== currentRoom.owner_user_id) { showToast('Только создатель может удалить комнату'); return; }
      if (!confirm('Удалить комнату и все связанные данные?')) return;
      try {
        await supabaseClient.from('rooms').delete().eq('id', currentRoom.id);
        showToast('Комната удалена');
        await leaveRoom();
      } catch (e) {
        console.error(e);
        showToast('Ошибка удаления комнаты');
      }
    };

    // finally, refresh info
    updateRoomPanelCurrentTurn();
    loadRoomMembers(currentRoom.id);
  }

  async function getRoomMembersList() {
    const { data } = await supabaseClient.from('room_members').select('user_id, users_mow2(username)').eq('room_id', currentRoom.id);
    if (!data) return [];
    return data.map(r => ({ user_id: r.user_id, username: r.users_mow2 && r.users_mow2.username ? r.users_mow2.username : '—' }));
  }

  function updateRoomPanelCurrentTurn() {
    const info = document.getElementById('mow2_panel_room_info');
    if (!info) return;
    const turn = currentRoom && currentRoom.current_turn_user_id ? currentRoom.current_turn_user_id : null;
    const youAre = auth.currentUser && auth.currentUser.id === currentRoom.owner_user_id ? ' (Создатель)' : '';
    if (!turn) {
      info.innerHTML = `Создателем: ${escapeHtml(currentRoom.owner_user_id ? currentRoom.owner_user_id : '')}${youAre}`;
    } else {
      // get username resolved asynchronously
      (async () => {
        try {
          const { data } = await supabaseClient.from('users_mow2').select('username').eq('id', turn).limit(1).single();
          const uname = data && data.username ? data.username : '—';
          info.innerHTML = `Сейчас ход: <b>${escapeHtml(uname)}</b>`;
        } catch (e) {
          info.innerHTML = `Сейчас ход: <b>${turn}</b>`;
        }
      })();
    }
  }

  function renderMembersInPanel(members) {
    const container = document.getElementById('mow2_panel_players');
    if (!container) return;
    container.innerHTML = '';
    members.forEach(m => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.background = '#151515';
      div.style.padding = '6px';
      div.style.borderRadius = '6px';
      div.innerHTML = `<div style="font-size:13px">${escapeHtml(m.users_mow2 ? m.users_mow2.username : m.user_id)}${m.is_owner ? ' (создатель)' : ''}</div>
        <div style="display:flex;gap:6px">
          ${auth.currentUser.id === currentRoom.owner_user_id ? `<button class="mow2_kick_btn" data-user="${m.user_id}">Кик</button>` : ''}
        </div>`;
      container.appendChild(div);
    });

    container.querySelectorAll('.mow2_kick_btn').forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.getAttribute('data-user');
        if (!confirm('Выгнать игрока?')) return;
        // owner only
        if (auth.currentUser.id !== currentRoom.owner_user_id) { showToast('Только создатель может кикать'); return; }
        await supabaseClient.from('room_members').delete().eq('room_id', currentRoom.id).eq('user_id', uid);
        showToast('Игрок выгнан');
        loadRoomMembers(currentRoom.id);
      };
    });
  }

  // -------------------- INIT (load user and show appropriate screen) ------
  async function init() {
    // attach handlers for existing toolbar buttons in original HTML
    attachOriginalToolbarHandlers();

    // Load user from localStorage
    const u = auth.loadFromStorage();
    if (!u) {
      showAuthScreen();
    } else {
      auth.currentUser = u;
      showRoomsScreen();
    }
  }

  function attachOriginalToolbarHandlers() {
    // Hook up original save/load/clear buttons to new permission model
    const btnClearAll = document.getElementById('btnClearAll');
    if (btnClearAll) {
      btnClearAll.onclick = async () => {
        if (!currentRoom) { showToast('Не в комнате'); return; }
        if (auth.currentUser.id !== currentRoom.owner_user_id) { showToast('Только создатель может очищать карту'); return; }
        if (!confirm('Очистить карту?')) return;
        await clearAllMarkersInRoom();
      };
    }

    const btnSaveImage = document.getElementById('btnSaveImage');
    if (btnSaveImage) {
      btnSaveImage.onclick = () => {
        // keep original behavior: html2canvas capture
        try {
          html2canvas(document.getElementById('map'), { useCORS: true }).then(canvas => {
            const link = document.createElement('a');
            link.download = `mow2_map_${Date.now()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.92);
            link.click();
          });
        } catch (e) {
          showToast('Ошибка сохранения изображения');
        }
      };
    }

    const btnAssault = document.getElementById('btnAssault');
    if (btnAssault) {
      // Per TЗ: button "Наступление противника" may be removed. Hide it.
      btnAssault.style.display = 'none';
    }

    // Example: provide a hook to create markers from original UI (if original had createSymb button)
    // /* INTEGRATE WITH ORIGINAL: find original handlers like createSymbol(symbName) and replace with call to createMarker(symbName,x,y, rotation, meta) */
  }

  // -------------------- ONLOAD --------------------
  window.addEventListener('load', () => {
    try {
      init();
    } catch (e) {
      console.error('init error', e);
      showToast('Ошибка инициализации');
    }
  });

  // Expose a few functions to global for debugging / integration with original UI
  window.MOW2 = {
    createMarker,
    bulkCreateMarkers,
    commitMarkerMove,
    enterRoom,
    leaveRoom,
    auth
  };

})();
