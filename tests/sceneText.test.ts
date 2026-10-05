import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUTTON_FILL, BUTTON_FILL_DISABLED, BUTTON_FILL_HOVER, contrast, MIN_CAP_HEIGHT, OUTLINE, STYLES, VT323_CAP_RATIO } from '../src/ui/sceneText';

describe('texto de las escenas: inventario de estilos', () => {
  it('todos los estilos: altura de mayúscula ≥ 8 unidades y contraste ≥ 4,5:1 contra su fondo', () => {
    for (const [name, s] of Object.entries(STYLES)) {
      expect(s.size * VT323_CAP_RATIO, name).toBeGreaterThanOrEqual(MIN_CAP_HEIGHT);
      expect(contrast(s.color, s.background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('los números del tapete y de las fichas son más grandes que el resto', () => {
    for (const name of ['numberOnDark', 'numberOnBone', 'chip', 'chipSelected', 'chipDisabled'] as const) {
      expect(STYLES[name].size).toBeGreaterThan(STYLES.label.size);
    }
  });

  it('los botones (también desactivados) se leen sobre su caja', () => {
    expect(contrast(STYLES.button.color, BUTTON_FILL)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(STYLES.buttonHover.color, BUTTON_FILL_HOVER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(STYLES.buttonDisabled.color, BUTTON_FILL_DISABLED)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', OUTLINE)).toBeGreaterThan(15);
  });

  it('ninguna escena dibuja texto por su cuenta: todo pasa por sceneText (sin fuente bitmap)', () => {
    for (const file of readdirSync('src/ui').filter((f) => f.endsWith('.ts') && f !== 'sceneText.ts')) {
      const src = readFileSync(`src/ui/${file}`, 'utf-8');
      expect(/\.fillText\(|\.strokeText\(|ctx\.font\s*=|DIGITS/.test(src), file).toBe(false);
    }
  });
});
