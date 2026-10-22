// Held items: one per Pokémon, found on the map, kept through evolution. Flags are read by sim.js.
export const HELD = {
  'choice-band': { n: 'Choice Band', e: 'Physical attack +50%', atk: 1.5 },
  'choice-specs': { n: 'Choice Specs', e: 'Special attack +50%', spa: 1.5 },
  'choice-scarf': { n: 'Choice Scarf', e: 'Movement speed +30%', speed: 1.3 },
  leftovers: { n: 'Leftovers', e: 'Restores 1.5% HP every second', regen: 0.015 },
  'life-orb': { n: 'Life Orb', e: '+30% damage, but costs 10% of damage dealt', power: 1.3, recoil: 0.1 },
  'focus-sash': { n: 'Focus Sash', e: 'Survive one lethal hit from full HP (used up)', sash: 1 },
  'shell-bell': { n: 'Shell Bell', e: 'Heals 1/8 of damage dealt', bell: 0.125 },
  'quick-claw': { n: 'Quick Claw', e: 'Moves recharge 15% faster', cd: 0.85 },
  'expert-belt': { n: 'Expert Belt', e: 'Super-effective hits +20%', expert: 1.2 },
  'rocky-helmet': { n: 'Rocky Helmet', e: 'Contact attackers lose 1/6 of their HP', helmet: 1 / 6 },
  'scope-lens': { n: 'Scope Lens', e: 'Raises critical-hit ratio', crit: 1 },
  'lucky-egg': { n: 'Lucky Egg', e: 'EXP gained +50%', exp: 1.5 },
  'assault-vest': { n: 'Assault Vest', e: 'Sp. Def +50%', spd: 1.5 },
  eviolite: { n: 'Eviolite', e: 'Def and Sp. Def +50% if it can still evolve', evio: 1 },
};
export const HELD_NAMES = Object.keys(HELD);
