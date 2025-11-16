"use client";

export default function UnitIcon({
  icon,
  title,
  onSelect
}: {
  icon: string;
  title: string;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="w-12 h-12 bg-neutral-800 rounded hover:bg-neutral-700 cursor-pointer flex items-center justify-center border border-neutral-600"
      title={title}
    >
      <img src={icon} className="max-w-full max-h-full" />
    </div>
  );
}
