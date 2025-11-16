"use client";

import { supabase } from "./supabaseClient";
import { logInfo, logError } from "./logger";

export async function copyEchelon(
  roomId: string,
  fromEchelon: number,
  toEchelon: number
) {
  try {
    const { data: units } = await supabase
      .from("units")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon_index", fromEchelon);

    if (units && units.length > 0) {
      const clonedUnits = units.map((u: any) => ({
        room_id: roomId,
        echelon_index: toEchelon,
        type: u.type,
        x: u.x,
        y: u.y,
        z_index: u.z_index,
        symbol_name: u.symbol_name,
        owner_user: u.owner_user,
        owner_slot: u.owner_slot
      }));
      await supabase.from("units").insert(clonedUnits);
    }

    const { data: drawings } = await supabase
      .from("drawings")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon_index", fromEchelon);

    if (drawings && drawings.length > 0) {
      const clonedDrawings = drawings.map((d: any) => ({
        room_id: roomId,
        echelon_index: toEchelon,
        type: d.type,
        points: d.points,
        style: d.style
      }));
      await supabase.from("drawings").insert(clonedDrawings);
    }

    logInfo(`Эшелон ${fromEchelon + 1} скопирован в ${toEchelon + 1}`);
    return { success: true };
  } catch (e) {
    logError("Ошибка копирования эшелона", { error: String(e) });
    return { success: false, error: String(e) };
  }
}
