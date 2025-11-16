"use client";

import { supabase } from "./supabaseClient";

export async function giveTurn(roomId: string, userId: string) {
  return await supabase
    .from("rooms")
    .update({ current_turn_user_id: userId })
    .eq("id", roomId);
}

export async function takeTurn(roomId: string, adminId: string) {
  return await supabase
    .from("rooms")
    .update({ current_turn_user_id: adminId })
    .eq("id", roomId);
}

export async function clearFront(roomId: string, echelon: number) {
  await supabase
    .from("drawings")
    .delete()
    .eq("room_id", roomId)
    .eq("echelon_index", echelon);
}

export async function clearMap(roomId: string, echelon: number) {
  await supabase
    .from("units")
    .delete()
    .eq("room_id", roomId)
    .eq("echelon_index", echelon);
}
