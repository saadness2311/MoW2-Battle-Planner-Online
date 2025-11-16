"use client";

import { supabase } from "./supabaseClient";
import { logError, logInfo } from "./logger";

export async function savePlan(roomId: string, userId: string, echelon: number) {
  try {
    const { data: units } = await supabase
      .from("units")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon_index", echelon);

    const { data: drawings } = await supabase
      .from("drawings")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon_index", echelon);

    const plan = {
      version: 1,
      room_id: roomId,
      echelon_index: echelon,
      units,
      drawings
    };

    await supabase.from("plans").insert({
      room_id: roomId,
      user_id: userId,
      title: `План ${new Date().toLocaleString()}`,
      data: plan
    });

    logInfo("План сохранён");
    return plan;
  } catch (e) {
    logError("Ошибка сохранения плана", { error: String(e) });
  }
}

export function downloadPlanAsJSON(plan: any) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], {
    type: "application/json"
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
      .from("units")
      .delete()
      .eq("room_id", roomId)
      .eq("echelon_index", echelon);
    await supabase
      .from("drawings")
      .delete()
      .eq("room_id", roomId)
      .eq("echelon_index", echelon);

    if (json.units && json.units.length > 0) {
      const newUnits = json.units.map((u: any) => ({
        room_id: roomId,
        echelon_index: echelon,
        type: u.type,
        x: u.x,
        y: u.y,
        z_index: u.z_index,
        symbol_name: u.symbol_name,
        owner_user: u.owner_user,
        owner_slot: u.owner_slot
      }));
      await supabase.from("units").insert(newUnits);
    }

    if (json.drawings && json.drawings.length > 0) {
      const newDrawings = json.drawings.map((d: any) => ({
        room_id: roomId,
        echelon_index: echelon,
        type: d.type,
        points: d.points,
        style: d.style
      }));
      await supabase.from("drawings").insert(newDrawings);
    }

    logInfo("План успешно загружен");
    return true;
  } catch (e) {
    logError("Ошибка загрузки плана", { error: String(e) });
    return false;
  }
}
