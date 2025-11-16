"use client";

import { supabase } from "./supabaseClient";

export function subscribeRoom(roomId: string, reload: () => void) {
  return supabase
    .channel(`room_${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      reload
    )
    .subscribe();
}

export function subscribeRoomPlayers(roomId: string, reload: () => void) {
  return supabase
    .channel(`room_players_${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      reload
    )
    .subscribe();
}

export async function heartbeat(roomId: string, userId: string) {
  await supabase
    .from("room_players")
    .update({ last_seen_at: new Date().toISOString(), is_in_room: true })
    .eq("room_id", roomId)
    .eq("user_id", userId);
}
