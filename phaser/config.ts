import * as Phaser from "phaser";
import BattleScene from "./scenes/BattleScene";

export function createPhaserConfig(
  parent: HTMLDivElement
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 1280,
    height: parent.clientHeight || 720,
    backgroundColor: "#111111",
    physics: {
      default: "arcade",
      arcade: { debug: false }
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BattleScene]
  };
}
