// Design tokens from the Formcast canvas.
export const colors = {
  ground: '#F2F3EF',
  surface: '#FFFFFF',
  ink: '#16181A',
  text: '#3B3F43',
  textMuted: '#5C6166',
  textFaint: '#6B7176',
  empty: '#9AA0A5',
  icon: '#7A8086',
  divider: '#EEF0EB',
  border: '#DDE0DA',
  chip: '#E4E6E1',
  chipRemoved: '#E9EBE6',
  dashed: '#B8BCB6',
  hairline: '#E2E4DF',
  handle: '#D5D8D3',
  textDisabled: '#7D8287',
  scrim: 'rgba(22,24,26,0.48)',
  badgeGray: '#E3E5E0',
  badgeGrayText: '#4A4F54',
  /** Text and icons on ink or other dark fills. */
  onInk: '#FFFFFF',
  onInkMuted: '#C9CDD0',
  shine: '#FFFFFF',

  amber: '#F3BE5A',
  amberInk: '#3E2601',
  amberText: '#5E3A04',
  amberBorder: '#C27A0E',
  amberFill: '#FFF4DB',
  amberRingTrack: '#EED9AE',
  amberRing: '#A45F05',
  amberRingIcon: '#7A4A05',
  amberButtonText: '#2A1A01',
  amberGlow: 'rgba(243,190,90,0.28)',
  amberPrevious: '#8A6A3A',

  green: '#17803D',
  greenFill: '#E8F5EC',
  greenBorder: '#2F8A52',
  greenInk: '#11592B',
  greenTint: '#E3F3E7',

  red: '#B42318',
  redRecord: '#E5483A',
  redFill: '#FDECEA',
  redBorder: '#C23A2A',
  redText: '#7E1F12',
  redSoftBorder: '#F0C9C3',
  recordDot: '#F04438',
  badgeRed: '#F2ADA3',
  badgeRedText: '#5A1308',

  link: '#1D5FB8',
  dock: '#16181A',
  dockMuted: '#6F767C',
  dockText: '#B9BEC2',
  dockButton: '#2B2F33',
  dockFaint: '#8A9096',
  dockErrorFill: '#3A1D1A',
  dockErrorIcon: '#F49A8F',
  dockErrorText: '#E3C4BF',

  mapLand: '#E7EAE3',
  mapPark: '#D9E8D3',
  mapRoad: '#FFFFFF',
  mapPin: '#E5483A',
  glassFill: 'rgba(255,255,255,0.62)',
  glassBorder: 'rgba(255,255,255,0.7)',
  glassIcon: 'rgba(22,24,26,0.07)',
};

/** Pill colours per priority. */
export const PRIORITY_TONE: Record<string, { bg: string; fg: string }> = {
  low: { bg: '#E1EBF7', fg: '#1D4A85' },
  medium: { bg: '#FCE7D2', fg: '#8A4210' },
  high: { bg: '#FBE0DC', fg: '#8F2416' },
};

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
};

export const radius = { card: 18, row: 13, pill: 14, sheet: 28 };

/** Delay before a heard proposal settles into the form (Settings can change it). */
export const DEFAULT_FILL_DELAY_MS = 5000;
