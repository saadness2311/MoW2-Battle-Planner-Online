"use client";

export default function UnitSlotsPanel({
  activeSlot,
  setActiveSlot
}: {
  activeSlot: number;
  setActiveSlot: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1 bg-neutral-800 rounded px-2 py-1">
      {Array.from({ length: 10 }).map((_, i) => (
        <button
          key={i}
          onClick={() => setActiveSlot(i)}
          className={`px-2 py-1 rounded text-xs ${
            activeSlot === i
              ? "bg-yellow-500 text-black"
              : "bg-neutral-700 hover:bg-neutral-600"
          }`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
