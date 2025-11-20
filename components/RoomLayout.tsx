"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Profile, getCurrentProfile } from "@/lib/auth";
import { Room } from "@/lib/types";
import PhaserGame from "./PhaserGame";
import SidebarControls from "./room/SidebarControls";
import TopRoomPanel from "./room/TopRoomPanel";
import EchelonSwitcher from "./room/EchelonSwitcher";
import SaveLoadPanel from "./SaveLoadPanel";
import ChatPanel from "./room/ChatPanel";
import LogsPanel from "./LogsPanel";
import { savePlan, loadPlanFromJSON } from "@/lib/saveLoad";
import { joinRoom } from "@/lib/rooms";
import { logInfo } from "@/lib/logger";
import EchelonCopyButton from "./EchelonCopyButton";

export type PlayerInfo = {
  id: string;
  nickname: string;
  role: string;
  isOwner: boolean;
  isCurrentTurn: boolean;
  isEditor: boolean;
};

type RoomLayoutProps = {
  roomId: string;
};

const ECHELONS = 3;

export type DrawingMode = "none" | "front" | "enemy";

export default function RoomLayout({ roomId }: RoomLayoutProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [currentEchelon, setCurrentEchelon] = useState(0);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>("none");
  const [drawingsVersion, setDrawingsVersion] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedOwnerSlot, setSelectedOwnerSlot] = useState<number | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const planFileRef = useRef<HTMLInputElement | null>(null);

  const isOwner = useMemo(() => room && profile && room.owner_id === profile.id, [room, profile]);
  const isCurrentTurn = useMemo(() => room && profile && room.current_turn_user_id === profile.id, [room, profile]);
  const isEditor = useMemo(() => room && profile && room.editing_user_id === profile.id, [room, profile]);

  const canControl = useMemo(
    () => !!profile && (!!isOwner || (isCurrentTurn && isEditor)),
    [profile, isOwner, isCurrentTurn, isEditor],
  );

  const currentTurnNickname = useMemo(
    () => players.find((p) => p.isCurrentTurn)?.nickname || null,
    [players],
  );

  useEffect(() => {
    async function init() {
      const p = await getCurrentProfile();
      if (!p) {
        window.location.href = "/login";
        return;
      }
      setProfile(p);
      await joinRoom(p, roomId).catch(() => {});
      await reloadRoom();
      await reloadPlayers();

      const roomChannel = supabase
        .channel(`room-${roomId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
          reloadRoom,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "room_users", filter: `room_id=eq.${roomId}` },
          reloadPlayers,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "room_permissions", filter: `room_id=eq.${roomId}` },
          reloadRoom,
        )
        .subscribe();

      const hb = setInterval(() => {
        if (!p) return;
        supabase
          .from("room_users")
          .update({ last_seen_at: new Date().toISOString(), is_active: true })
          .eq("room_id", roomId)
          .eq("user_id", p.id);
      }, 20000);

      return () => {
        clearInterval(hb);
        supabase.removeChannel(roomChannel);
      };
    }
    init();
  }, [roomId]);

  async function reloadRoom() {
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, owner_id, current_turn_user_id, editing_user_id, map_id, is_locked, max_players")
      .eq("id", roomId)
      .single();
    if (error) return;
    setRoom(data as Room);
  }

  async function reloadPlayers() {
    const { data, error } = await supabase
      .from("room_users")
      .select("user_id, role, room_id")
      .eq("room_id", roomId)
      .eq("is_active", true);
    if (error) return;
    const ids = (data || []).map((r) => r.user_id);
    if (ids.length === 0) {
      setPlayers([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", ids);
    setPlayers(
      (data || []).map((rp) => {
        const prof = profiles?.find((p) => p.id === rp.user_id);
        return {
          id: rp.user_id,
          nickname: prof?.nickname || "Игрок",
          role: rp.role,
          isOwner: room?.owner_id === rp.user_id,
          isCurrentTurn: room?.current_turn_user_id === rp.user_id,
          isEditor: room?.editing_user_id === rp.user_id,
        } as PlayerInfo;
      }),
    );
  }

  async function handleGiveTurn(userId: string) {
    if (!room || !isOwner) return;
    await supabase.from("rooms").update({ current_turn_user_id: userId }).eq("id", room.id);
    logInfo("Ход передан", { userId });
  }

  async function handleTakeTurn() {
    if (!room || !isOwner) return;
    await supabase.from("rooms").update({ current_turn_user_id: null }).eq("id", room.id);
    logInfo("Ход снят");
  }

  async function handleSetEditor(userId: string) {
    if (!room || !isOwner) return;
    await supabase
      .from("rooms")
      .update({ editing_user_id: userId })
      .eq("id", room.id);
    await supabase
      .from("room_permissions")
      .upsert({ room_id: room.id, editor_user_id: userId, updated_at: new Date().toISOString() });
    logInfo("Права на редактирование обновлены", { userId });
  }

  async function handleLockRoom() {
    if (!room || !isOwner) return;
    await supabase.from("rooms").update({ is_locked: !room.is_locked }).eq("id", room.id);
  }

  async function handleChangeMap(mapId: string) {
    if (!room || !isOwner) return;
    await supabase.from("rooms").update({ map_id: mapId }).eq("id", room.id);
  }

  async function handleResetMap() {
    if (!room || !isOwner) return;
    await supabase.from("rooms").update({ map_id: "map1" }).eq("id", room.id);
    logInfo("Карта сброшена", { map: "map1" });
  }

  async function handleClearFront() {
    if (!room || !canControl) return;
    await supabase
      .from("room_drawings")
      .delete()
      .eq("room_id", room.id)
      .eq("echelon", currentEchelon)
      .eq("type", "front_line");
    setDrawingsVersion((v) => v + 1);
  }

  async function handleClearMap() {
    if (!room || !canControl) return;
    await supabase.from("room_units").delete().eq("room_id", room.id).eq("echelon", currentEchelon);
    await supabase.from("room_symbols").delete().eq("room_id", room.id).eq("echelon", currentEchelon);
    await supabase.from("room_drawings").delete().eq("room_id", room.id).eq("echelon", currentEchelon);
    setDrawingsVersion((v) => v + 1);
  }

  async function handleSavePlan() {
    if (!profile || !room) return;
    await savePlan(room.id, profile.id, currentEchelon);
  }

  async function handleLoadPlan(file: File) {
    if (!room) return;
    const text = await file.text();
    const json = JSON.parse(text);
    await loadPlanFromJSON(room.id, currentEchelon, json);
    setDrawingsVersion((v) => v + 1);
  }

  function triggerLoadPlan() {
    planFileRef.current?.click();
  }

  async function handleCopyEchelon() {
    if (!room || !canControl) return;
    const target = (currentEchelon + 1) % ECHELONS;

    const { data: units } = await supabase
      .from("room_units")
      .select("symbol_key, x, y, z_index, team, slot, nickname")
      .eq("room_id", room.id)
      .eq("echelon", currentEchelon);
    const { data: symbols } = await supabase
      .from("room_symbols")
      .select("symbol_key, x, y")
      .eq("room_id", room.id)
      .eq("echelon", currentEchelon);
    const { data: drawings } = await supabase
      .from("room_drawings")
      .select("type, points, style")
      .eq("room_id", room.id)
      .eq("echelon", currentEchelon);

    await supabase.from("room_units").delete().eq("room_id", room.id).eq("echelon", target);
    await supabase.from("room_symbols").delete().eq("room_id", room.id).eq("echelon", target);
    await supabase.from("room_drawings").delete().eq("room_id", room.id).eq("echelon", target);

    if (units && units.length > 0)
      await supabase.from("room_units").insert(
        units.map((u) => ({ ...u, room_id: room.id, echelon: target })),
      );
    if (symbols && symbols.length > 0)
      await supabase.from("room_symbols").insert(
        symbols.map((s) => ({ ...s, room_id: room.id, echelon: target })),
      );
    if (drawings && drawings.length > 0)
      await supabase.from("room_drawings").insert(
        drawings.map((d) => ({ ...d, room_id: room.id, echelon: target })),
      );

    setDrawingsVersion((v) => v + 1);
    logInfo("Эшелон скопирован", { to: target });
  }

  function handleChangeEchelon(idx: number) {
    setCurrentEchelon(idx);
    setDrawingMode("none");
    setDrawingsVersion((v) => v + 1);
  }

  function handleSelectOwnerSlot(slotIndex: number, symbolKey?: string) {
    setSelectedOwnerSlot(slotIndex);
    if (symbolKey) {
      setSelectedSymbol(symbolKey);
    }
  }

  if (!room || !profile) {
    return (
      <div className="h-screen w-screen bg-[#15171c] text-gray-100 flex items-center justify-center">
        <div className="text-sm text-zinc-400">Загрузка комнаты...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#15171c] text-gray-100 flex overflow-hidden">
      <aside className="w-80 max-w-xs border-r border-zinc-800 bg-[#111216] flex-shrink-0 overflow-y-auto">
        <SidebarControls
          currentMapId={room.map_id || "map1"}
          currentEchelon={currentEchelon}
          drawingMode={drawingMode}
          selectedSymbol={selectedSymbol}
          selectedOwnerSlot={selectedOwnerSlot}
          onSetDrawingMode={setDrawingMode}
          onSelectSymbol={setSelectedSymbol}
          onSelectOwnerSlot={handleSelectOwnerSlot}
          onChangeMap={handleChangeMap}
          onResetMap={handleResetMap}
          onClearFront={handleClearFront}
          onClearMap={handleClearMap}
          onSavePlan={handleSavePlan}
          onLoadPlan={triggerLoadPlan}
        />
        <div className="px-3 pb-3 space-y-3">
          <SaveLoadPanel roomId={room.id} userId={profile.id} echelon={currentEchelon} />
          <EchelonCopyButton onCopy={handleCopyEchelon} />
          <button
            className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded px-3 py-2 hover:border-emerald-400"
            onClick={() => setLogsOpen((v) => !v)}
          >
            {logsOpen ? "Скрыть логи" : "Логи"}
          </button>
          <input
            ref={planFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLoadPlan(file);
            }}
          />
        </div>
      </aside>

      <main className="flex-1 relative">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <TopRoomPanel
            roomName={room.name}
            players={players}
            isAdmin={!!isOwner}
            currentTurnNickname={currentTurnNickname}
            onGiveTurn={handleGiveTurn}
            onTakeTurn={handleTakeTurn}
            onLockRoom={handleLockRoom}
            onSetEditor={handleSetEditor}
          />
        </div>

        <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
          <EchelonSwitcher current={currentEchelon} total={ECHELONS} onChange={handleChangeEchelon} />
        </div>

        <div className="absolute inset-0 z-10">
          <PhaserGame
            roomId={room.id}
            currentEchelon={currentEchelon}
            canControl={canControl}
            currentMapId={room.map_id || "map1"}
            drawingMode={drawingMode}
            drawingsVersion={drawingsVersion}
            selectedSymbol={selectedSymbol}
            ownerSlot={selectedOwnerSlot}
            userId={profile.id}
          />
        </div>

        <div className="absolute right-0 top-0 h-full z-30">
          <ChatPanel roomId={room.id} profile={profile} />
        </div>

        {logsOpen && (
          <div className="absolute left-2 bottom-2 z-30">
            <LogsPanel roomId={room.id} />
          </div>
        )}
      </main>
    </div>
  );
}
