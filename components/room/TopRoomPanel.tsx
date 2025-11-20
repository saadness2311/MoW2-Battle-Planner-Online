// components/room/TopRoomPanel.tsx
"use client";

import { useState } from "react";
import type { PlayerInfo } from "../RoomLayout";

type TopRoomPanelProps = {
  roomName: string;
  players: PlayerInfo[];
  isAdmin: boolean;
  currentTurnNickname: string | null;
  onGiveTurn: (userId: string) => void;
  onTakeTurn: (userId: string) => void;
  onLockRoom: () => void;
  onSetEditor: (userId: string) => void;
};

export default function TopRoomPanel({
  roomName,
  players,
  isAdmin,
  currentTurnNickname,
  onGiveTurn,
  onTakeTurn,
  onLockRoom,
  onSetEditor,
}: TopRoomPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const currentPlayer = players.find((p) => p.isCurrentTurn) || null;

  return (
    <div className="bg-[#111216]/95 border border-zinc-800 rounded-xl px-3 py-2 shadow-lg shadow-black/40 min-w-[320px]">
      <div
        className="flex items-center justify-between gap-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex flex-col">
          <span className="text-xs text-zinc-400">Комната</span>
          <span className="text-sm font-semibold text-zinc-100 truncate max-w-[220px]">
            {roomName}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[11px] text-zinc-400">
            Ходит сейчас:
          </span>
          <span className="text-xs font-medium text-emerald-400">
            {currentTurnNickname || "— никто —"}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 border-t border-zinc-800 pt-2 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-zinc-400">
              Игроки в комнате: {players.length}
            </span>
            {isAdmin && (
              <button
                className="px-2 py-[2px] text-[11px] rounded bg-[#1f2933] border border-zinc-700 hover:border-yellow-400 text-zinc-200"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLockRoom();
                }}
              >
                Заблокировать вход
              </button>
            )}
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-[11px] bg-[#15171c] border border-zinc-800 rounded px-2 py-[3px]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "w-1.5 h-1.5 rounded-full",
                      p.isOwner
                        ? "bg-amber-400"
                        : p.isCurrentTurn
                        ? "bg-emerald-400"
                        : "bg-zinc-500",
                    ].join(" ")}
                  />
                  <span className="text-zinc-200 truncate max-w-[130px]">
                    {p.nickname}
                  </span>
                  {p.isOwner && (
                    <span className="text-[10px] text-amber-300 border border-amber-400/60 rounded px-1">
                      Админ
                    </span>
                  )}
                  {p.isCurrentTurn && !p.isOwner && (
                    <span className="text-[10px] text-emerald-300 border border-emerald-400/60 rounded px-1">
                      Ход
                    </span>
                  )}
                </div>

                {isAdmin && !p.isOwner && (
                  <div className="flex items-center gap-1">
                    <button
                      className="px-2 py-[1px] rounded bg-[#1f2933] border border-zinc-700 hover:border-amber-400 text-[10px] text-amber-200"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetEditor(p.id);
                      }}
                    >
                      Редакт.
                    </button>
                    {!p.isCurrentTurn ? (
                      <button
                        className="px-2 py-[1px] rounded bg-[#1f2933] border border-zinc-700 hover:border-emerald-400 text-[10px] text-emerald-300"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onGiveTurn(p.id);
                        }}
                      >
                        Дать ход
                      </button>
                    ) : (
                      <button
                        className="px-2 py-[1px] rounded bg-[#1f2933] border border-zinc-700 hover:border-red-400 text-[10px] text-red-300"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTakeTurn(p.id);
                        }}
                      >
                        Отобрать ход
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {players.length === 0 && (
              <div className="text-[11px] text-zinc-500">
                Пока никого нет...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
