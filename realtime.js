/* realtime.js
   Полностью переработанная версия:
   - Без никнеймов вообще
   - Меню комнат можно свернуть и развернуть
   - Сохраняется оригинальный дизайн
*/
(function(){
  function el(id){return document.getElementById(id);}
  function nowTs(){return Date.now();}
  const ROOMS_KEY = 'mow2_rooms_v1';

  function loadRooms(){
    try{
      const raw = localStorage.getItem(ROOMS_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){return {};}
  }
  function saveRooms(obj){ localStorage.setItem(ROOMS_KEY, JSON.stringify(obj)); }

  function escapeHtml(s){
    return (s+'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function renderRooms(){
    const listDiv = el('rooms-list');
    const rooms = loadRooms();
    listDiv.innerHTML = '';
    const names = Object.keys(rooms).sort();
    if(names.length===0){
      listDiv.innerHTML = '<div style="color:#666">Комнат пока нет</div>';
      return;
    }
    names.forEach(name=>{
      const r = rooms[name];
      const row = document.createElement('div');
      row.style.padding='6px 0';
      row.style.borderBottom='1px solid #eee';
      row.innerHTML = '<strong>'+escapeHtml(name)+'</strong> — ' + (r.count||0) + ' игроков ' + (r.pass ? '🔒' : '');
      const joinBtn = document.createElement('button');
      joinBtn.textContent = 'Присоединиться';
      joinBtn.style.marginLeft='8px';
      joinBtn.onclick = ()=>{ promptJoin(name); };
      row.appendChild(joinBtn);
      listDiv.appendChild(row);
    });
  }

  function promptJoin(name){
    const rooms = loadRooms();
    const r = rooms[name];
    if(!r){ alert('Комната не найдена'); renderRooms(); return; }
    if(r.pass){
      const p = prompt('Введите пароль для комнаты "'+name+'":');
      if(p===null) return;
      if(p !== r.pass){
        alert('Неверный пароль');
        return;
      }
    }
    const roomLink = location.origin + location.pathname + '#room=' + encodeURIComponent(r.id);
    location.href = roomLink;
  }

  
function createRoom(name, pass){
    const rooms = loadRooms();
    if(!name || !name.trim()) throw new Error('empty-name');
    if(rooms[name]) throw new Error('name-exists');
    const id = 'r' + Math.random().toString(36).slice(2,10);
    rooms[name] = { id: id, name: name, pass: pass || '', created: nowTs(), count: 0 };
    saveRooms(rooms);

    // Try to broadcast via TogetherJS hub without starting TogetherJS UI.
    try {
      if (typeof TogetherJS !== 'undefined' && TogetherJS.hub && TogetherJS.hub.emit) {
        TogetherJS.hub.emit("announce-room", { room: rooms[name] });
      } else if (typeof TogetherJS !== 'undefined' && TogetherJS.running) {
        TogetherJS.send({ type: 'announce-room', room: rooms[name] });
      }
    } catch(e) {
      console.error('announce-room emit failed', e);
    }

    return rooms[name];
  }


  function updateCountForRoomId(roomId, delta){
    const rooms = loadRooms();
    let changed=false;
    for(const name in rooms){
      if(rooms[name].id === roomId){
        rooms[name].count = Math.max(0, (rooms[name].count||0) + delta);
        changed=true;
      }
    }
    if(changed) saveRooms(rooms);
  }

  document.addEventListener('DOMContentLoaded', function(){
    // TogetherJS hub listener to receive announce-room from other pages (no UI start).
    try {
      if (typeof TogetherJS !== 'undefined' && TogetherJS.hub && TogetherJS.hub.on) {
        TogetherJS.hub.on("announce-room", function(data) {
          try {
            if (!data || !data.room) return;
            const rooms = loadRooms();
            if (!rooms[data.room.name]) {
              rooms[data.room.name] = data.room;
              saveRooms(rooms);
              renderRooms();
            }
          } catch(e) { console.error('announce-room handler', e); }
        });
      }
    } catch(e) { console.error('TogetherJS hub setup', e); }

    const btnShow = el('btn-show-create');
    const createForm = el('create-form');
    const btnCancel = el('btn-cancel-create');
    const btnCreate = el('btn-create-room');
    const roomLinkDiv = el('room-link');
    const createError = el('create-error');
    const overlay = el('rooms-overlay');

    // 🧩 Добавляем кнопку сворачивания/разворачивания меню комнат
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'rooms-toggle';
    toggleBtn.textContent = 'Комнаты ⤢';
    Object.assign(toggleBtn.style, {
      position: 'fixed',
      top: '10px',
      left: '10px',
      zIndex: 9999,
      display: 'none',
      padding: '6px 10px',
      borderRadius: '8px',
      border: '1px solid #888',
      background: '#fff',
      cursor: 'pointer',
      fontSize: '14px'
    });
    document.body.appendChild(toggleBtn);

    let overlayVisible = true;
    toggleBtn.onclick = ()=>{
      overlayVisible = !overlayVisible;
      overlay.style.display = overlayVisible ? 'block' : 'none';
    };

    btnShow.onclick = ()=>{
      createForm.style.display='block';
      btnShow.style.display='none';
    };
    btnCancel.onclick = ()=>{
      createForm.style.display='none';
      btnShow.style.display='inline-block';
      roomLinkDiv.style.display='none';
      createError.innerText='';
    };

    btnCreate.onclick = ()=>{
      createError.innerText = '';
      const name = el('room-name').value.trim();
      const pass = el('room-pass').value;
      try{
        const roomObj = createRoom(name, pass);
        const link = location.origin + location.pathname + '#room=' + encodeURIComponent(roomObj.id);
        roomLinkDiv.innerHTML = '<div>Ссылка: <a href="'+link+'">'+link+'</a></div>';
        roomLinkDiv.style.display='block';
        startTogether(roomObj.id);
      }catch(e){
        if(e.message === 'empty-name') createError.innerText = 'Название не может быть пустым';
        else if(e.message === 'name-exists') createError.innerText = 'Комната с таким названием уже существует';
        else createError.innerText = 'Ошибка: ' + e.message;
      }
      renderRooms();
    };

    renderRooms();
    setInterval(renderRooms, 5000);

    function parseHash(){
      const h = location.hash.substring(1);
      const params = {};
      h.split('&').forEach(part=>{
        const kv = part.split('=');
        if(kv[0]) params[kv[0]] = decodeURIComponent((kv[1]||''));
      });
      return params;
    }

    const params = parseHash();
    if(params.room){ startTogether(params.room); }

    window.startTogether = function(roomId){
      if(!window.TogetherJS){
        alert('TogetherJS не загружен.');
        return;
      }

      TogetherJS.config_getUserName = () => 'Игрок';
      TogetherJS();

      TogetherJS.on("ready", function () {
        // скрываем панель комнат
        overlay.style.display = 'none';
        toggleBtn.style.display = 'block';
        overlayVisible = false;

        updateCountForRoomId(roomId, 1);
        renderRooms();

        const roomsObj = loadRooms();
        for(const nm in roomsObj){
          TogetherJS.send({type:'announce-room', room: roomsObj[nm]});
        }
        TogetherJS.send({type:'presence','roomId':roomId});
      });

      TogetherJS.on("close", function () {
        overlay.style.display = 'block';
        toggleBtn.style.display = 'none';
        overlayVisible = true;
        const pr = parseHash();
        if(pr.room) updateCountForRoomId(pr.room, -1);
        renderRooms();
      });

      TogetherJS.hub.on("togetherjs.msg", function (msg) {
        try{
          const data = msg.msg;
          if(!data || !data.type) return;
          if(data.type === 'announce-room'){
            const rooms = loadRooms();
            if(!rooms[data.room.name]){
              rooms[data.room.name] = data.room;
              saveRooms(rooms);
              renderRooms();
            }
          }else if(data.type === 'map-action'){
            const ev = new CustomEvent('realtime-map-action', {detail: data});
            window.dispatchEvent(ev);
          }else if(data.type === 'presence'){
            if(data.roomId){
              updateCountForRoomId(data.roomId, 1);
              renderRooms();
            }
          }
        }catch(e){ console.error(e); }
      });

      window.sendMapAction = function(action){
        action._ts = nowTs();
        if(window.TogetherJS && TogetherJS.running){
          TogetherJS.send({type:'map-action', action: action});
        }
      };
    };

    window.addEventListener('storage', function(e){
      if(e.key === ROOMS_KEY) renderRooms();
    });

  });
})();
