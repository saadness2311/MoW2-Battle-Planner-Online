"use client";

import { useState } from "react";
import { copyEchelon } from "@/lib/echelonCopy";

export default function EchelonCopyButton({
  roomId,
  from,
  to
}: {
  roomId: string;
  from: number;
  to: number;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function doCopy() {
    setLoading(true);
    await copyEchelon(roomId, from, to);
    setLoading(false);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      onClick={doCopy}
      disabled={loading}
      className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm disabled:opacity-50"
    >
      {loading ? "Копирование..." : done ? "✓ Готово" : `Эш. ${from + 1} → ${to + 1}`}
    </button>
  );
}
