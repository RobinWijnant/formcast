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

  amber: '#F3BE5A',
  amberInk: '#3E2601',
  amberText: '#5E3A04',
  amberBorder: '#C27A0E',
  amberFill: '#FFF4DB',
  amberRingTrack: '#EED9AE',
  amberRing: '#A45F05',

  green: '#17803D',
  greenFill: '#E8F5EC',
  greenBorder: '#2F8A52',
  greenInk: '#11592B',

  red: '#B42318',
  redRecord: '#E5483A',
  redFill: '#FDECEA',
  redBorder: '#C23A2A',
  redText: '#7E1F12',

  link: '#1D5FB8',
  dock: '#16181A',
  dockMuted: '#6F767C',
  dockText: '#B9BEC2',
  dockButton: '#2B2F33',
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
