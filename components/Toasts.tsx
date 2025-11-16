"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; text: string };

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: any) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, text: e.detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2500);
    };

    window.addEventListener("toast", handler);
    return () => window.removeEventListener("toast", handler);
  }, []);

  return (
    <div className="fixed top-3 right-3 flex flex-col gap-2 z-[2000] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-neutral-900/85 text-neutral-100 px-3 py-1 rounded shadow pointer-events-none text-sm border border-neutral-700"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
