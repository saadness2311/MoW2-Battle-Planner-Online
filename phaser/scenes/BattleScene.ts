// phaser/scenes/BattleScene.ts
import * as Phaser from "phaser";
import { supabase } from "../../lib/supabaseClient";

type DrawingMode = "none" | "front" | "enemy";

type SceneContext = {
  roomId: string;
  echelon: number;
  canControl: boolean;
  currentMapId: string;
  drawingMode: DrawingMode;
  drawingsVersion: number;
  selectedSymbol: string | null;
  ownerSlot: number | null;
};

type UnitRecord = {
  id: string;
  room_id: string;
  echelon_index: number;
  type: string;
  x: number;
  y: number;
  z_index: number;
  symbol_name: string | null;
  owner_slot: number | null;
};

type DrawingRecord = {
  id: string;
  room_id: string;
  echelon_index: number;
  type: string;
  points: { x: number; y: number }[];
  style: any;
};

// Иконки как в оффлайне
const ICON_NAMES = [
  "symb1",
  "symb2",
  "symb3",
  "symb4",
  "symb5",
  "symb6",
  "symb7",
  "symb8",
  "symb9",
  "symb10",
  "symb11",
  "symb12",
  "symb13",
  "symb14",
  "symb15",
  "symb16",
  "symb17",
  "symb18",
  "symb19",
  "symb20",
  "symb21",
  "symb22",
  "symb23",
  "symb24",
  "symb25",
  "symb26",
  "symb27",
  "symb28",
  "symb29",
  "symb30",
  "symb31",
  "symb32",
  "symb33",
  "symb34",
  "symb35",
];

// Цвет подсветки по owner_slot:
// 1–5  → зелёный (синие юниты)
// 6–10 → красный (красные юниты)
// остальное — без подсветки
function getOwnerHaloColor(slot: number | null | undefined): number | null {
  if (!slot || slot <= 0) return null;
  if (slot >= 1 && slot <= 5) {
    return 0x22c55e;
  }
  if (slot >= 6 && slot <= 10) {
    return 0xef4444;
  }
  return null;
}

export class BattleScene extends Phaser.Scene {
  private ctx: SceneContext = {
    roomId: "",
    echelon: 0,
    canControl: false,
    currentMapId: "map1",
    drawingMode: "none",
    drawingsVersion: 0,
    selectedSymbol: null,
    ownerSlot: null,
  };

  private mapImage?: Phaser.GameObjects.Image;

  private unitSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private unitHalos: Map<string, Phaser.GameObjects.Graphics> = new Map();

  private drawingGraphics: Map<string, Phaser.GameObjects.Graphics> =
    new Map();
  private currentDrawingGraphics?: Phaser.GameObjects.Graphics;
  private currentDrawingPoints: { x: number; y: number }[] = [];
  private isPointerDownForDrawing = false;

  private pointerDownPos: { x: number; y: number } | null = null;
  private isDraggingUnit = false;

  private isReady = false;

  constructor() {
    super("BattleScene");
  }

  public setContextFromReact(partial: Partial<SceneContext>) {
    const prevEchelon = this.ctx.echelon;
    const prevMap = this.ctx.currentMapId;
    const prevDrawingsVersion = this.ctx.drawingsVersion;

    this.ctx = { ...this.ctx, ...partial };

    if (!this.isReady) return;

    if (partial.echelon !== undefined && partial.echelon !== prevEchelon) {
      this.reloadUnits();
      this.reloadDrawings();
    }

    if (
      partial.currentMapId !== undefined &&
      partial.currentMapId !== prevMap
    ) {
      this.loadNewMapTexture();
    }

    if (
      partial.drawingsVersion !== undefined &&
      partial.drawingsVersion !== prevDrawingsVersion
    ) {
      this.reloadDrawings();
    }
  }

  preload() {
    ICON_NAMES.forEach((name) => {
      this.load.image(name, `/assets/symbols/${name}.png`);
    });

    this.load.image("unit_default", "/assets/symbols/symb5.png");
  }

  async create() {
    this.cameras.main.setBackgroundColor("#000000");

    await this.loadNewMapTexture();
    this.initInputHandlers();

    await this.reloadUnits();
    await this.reloadDrawings();

    this.isReady = true;
    this.game.events.emit("ready");
  }

  private async loadNewMapTexture() {
    const texKey = `map_${this.ctx.currentMapId}`;

    if (!this.textures.exists(texKey)) {
      this.load.image(texKey, `/assets/maps/${this.ctx.currentMapId}.jpg`);
      await new Promise<void>((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        this.load.start();
      });
    }

    if (this.mapImage) {
      this.mapImage.destroy();
    }

    this.mapImage = this.add
      .image(0, 0, texKey)
      .setOrigin(0, 0)
      .setDisplaySize(this.scale.width, this.scale.height);
  }

