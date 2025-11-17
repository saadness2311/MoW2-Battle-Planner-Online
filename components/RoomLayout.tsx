// components/RoomLayout.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PhaserGame from "./PhaserGame";
import SidebarControls from "./room/SidebarControls";
import TopRoomPanel from "./room/TopRoomPanel";
import EchelonSwitcher from "./room/EchelonSwitcher";

export type PlayerInfo = {
  id: string;
  nickname: string;
  isOwner: boolean;
  isCurrentTurn: boolean;
};

type RoomLayoutProps = {
  roomId: string;
};

type RoomRecord = {
  id: string;
  name: string;
  owner_id: string;
  current_turn_user_id: string | null;
  current_map_id: string | null;
  is_locked?: boolean;
};

type RoomPlayerRecord = {
  id: string;
  room_id: string;
  user_id: string;
};

type UserRecord = {
  id: string;
  nickname: string;
};

export type DrawingMode = "none" | "front" | "enemy";

function loadCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("mow2_user");
    if (!raw) return null;
    return JSON.parse(raw) as { id: string; nickname: string };
  } catch {
    return null;
  }
}

export default function RoomLayout({ roomId }: RoomLayoutProps) {
  const [currentEchelon, setCurrentEchelon] = useState(0);

  const [drawingMode, setDrawingMode] = useState<DrawingMode>("none");
  const [drawingsVersion, setDrawingsVersion] = useState(0);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedOwnerSlot, setSelectedOwnerSlot] = useState<number | null>(
    null,
  );

  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; nickname: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin =
    !!room && !!currentUser && room.owner_id === currentUser.id;

  const isActivePlayer =
    !!room &&
    !!currentUser &&
    (room.owner_id === currentUser.id ||
      room.current_turn_user_id === currentUser.id);

  const currentTurnNickname =
    players.find((p) => p.isCurrentTurn)?.nickname || null;

  // -----------------------------
  // 1. Начальная загрузка комнаты и игроков
  // -----------------------------
  useEffect(() => {
    const u = loadCurrentUser();
    setCurrentUser(u);

    const fetchData = async () => {
      setLoading(true);

      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("id, name, owner_id, current_turn_user_id, current_map_id, is_locked")
        .eq("id", roomId)
        .maybeSingle();

      if (roomError) {
        console.error("Ошибка загрузки комнаты:", roomError);
        setLoading(false);
        return;
      }
      if (!roomData) {
        console.error("Комната не найдена");
        setLoading(false);
        return;
      }

      const typedRoom = roomData as RoomRecord;
      setRoom(typedRoom);

      const { data: rpData, error: rpError } = await supabase
        .from("room_players")
        .select("id, room_id, user_id")
        .eq("room_id", roomId);

      if (rpError) {
        console.error("Ошибка загрузки room_players:", rpError);
        setLoading(false);
        return;
      }

      const roomPlayers = (rpData || []) as RoomPlayerRecord[];
      const userIds = roomPlayers.map((rp) => rp.user_id);

      if (userIds.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("id, nickname")
        .in("id", userIds);

      if (usersError) {
        console.error("Ошибка загрузки users:", usersError);
        setLoading(false);
        return;
      }

      const users = (usersData || []) as UserRecord[];

      const playerInfos: PlayerInfo[] = roomPlayers.map((rp) => {
        const uInfo = users.find((u) => u.id === rp.user_id);
        return {
          id: rp.user_id,
          nickname: uInfo?.nickname || "Без имени",
          isOwner: rp.user_id === typedRoom.owner_id,
          isCurrentTurn: rp.user_id === typedRoom.current_turn_user_id,
        };
      });

      setPlayers(playerInfos);
      setLoading(false);
    };

    fetchData();
  }, [roomId]);

  // -----------------------------
  // 2. Realtime по комнате (ход / карта / lock)
  // -----------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            const newRoom = payload.new as RoomRecord;
            setRoom((prev) => ({ ...(prev || newRoom), ...newRoom }));
            setPlayers((prev) =>
              prev.map((p) => ({
                ...p,
                isCurrentTurn: p.id === newRoom.current_turn_user_id,
              })),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // -----------------------------
  // 3. Ходы
  // -----------------------------

  const handleGiveTurn = async (userId: string) => {
    if (!room || !currentUser || !isAdmin) return;

    const { error } = await supabase
      .from("rooms")
      .update({ current_turn_user_id: userId })
      .eq("id", room.id);

    if (error) {
      console.error("Ошибка передачи хода:", error);
      return;
    }

    setRoom((prev) =>
      prev ? { ...prev, current_turn_user_id: userId } : prev,
    );
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        isCurrentTurn: p.id === userId,
      })),
    );
  };

  const handleTakeTurn = async (_userId: string) => {
    if (!room || !currentUser || !isAdmin) return;

    const { error } = await supabase
      .from("rooms")
      .update({ current_turn_user_id: null })
      .eq("id", room.id);

    if (error) {
      console.error("Ошибка отбора хода:", error);
      return;
    }

    setRoom((prev) =>
      prev ? { ...prev, current_turn_user_id: null } : prev,
    );
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        isCurrentTurn: false,
      })),
    );
  };

  const handleLockRoom = async () => {
    if (!room || !isAdmin) return;
    const newLocked = !((room as any).is_locked ?? false);

    const { error } = await supabase
      .from("rooms")
      .update({ is_locked: newLocked })
      .eq("id", room.id);

    if (error) {
      console.error("Ошибка блокировки комнаты:", error);
      return;
    }

    setRoom((prev) =>
      prev ? { ...prev, is_locked: newLocked } : prev,
    );
  };

  // -----------------------------
  // 4. Сайдбар: карта / очистка / планы / символы / слоты
  // -----------------------------
  const handleChangeMap = async (mapId: string) => {
    if (!room || !isAdmin) return;
    const { error } = await supabase
      .from("rooms")
      .update({ current_map_id: mapId })
      .eq("id", room.id);

    if (error) {
      console.error("Ошибка смены карты:", error);
      return;
    }
    setRoom((prev) => (prev ? { ...prev, current_map_id: mapId } : prev));
  };

  const handleClearFront = async () => {
    if (!room || !isAdmin) return;
    const { error } = await supabase
      .from("drawings")
      .delete()
      .eq("room_id", room.id)
      .eq("echelon_index", currentEchelon);

    if (error) {
      console.error("Ошибка очистки фронта:", error);
    } else {
      setDrawingsVersion((v) => v + 1);
    }
  };

  const handleClearMap = async () => {
    if (!room || !isAdmin) return;
    const { error: errUnits } = await supabase
      .from("units")
      .delete()
      .eq("room_id", room.id)
      .eq("echelon_index", currentEchelon);

    const { error: errDraw } = await supabase
      .from("drawings")
      .delete()
      .eq("room_id", room.id)
      .eq("echelon_index", currentEchelon);

    if (errUnits || errDraw) {
      console.error("Ошибка очистки карты:", errUnits || errDraw);
    } else {
      setDrawingsVersion((v) => v + 1);
    }
  };

  const handleSavePlan = async () => {
    if (!room || !currentUser) return;
    console.log("Сохранить план — TODO (следующий шаг)");
  };

  const handleLoadPlan = async () => {
    if (!room || !currentUser) return;
    console.log("Загрузить план — TODO (следующий шаг)");
  };

  const handleChangeEchelon = (idx: number) => {
    setCurrentEchelon(idx);
    setDrawingMode("none");
    setDrawingsVersion((v) => v + 1);
  };

  const handleSelectSymbol = (symbol: string | null) => {
    setSelectedSymbol(symbol);
  };

  const handleSelectOwnerSlot = (slotIndex: number) => {
    setSelectedOwnerSlot(slotIndex);
  };

  // -----------------------------
  // 5. Рендер
  // -----------------------------

  if (loading || !room) {
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
          roomId={room.id}
          currentEchelon={currentEchelon}
          drawingMode={drawingMode}
          selectedSymbol={selectedSymbol}
          selectedOwnerSlot={selectedOwnerSlot}
          onSetDrawingMode={setDrawingMode}
          onSelectSymbol={handleSelectSymbol}
          onSelectOwnerSlot={handleSelectOwnerSlot}
          onChangeMap={handleChangeMap}
          onClearFront={handleClearFront}
          onClearMap={handleClearMap}
          onSavePlan={handleSavePlan}
          onLoadPlan={handleLoadPlan}
        />
      </aside>

      <main className="flex-1 relative">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <TopRoomPanel
            roomName={room.name}
            players={players}
            isAdmin={!!isAdmin}
            currentTurnNickname={currentTurnNickname}
            onGiveTurn={handleGiveTurn}
            onTakeTurn={handleTakeTurn}
            onLockRoom={handleLockRoom}
          />
        </div>

        <div className="absolute top-3 right-4 z-20">
          <EchelonSwitcher
            current={currentEchelon}
            total={3}
            onChange={handleChangeEchelon}
          />
        </div>

        <div className="absolute inset-0 z-10">
          <PhaserGame
            roomId={room.id}
            currentEchelon={currentEchelon}
            canControl={isActivePlayer}
            currentMapId={room.current_map_id || "map1"}
            drawingMode={drawingMode}
            drawingsVersion={drawingsVersion}
            selectedSymbol={selectedSymbol}
            ownerSlot={selectedOwnerSlot}
          />
        </div>
      </main>
    </div>
  );
}
