"use client";

import { useEffect, useState } from "react";
import { Room, RoomPlayer } from "@/lib/types";
import { Session } from "@/lib/auth";
import { giveTurn, takeTurn, clearFront, clearMap } from "@/lib/roomActions";
import EchelonCopyButton from "./EchelonCopyButton";
import UnitSlotsPanel from "./UnitSlotsPanel";
import SaveLoadPanel from "./SaveLoadPanel";

export default function RoomTopPanel({
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
  const isAdmin = room.owner_id === session.userId;
  const [activeSlot, setActiveSlot] = useState(0);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("SET_ACTIVE_SLOT", { detail: activeSlot })
    );
  }, [activeSlot]);

  return (
    <div className="w-full bg-neutral-800 p-3 flex flex-col gap-2 border-b border-neutral-700">
      <div className="flex justify-between items-center">
        <div className="text-xl font-bold">{room.name}</div>

        <div className="flex gap-4">
          {players.map((p) => (
            <div key={p.id} className="text-sm">
              <span
                className={
                  room.current_turn_user_id === p.user_id
                    ? "text-yellow-400 font-bold"
                    : ""
                }
              >
                {p.nickname}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {[0, 1, 2].map((idx) => (
              <button
                key={idx}
                onClick={() => setEchelon(idx)}
                className={`px-2 py-1 rounded text-sm ${
                  echelon === idx
                    ? "bg-yellow-500 text-black"
                    : "bg-neutral-700"
                }`}
              >
                Эш. {idx + 1}
              </button>
            ))}
          </div>

          <UnitSlotsPanel
            activeSlot={activeSlot}
            setActiveSlot={setActiveSlot}
          />
        </div>
      </div>

      <div className="flex justify-between items-center">
        {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              {players.map((p) => (
                <button
                  key={p.user_id}
                  onClick={() => giveTurn(room.id, p.user_id)}
                  className="px-2 py-1 bg-blue-500 hover:bg-blue-400 rounded text-sm"
                >
                  Ход → {p.nickname}
                </button>
              ))}
              <button
                onClick={() => takeTurn(room.id, session.userId)}
                className="px-2 py-1 bg-red-500 hover:bg-red-400 rounded text-sm"
              >
                Забрать ход
              </button>
            </div>

            <div className="flex gap-2 ml-4">
              <button
                onClick={() => clearFront(room.id, echelon)}
                className="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
              >
                Очистить фронт
              </button>

              <button
                onClick={() => clearMap(room.id, echelon)}
                className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
              >
                Очистить карту
              </button>

              <EchelonCopyButton roomId={room.id} from={0} to={1} />
              <EchelonCopyButton roomId={room.id} from={1} to={2} />
            </div>
          </div>
        )}

        {isAdmin && (
          <SaveLoadPanel
            roomId={room.id}
            userId={session.userId}
            echelon={echelon}
          />
        )}
      </div>
    </div>
  );
}
