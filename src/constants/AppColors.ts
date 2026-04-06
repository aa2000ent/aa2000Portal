/**
 * Branding, neutrals, tabs, and form/list semantics (light fills + status hues).
 */
export const AppColors = {
  navy: '#000066',
  navyDeep: '#000044',
  /** Mid step for gradients between deep navy and accent */
  navyMid: '#000055',
  accentBlue: '#1a4d99',
  accentBlueDark: '#153d7a',
  pageBg: '#ffffff',
  white: '#ffffff',
  borderLight: '#e2e6ec',
  textMuted: '#5c6570',
  chipBg: '#f0f2f5',
  tabInactive: '#5a6b85',
  ongoingGreen: '#2e7d32',
  upcomingBlue: '#1565c0',
  softFillGreen: '#f1f8f2',
  softFillBlue: '#f0f6fc',
} as const

export type AppColorKey = keyof typeof AppColors
