"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { subscribeRoom, subscribeRoomPlayers, heartbeat } from "@/lib/roomRealtime";
import { Room, RoomPlayer } from "@/lib/types";
import RoomTopPanel from "./RoomTopPanel";
import RoomSidePanel from "./RoomSidePanel";
import PhaserGame from "./PhaserGame";
import { Session } from "@/lib/auth";
import LogsPanel from "./LogsPanel";

export default function RoomLayout({
  roomId,
  session
}: {
  roomId: string;
  session: Session;
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [echelon, setEchelon] = useState(0);

  async function loadRoom() {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    if (data) setRoom(data as Room);
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from("room_players")
      .select("id, room_id, user_id, joined_at, last_seen_at, is_in_room, users(nickname)")
      .eq("room_id", roomId);

    if (data) {
      setPlayers(
        (data as any[]).map((p) => ({
          ...p,
          nickname: p.users.nickname
        }))
      );
    }
  }

  useEffect(() => {
    loadRoom();
    loadPlayers();

    if (typeof window !== "undefined") {
      window.mow2RoomId = roomId;
      window.mow2UserId = session.userId;
    }

    const channelRoom = subscribeRoom(roomId, loadRoom);
    const channelPlayers = subscribeRoomPlayers(roomId, loadPlayers);

    const hb = setInterval(() => {
      heartbeat(roomId, session.userId);
    }, 4000);

    return () => {
      supabase.removeChannel(channelRoom);
      supabase.removeChannel(channelPlayers);
      clearInterval(hb);
    };
  }, [roomId, session.userId]);

  if (!room) return <div className="text-center p-6">Загрузка комнаты...</div>;

  return (
    <div className="w-full h-full overflow-hidden relative flex flex-col">
      <RoomTopPanel
        room={room}
        players={players}
        session={session}
        echelon={echelon}
        setEchelon={setEchelon}
      />

      <div className="flex flex-1 overflow-hidden">
        <RoomSidePanel
          room={room}
          players={players}
          session={session}
          echelon={echelon}
          setEchelon={setEchelon}
        />

        <div className="flex-1 relative bg-black">
          <PhaserGame roomId={roomId} session={session} echelon={echelon} room={room} />
          <LogsPanel roomId={roomId} />
        </div>
      </div>
    </div>
  );
}
