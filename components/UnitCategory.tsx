"use client";

import { useState } from "react";

export default function UnitCategory({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-neutral-700 pb-2 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left text-md font-bold text-neutral-200 py-1"
      >
        {open ? "▼" : "▶"} {title}
      </button>

      {open && <div className="pl-3 pt-2">{children}</div>}
    </div>
  );
}
