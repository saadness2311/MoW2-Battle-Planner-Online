"use client";

import { supabase } from "./supabaseClient";

declare global {
  interface Window {
    mow2RoomId?: string;
    mow2UserId?: string;
  }
}

export async function logInfo(message: string, details: any = {}) {
  await sendLog("info", message, details);
}

export async function logWarn(message: string, details: any = {}) {
  await sendLog("warn", message, details);
}

export async function logError(message: string, details: any = {}) {
  await sendLog("error", message, details);
}

async function sendLog(level: string, message: string, details: any) {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: `${level.toUpperCase()}: ${message}`
        })
      );
    }

    if (typeof window === "undefined") return;
    if (!window.mow2RoomId) return;

    await supabase.from("logs").insert({
      room_id: window.mow2RoomId,
      user_id: window.mow2UserId || null,
      level,
      message,
      details
    });
  } catch (e) {
    console.warn("LOG SYSTEM ERROR", e);
  }
}
