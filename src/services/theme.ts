/**
 * Light, dark, or whatever the phone says.
 *
 * The preference lives in localStorage and the resolved theme on
 * `<html data-theme>`, set by an inline script before the first paint so a
 * dark phone never flashes a white page on open. Everything else reads the
 * attribute: CSS through the tokens in globals.css, components through
 * `useTheme`.
 */

export type ThemePreference = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['auto', 'light', 'dark'];
export const THEME_STORAGE_KEY = 'wave-reader:theme';
/** Dispatched on `window` whenever the preference or the resolved theme changes. */
export const THEME_EVENT = 'wave-reader:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Browser chrome follows the map's ground, so the status bar blends into it. */
export const THEME_COLOR: Record<Theme, string> = {
  light: '#E9EDF0',
  dark: '#0A0D10',
};

/** Mapbox's own quiet basemaps: grey enough that the markers carry the colour. */
export const MAP_STYLE: Record<Theme, string> = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export function parsePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === 'auto') return systemDark ? 'dark' : 'light';
  return preference;
}

export function readPreference(): ThemePreference {
  try {
    return parsePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Private windows and blocked storage: the phone's setting still applies.
    return 'auto';
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches === true;
}

/** The theme on screen, as the boot script or the last change left it. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * The browser-chrome colour. The tag is created here and by the boot script,
 * never rendered by React: React 19 hoists a rendered <meta> and adds its own
 * copy on hydration, and two theme colours is one too many.
 */
function themeColorMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  return meta;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }
  themeColorMeta().content = THEME_COLOR[theme];
}

export function savePreference(preference: ThemePreference) {
  try {
    if (preference === 'auto') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted, but still applied for this visit.
  }
  applyTheme(resolveTheme(preference, systemPrefersDark()));
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Follows the phone when it switches (at dusk, typically) while on Auto. */
export function watchSystemTheme(): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  const onChange = () => {
    if (readPreference() !== 'auto') return;
    applyTheme(resolveTheme('auto', query.matches));
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Inlined in <head>, so it runs before the body paints. It duplicates
 * `resolveTheme` and `applyTheme` on purpose: nothing is loaded yet.
 */
export const THEME_BOOT_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})}catch(e){}var d=p==='dark'||(p!=='light'&&window.matchMedia&&matchMedia(${JSON.stringify(
  DARK_QUERY
)}).matches);var t=d?'dark':'light';var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;var m=document.createElement('meta');m.name='theme-color';m.content=t==='dark'?${JSON.stringify(
  THEME_COLOR.dark
)}:${JSON.stringify(THEME_COLOR.light)};document.head.appendChild(m)})();`;
