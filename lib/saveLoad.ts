"use client";

import { supabase } from "./supabaseClient";
import { logError, logInfo } from "./logger";

export async function savePlan(roomId: string, userId: string, echelon: number) {
  try {
    const { data: units } = await supabase
      .from("room_units")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon", echelon);

    const { data: symbols } = await supabase
      .from("room_symbols")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon", echelon);

    const { data: drawings } = await supabase
      .from("room_drawings")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon", echelon);

    const plan = {
      version: 1,
      room_id: roomId,
      echelon,
      units,
      symbols,
      drawings,
    };

    await supabase.from("action_logs").insert({
      room_id: roomId,
      user_id: userId,
      action: "plan_saved",
      details: { echelon },
    });

    downloadPlanAsJSON(plan);
    logInfo("План сохранён");
    return plan;
  } catch (e) {
    logError("Ошибка сохранения плана", { error: String(e) });
  }
}

export function downloadPlanAsJSON(plan: any) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `battle_plan_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadPlanFromJSON(roomId: string, echelon: number, json: any) {
  try {
    await supabase
      .from("room_units")
      .delete()
      .eq("room_id", roomId)
      .eq("echelon", echelon);
    await supabase
      .from("room_symbols")
      .delete()
      .eq("room_id", roomId)
      .eq("echelon", echelon);
    await supabase
      .from("room_drawings")
      .delete()
      .eq("room_id", roomId)
      .eq("echelon", echelon);

    if (json.units && json.units.length > 0) {
      const newUnits = json.units.map((u: any) => ({
        room_id: roomId,
        echelon,
        type: u.type,
        x: u.x,
        y: u.y,
        z_index: u.z_index,
        symbol_key: u.symbol_key,
        team: u.team,
        slot: u.slot,
        nickname: u.nickname,
      }));
      await supabase.from("room_units").insert(newUnits);
    }

    if (json.symbols && json.symbols.length > 0) {
      const newSymbols = json.symbols.map((s: any) => ({
        room_id: roomId,
        echelon,
        symbol_key: s.symbol_key,
        x: s.x,
        y: s.y,
      }));
      await supabase.from("room_symbols").insert(newSymbols);
    }

    if (json.drawings && json.drawings.length > 0) {
      const newDrawings = json.drawings.map((d: any) => ({
        room_id: roomId,
        echelon,
        type: d.type,
        points: d.points,
        style: d.style,
      }));
      await supabase.from("room_drawings").insert(newDrawings);
    }

    logInfo("План успешно загружен");
    return true;
  } catch (e) {
    logError("Ошибка загрузки плана", { error: String(e) });
    return false;
  }
}
