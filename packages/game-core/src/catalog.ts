export const GOODS = [
  { id: 'grain', name: 'Grain', base: 4, color: 0xe6bf72 },
  { id: 'herbs', name: 'Herbs', base: 6, color: 0x92ba9a },
  { id: 'cloth', name: 'Cloth', base: 8, color: 0xb6a4d9 },
  { id: 'tea', name: 'Tea', base: 10, color: 0xc99970 },
  { id: 'iron', name: 'Iron', base: 12, color: 0x94b3ca },
  { id: 'crystal', name: 'Crystal', base: 20, color: 0x86d5ce },
] as const;
export type GoodId = typeof GOODS[number]['id'];

export const TOWNS = [
  {
    id: 'meadow', name: 'Meadow', color: '#a7c9a0', specialty: 'Grain & herbs',
    supply: { grain: 3, herbs: 4, cloth: 9, tea: 11 },
    demand: { grain: 0.9, herbs: 0.9, cloth: 1.3, tea: 1.2, iron: 1.4, crystal: 1.1 },
  },
  {
    id: 'forge', name: 'Forge', color: '#e6aa86', specialty: 'Iron & crystal',
    supply: { iron: 9, crystal: 16, grain: 5, cloth: 9 },
    demand: { grain: 1.3, herbs: 1.4, cloth: 1.1, tea: 1.2, iron: 0.9, crystal: 0.9 },
  },
  {
    id: 'harbor', name: 'Harbor', color: '#9ec6e6', specialty: 'Cloth & tea',
    supply: { cloth: 6, tea: 7, herbs: 7, crystal: 22 },
    demand: { grain: 1.2, herbs: 1.1, cloth: 0.9, tea: 0.9, iron: 1.2, crystal: 1.4 },
  },
] as const;
export type Town = typeof TOWNS[number];

export function priceRange(town: Town, goodId: GoodId) {
  const base = GOODS.find((good) => good.id === goodId)!.base * 1.8 * town.demand[goodId];
  return {
    min: Math.max(1, Math.floor(base * 0.85)),
    max: Math.max(1, Math.floor(base * 1.15)),
  };
}
