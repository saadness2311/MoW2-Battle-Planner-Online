"use client";

import { supabase } from "./supabaseClient";

export type Profile = {
  id: string;
  nickname: string;
  role: string;
};

export function nicknameToEmail(nickname: string) {
  return `${nickname}@mow.local`;
}

export async function signUpWithNickname(nickname: string, password: string) {
  const email = nicknameToEmail(nickname);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname } },
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("Не удалось создать пользователя");

  const { error: profileError } = await supabase.from("profiles").insert({
    id: user.id,
    nickname,
  });
  if (profileError) throw profileError;
  return user;
}

export async function signInWithNickname(nickname: string, password: string) {
  const email = nicknameToEmail(nickname);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, role")
    .eq("id", authData.user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function requireAuth(): Promise<Profile | null> {
  const profile = await getCurrentProfile();
  if (!profile && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return profile;
}
