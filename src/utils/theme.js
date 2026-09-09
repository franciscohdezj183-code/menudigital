export const DEFAULT_THEME_COLOR = '#9250D8';
export function themeColor(value) {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : DEFAULT_THEME_COLOR;
}
export const themeStyle = value => ({ '--brand-color': themeColor(value) });
