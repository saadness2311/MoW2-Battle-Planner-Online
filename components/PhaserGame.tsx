"use client";

import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { createPhaserConfig } from "@/phaser/config";
import { Session } from "@/lib/auth";
import { Room } from "@/lib/types";

interface PhaserGameProps {
  roomId: string;
  session: Session;
  echelon: number;
  room: Room;
}

export default function PhaserGame({
  roomId,
  session,
  echelon,
  room
}: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (gameRef.current) return;

    const config = createPhaserConfig(containerRef.current);
    const game = new Phaser.Game(config);

    (game as any).mow2Context = {
      roomId,
      userId: session.userId,
      nickname: session.nickname,
      echelon,
      room
    };

    gameRef.current = game;

    const exportHandler = () => {
      const g: any = gameRef.current;
      if (!g) return;
      if (g.scene.isActive("BattleScene")) {
        const scene = g.scene.getScene("BattleScene") as any;
        if (typeof scene.exportSceneAsPNG === "function") {
          scene.exportSceneAsPNG();
        }
      }
    };

    const drawModeHandler = (e: any) => {
      const g: any = gameRef.current;
      if (!g) return;
      if (g.scene.isActive("BattleScene")) {
        const scene = g.scene.getScene("BattleScene") as any;
        scene.drawingMode = e.detail;
      }
    };

    const createUnitHandler = (e: any) => {
      const g: any = gameRef.current;
      if (!g) return;
      if (g.scene.isActive("BattleScene")) {
        const scene = g.scene.getScene("BattleScene") as any;
        scene.pendingUnitToCreate = e.detail;
      }
    };

    const activeSlotHandler = (e: any) => {
      const g: any = gameRef.current;
      if (!g) return;
      if (g.scene.isActive("BattleScene")) {
        const scene = g.scene.getScene("BattleScene") as any;
        scene.activeSlot = e.detail;
      }
    };

    window.addEventListener("EXPORT_MAP", exportHandler);
    window.addEventListener("SET_DRAW_MODE", drawModeHandler);
    window.addEventListener("SET_CREATE_UNIT", createUnitHandler);
    window.addEventListener("SET_ACTIVE_SLOT", activeSlotHandler);

    return () => {
      window.removeEventListener("EXPORT_MAP", exportHandler);
      window.removeEventListener("SET_DRAW_MODE", drawModeHandler);
      window.removeEventListener("SET_CREATE_UNIT", createUnitHandler);
      window.removeEventListener("SET_ACTIVE_SLOT", activeSlotHandler);

      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const g: any = gameRef.current;
    if (!g || !g.mow2Context) return;
    g.mow2Context.echelon = echelon;
    g.mow2Context.room = room;

    if (g.scene.isActive("BattleScene")) {
      const scene = g.scene.getScene("BattleScene") as any;
      if (typeof scene.handleExternalUpdate === "function") {
        scene.handleExternalUpdate({ echelon, room });
      }
    }
  }, [echelon, room]);

  return <div ref={containerRef} className="w-full h-full" />;
}
