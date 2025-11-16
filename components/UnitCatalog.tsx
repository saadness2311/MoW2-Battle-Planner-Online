"use client";

import { UNIT_MANIFEST, UnitDefinition } from "@/phaser/unitManifest";
import UnitCategory from "./UnitCategory";
import UnitGrid from "./UnitGrid";

export default function UnitCatalog() {
  const nations = [...new Set(UNIT_MANIFEST.map((u) => u.nation))];

  function selectUnit(unit: UnitDefinition) {
    window.dispatchEvent(new CustomEvent("SET_CREATE_UNIT", { detail: unit }));
  }

  return (
    <div className="text-sm">
      {nations.map((nation) => {
        const units = UNIT_MANIFEST.filter((u) => u.nation === nation);
        return (
          <UnitCategory key={nation} title={nation}>
            <UnitGrid units={units} onSelect={selectUnit} />
          </UnitCategory>
        );
      })}
    </div>
  );
}
