/* realtime.js
 Client-side "magic link" rooms using TogetherJS.
 - Creates rooms by generating an id and sharing a link with #room=<id>&nick=<nick>
 - Stores room metadata in localStorage and announces via TogetherJS when connected
 - Rooms list auto-updates from localStorage every 5 seconds and on TogetherJS announcements
 - Passwords are stored client-side (localStorage). This is a "super-simple" solution without servers.
 - Conflict resolution: "last-wins" — every action carries a timestamp and is applied if newer.
 - Integrates with existing script.js by sending/receiving 'map-action' messages that include action details.
*/
(function(){
  function el(id){return document.getElementById(id);}
  function qs(sel){return document.querySelector(sel);}
  function nowTs(){return Date.now();}
  const ROOMS_KEY = 'mow2_rooms_v1';

  function loadRooms(){
    try{
      const raw = localStorage.getItem(ROOMS_KEY);
      if(!raw) return {};
      return JSON.parse(raw);
    }catch(e){return {};}
  }
  function saveRooms(obj){
    localStorage.setItem(ROOMS_KEY, JSON.stringify(obj));
  }

  function renderRooms(){
    const listDiv = el('rooms-list');
    const rooms = loadRooms();
    listDiv.innerHTML = '';
    const names = Object.keys(rooms).sort();
    if(names.length===0){ listDiv.innerHTML = '<div style="color:#666">Комнат пока нет</div>'; return; }
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

  function escapeHtml(s){ return (s+'').replace(/[&<>"\']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }

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
    const nick = prompt('Введите никнейм:', localStorage.getItem('mow2_nick')||'Игрок');
    if(!nick) return;
    localStorage.setItem('mow2_nick', nick);
    const roomLink = location.origin + location.pathname + '#room=' + encodeURIComponent(r.id) + '&nick=' + encodeURIComponent(nick);
    location.href = roomLink;
  }

  function createRoom(name, pass, nick){
    const rooms = loadRooms();
    if(!name || !name.trim()) { throw new Error('empty-name'); }
    if(rooms[name]) { throw new Error('name-exists'); }
    const id = 'r' + Math.random().toString(36).slice(2,10);
    rooms[name] = { id: id, name: name, pass: pass || '', created: nowTs(), count: 0 };
    saveRooms(rooms);
    localStorage.setItem('mow2_nick', nick||'Игрок');
    if(window.TogetherJS && TogetherJS.running){
      TogetherJS.send({type:'announce-room', room: rooms[name]});
    }
    return rooms[name];
  }

  function announceRoomToConnected(roomObj){
    if(window.TogetherJS && TogetherJS.running){
      TogetherJS.send({type:'announce-room', room: roomObj});
    }
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
    const btnShow = el('btn-show-create');
    const createForm = el('create-form');
    const btnCancel = el('btn-cancel-create');
    const btnCreate = el('btn-create-room');
    const roomLinkDiv = el('room-link');
    const createError = el('create-error');

    btnShow.onclick = ()=>{ createForm.style.display='block'; btnShow.style.display='none'; };
    btnCancel.onclick = ()=>{ createForm.style.display='none'; btnShow.style.display='inline-block'; roomLinkDiv.style.display='none'; createError.innerText=''; };

    btnCreate.onclick = ()=>{
      createError.innerText = '';
      const name = el('room-name').value.trim();
      const pass = el('room-pass').value;
      const nick = el('nick-name').value.trim() || localStorage.getItem('mow2_nick') || 'Игрок';
      try{
        const roomObj = createRoom(name, pass, nick);
        const link = location.origin + location.pathname + '#room=' + encodeURIComponent(roomObj.id) + '&nick=' + encodeURIComponent(nick);
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
    if(params.room){
      if(params.nick) localStorage.setItem('mow2_nick', params.nick);
      startTogether(params.room);
    }

    if(window.TogetherJS){}

    window.startTogether = function(roomId){
      if(!window.TogetherJS){
        alert('TogetherJS script не загружен. Проверьте подключение к интернету.');
        return;
      }
      TogetherJS.config_getUserName = function () {
        return localStorage.getItem('mow2_nick') || 'Игрок';
      };
      TogetherJS();

      TogetherJS.on("ready", function () {
        // 🔹 Скрываем меню выбора комнаты при подключении
        const overlay = document.getElementById('rooms-overlay');
        if (overlay) overlay.style.display = 'none';

        updateCountForRoomId(roomId, 1);
        renderRooms();
        const roomsObj = loadRooms();
        for(const nm in roomsObj){
          TogetherJS.send({type:'announce-room', room: roomsObj[nm]});
        }
        TogetherJS.send({type:'presence','roomId':roomId});
      });

      TogetherJS.on("close", function () {
        // 🔹 Показываем меню обратно при отключении
        const overlay = document.getElementById('rooms-overlay');
        if (overlay) overlay.style.display = 'block';

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
        action._from = localStorage.getItem('mow2_nick') || 'Игрок';
        if(window.TogetherJS && TogetherJS.running){
          TogetherJS.send({type:'map-action', action: action});
        }
      };
    };

    window.addEventListener('storage', function(e){
      if(e.key === ROOMS_KEY){
        renderRooms();
      }
    });

  });
})();
