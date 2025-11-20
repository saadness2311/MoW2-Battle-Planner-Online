"use client";

import { supabase } from "./supabaseClient";
import { Profile } from "./auth";
import { hashPassword } from "./hashPassword";

export async function fetchRooms() {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createRoom(owner: Profile, name: string, password?: string, description?: string) {
  const passHash = password ? await hashPassword(password) : null;
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name,
      owner_id: owner.id,
      password_hash: passHash,
      description: description || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (data) {
    await supabase.from("room_users").insert({
      room_id: data.id,
      user_id: owner.id,
      role: "creator",
      is_active: true,
    });
    await supabase.from("room_permissions").upsert({
      room_id: data.id,
      editor_user_id: owner.id,
    });
  }
  return data?.id as string;
}

export async function joinRoom(profile: Profile, roomId: string, password?: string) {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("password_hash, max_players, owner_id, is_locked")
    .eq("id", roomId)
    .single();
  if (roomError || !room) throw roomError || new Error("Комната не найдена");

  if (room.is_locked) {
    throw new Error("Комната закрыта для входа");
  }

  if (room.password_hash) {
    const passHash = await hashPassword(password || "");
    if (passHash !== room.password_hash) {
      throw new Error("Неверный пароль комнаты");
    }
  }

  const { data: members } = await supabase
    .from("room_users")
    .select("id")
    .eq("room_id", roomId)
    .eq("is_active", true);
  if ((members || []).length >= (room.max_players || 50)) {
    throw new Error("Лимит игроков в комнате достигнут");
  }

  await supabase.from("room_users").upsert({
    room_id: roomId,
    user_id: profile.id,
    role: profile.id === room.owner_id ? "creator" : "spectator",
    is_active: true,
    last_seen_at: new Date().toISOString(),
  });
}

export async function leaveRoom(profile: Profile, roomId: string) {
  await supabase
    .from("room_users")
    .update({ is_active: false, last_seen_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", profile.id);
}

export async function deleteRoom(roomId: string, profile: Profile) {
  await supabase.from("rooms").delete().eq("id", roomId).eq("owner_id", profile.id);
}
