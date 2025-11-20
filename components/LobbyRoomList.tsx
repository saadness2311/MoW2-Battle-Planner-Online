"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Profile, getCurrentProfile, signOut } from "@/lib/auth";
import { createRoom, deleteRoom, fetchRooms, joinRoom } from "@/lib/rooms";
import { Room } from "@/lib/types";

export default function LobbyRoomList() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [description, setDescription] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canCreate = useMemo(() => name.trim().length >= 3, [name]);

  useEffect(() => {
    async function init() {
      const p = await getCurrentProfile();
      if (!p) {
        window.location.href = "/login";
        return;
      }
      setProfile(p);
      loadRooms();

      const channel = supabase
        .channel("rooms-list")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms" },
          () => loadRooms(),
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
    init();
  }, []);

  async function loadRooms() {
    try {
      const data = await fetchRooms();
      setRooms(data as Room[]);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreate() {
    if (!profile) return;
    try {
      const roomId = await createRoom(profile, name.trim(), password || undefined, description || undefined);
      setName("");
      setPassword("");
      setDescription("");
      if (roomId) window.location.href = `/room/${roomId}`;
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleJoin(roomId: string) {
    if (!profile) return;
    try {
      await joinRoom(profile, roomId, roomPassword || undefined);
      window.location.href = `/room/${roomId}`;
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(roomId: string) {
    if (!profile) return;
    await deleteRoom(roomId, profile);
  }

  function logout() {
    signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xl font-bold">Лобби комнат</div>
          {profile && (
            <div className="text-sm text-neutral-400">Вы вошли как {profile.nickname}</div>
          )}
        </div>

        <button
          onClick={logout}
          className="px-3 py-1 text-sm bg-neutral-800 rounded hover:bg-neutral-700"
        >
          Выйти
        </button>
      </div>

      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex flex-col gap-3 max-w-xl">
        <div className="font-semibold">Создать комнату</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название комнаты"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание (опционально)"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль (опционально)"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
        />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold disabled:opacity-50"
        >
          Создать
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-neutral-800 border border-neutral-700 rounded-lg p-4">
        <div className="font-semibold mb-3">Список комнат</div>
        <div className="flex flex-col gap-2">
          {rooms.map((r) => (
            <div
              key={r.id}
              className="flex justify-between items-center bg-neutral-900 rounded px-3 py-2 text-sm"
            >
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-neutral-400">
                  id: {r.id.slice(0, 8)}… · игроков: {r.max_players} · карта: {r.map_id || "map1"}
                </div>
                {r.description && <div className="text-neutral-400 text-xs">{r.description}</div>}
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="password"
                  placeholder="Пароль"
                  className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs"
                  onChange={(e) => setRoomPassword(e.target.value)}
                />
                <button
                  onClick={() => handleJoin(r.id)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded"
                >
                  Войти
                </button>
                {profile && profile.id === r.owner_id && (
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}

          {rooms.length === 0 && (
            <div className="text-neutral-400 text-sm">Комнат пока нет</div>
          )}
        </div>
      </div>
    </div>
  );
}
