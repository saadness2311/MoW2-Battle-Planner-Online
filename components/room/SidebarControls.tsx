// components/room/SidebarControls.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type DrawingMode =
  | "none"
  | "free"
  | "line"
  | "arrow"
  | "circle"
  | "polygon"
  | "front"
  | "enemy";

type SidebarControlsProps = {
  currentMapId: string;
  currentEchelon: number;
  drawingMode: DrawingMode;
  selectedSymbol: string | null;
  selectedOwnerSlot: number | null;
  onSetDrawingMode: (mode: DrawingMode) => void;
  onSelectSymbol: (symbol: string | null) => void;
  onSelectOwnerSlot: (slotIndex: number, symbolKey?: string) => void;
  onChangeMap: (mapId: string) => void;
  onResetMap: () => void;
  onClearFront: () => void;
  onClearMap: () => void;
  onSavePlan: () => void;
  onLoadPlan: () => void;
};

// такие же имена иконок, как в оффлайне (assets/symbols/symbX.png)
const ICON_NAMES = [
  "symb1",
  "symb2",
  "symb3",
  "symb4",
  "symb5",
  "symb6",
  "symb7",
  "symb8",
  "symb9",
  "symb10",
  "symb11",
  "symb12",
  "symb13",
  "symb14",
  "symb15",
  "symb16",
  "symb17",
  "symb18",
  "symb19",
  "symb20",
  "symb21",
  "symb22",
  "symb23",
  "symb24",
  "symb25",
  "symb26",
  "symb27",
  "symb28",
  "symb29",
  "symb30",
  "symb31",
  "symb32",
  "symb33",
  "symb34",
  "symb35",
];

const ICON_CATEGORIES: Record<string, string[]> = {
  unit: [
    "symb1",
    "symb2",
    "symb3",
    "symb4",
    "symb5",
    "symb6",
    "symb7",
    "symb8",
    "symb9",
    "symb10",
    "symb11",
    "symb12",
    "symb13",
    "symb14",
    "symb15",
    "symb16",
    "symb17",
    "symb18",
  ],
  engineer: [
    "symb19",
    "symb20",
    "symb21",
    "symb22",
    "symb23",
    "symb24",
    "symb25",
    "symb26",
    "symb27",
    "symb28",
    "symb29",
  ],
  signs: ["symb31", "symb32", "symb33", "symb34", "symb35"],
};

const ICON_LABELS: Record<string, string> = {
  symb1: "Бронеавтомобиль",
  symb2: "Гаубица",
  symb3: "Противотанковая пушка",
  symb4: "ПВО",
  symb5: "Основная пехота",
  symb6: "Тяжёлая пехота",
  symb7: "Специальная пехота",
  symb8: "Вспомогательная пехота",
  symb9: "Подразделение поддержки",
  symb10: "Тяжёлый танк",
  symb11: "Противотанковая САУ",
  symb12: "Лёгкий танк",
  symb13: "Средний танк",
  symb14: "Штурмовая САУ",
  symb15: "Пехотный отряд",
  symb16: "Парашютисты",
  symb17: "Фронтовая авиация",
  symb18: "Вспомогательная техника",
};

const MAP_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const idx = i + 1;
  const label = `Карта ${idx}`;
  return [
    { value: `map${idx}`, label: `${idx}. ${label}-a` },
    { value: `map${idx}-alt`, label: `${idx}. ${label}-b` },
  ];
}).flat();

const REGIMENT_NAMES: Record<string, string[]> = {
  germany: [
    "Самоходный",
    "Развед",
    "Механка",
    "Гаубицы",
    "Моторизованная пехота",
    "Огнеметный",
    "ПВО",
    "Саперка",
    "Гренадерский",
    "Минометный",
    "Штурмовой",
    "Тяжелый танковый",
    "Противотанковый",
    "Средний танковый",
    "Первый артиллерийский",
    "Первый пехотный",
    "Первый танковый",
  ],
  usa: [
    "Самоходный",
    "Развед",
    "Механка",
    "Гаубицы",
    "Моторизованная пехота",
    "Огнеметный",
    "ПВО",
    "Десантный",
    "Тяжелый танковый",
    "Минометный",
    "Саперный",
    "Средний танковый",
    "Противотанковый",
    "Штурмовой",
    "Первый артиллерийский",
    "Первый пехотный",
    "Первый танковый",
  ],
  ussr: [
    "Самоходный",
    "Развед",
    "Механка",
    "Гаубицы",
    "Моторизованная пехота",
    "Огнеметный",
    "ПВО",
    "Саперка",
    "Тяжелый танковый",
    "Минометный",
    "Штурмовой",
    "Средний танковый",
    "Противотанковый",
    "88-ой штурмовой",
    "Первый артиллерийский",
    "Первый пехотный",
    "Первый танковый",
  ],
};

