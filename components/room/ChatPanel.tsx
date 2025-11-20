"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Profile } from "@/lib/auth";

const LIMIT = 200;

export default function ChatPanel({ roomId, profile }: { roomId: string; profile: Profile }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [lastSent, setLastSent] = useState<number>(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel(`chat-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => [payload.new, ...prev].slice(0, LIMIT));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  async function loadMessages() {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, content, created_at, user_id")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    setMessages(data || []);
  }

  async function sendMessage() {
    if (!text.trim()) return;
    const now = Date.now();
    if (now - lastSent < 1000) return; // 1 msg per second
    setLastSent(now);

    await supabase.from("chat_messages").insert({
      room_id: roomId,
      user_id: profile.id,
      content: text.trim().slice(0, 500),
    });
    setText("");
  }

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="h-full w-80 bg-[#0f1116]/95 border-l border-neutral-800 flex flex-col">
      <div className="px-3 py-2 border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-400">
        Чат комнаты
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-2 px-3 py-2 text-sm">
        {messages.map((m) => (
          <div key={m.id} className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200">
            <div className="text-[10px] text-neutral-500">
              {new Date(m.created_at).toLocaleTimeString()} · {m.user_id.slice(0, 6)}
            </div>
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-neutral-800 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm resize-none h-16"
          placeholder="Сообщение"
        />
        <button
          onClick={sendMessage}
          className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1 text-sm"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
