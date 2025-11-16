import Phaser from "phaser";
import { supabase } from "@/lib/supabaseClient";

type Mow2Context = {
  roomId: string;
  userId: string;
  nickname: string;
  echelon: number;
  room: {
    id: string;
    current_turn_user_id: string | null;
    current_map_id: string | null;
  };
};

type UnitRow = {
  id: string;
  room_id: string;
  echelon_index: number;
  type: string;
  x: number;
  y: number;
  z_index: number;
  symbol_name: string | null;
  owner_user?: string | null;
  owner_slot?: number | null;
};

type DrawingRow = {
  id: string;
  room_id: string;
  echelon_index: number;
  type: string;
  points: { x: number; y: number }[];
  style: {
    color?: number;
    width?: number;
    alpha?: number;
    arrowHead?: boolean;
  };
};

const Z_LAYERS = {
  MAP: 0,
  DRAWINGS: 10,
  UNITS: 100,
  MY_UNITS: 200,
  UI: 1000
};

export default class BattleScene extends Phaser.Scene {
  private context!: Mow2Context;

  private bg?: Phaser.GameObjects.Image;

  private units: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private unitMeta: Map<string, UnitRow> = new Map();

  private drawings: Map<string, Phaser.GameObjects.Graphics> = new Map();

  private unitsChannel: any;
  private drawingsChannel: any;

  public drawingMode: string | null = null;
  private isDrawing = false;
  private drawPoints: Phaser.Math.Vector2[] = [];
  private tempGraphics?: Phaser.GameObjects.Graphics;

  public pendingUnitToCreate: any = null;
  public activeSlot: number = 0;

  private selectedUnits: Set<string> = new Set();
  private selectionGraphics: Map<string, Phaser.GameObjects.Graphics> =
    new Map();

  private cursorHint?: Phaser.GameObjects.Text;

  private contextMenu?: Phaser.GameObjects.Container;

  constructor() {
    super("BattleScene");
  }

  init() {
    const game: any = this.game;
    this.context = game.mow2Context as Mow2Context;
  }