const NATIONS = [
  { value: "ussr", label: "USSR" },
  { value: "germany", label: "Germany" },
  { value: "usa", label: "USA" },
];

export default function SidebarControls({
  currentMapId,
  currentEchelon,
  drawingMode,
  selectedSymbol,
  selectedOwnerSlot,
  onSetDrawingMode,
  onSelectSymbol,
  onSelectOwnerSlot,
  onChangeMap,
  onResetMap,
  onClearFront,
  onClearMap,
  onSavePlan,
  onLoadPlan,
}: SidebarControlsProps) {
  const [mapValue, setMapValue] = useState(currentMapId || "map1");

  useEffect(() => {
    if (currentMapId) {
      setMapValue(currentMapId);
    }
  }, [currentMapId]);

  const toggleMode = (mode: DrawingMode) => {
    onSetDrawingMode(drawingMode === mode ? "none" : mode);
  };

  const handleSymbolClick = (name: string) => {
    if (selectedSymbol === name) {
      onSelectSymbol(null);
    } else {
      onSelectSymbol(name);
    }
  };

  const handleApplyMap = () => {
    if (mapValue) onChangeMap(mapValue);
  };

  const handleResetMap = () => {
    setMapValue("map1");
    onResetMap();
  };

  const handleSelectRegiment = (slotIndex: number, symbolKey: string) => {
    onSelectOwnerSlot(slotIndex, symbolKey);
    onSelectSymbol(symbolKey);
  };

  return (
    <div className="flex flex-col h-full p-3 space-y-4 text-sm">
      <div className="mb-2">
        <div className="text-xs uppercase tracking-wide text-zinc-400 mb-1">
          MoW2 Battle Planner
        </div>
        <div className="flex justify-between items-center text-xs text-zinc-500">
          <span>ru Русский</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-zinc-300">Выберите карту:</div>
        <select
          className="w-full bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={mapValue}
          onChange={(e) => setMapValue(e.target.value)}
        >
          {MAP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1 pt-1">
          <button
            className="flex-1 bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs hover:border-emerald-500"
            onClick={handleApplyMap}
          >
            Загрузить карту
          </button>
          <button
            className="flex-1 bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs hover:border-red-500"
            onClick={handleResetMap}
          >
            Сбросить карту
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-зinc-300">
          Каталог символов
        </div>

        <IconCategoryBlock
          title="Боевые"
          keys={ICON_CATEGORIES.unit}
          selectedSymbol={selectedSymbol}
          onSymbolClick={handleSymbolClick}
        />
        <IconCategoryBlock
          title="Инженерные"
          keys={ICON_CATEGORIES.engineer}
          selectedSymbol={selectedSymbol}
          onSymbolClick={handleSymbolClick}
        />
        <IconCategoryBlock
          title="Знаки"
          keys={ICON_CATEGORIES.signs}
          selectedSymbol={selectedSymbol}
          onSymbolClick={handleSymbolClick}
        />

        <div className="text-[10px] text-zinc-500 pt-1">
          Клик по иконке — выбор символа.  
          ЛКМ по карте (при выключенном рисовании) — поставить выбранный символ.
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-sky-400">Синие (1–5)</div>
        {Array.from({ length: 5 }).map((_, idx) => (
          <RegimentSlot
            key={`blue-${idx + 1}`}
            side="blue"
            index={idx + 1}
            selectedOwnerSlot={selectedOwnerSlot}
            onSelectOwnerSlot={handleSelectRegiment}
          />
        ))}

        <div className="text-xs font-semibold text-red-400 pt-2">
          Красные (6–10)
        </div>
        {Array.from({ length: 5 }).map((_, idx) => (
          <RegimentSlot
            key={`red-${idx + 6}`}
            side="red"
            index={idx + 6}
            selectedOwnerSlot={selectedOwnerSlot}
            onSelectOwnerSlot={handleSelectRegiment}
          />
        ))}
      </div>

      <div className="mt-auto space-y-2 pt-2 border-t border-zinc-800">
        <div className="text-xs font-semibold text-zinc-300">
          Инструменты рисования
        </div>

        <div className="flex flex-col gap-1">
          <button
            className={[
              "bg-[#191b20] border rounded px-2 py-1 text-xs",
              drawingMode === "front"
                ? "border-emerald-500"
                : "border-zinc-700 hover:border-emerald-500",
            ].join(" ")}
            onClick={() => toggleMode("front")}
          >
            Нанести линию фронта
          </button>
          <button
            className={[
              "bg-[#191b20] border rounded px-2 py-1 text-xs",
              drawingMode === "enemy"
                ? "border-emerald-500"
                : "border-zinc-700 hover:border-emerald-500",
            ].join(" ")}
            onClick={() => toggleMode("enemy")}
          >
            Нанести область противника
          </button>
          <button
            className="bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs hover:border-yellow-500"
            onClick={onClearFront}
          >
            Очистить фронт
          </button>
          <button
            className="bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs hover:border-red-500"
            onClick={onClearMap}
          >
            Очистить карту
          </button>
        </div>

        <div className="flex gap-1 pt-1">
          <button
            className="flex-1 bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs hover:border-emerald-500"
            onClick={onSavePlan}
          >
            Сохранить план
          </button>
          <button
            className="flex-1 bg-[#191b20] border border-zinc-700 rounded px-2 py-1 text-xs hover:border-emerald-500"
            onClick={onLoadPlan}
          >
            Загрузить план
          </button>
        </div>

        <div className="text-[10px] text-zinc-500 pt-1">
          Эшелон: {currentEchelon + 1}/3.  
          Эшелоны показывают один бой в трёх временных промежутках.
        </div>
      </div>
    </div>
  );
}

type RegimentSlotProps = {
  side: "blue" | "red";
  index: number; // 1..10
  selectedOwnerSlot: number | null;
  onSelectOwnerSlot: (slotIndex: number, symbolKey: string) => void;
};

function RegimentSlot({
  side,
  index,
  selectedOwnerSlot,
  onSelectOwnerSlot,
}: RegimentSlotProps) {
  const isSelected = selectedOwnerSlot === index;
  const defaultNation = side === "blue" ? "ussr" : "germany";
  const [nation, setNation] = useState<string>(defaultNation);
  const [regiment, setRegiment] = useState<number>(1);

  useEffect(() => {
    setNation(defaultNation);
  }, [defaultNation]);

  const regOptions = useMemo(() => REGIMENT_NAMES[nation] || [], [nation]);
  const symbolKey = `${nation}_reg${regiment}`;
  const regLabel = regOptions[regiment - 1] || `Полк ${regiment}`;

  return (
    <div
      className={[
        "space-y-1 border rounded px-2 py-1 bg-[#181a1f]",
        isSelected ? "border-emerald-500" : "border-zinc-800",
      ].join(" ")}
    >
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span>Слот {index}</span>
        <span>{nation.toUpperCase()}</span>
      </div>
      <div className="flex gap-1 items-center">
        <select
          className="flex-1 bg-[#15171c] border border-zinc-700 rounded px-1 py-[2px] text-[11px]"
          value={nation}
          onChange={(e) => {
            setNation(e.target.value);
            setRegiment(1);
          }}
        >
          {NATIONS.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
        <select
          className="flex-1 bg-[#15171c] border border-zinc-700 rounded px-1 py-[2px] text-[11px]"
          value={regiment}
          onChange={(e) => setRegiment(Number(e.target.value))}
        >
          {regOptions.map((label, idx) => (
            <option key={`${nation}-reg-${idx + 1}`} value={idx + 1}>
              {idx + 1}. {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-[#0f1116] border border-zinc-800 rounded flex items-center justify-center overflow-hidden">
          <img
            src={`/assets/${nation}/reg${regiment}.png`}
            alt={regLabel}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex-1">
          <div className="text-[11px] text-zinc-300">{regLabel}</div>
          <button
            className="mt-1 px-2 py-[2px] text-[11px] bg-[#22252e] border border-zinc-700 rounded hover:border-emerald-500"
            onClick={() => onSelectOwnerSlot(index, symbolKey)}
          >
            Поставить
          </button>
        </div>
      </div>
    </div>
  );
}

type IconCategoryBlockProps = {
  title: string;
  keys: string[];
  selectedSymbol: string | null;
  onSymbolClick: (name: string) => void;
};

function IconCategoryBlock({
  title,
  keys,
  selectedSymbol,
  onSymbolClick,
}: IconCategoryBlockProps) {
  return (
    <div className="mb-1">
      <div className="text-[11px] text-zinc-400 mb-1">{title}</div>
      <div className="grid grid-cols-6 gap-1">
        {keys.map((name) => {
          const isSelected = selectedSymbol === name;
          const label = ICON_LABELS[name] || name;

          return (
            <button
              key={name}
              className={[
                "relative aspect-square bg-[#15171c] border rounded overflow-hidden",
                isSelected
                  ? "border-emerald-500"
                  : "border-zinc-700 hover:border-emerald-500",
              ].join(" ")}
              title={label}
              onClick={() => onSymbolClick(name)}
            >
              <img
                src={`/assets/symbols/${name}.png`}
                alt={label}
                className="w-full h-full object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
