"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Room } from "@/lib/types";
import { Session, clearSession, getSession } from "@/lib/auth";
import { createRoom, deleteRoom } from "@/lib/rooms";

export default function LobbyRoomList() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [session, setSessionState] = useState<Session | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/auth";
    } else {
      setSessionState(s);
      loadRooms();
    }
  }, []);

  async function loadRooms() {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false });
    setRooms((data as Room[]) || []);
  }

  async function handleCreate() {
    if (!session) return;
    if (name.trim().length < 3) {
      setError("Название минимум 3 символа");
      return;
    }
    const res = await createRoom(session, name.trim(), password);
    if ((res as any).error) {
      setError((res as any).error);
      return;
    }
    setName("");
    setPassword("");
    loadRooms();
  }

  async function handleDelete(roomId: string) {
    if (!session) return;
    await deleteRoom(roomId, session);
    loadRooms();
  }

  function logout() {
    clearSession();
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-6 flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xl font-bold">Лобби комнат</div>
          {session && (
            <div className="text-sm text-neutral-400">
              Вы вошли как {session.nickname}
            </div>
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль (опционально)"
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
        />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button
          onClick={handleCreate}
          className="px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold"
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
                  id: {r.id.slice(0, 8)}… · создатель: {r.owner_id.slice(0, 6)}…
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => (window.location.href = `/room/${r.id}`)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded"
                >
                  Войти
                </button>
                {session && session.userId === r.owner_id && (
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
