/**
 * Theme tokens for text, surfaces, tint (links / focus), and icons.
 */
export const LightColorTokens = {
  text: '#11181C',
  background: '#ffffff',
  tint: '#0a7ea4',
  icon: '#687076',
} as const

export const DarkColorTokens = {
  text: '#ECEDEE',
  background: '#151718',
  tint: '#ffffff',
  icon: '#9BA1A6',
} as const

export type ThemeMode = 'light' | 'dark'
