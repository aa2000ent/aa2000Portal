import { AppColors } from '../constants/AppColors'
import { DarkColorTokens, LightColorTokens, type ThemeMode } from '../constants/LightDarkColorTokens'

/** Shell / marketing accent (header strip, badges) — warm gold on navy */
const shellAccent = '#c9a227'

function setProps(el: HTMLElement, vars: Record<string, string>) {
  for (const [key, val] of Object.entries(vars)) {
    el.style.setProperty(key, val)
  }
}

const brandVars: Record<string, string> = {
  '--aa-navy': AppColors.navy,
  '--aa-navy-deep': AppColors.navyDeep,
  '--aa-navy-light': AppColors.navyMid,
  '--aa-white': AppColors.white,
  '--aa-page-bg': AppColors.pageBg,
  '--aa-border-light': AppColors.borderLight,
  '--aa-text-muted-brand': AppColors.textMuted,
  '--aa-chip-bg': AppColors.chipBg,
  '--aa-tab-inactive': AppColors.tabInactive,
  '--aa-ongoing-green': AppColors.ongoingGreen,
  '--aa-upcoming-blue': AppColors.upcomingBlue,
  '--aa-soft-fill-green': AppColors.softFillGreen,
  '--aa-soft-fill-blue': AppColors.softFillBlue,
  '--aa-blue': AppColors.accentBlue,
  '--aa-blue-dark': AppColors.accentBlueDark,
  '--aa-cyan': LightColorTokens.tint,
  '--aa-accent': shellAccent,
  '--aa-app-bg-gradient': `linear-gradient(to bottom right, ${AppColors.navyDeep} 0%, ${AppColors.navy} 50%, ${AppColors.accentBlue} 100%)`,
}

const shadowLight = {
  '--aa-border': 'rgba(17, 24, 28, 0.07)',
  '--aa-border-strong': 'rgba(17, 24, 28, 0.11)',
  '--aa-shadow-sm': '0 1px 2px rgba(17, 24, 28, 0.045)',
  '--aa-shadow': '0 1px 3px rgba(17, 24, 28, 0.06)',
  '--aa-shadow-md': '0 4px 12px rgba(17, 24, 28, 0.07)',
  '--aa-shadow-lg': '0 8px 24px rgba(17, 24, 28, 0.08)',
}

const shadowDark = {
  '--aa-border': 'rgba(236, 237, 238, 0.07)',
  '--aa-border-strong': 'rgba(236, 237, 238, 0.12)',
  '--aa-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.22)',
  '--aa-shadow': '0 1px 3px rgba(0, 0, 0, 0.24), 0 1px 2px rgba(0, 0, 0, 0.2)',
  '--aa-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.28)',
  '--aa-shadow-lg': '0 8px 28px rgba(0, 0, 0, 0.32)',
}

export function applyPortalThemeCssVars(theme: ThemeMode) {
  const root = document.documentElement
  setProps(root, brandVars)

  if (theme === 'light') {
    const t = LightColorTokens
    const canvas = '#f4f6f9'
    setProps(root, {
      ...shadowLight,
      '--aa-light-canvas': canvas,
      '--aa-bg-light': AppColors.chipBg,
      '--aa-shell-text': t.text,
      '--aa-shell-text-muted': t.icon,
      '--aa-content-bg': t.background,
      '--aa-content-bg-elevated': AppColors.chipBg,
      '--aa-content-border': 'rgba(17, 24, 28, 0.07)',
      '--aa-content-border-strong': AppColors.borderLight,
      '--aa-content-text': t.text,
      '--aa-content-text-muted': AppColors.textMuted,
      '--aa-content-shadow': '0 2px 10px rgba(17, 24, 28, 0.06), 0 1px 3px rgba(17, 24, 28, 0.04)',
      '--aa-field-bg': t.background,
      '--aa-field-border': AppColors.borderLight,
      '--aa-toolbar-bg': AppColors.chipBg,
      '--aa-table-head-bg': AppColors.chipBg,
      '--aa-table-row-alt': AppColors.chipBg,
      '--aa-table-empty-bg': AppColors.chipBg,
      '--aa-roles-list-bg': AppColors.chipBg,
      '--aa-modal-overlay-bg': 'rgba(17, 24, 28, 0.4)',
      '--aa-placeholder-surface': AppColors.chipBg,
      '--aa-slate': t.icon,
      '--aa-slate-dark': AppColors.textMuted,
      '--aa-theme-tint': t.tint,
    })
  } else {
    const t = DarkColorTokens
    const canvas = '#12151a'
    const card = '#1c2128'
    const raised = '#252b34'
    setProps(root, {
      ...shadowDark,
      '--aa-dark-canvas': canvas,
      '--aa-dark-card': card,
      '--aa-dark-raised': raised,
      '--aa-bg-light': AppColors.chipBg,
      '--aa-shell-text': t.text,
      '--aa-shell-text-muted': '#a8b0b8',
      '--aa-content-bg': card,
      '--aa-content-bg-elevated': raised,
      '--aa-content-border': 'rgba(236, 237, 238, 0.08)',
      '--aa-content-border-strong': 'rgba(236, 237, 238, 0.14)',
      '--aa-content-text': t.text,
      '--aa-content-text-muted': '#a8b0b8',
      '--aa-content-shadow': '0 4px 20px rgba(0, 0, 0, 0.28)',
      '--aa-field-bg': raised,
      '--aa-field-border': 'rgba(236, 237, 238, 0.12)',
      '--aa-toolbar-bg': '#181c22',
      '--aa-table-head-bg': '#181c22',
      '--aa-table-row-alt': 'rgba(255, 255, 255, 0.03)',
      '--aa-table-empty-bg': raised,
      '--aa-roles-list-bg': raised,
      '--aa-modal-overlay-bg': 'rgba(6, 8, 12, 0.65)',
      '--aa-placeholder-surface': raised,
      '--aa-slate': t.icon,
      '--aa-slate-dark': '#a8b0b8',
      '--aa-theme-tint': t.tint,
    })
  }
}
