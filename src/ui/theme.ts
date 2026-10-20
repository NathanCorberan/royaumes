/** Apparence commune des entités : aucun symbole n'est dispersé dans les écrans. */
export interface Look {
  glyph: string
  label: string
}
export const theme: Record<string, Look> = {
  village: { glyph: '🏰', label: 'Village' },
  wood: { glyph: '🪵', label: 'Bois' },
  stone: { glyph: '🪨', label: 'Pierre' },
  gold: { glyph: '🪙', label: 'Or' },
  sawmill: { glyph: '🪚', label: 'Scierie' },
  quarry: { glyph: '⛏️', label: 'Carrière' },
  mine: { glyph: '⚒️', label: 'Mine' },
  dungeon: { glyph: '⚔️', label: 'Donjon' },
  hero: { glyph: '🛡️', label: 'Héros' },
  companion: { glyph: '🤖', label: 'Compagnon' },
  goblin: { glyph: '👺', label: 'Gobelin' },
  skeleton: { glyph: '💀', label: 'Squelette' },
  troll: { glyph: '👹', label: 'Troll' },
  door: { glyph: '🚪', label: 'Porte' },
}
export const look = (kind: string): Look => theme[kind] ?? { glyph: '?', label: kind }
