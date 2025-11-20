"use client";

import { supabase } from "./supabaseClient";

export type Profile = {
  id: string;
  nickname: string;
  role: string;
};

function normalizePassword(password: string) {
  // Supabase enforces a minimum of 6 chars; pad silently to keep UX at >=1 char
  return password.length >= 6 ? password : password.padEnd(6, "*");
}

function normalizeNickname(nickname: string) {
  return nickname.trim();
}

async function resolveEmailForNickname(nickname: string) {
  const { data, error } = await supabase.rpc("auth_email_for_nickname", {
    p_nickname: nickname,
  });
  if (error || !data) {
    throw new Error(
      "Не удалось найти пользователя. Проверьте ник или зарегистрируйтесь заново."
    );
  }
  return data as string;
}

export async function signUpWithNickname(nickname: string, password: string) {
  const cleanNick = normalizeNickname(nickname);
  const authPassword = normalizePassword(password);

  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: cleanNick, password: authPassword }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Не удалось создать пользователя");
  }

  const { email } = (await res.json()) as { email: string };

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: authPassword,
  });
  if (error) throw error;
}

export async function signInWithNickname(nickname: string, password: string) {
  const cleanNick = normalizeNickname(nickname);
  const email = await resolveEmailForNickname(cleanNick);
  const authPassword = normalizePassword(password);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: authPassword,
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
