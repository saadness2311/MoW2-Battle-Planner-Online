"use client";

import { useRef } from "react";
import { savePlan, downloadPlanAsJSON, loadPlanFromJSON } from "@/lib/saveLoad";

export default function SaveLoadPanel({
  roomId,
  userId,
  echelon
}: {
  roomId: string;
  userId: string;
  echelon: number;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleSave() {
    const plan = await savePlan(roomId, userId, echelon);
    if (plan) downloadPlanAsJSON(plan);
  }

  async function handleLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const json = JSON.parse(text);
    await loadPlanFromJSON(roomId, echelon, json);
  }

  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={handleSave}
        className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm"
      >
        Сохранить план (JSON)
      </button>

      <button
        onClick={() => fileRef.current?.click()}
        className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm"
      >
        Загрузить план (JSON)
      </button>

      <input
        type="file"
        accept="application/json"
        ref={fileRef}
        onChange={handleLoadFile}
        className="hidden"
      />
    </div>
  );
}
