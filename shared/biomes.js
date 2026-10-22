// Biome ids and their boosted / native types; shared by map generation, region data and the sim.
export const B = { ROUTE: 0, FOREST: 1, VOLCANO: 2, SNOW: 3, SWAMP: 4, CAVE: 5, DESERT: 6, SEA: 7, HILLS: 8, CITY: 9, HAUNTED: 10, BEACH: 11 };
export const BIOMES = [
  { n: 'Route', types: [] },
  { n: 'Forest', types: ['grass', 'bug'] },
  { n: 'Volcano', types: ['fire'] },
  { n: 'Snowfield', types: ['ice'] },
  { n: 'Marsh', types: ['poison', 'water'] },
  { n: 'Cave', types: ['rock', 'dark'] },
  { n: 'Desert', types: ['ground'] },
  { n: 'Islands', types: ['water'] },
  { n: 'Hills', types: ['rock', 'fighting', 'ground'] },
  { n: 'City', types: ['electric', 'steel', 'normal'] },
  { n: 'Haunted Grounds', types: ['ghost', 'dark', 'psychic'] },
  { n: 'Beach', types: ['water', 'flying'] },
];
