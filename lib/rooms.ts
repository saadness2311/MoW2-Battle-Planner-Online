"use client";

import { supabase } from "./supabaseClient";
import { hashPassword } from "./hashPassword";
import type { Session } from "./auth";

export async function createRoom(
  session: Session,
  name: string,
  password?: string
) {
  let password_hash = null;
  if (password && password.length > 0) {
    password_hash = await hashPassword(password);
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name,
      owner_id: session.userId,
      password_hash,
      current_turn_user_id: session.userId
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { success: true, roomId: data.id };
}

export async function deleteRoom(roomId: string, session: Session) {
  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", roomId)
    .eq("owner_id", session.userId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function checkRoomPassword(roomId: string, password: string) {
  const { data, error } = await supabase
    .from("rooms")
    .select("password_hash")
    .eq("id", roomId)
    .single();

  if (error || !data) return { error: "Комната не найдена" };

  if (!data.password_hash) return { success: true };

  const hashed = await hashPassword(password);
  if (hashed !== data.password_hash) return { error: "Неверный пароль комнаты" };

  return { success: true };
}

export async function joinRoom(roomId: string, session: Session) {
  const { data: existing } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("room_players").insert({
      room_id: roomId,
      user_id: session.userId
    });
    if (error) return { error: error.message };
  }

  return { success: true };
}