  preload() {
    const mapId = this.context.room.current_map_id || "map1";
    this.load.image("map", `/assets/maps/${mapId}.jpg`);
    this.load.image("unit_default", "/assets/symbols/unit_default.png`);
  }

  create() {
    this.createMap();
    this.enableCameraControls();

    this.createCursorHint();

    this.loadUnits();
    this.loadDrawings();

    this.subscribeUnitsRealtime();
    this.subscribeDrawingsRealtime();

    this.enableInput();
  }

  private createMap() {
    this.bg = this.add.image(0, 0, "map").setOrigin(0, 0);
    this.bg.setDepth(Z_LAYERS.MAP);
  }

  private enableCameraControls() {
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.setBounds(0, 0, this.bg!.width, this.bg!.height);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.isDrawing || this.pendingUnitToCreate) return;
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
    });

    this.input.on("wheel", (_, __, ___, deltaY) => {
      const factor = 0.001;
      cam.zoom = Phaser.Math.Clamp(cam.zoom - deltaY * factor, 0.2, 2.5);
    });
  }

  private createCursorHint() {
    this.cursorHint = this.add
      .text(0, 0, "", {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000099"
      })
      .setDepth(Z_LAYERS.UI)
      .setPadding(4, 2, 4, 2)
      .setVisible(false);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.cursorHint) return;
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      this.cursorHint.setPosition(worldX + 12, worldY + 12);
    });
  }

  private showCursorHint(text: string) {
    if (!this.cursorHint) return;
    this.cursorHint.setText(text);
    this.cursorHint.setVisible(true);
  }

  private hideCursorHint() {
    if (!this.cursorHint) return;
    this.cursorHint.setVisible(false);
  }

  private async loadUnits() {
    const { roomId, echelon } = this.context;

    const { data } = await supabase
      .from("units")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon_index", echelon);

    this.units.forEach((u) => u.destroy());
    this.units.clear();
    this.unitMeta.clear();
    this.clearSelection();

    (data || []).forEach((row: UnitRow) => {
      this.spawnUnit(row, true);
    });
  }

  private spawnUnit(row: UnitRow, initial = false) {
    const texture = row.symbol_name || "unit_default";

    const sprite = this.add
      .sprite(row.x, row.y, texture)
      .setInteractive({ draggable: true });

    sprite.setDepth(this.depthForUnit(row));
    sprite.setData("unitId", row.id);

    if (!initial) {
      sprite.setAlpha(0);
      sprite.setScale(0.8);
      this.tweens.add({
        targets: sprite,
        alpha: 1,
        scale: 1,
        duration: 200,
        ease: "Sine.easeOut"
      });
    }

    sprite.on("pointerover", () => {
      const owner = row.owner_user === this.context.userId ? "мой" : "чужой";
      const slot = row.owner_slot ?? 0;
      this.showCursorHint(
        `${row.type || "юнит"} (${owner}, слот ${slot + 1})`
      );
    });
    sprite.on("pointerout", () => {
      this.hideCursorHint();
    });

    sprite.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;

      const id = row.id;
      if (this.selectedUnits.has(id)) {
        this.unselectUnit(id);
      } else {
        if (!p.shiftKey) this.clearSelection();
        this.selectUnit(id);
      }
    });

    sprite.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!p.rightButtonDown()) return;

      const id = row.id;
      const worldX = p.worldX;
      const worldY = p.worldY;
      this.openContextMenu(id, worldX, worldY);
    });

    sprite.on("dragstart", () => {
      const id = row.id;
      if (!this.canControlUnit(row)) return;
      this.selectUnit(id);
      sprite.setDepth(Z_LAYERS.MY_UNITS + 100);
    });

    sprite.on("drag", (_pointer: any, x: number, y: number) => {
      if (!this.canControlUnit(row)) return;
      sprite.setPosition(x, y);
      const g = this.selectionGraphics.get(row.id);
      if (g) {
        g.clear();
        this.drawSelectionRect(g, sprite);
      }
    });

    sprite.on("dragend", async () => {
      if (!this.canControlUnit(row)) return;
      sprite.setDepth(this.depthForUnit(row));

      await supabase
        .from("units")
        .update({ x: sprite.x, y: sprite.y })
        .eq("id", row.id);

      this.showCursorHint("Юнит перемещён");
      this.time.delayedCall(800, () => this.hideCursorHint());
    });

    this.units.set(row.id, sprite);
    this.unitMeta.set(row.id, row);
  }

  private depthForUnit(row: UnitRow) {
    if (row.owner_user === this.context.userId) {
      return Z_LAYERS.MY_UNITS;
    }
    return Z_LAYERS.UNITS;
  }

  private updateUnit(row: UnitRow) {
    const s = this.units.get(row.id);

    this.unitMeta.set(row.id, row);

    if (!s) {
      return this.spawnUnit(row, true);
    }

    this.tweens.add({
      targets: s,
      x: row.x,
      y: row.y,
      duration: 200,
      ease: "Sine.easeOut"
    });

    s.setDepth(this.depthForUnit(row));
  }

  private removeUnit(row: UnitRow) {
    const s = this.units.get(row.id);
    if (s) s.destroy();
    this.units.delete(row.id);
    this.unitMeta.delete(row.id);
    this.unselectUnit(row.id);
  }

  private canControlUnit(row: UnitRow): boolean {
    if (row.owner_user !== this.context.userId) return false;
    return this.isMyTurn();
  }

  private selectUnit(id: string) {
    if (this.selectedUnits.has(id)) return;
    this.selectedUnits.add(id);

    const sprite = this.units.get(id);
    if (!sprite) return;

    const g = this.add.graphics();
    g.setDepth(Z_LAYERS.UI - 1);
    g.lineStyle(2, 0xffff00, 0.9);
    this.drawSelectionRect(g, sprite);
    this.selectionGraphics.set(id, g);

    this.tweens.add({
      targets: sprite,
      scale: 1.05,
      duration: 120,
      yoyo: true
    });
  }

  private unselectUnit(id: string) {
    this.selectedUnits.delete(id);
    const g = this.selectionGraphics.get(id);
    if (g) {
      g.destroy();
      this.selectionGraphics.delete(id);
    }
  }

  private clearSelection() {
    this.selectedUnits.forEach((id) => {
      const g = this.selectionGraphics.get(id);
      if (g) g.destroy();
    });
    this.selectionGraphics.clear();
    this.selectedUnits.clear();
  }

  private drawSelectionRect(
    g: Phaser.GameObjects.Graphics,
    sprite: Phaser.GameObjects.Sprite
  ) {
    const w = sprite.displayWidth;
    const h = sprite.displayHeight;
    const x = sprite.x - w / 2;
    const y = sprite.y - h / 2;
    g.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  private openContextMenu(unitId: string, worldX: number, worldY: number) {
    if (this.contextMenu) {
      this.contextMenu.destroy();
      this.contextMenu = undefined;
    }

    const row = this.unitMeta.get(unitId);
    if (!row) return;

    const isOwner = row.owner_user === this.context.userId;

    const items: { label: string; action: () => void; enabled?: boolean }[] = [
      {
        label: "Удалить юнит",
        action: () => this.deleteUnit(unitId, row),
        enabled: isOwner && this.isMyTurn()
      },
      {
        label: "Отметить (жёлтый)",
        action: () => this.markUnit(unitId, 0xffff66),
        enabled: isOwner
      },
      {
        label: "Снять отметку",
        action: () => this.markUnit(unitId, 0xffffff),
        enabled: isOwner
      }
    ];

    const container = this.add.container(worldX, worldY);
    const bg = this.add.rectangle(0, 0, 150, items.length * 18 + 8, 0x000000, 0.8);
    bg.setOrigin(0, 0);

    const texts: Phaser.GameObjects.Text[] = [];

    items.forEach((item, index) => {
      const y = 4 + index * 18;
      const t = this.add
        .text(4, y, item.label, {
          fontSize: "12px",
          color: item.enabled === false ? "#666666" : "#ffffff"
        })
        .setInteractive({ useHandCursor: item.enabled !== false });

      if (item.enabled !== false) {
        t.on("pointerdown", () => {
          item.action();
          this.closeContextMenu();
        });
      }

      texts.push(t);
    });

    container.add(bg);
    texts.forEach((t) => container.add(t));

    container.setDepth(Z_LAYERS.UI);
    this.contextMenu = container;

    this.input.once("pointerdown", () => {
      this.closeContextMenu();
    });
  }

  private closeContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.destroy();
      this.contextMenu = undefined;
    }
  }

  private async deleteUnit(unitId: string, row: UnitRow) {
    if (!this.canControlUnit(row)) return;
    await supabase.from("units").delete().eq("id", unitId);
  }

  private markUnit(unitId: string, color: number) {
    const sprite = this.units.get(unitId);
    if (!sprite) return;
    sprite.setTint(color);
  }

  private subscribeUnitsRealtime() {
    const { roomId } = this.context;

    this.unitsChannel = supabase
      .channel(`units_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "units",
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          const newRow = payload.new as UnitRow;
          const oldRow = payload.old as UnitRow;

          const echelon = this.context.echelon;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            if (newRow.echelon_index !== echelon) return;
          }
          if (payload.eventType === "DELETE") {
            if (oldRow.echelon_index !== echelon) return;
          }

          if (payload.eventType === "INSERT") this.spawnUnit(newRow);
          if (payload.eventType === "UPDATE") this.updateUnit(newRow);
          if (payload.eventType === "DELETE") this.removeUnit(oldRow);
        }
      )
      .subscribe();
  }

  private async loadDrawings() {
    const { roomId, echelon } = this.context;

    const { data } = await supabase
      .from("drawings")
      .select("*")
      .eq("room_id", roomId)
      .eq("echelon_index", echelon);

    this.clearLocalDrawings();

    (data || []).forEach((row: DrawingRow) => {
      this.renderDrawing(row);
    });
  }

  private clearLocalDrawings() {
    this.drawings.forEach((g) => g.destroy());
    this.drawings.clear();
  }

  private renderDrawing(row: DrawingRow) {
    const g = this.add.graphics();
    g.setDepth(Z_LAYERS.DRAWINGS);

    const color = row.style?.color ?? 0xff0000;
    const width = row.style?.width ?? 3;
    const alpha = row.style?.alpha ?? 1;

    g.lineStyle(width, color, alpha);

    const pts = row.points;
    if (!pts || pts.length < 2) return;

    if (row.type === "line" || row.type === "free") {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    }

    if (row.type === "arrow") {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();

      const end = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
      const headLen = 14;

      g.beginPath();
      g.moveTo(end.x, end.y);
      g.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      g.moveTo(end.x, end.y);
      g.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      g.strokePath();
    }

    if (row.type === "circle") {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const r = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      g.strokeCircle(a.x, a.y, r);
    }

    if (row.type === "polygon") {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.strokePath();
    }

    this.drawings.set(row.id, g);
  }

  private subscribeDrawingsRealtime() {
    const { roomId } = this.context;

    this.drawingsChannel = supabase
      .channel(`drawings_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drawings",
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          const newRow = payload.new as DrawingRow;
          const oldRow = payload.old as DrawingRow;

          const echelon = this.context.echelon;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            if (newRow.echelon_index !== echelon) return;
          }
          if (payload.eventType === "DELETE") {
            if (oldRow.echelon_index !== echelon) return;
          }

          if (payload.eventType === "INSERT") this.renderDrawing(newRow);
          if (payload.eventType === "DELETE") {
            const g = this.drawings.get(oldRow.id);
            if (g) g.destroy();
            this.drawings.delete(oldRow.id);
          }
        }
      )
      .subscribe();
  }

  private enableInput() {
    this.input.on("pointerdown", async (p: Phaser.Input.Pointer) => {
      if (this.contextMenu) {
        this.closeContextMenu();
      }

      if (this.pendingUnitToCreate && this.isMyTurn()) {
        const u = this.pendingUnitToCreate;

        await supabase.from("units").insert({
          room_id: this.context.roomId,
          echelon_index: this.context.echelon,
          type: u.id,
          x: p.worldX,
          y: p.worldY,
          z_index: Date.now(),
          symbol_name: u.icon,
          owner_user: this.context.userId,
          owner_slot: this.activeSlot ?? 0
        });

        this.pendingUnitToCreate = null;
        this.showCursorHint("Юнит создан");
        this.time.delayedCall(800, () => this.hideCursorHint());
        return;
      }

      if (this.drawingMode && this.isMyTurn()) {
        this.isDrawing = true;
        this.drawPoints = [
          new Phaser.Math.Vector2(p.worldX, p.worldY)
        ];
        this.tempGraphics = this.add.graphics();
        this.tempGraphics.setDepth(Z_LAYERS.UI - 2);
        return;
      }
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.isDrawing || !this.tempGraphics || !this.drawingMode) return;

      const pt = new Phaser.Math.Vector2(p.worldX, p.worldY);
      this.drawPoints.push(pt);

      this.tempGraphics.clear();
      const color = 0xff0000;
      const width = 3;

      this.tempGraphics.lineStyle(width, color, 1);

      if (
        this.drawingMode === "line" ||
        this.drawingMode === "free" ||
        this.drawingMode === "arrow"
      ) {
        this.tempGraphics.beginPath();
        this.tempGraphics.moveTo(this.drawPoints[0].x, this.drawPoints[0].y);
        for (let i = 1; i < this.drawPoints.length; i++) {
          this.tempGraphics.lineTo(this.drawPoints[i].x, this.drawPoints[i].y);
        }
        this.tempGraphics.strokePath();
      }

      if (this.drawingMode === "circle" && this.drawPoints.length >= 2) {
        const a = this.drawPoints[0];
        const b = this.drawPoints[this.drawPoints.length - 1];
        const r = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        this.tempGraphics.strokeCircle(a.x, a.y, r);
      }
    });

    this.input.on("pointerup", async () => {
      if (!this.isDrawing || !this.drawingMode) return;

      this.isDrawing = false;

      if (this.tempGraphics) {
        this.tempGraphics.destroy();
        this.tempGraphics = undefined;
      }

      if (this.drawPoints.length < 2) {
        this.drawPoints = [];
        return;
      }

      const drawingRow = {
        room_id: this.context.roomId,
        echelon_index: this.context.echelon,
        type: this.drawingMode,
        points: this.drawPoints.map((p) => ({ x: p.x, y: p.y })),
        style: {
          color: 0xff0000,
          width: 3,
          alpha: 1,
          arrowHead: this.drawingMode === "arrow"
        }
      };

      await supabase.from("drawings").insert(drawingRow);

      this.drawPoints = [];

      this.showCursorHint("Фронт нанесён");
      this.time.delayedCall(1000, () => this.hideCursorHint());
    });
  }

  private isMyTurn() {
    return this.context.room.current_turn_user_id === this.context.userId;
  }

  public async handleExternalUpdate({
    echelon,
    room
  }: {
    echelon?: number;
    room?: any;
  }) {
    if (typeof echelon === "number") {
      this.context.echelon = echelon;
      await this.loadUnits();
      await this.loadDrawings();
    }
    if (room) {
      this.context.room = {
        ...this.context.room,
        ...room
      };
    }
  }

  public exportSceneAsPNG() {
    const cam = this.cameras.main;

    const width = this.bg ? this.bg.width : cam.width;
    const height = this.bg ? this.bg.height : cam.height;

    const rt = this.make.renderTexture(
      {
        x: 0,
        y: 0,
        width,
        height
      },
      false
    );

    if (this.bg) rt.draw(this.bg);
    this.drawings.forEach((g) => rt.draw(g));
    this.units.forEach((s) => rt.draw(s));

    const canvas = rt.canvas;
    const pngUrl = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `battle_plan_${Date.now()}.png`;
    a.click();

    rt.destroy();
  }

  private shutdown() {
    if (this.unitsChannel) supabase.removeChannel(this.unitsChannel);
    if (this.drawingsChannel) supabase.removeChannel(this.drawingsChannel);
    this.units.forEach((u) => u.destroy());
    this.drawings.forEach((d) => d.destroy());
    this.clearSelection();
  }

  destroy() {
    this.shutdown();
    // @ts-ignore
    super.destroy();
  }
}