  private async reloadUnits() {
    this.unitSprites.forEach((sprite) => sprite.destroy());
    this.unitHalos.forEach((g) => g.destroy());
    this.unitSprites.clear();
    this.unitHalos.clear();

    if (!this.ctx.roomId) return;

    const { data, error } = await supabase
      .from("units")
      .select(
        "id, room_id, echelon_index, type, x, y, z_index, symbol_name, owner_slot",
      )
      .eq("room_id", this.ctx.roomId)
      .eq("echelon_index", this.ctx.echelon);

    if (error) {
      console.error("Ошибка загрузки units:", error);
      return;
    }

    const units = (data || []) as UnitRecord[];

    units.forEach((u) => {
      this.spawnUnitSprite(u);
    });
  }

  private spawnUnitSprite(u: UnitRecord) {
    const textureKey = this.resolveUnitTexture(u);

    const haloColor = getOwnerHaloColor(u.owner_slot);
    let halo: Phaser.GameObjects.Graphics | undefined;

    if (haloColor !== null) {
      halo = this.add.graphics();
      halo.fillStyle(haloColor, 0.22);
      halo.lineStyle(1, haloColor, 0.5);
      halo.beginPath();
      halo.arc(u.x, u.y, 24, 0, Math.PI * 2);
      halo.closePath();
      halo.fillPath();
      halo.strokePath();
      halo.setDepth((u.z_index || 0) - 1);
      this.unitHalos.set(u.id, halo);
    }

    const sprite = this.add
      .image(u.x, u.y, textureKey)
      .setOrigin(0.5, 0.5);

    sprite.setDepth(u.z_index || 0);
    sprite.setInteractive({ draggable: true });

    this.input.setDraggable(sprite, this.ctx.canControl);

    sprite.on("dragstart", () => {
      this.isDraggingUnit = true;
    });

    sprite.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        sprite.x = dragX;
        sprite.y = dragY;

        const haloObj = this.unitHalos.get(u.id);
        if (haloObj) {
          haloObj.clear();
          const c = getOwnerHaloColor(u.owner_slot);
          if (c !== null) {
            haloObj.fillStyle(c, 0.22);
            haloObj.lineStyle(1, c, 0.5);
            haloObj.beginPath();
            haloObj.arc(dragX, dragY, 24, 0, Math.PI * 2);
            haloObj.closePath();
            haloObj.fillPath();
            haloObj.strokePath();
          }
        }
      },
    );

    sprite.on("dragend", async () => {
      const newX = sprite.x;
      const newY = sprite.y;
      this.isDraggingUnit = false;

      if (!this.ctx.canControl) {
        return;
      }

      const { error } = await supabase
        .from("units")
        .update({
          x: newX,
          y: newY,
          z_index: sprite.depth ?? 0,
        })
        .eq("id", u.id);

      if (error) {
        console.error("Ошибка обновления позиции юнита:", error);
      }
    });

    this.unitSprites.set(u.id, sprite);
  }

  private resolveUnitTexture(u: UnitRecord): string {
    if (u.symbol_name && this.textures.exists(u.symbol_name)) {
      return u.symbol_name;
    }
    if (this.textures.exists("unit_default")) {
      return "unit_default";
    }
    return ICON_NAMES[4] || "symb5";
  }

  private async createUnitAt(x: number, y: number) {
    if (!this.ctx.roomId) return;
    if (!this.ctx.selectedSymbol) return;

    const payload = {
      room_id: this.ctx.roomId,
      echelon_index: this.ctx.echelon,
      type: "symbol",
      x,
      y,
      z_index: Date.now(),
      symbol_name: this.ctx.selectedSymbol,
      owner_slot: this.ctx.ownerSlot ?? 0,
    };

    const { data, error } = await supabase
      .from("units")
      .insert(payload)
      .select(
        "id, room_id, echelon_index, type, x, y, z_index, symbol_name, owner_slot",
      )
      .single();

    if (error) {
      console.error("Ошибка создания юнита:", error);
      return;
    }

    const rec = data as UnitRecord;
    this.spawnUnitSprite(rec);
  }

  private async reloadDrawings() {
    this.drawingGraphics.forEach((g) => g.destroy());
    this.drawingGraphics.clear();

    if (!this.ctx.roomId) return;

    const { data, error } = await supabase
      .from("drawings")
      .select("id, room_id, echelon_index, type, points, style")
      .eq("room_id", this.ctx.roomId)
      .eq("echelon_index", this.ctx.echelon);

    if (error) {
      console.error("Ошибка загрузки drawings:", error);
      return;
    }

    const drawings = (data || []) as any[];

    drawings.forEach((raw) => {
      const rec: DrawingRecord = {
        id: raw.id,
        room_id: raw.room_id,
        echelon_index: raw.echelon_index,
        type: raw.type,
        points: raw.points || [],
        style: raw.style,
      };
      this.drawStoredDrawing(rec);
    });
  }

  private drawStoredDrawing(rec: DrawingRecord) {
    if (!rec.points || rec.points.length < 2) return;

    const g = this.add.graphics();
    const color = 0xff0000;
    const alpha = 1;

    if (rec.type === "front_line") {
      g.lineStyle(2, color, alpha);
      g.beginPath();
      g.moveTo(rec.points[0].x, rec.points[0].y);
      for (let i = 1; i < rec.points.length; i++) {
        g.lineTo(rec.points[i].x, rec.points[i].y);
      }
      g.strokePath();
    } else if (rec.type === "enemy_area") {
      g.lineStyle(1, color, 0.8);
      g.fillStyle(color, 0.15);
      g.beginPath();
      g.moveTo(rec.points[0].x, rec.points[0].y);
      for (let i = 1; i < rec.points.length; i++) {
        g.lineTo(rec.points[i].x, rec.points[i].y);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
    }

    this.drawingGraphics.set(rec.id, g);
  }

  private redrawCurrentDrawing() {
    if (!this.currentDrawingGraphics || this.currentDrawingPoints.length < 2)
      return;

    const g = this.currentDrawingGraphics;
    g.clear();

    const color = 0xff0000;

    if (this.ctx.drawingMode === "front") {
      g.lineStyle(2, color, 1);
      g.beginPath();
      g.moveTo(this.currentDrawingPoints[0].x, this.currentDrawingPoints[0].y);
      for (let i = 1; i < this.currentDrawingPoints.length; i++) {
        g.lineTo(this.currentDrawingPoints[i].x, this.currentDrawingPoints[i].y);
      }
      g.strokePath();
    } else if (this.ctx.drawingMode === "enemy") {
      g.lineStyle(1, color, 0.9);
      g.fillStyle(color, 0.15);
      g.beginPath();
      g.moveTo(this.currentDrawingPoints[0].x, this.currentDrawingPoints[0].y);
      for (let i = 1; i < this.currentDrawingPoints.length; i++) {
        g.lineTo(this.currentDrawingPoints[i].x, this.currentDrawingPoints[i].y);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  private initInputHandlers() {
    this.input.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer) => {
        if (!this.ctx.canControl) return;

        if (this.ctx.drawingMode !== "none") {
          if (pointer.rightButtonDown()) return;

          this.isPointerDownForDrawing = true;
          this.currentDrawingPoints = [{ x: pointer.x, y: pointer.y }];

          if (this.currentDrawingGraphics) {
            this.currentDrawingGraphics.destroy();
          }
          this.currentDrawingGraphics = this.add.graphics();
        } else {
          if (pointer.rightButtonDown()) return;
          this.pointerDownPos = { x: pointer.x, y: pointer.y };
        }
      },
      this,
    );

    this.input.on(
      "pointermove",
      (pointer: Phaser.Input.Pointer) => {
        if (!this.ctx.canControl) return;

        if (this.ctx.drawingMode !== "none") {
          if (!this.isPointerDownForDrawing) return;
          if (!this.currentDrawingGraphics) return;

          const last =
            this.currentDrawingPoints[
              this.currentDrawingPoints.length - 1
            ];
          const dx = pointer.x - last.x;
          const dy = pointer.y - last.y;
          if (dx * dx + dy * dy < 4) return;

          this.currentDrawingPoints.push({ x: pointer.x, y: pointer.y });
          this.redrawCurrentDrawing();
        }
      },
      this,
    );

    this.input.on(
      "pointerup",
      async (pointer: Phaser.Input.Pointer) => {
        if (!this.ctx.canControl) {
          this.isPointerDownForDrawing = false;
          this.pointerDownPos = null;
          return;
        }

        if (this.ctx.drawingMode !== "none") {
          if (!this.isPointerDownForDrawing) return;

          this.isPointerDownForDrawing = false;

          if (
            !this.ctx.roomId ||
            this.currentDrawingPoints.length < 2
          ) {
            if (this.currentDrawingGraphics) {
              this.currentDrawingGraphics.destroy();
              this.currentDrawingGraphics = undefined;
            }
            this.currentDrawingPoints = [];
            return;
          }

          const type =
            this.ctx.drawingMode === "front"
              ? "front_line"
              : "enemy_area";

          const payload = {
            room_id: this.ctx.roomId,
            echelon_index: this.ctx.echelon,
            type,
            points: this.currentDrawingPoints,
            style: {
              color: "#ff0000",
              width: 2,
              fill: this.ctx.drawingMode === "enemy",
            },
          };

          const { data, error } = await supabase
            .from("drawings")
            .insert(payload)
            .select("id")
            .single();

          if (error) {
            console.error("Ошибка сохранения рисунка:", error);
            if (this.currentDrawingGraphics) {
              this.currentDrawingGraphics.destroy();
              this.currentDrawingGraphics = undefined;
            }
          } else {
            const id = (data as any).id as string;
            if (this.currentDrawingGraphics) {
              this.drawingGraphics.set(id, this.currentDrawingGraphics);
              this.currentDrawingGraphics = undefined;
            }
          }

          this.currentDrawingPoints = [];
          return;
        }

        if (!this.pointerDownPos) return;

        const dx = pointer.x - this.pointerDownPos.x;
        const dy = pointer.y - this.pointerDownPos.y;
        const dist2 = dx * dx + dy * dy;

        this.pointerDownPos = null;

        if (this.isDraggingUnit) {
          this.isDraggingUnit = false;
          return;
        }

        if (!this.ctx.selectedSymbol) return;
        if (dist2 > 16) return;

        await this.createUnitAt(pointer.x, pointer.y);
      },
      this,
    );
  }
}
