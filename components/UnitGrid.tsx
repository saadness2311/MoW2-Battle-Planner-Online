"use client";

import UnitIcon from "./UnitIcon";
import { UnitDefinition } from "@/phaser/unitManifest";

export default function UnitGrid({
  units,
  onSelect
}: {
  units: UnitDefinition[];
  onSelect: (u: UnitDefinition) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {units.map((u) => (
        <UnitIcon key={u.id} icon={u.icon} title={u.name} onSelect={() => onSelect(u)} />
      ))}
    </div>
  );
}
