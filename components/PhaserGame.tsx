// components/PhaserGame.tsx
"use client";

import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { BattleScene } from "@/phaser/scenes/BattleScene";
import type { DrawingMode } from "./RoomLayout";

type PhaserGameProps = {
  roomId: string;
  currentEchelon: number;
  canControl: boolean;
  currentMapId: string;
  drawingMode: DrawingMode;
  drawingsVersion: number;
  selectedSymbol: string | null;
  ownerSlot: number | null;
};

export default function PhaserGame({
  roomId,
  currentEchelon,
  canControl,
  currentMapId,
  drawingMode,
  drawingsVersion,
  selectedSymbol,
  ownerSlot,
}: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;
    if (gameRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: containerRef.current,
      backgroundColor: "#000000",
      physics: {
        default: "arcade",
        arcade: { debug: false },
      },
      scene: [BattleScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.events.once("ready", () => {
      const anyGame = game as any;
      const scene = anyGame.scene.keys["BattleScene"] as BattleScene | undefined;
      if (scene && typeof scene.setContextFromReact === "function") {
        scene.setContextFromReact({
          roomId,
          echelon: currentEchelon,
          canControl,
          currentMapId,
          drawingMode,
          drawingsVersion,
          selectedSymbol,
          ownerSlot,
        });
      }
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;

    const anyGame = game as any;
    const scene = anyGame.scene.keys["BattleScene"] as BattleScene | undefined;
    if (scene && typeof scene.setContextFromReact === "function") {
      scene.setContextFromReact({
        roomId,
        echelon: currentEchelon,
        canControl,
        currentMapId,
        drawingMode,
        drawingsVersion,
        selectedSymbol,
        ownerSlot,
      });
    }
  }, [
    roomId,
    currentEchelon,
    canControl,
    currentMapId,
    drawingMode,
    drawingsVersion,
    selectedSymbol,
    ownerSlot,
  ]);

  return <div ref={containerRef} className="w-full h-full" />;
}
