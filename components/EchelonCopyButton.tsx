"use client";

import { useState } from "react";
import { copyEchelon } from "@/lib/echelonCopy";

type Props =
  | { onCopy: () => Promise<void> | void }
  | { roomId: string; from: number; to: number; onCopy?: undefined };

export default function EchelonCopyButton(props: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function doCopy() {
    setLoading(true);
    if ("roomId" in props) {
      await copyEchelon(props.roomId, props.from, props.to);
    } else if (props.onCopy) {
      await props.onCopy();
    }
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
      {loading
        ? "Копирование..."
        : done
          ? "✓ Готово"
          : "roomId" in props
            ? `Эш. ${props.from + 1} → ${props.to + 1}`
            : "Скопировать текущий → следующий"}
    </button>
  );
}
