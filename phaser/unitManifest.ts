export type UnitDefinition = {
  id: string;
  name: string;
  icon: string;
  nation: string;
  type: string;
};

export const UNIT_MANIFEST: UnitDefinition[] = [
  {
    id: "ussr_t34",
    name: "Т-34",
    icon: "/assets/icons/ussr/t34.png",
    nation: "USSR",
    type: "tank"
  },
  {
    id: "ger_pz4",
    name: "Pz. IV",
    icon: "/assets/icons/ger/pz4.png",
    nation: "GER",
    type: "tank"
  },
  {
    id: "usa_sherman",
    name: "Sherman",
    icon: "/assets/icons/usa/sherman.png",
    nation: "USA",
    type: "tank"
  }
];
