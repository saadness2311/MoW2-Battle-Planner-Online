"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type LogRow = {
  id: number;
  room_id: string;
  user_id: string | null;
  level: string;
  message: string;
  created_at: string;
};

export default function LogsPanel({ roomId }: { roomId: string }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    load();

    const channel = supabase
      .channel(`logs_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "logs",
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          const row = payload.new as LogRow;
          setLogs((prev) => [...prev, row]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  async function load() {
    const { data } = await supabase
      .from("logs")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    setLogs((data as LogRow[]) || []);
  }

  return (
    <div className="absolute bottom-2 left-2 text-xs z-[1500]">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 bg-neutral-700 rounded hover:bg-neutral-600"
      >
        {open ? "Скрыть логи" : "Логи"}
      </button>

      {open && (
        <div className="mt-2 p-2 bg-neutral-800 border border-neutral-600 rounded max-h-64 w-80 overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className={
                log.level === "error"
                  ? "text-red-400"
                  : log.level === "warn"
                  ? "text-yellow-300"
                  : "text-neutral-200"
              }
            >
              <span className="text-neutral-500">
                {log.created_at.slice(11, 19)}
              </span>{" "}
              <b>[{log.level}]</b> {log.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
