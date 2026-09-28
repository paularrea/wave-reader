import { test, expect } from '@playwright/test';
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY, parsePreference, resolveTheme } from '../../src/services/theme';

test.describe('spec: appearance / Auto, claro u oscuro', () => {
  test('Auto follows the phone; an explicit choice wins over it', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  test('anything stored that is not light or dark reads as Auto', () => {
    expect(parsePreference('dark')).toBe('dark');
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference(null)).toBe('auto');
    expect(parsePreference('sepia')).toBe('auto');
  });

  test('the boot script reads the same key the app writes', () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    // It runs before anything loads, so it must parse on its own.
    expect(() => new Function(THEME_BOOT_SCRIPT)).not.toThrow();
  });
});
