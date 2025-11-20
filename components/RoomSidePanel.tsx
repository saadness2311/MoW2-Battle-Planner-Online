"use client";

import { Session } from "@supabase/supabase-js";
import { Room, RoomPlayer } from "@/lib/types";
import UnitCatalog from "./UnitCatalog";

export default function RoomSidePanel({
  room,
  players,
  session,
  echelon,
  setEchelon
}: {
  room: Room;
  players: RoomPlayer[];
  session: Session;
  echelon: number;
  setEchelon: (v: number) => void;
}) {
  const myTurn = room.current_turn_user_id === session.user?.id;

  function setMode(mode: string) {
    window.dispatchEvent(new CustomEvent("SET_DRAW_MODE", { detail: mode }));
  }

  return (
    <div className="w-[260px] bg-neutral-900 border-r border-neutral-700 p-3 flex flex-col gap-4">
      <h2 className="text-lg font-bold">Инструменты</h2>

      {!myTurn && (
        <div className="text-neutral-400 text-sm">
          Сейчас не ваш ход. Инструменты недоступны.
        </div>
      )}

      {myTurn && (
        <div className="flex flex-col gap-2 text-sm">
          <button
            className="px-3 py-1 bg-neutral-700 rounded hover:bg-neutral-600"
            onClick={() => setMode("free")}
          >
            Свободная линия
          </button>
          <button
            className="px-3 py-1 bg-neutral-700 rounded hover:bg-neutral-600"
            onClick={() => setMode("line")}
          >
            Прямая линия
          </button>
          <button
            className="px-3 py-1 bg-neutral-700 rounded hover:bg-neutral-600"
            onClick={() => setMode("arrow")}
          >
            Стрелка
          </button>
          <button
            className="px-3 py-1 bg-neutral-700 rounded hover:bg-neutral-600"
            onClick={() => setMode("circle")}
          >
            Круг / зона
          </button>
          <button
            className="px-3 py-1 bg-neutral-700 rounded hover:bg-neutral-600"
            onClick={() => setMode("polygon")}
          >
            Многоугольник
          </button>
        </div>
      )}

      <div className="mt-4">
        <h2 className="text-lg font-bold mb-1">Каталог юнитов</h2>
        <UnitCatalog />
      </div>
    </div>
  );
}
