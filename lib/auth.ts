"use client";

import { supabase } from "./supabaseClient";

// Build a domain from the configured Supabase URL so the hidden email we send to
// Supabase always passes validation, even when users only see nick/password.
const derivedEmailDomain = (() => {
  try {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (rawUrl) {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.replace(/:\d+$/, "");
      if (host && host.includes(".")) return host;
      if (host) return `${host}.localdomain`;
    }
  } catch (e) {
    console.warn("Failed to derive email domain from SUPABASE_URL", e);
  }
  return "supabase.localdomain";
})();

export type Profile = {
  id: string;
  nickname: string;
  role: string;
};

export function nicknameToEmail(nickname: string) {
  // Supabase still requires an email field, but users should only ever see/login with a nickname.
  // Convert the nickname into a conservative ASCII slug and pair it with a valid domain.
  const safe = nickname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const local = (safe || "user").slice(0, 64);
  return `${local}@${derivedEmailDomain}`;
}

function normalizePassword(password: string) {
  // Supabase enforces a minimum of 6 chars; pad silently to keep UX at >=1 char
  return password.length >= 6 ? password : password.padEnd(6, "*");
}

async function waitForProfile(userId: string, nickname: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (data?.id) return data;
    if (error && error.code !== "PGRST116") throw error;

    // If profile doesn't exist yet, attempt an upsert (will succeed when the
    // trigger already ran, and will insert when RLS allows it for the current user).
    await supabase
      .from("profiles")
      .upsert({ id: userId, nickname })
      .select("id")
      .maybeSingle();

    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Не удалось создать профиль. Попробуйте еще раз.");
}

export async function signUpWithNickname(nickname: string, password: string) {
  const email = nicknameToEmail(nickname);
  const authPassword = normalizePassword(password);
  const { data, error } = await supabase.auth.signUp({
    email,
    password: authPassword,
    options: { data: { nickname } },
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("Не удалось создать пользователя");

  await waitForProfile(user.id, nickname);
  return user;
}

export async function signInWithNickname(nickname: string, password: string) {
  const email = nicknameToEmail(nickname);
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
