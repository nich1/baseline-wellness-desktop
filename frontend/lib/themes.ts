import { muscles } from './tension';
import { gamingPalettes } from './theme-palettes';

export const themeFields = [
  ['bg', 'Page background', '#0a0a0a', 'Surfaces'],
  ['surface', 'Cards', '#18181b', 'Surfaces'],
  ['surface-raised', 'Inset panels & inputs', '#111113', 'Surfaces'],
  ['surface-hover', 'Hover background', '#202024', 'Surfaces'],
  ['border', 'Borders', '#27272a', 'Surfaces'],
  ['fg', 'Main text', '#fafafa', 'Text & accents'],
  ['muted', 'Secondary text', '#a1a1aa', 'Text & accents'],
  ['subtle', 'Small labels', '#92929e', 'Text & accents'],
  ['accent', 'Accent', '#60a5fa', 'Text & accents'],
  ['accent-hover', 'Accent highlight', '#93c5fd', 'Text & accents'],
  ['danger', 'Errors & destructive actions', '#f87171', 'Text & accents'],
  ['chart', 'Graph lines & points', '#60a5fa', 'Charts & changes'],
  ['weight-up', 'Bodyweight increase', '#f87171', 'Charts & changes'],
  ['weight-down', 'Bodyweight decrease', '#4ade80', 'Charts & changes'],
  ['logo-symbol-main', 'Symbol', '#ffffff', 'Logo'],
  ['logo-symbol-accent', 'Symbol slash', '#00b9e8', 'Logo'],
  ['logo-wordmark-main', 'BASELINE text', '#ffffff', 'Logo'],
  ['logo-wordmark-accent', 'BASELINE accent', '#00b9e8', 'Logo'],
  ...muscles.map(([id, name, color]) => [`muscle-${id}`, name, color, 'Muscle colors']),
] as const;
export type Theme = { id: string; name: string; colors: Record<string, string> };
export const defaultTheme: Theme = { id: 'baseline', name: 'Baseline', colors: Object.fromEntries(themeFields.map(([key,,color]) => [key,color])) };
function preset(id: string, name: string, colors: Record<string,string>): Theme {
  return { id, name, colors: {...defaultTheme.colors, ...colors} };
}
function mix(first: string, second: string, amount: number) {
  return '#' + [1,3,5].map(start => Math.round(
    parseInt(first.slice(start,start+2),16)*(1-amount) + parseInt(second.slice(start,start+2),16)*amount,
  ).toString(16).padStart(2,'0')).join('');
}
function gamingPreset([id,name,collection,bg,accent,chart]: typeof gamingPalettes[number]): Theme {
  const light = collection === 'Light';
  const fg = light ? mix('#20212b',accent,.12) : mix('#fafafa',accent,.08);
  return preset(id,name,{
    bg, fg, surface: light ? '#ffffff' : mix(bg,fg,.055),
    'surface-raised': mix(bg,fg,light ? .035 : .025),
    'surface-hover': mix(bg,fg,light ? .07 : .095),
    border: mix(bg,fg,light ? .20 : .18),
    muted: mix(bg,fg,light ? .75 : .72), subtle: mix(bg,fg,light ? .70 : .65),
    accent, 'accent-hover': mix(accent,light ? '#111111' : '#ffffff',.20), chart,
    danger: light ? '#b4233f' : '#ff879c',
    'weight-up': light ? '#b4233f' : '#ff879c',
    'weight-down': light ? '#247447' : '#78e4a0',
    'logo-symbol-main':fg, 'logo-wordmark-main':fg,
    'logo-symbol-accent':accent, 'logo-wordmark-accent':chart,
  });
}
export const themeCollections = ['All themes','Basics','Neon','Retro','Sci-fi','Fantasy','Minimal','Light','Custom'] as const;
export type ThemeCollection = typeof themeCollections[number];
export const themeCatalog: Record<string,{collection: ThemeCollection; description: string}> = {
  baseline:{collection:'Basics',description:'The original Baseline palette'},
  ocean:{collection:'Basics',description:'Navy and sky blue'},
  forest:{collection:'Basics',description:'Dark green and mint'},
  plum:{collection:'Basics',description:'Purple and lavender'},
  paper:{collection:'Light',description:'Warm white and blue'},
  ...Object.fromEntries(gamingPalettes.map(([id,,collection,,,,description])=>[id,{collection,description}])),
};
export const themePresets: Theme[] = [defaultTheme,
  preset('ocean','Ocean', {bg:'#09121e',surface:'#152438','surface-raised':'#0e1c2d','surface-hover':'#20344b',border:'#2c415b',accent:'#38bdf8','accent-hover':'#7dd3fc',chart:'#38bdf8','logo-symbol-accent':'#38bdf8','logo-wordmark-accent':'#38bdf8'}),
  preset('forest','Forest', {bg:'#0c1410',surface:'#18281e','surface-raised':'#101d15','surface-hover':'#23382a',border:'#304a39',accent:'#6ee7a0','accent-hover':'#a7f3c1',chart:'#6ee7a0','logo-symbol-accent':'#6ee7a0','logo-wordmark-accent':'#6ee7a0'}),
  preset('plum','Plum', {bg:'#160f1d',surface:'#281c33','surface-raised':'#1d1426','surface-hover':'#372544',border:'#4b355b',accent:'#d8a4f6','accent-hover':'#ebccfc',chart:'#d8a4f6','logo-symbol-accent':'#d8a4f6','logo-wordmark-accent':'#d8a4f6'}),
  preset('paper','Paper', {bg:'#f5f3ef',surface:'#ffffff','surface-raised':'#ebe8e2','surface-hover':'#e3e0d9',border:'#ccc7bd',fg:'#242933',muted:'#555e6c',subtle:'#646c78',accent:'#2563eb','accent-hover':'#1d4ed8',danger:'#b91c1c',chart:'#2563eb','weight-up':'#b91c1c','weight-down':'#15803d','logo-symbol-main':'#242933','logo-wordmark-main':'#242933','logo-symbol-accent':'#0284c7','logo-wordmark-accent':'#0284c7'}),
  ...gamingPalettes.map(gamingPreset),
];
export function filterThemes(themes: Theme[], query: string, collection: ThemeCollection) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return themes.filter(theme => {
    const info = themeCatalog[theme.id] ?? {collection:'Custom',description:'Your saved theme'};
    const haystack = `${theme.name} ${info.collection} ${info.description}`.toLowerCase();
    return (collection === 'All themes' || info.collection === collection) && words.every(word=>haystack.includes(word));
  });
}
export const THEME_KEY = 'baseline-themes-v1';
export type ThemePreferences = { active: Theme; custom: Theme[] };
export const defaultPreferences: ThemePreferences = { active: defaultTheme, custom: [] };
export function validTheme(value: unknown): Theme | null {
  if (!value || typeof value !== 'object') return null;
  const theme = value as Partial<Theme>;
  if (typeof theme.id !== 'string' || typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 60 || !theme.colors) return null;
  const colors: Record<string,string> = {};
  for (const [key] of themeFields) {
    const color = theme.colors[key];
    if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) return null;
    colors[key] = color.toLowerCase();
  }
  return { id:theme.id.slice(0,100), name:theme.name.trim(), colors };
}
export function parsePreferences(raw: string | null): ThemePreferences {
  try {
    const parsed = JSON.parse(raw || 'null');
    const active = validTheme(parsed?.active);
    if (!active) return defaultPreferences;
    return { active, custom: Array.isArray(parsed.custom) ? parsed.custom.map(validTheme).filter((theme: Theme | null): theme is Theme => !!theme).slice(0,50) : [] };
  } catch { return defaultPreferences; }
}
// Preserve every original tint for the default palette; derive it from the
// corresponding editable color only when that color actually changes.
export const legacyTones: Record<string,string> = {
  '52525b':'subtle','3f3f46':'border','38383f':'border','33333a':'border','303038':'border','25252b':'surface-hover','1d1d22':'surface-hover',
  '7f1d1d':'danger','2a1215':'danger','fca5a5':'danger','ef4444':'danger','f87171':'danger','4ade80':'weight-down','1e3a5f':'accent',
  '7f8794':'muted','929dad':'subtle','a8afbd':'muted','c1c8d4':'muted','bed8ff':'accent-hover','d7e5ff':'accent-hover','dbe7f7':'fg','e5e9f1':'fg',
  'ffffff04':'fg','ffffff0c':'fg','ffffff14':'fg','a3c7ff08':'accent','a3c7ff12':'accent','a3c7ff30':'accent','a3c7ff40':'accent','b9c6db30':'muted',
};
export function themeVariables(theme: Theme): Record<string,string> {
  const vars = Object.fromEntries(Object.entries(theme.colors).map(([key,value]) => [`--${key}`,value]));
  for (const [hex, role] of Object.entries(legacyTones)) {
    const value = theme.colors[role];
    vars[`--tone-${hex}`] = value === defaultTheme.colors[role] ? `#${hex}` : value + (hex.length===8 ? hex.slice(6) : '');
    if (hex === '2a1215' && value !== defaultTheme.colors[role]) vars[`--tone-${hex}`] = `color-mix(in srgb, ${value} 12%, ${theme.colors.bg})`;
  }
  return vars;
}
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key,value] of Object.entries(themeVariables(theme))) root.style.setProperty(key,value);
  const bg = theme.colors.bg;
  const luminance = .2126*parseInt(bg.slice(1,3),16)+.7152*parseInt(bg.slice(3,5),16)+.0722*parseInt(bg.slice(5,7),16);
  root.style.colorScheme = luminance > 150 ? 'light' : 'dark';
  root.dataset.logoCustom = String(themeFields.filter(([, , ,group]) => group==='Logo').some(([key])=>theme.colors[key]!==defaultTheme.colors[key]));
}
