// phaser/scenes/BattleScene.ts
import * as Phaser from "phaser";
import { supabase } from "../../lib/supabaseClient";

type DrawingMode = "none" | "front" | "enemy";

type SceneContext = {
  roomId: string;
  userId: string;
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
  echelon: number;
  symbol_key: string;
  x: number;
  y: number;
  z_index: number;
  team: string | null;
  slot: number | null;
  nickname: string | null;
};

type DrawingRecord = {
  id: string;
  room_id: string;
  echelon: number;
  type: string;
  points: { x: number; y: number }[];
  style: any;
};

const ICON_NAMES = Array.from({ length: 35 }, (_, i) => `symb${i + 1}`);
const NATIONS = ["ussr", "germany", "usa"];
const REGIMENTS_PER_NATION = 17;

function haloColor(slot: number | null | undefined) {
  if (!slot || slot <= 0) return null;
  if (slot >= 1 && slot <= 5) return 0x22c55e;
  if (slot >= 6 && slot <= 10) return 0xef4444;
  return null;
}

export class BattleScene extends Phaser.Scene {
  private ctx: SceneContext = {
    roomId: "",
    userId: "",
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

  private drawingGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private currentDrawingGraphics?: Phaser.GameObjects.Graphics;
  private currentDrawingPoints: { x: number; y: number }[] = [];
  private isPointerDownForDrawing = false;

  private pointerDownPos: { x: number; y: number } | null = null;
  private isDraggingUnit = false;

  private lastMoveAt = 0;
  private placements: number[] = [];
  private realtimeChannel: any;

  constructor() {
    super("BattleScene");
  }

  public setContextFromReact(partial: Partial<SceneContext>) {
    const prevEchelon = this.ctx.echelon;
    const prevMap = this.ctx.currentMapId;
    const prevDrawingsVersion = this.ctx.drawingsVersion;

    this.ctx = { ...this.ctx, ...partial } as SceneContext;

    if (!this.scene.isActive()) return;

    if (partial.echelon !== undefined && partial.echelon !== prevEchelon) {
      this.reloadUnits();
      this.reloadDrawings();
      this.restartRealtime();
    }

    if (partial.currentMapId !== undefined && partial.currentMapId !== prevMap) {
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

    NATIONS.forEach((nation) => {
      for (let i = 1; i <= REGIMENTS_PER_NATION; i++) {
        const key = `${nation}_reg${i}`;
        this.load.image(key, `/assets/${nation}/reg${i}.png`);
      }
    });
  }

  async create() {
    this.cameras.main.setBackgroundColor("#000000");

    await this.loadNewMapTexture();
    this.initInputHandlers();
    await this.reloadUnits();
    await this.reloadDrawings();
    this.restartRealtime();

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

    if (this.mapImage) this.mapImage.destroy();

    this.mapImage = this.add
      .image(0, 0, texKey)
      .setOrigin(0, 0)
      .setDisplaySize(this.scale.width, this.scale.height);

    this.cameras.main.setBounds(0, 0, this.mapImage.displayWidth, this.mapImage.displayHeight);
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
  }

  private async reloadUnits() {
    this.unitSprites.forEach((s) => s.destroy());
    this.unitHalos.forEach((g) => g.destroy());
    this.unitSprites.clear();
    this.unitHalos.clear();

    if (!this.ctx.roomId) return;

    const { data, error } = await supabase
      .from("room_units")
      .select("id, room_id, echelon, symbol_key, x, y, z_index, team, slot, nickname")
      .eq("room_id", this.ctx.roomId)
      .eq("echelon", this.ctx.echelon);

    if (error) {
      console.error("Ошибка загрузки room_units:", error);
      return;
    }

    (data as UnitRecord[]).forEach((u) => this.spawnUnitSprite(u));
  }

  private spawnUnitSprite(u: UnitRecord) {
    const textureKey = this.resolveUnitTexture(u);
    const haloC = haloColor(u.slot || null);
    let halo: Phaser.GameObjects.Graphics | undefined;

    if (haloC !== null) {
      halo = this.add.graphics();
      halo.fillStyle(haloC, 0.22);
      halo.lineStyle(1, haloC, 0.5);
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
      .setOrigin(0.5, 0.5)
      .setDepth(u.z_index || 0)
      .setInteractive({ draggable: true });

    this.input.setDraggable(sprite, this.ctx.canControl);

    sprite.on("dragstart", () => {
      this.isDraggingUnit = true;
    });

    sprite.on("drag", (_pointer, dragX, dragY) => {
      sprite.x = dragX;
      sprite.y = dragY;
      const haloObj = this.unitHalos.get(u.id);
      if (haloObj) {
        haloObj.clear();
        const c = haloColor(u.slot || null);
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
    });

    sprite.on("dragend", async () => {
      const now = Date.now();
      if (!this.ctx.canControl) return;
      if (now - this.lastMoveAt < 1000) return; // 1 move per second
      this.lastMoveAt = now;

      const { error } = await supabase
        .from("room_units")
        .update({ x: sprite.x, y: sprite.y, z_index: sprite.depth || 0 })
        .eq("id", u.id);

      if (error) console.error("Ошибка обновления юнита", error);
    });

    this.unitSprites.set(u.id, sprite);
  }

  private resolveUnitTexture(u: UnitRecord): string {
    if (u.symbol_key && this.textures.exists(u.symbol_key)) return u.symbol_key;
    if (this.textures.exists("unit_default")) return "unit_default";
    return ICON_NAMES[4] || "symb5";
  }

  private async createUnitAt(x: number, y: number) {
    if (!this.ctx.roomId || !this.ctx.selectedSymbol) return;
    const now = Date.now();
    this.placements = this.placements.filter((ts) => now - ts < 1000);
    if (this.placements.length >= 5) return; // 5 symbols per second
    this.placements.push(now);

    const payload = {
      room_id: this.ctx.roomId,
      echelon: this.ctx.echelon,
      symbol_key: this.ctx.selectedSymbol,
      x,
      y,
      z_index: Date.now(),
      team: this.ctx.ownerSlot && this.ctx.ownerSlot <= 5 ? "blue" : this.ctx.ownerSlot ? "red" : null,
      slot: this.ctx.ownerSlot,
      nickname: null,
    };

    const { data, error } = await supabase
      .from("room_units")
      .insert(payload)
      .select(
        "id, room_id, echelon, symbol_key, x, y, z_index, team, slot, nickname",
      )
      .single();

    if (error) {
      console.error("Ошибка создания юнита", error);
      return;
    }

    this.spawnUnitSprite(data as UnitRecord);
  }

  private async reloadDrawings() {
    this.drawingGraphics.forEach((g) => g.destroy());
    this.drawingGraphics.clear();

    if (!this.ctx.roomId) return;

    const { data, error } = await supabase
      .from("room_drawings")
      .select("id, room_id, echelon, type, points, style")
      .eq("room_id", this.ctx.roomId)
      .eq("echelon", this.ctx.echelon);

    if (error) {
      console.error("Ошибка загрузки рисунков", error);
      return;
    }

    (data as any[]).forEach((raw) => this.drawStoredDrawing(raw as DrawingRecord));
  }

  private drawStoredDrawing(rec: DrawingRecord) {
    if (!rec.points || rec.points.length < 2) return;

    const g = this.add.graphics();
    const color = 0xff0000;

    if (rec.type === "front_line") {
      g.lineStyle(2, color, 1);
      g.beginPath();
      g.moveTo(rec.points[0].x, rec.points[0].y);
      for (let i = 1; i < rec.points.length; i++) {
        g.lineTo(rec.points[i].x, rec.points[i].y);
      }
      g.strokePath();
    } else if (rec.type === "enemy_area") {
      g.lineStyle(1, color, 0.9);
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
    if (!this.currentDrawingGraphics || this.currentDrawingPoints.length < 2) return;

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

          const last = this.currentDrawingPoints[this.currentDrawingPoints.length - 1];
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

          if (!this.ctx.roomId || this.currentDrawingPoints.length < 2) {
            this.currentDrawingGraphics?.destroy();
            this.currentDrawingGraphics = undefined;
            this.currentDrawingPoints = [];
            return;
          }

          const type = this.ctx.drawingMode === "front" ? "front_line" : "enemy_area";
          const payload = {
            room_id: this.ctx.roomId,
            echelon: this.ctx.echelon,
            type,
            points: this.currentDrawingPoints,
            style: { color: "#ff0000", width: 2, fill: this.ctx.drawingMode === "enemy" },
          };

          const { data, error } = await supabase
            .from("room_drawings")
            .insert(payload)
            .select("id")
            .single();

          if (error) {
            console.error("Ошибка сохранения рисунка", error);
            this.currentDrawingGraphics?.destroy();
            this.currentDrawingGraphics = undefined;
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

  private restartRealtime() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
    }

    if (!this.ctx.roomId) return;

    this.realtimeChannel = supabase
      .channel(`rt-${this.ctx.roomId}-${this.ctx.echelon}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_units",
          filter: `room_id=eq.${this.ctx.roomId}`,
        },
        (payload) => {
          if ((payload.new as any).echelon !== this.ctx.echelon) return;
          this.reloadUnits();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_drawings",
          filter: `room_id=eq.${this.ctx.roomId}`,
        },
        (payload) => {
          if ((payload.new as any).echelon !== this.ctx.echelon) return;
          this.reloadDrawings();
        },
      )
      .subscribe();
  }
}

export default BattleScene;
