// components/room/EchelonSwitcher.tsx
"use client";

type EchelonSwitcherProps = {
  current: number; // 0..(total-1)
  total: number;
  onChange: (index: number) => void;
};

export default function EchelonSwitcher({
  current,
  total,
  onChange,
}: EchelonSwitcherProps) {
  const labels = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="bg-[#111216]/95 border border-zinc-800 rounded-full px-2 py-1 shadow-lg shadow-black/40 flex items-center gap-1">
      {labels.map((label, i) => {
        const active = i === current;
        return (
          <button
            key={i}
            type="button"
            className={[
              "px-2.5 py-[3px] text-[11px] rounded-full border transition-colors",
              active
                ? "bg-emerald-500/90 border-emerald-300 text-black font-semibold"
                : "bg-[#181b22] border-zinc-700 text-zinc-300 hover:border-emerald-400 hover:text-emerald-200",
            ].join(" ")}
            onClick={() => onChange(i)}
          >
            Эш. {label}
          </button>
        );
      })}
    </div>
  );
}
