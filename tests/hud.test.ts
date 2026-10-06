import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hudMode } from '../src/ui/stage';

describe('barra superior: un solo modo para las cinco mesas', () => {
  it('el modo depende solo del ancho disponible y del contenido más ancho de todas las mesas', () => {
    // Anchos necesarios en modo completo de las mesas 1-5 (unidades), con una más ancha (la 4).
    const required = [612, 618, 616, 624, 610];
    const modes = [1, 2, 3, 4, 5].map(() => hudMode(640, required));
    expect(new Set(modes).size).toBe(1);
    expect(modes[0]).toBe('completo');
    // Si la más ancha no cabe, todas pasan a compacto a la vez (no solo la 4).
    expect(hudMode(620, required)).toBe('compacto');
    // Con espacio de sobra, siempre completo; sin medidas, completo.
    expect(hudMode(2000, required)).toBe('completo');
    expect(hudMode(0, required)).toBe('completo');
  });

  it('las partes que cambian entre mesas tienen un ancho reservado (saldo, pasivo y botones)', () => {
    const css = readFileSync('src/ui/style.css', 'utf8');
    expect(css).toMatch(/\.hud:not\(\.compact\) \.hud-balance \{ width: \d+px/);
    expect(css).toMatch(/\.hud:not\(\.compact\) \.hud-passive \{ width: \d+px/);
    expect(css).toMatch(/\.hud:not\(\.compact\) \.hud-buttons \{ min-width: \d+px/);
    // El aviso del ayudante no ocupa sitio en la fila.
    expect(css).toMatch(/\.hud-toast \{[^}]*position: absolute/);
  });

  it('cajones: las pestañas de un lado se apartan del cajón abierto (nunca tapan su contenido)', () => {
    const css = readFileSync('src/ui/style.css', 'utf8');
    expect(css).toContain(".table-layer:has(.drawer.left[data-open='true']) .drawer.left[data-open='false']");
    expect(css).toContain(".table-layer:has(.drawer.right[data-open='true']) .drawer.right[data-open='false']");
  });

  it('el cajón en sí no recibe clics (solo su pestaña y su cuerpo), y esa regla gana a la de la capa', () => {
    // Sesión 9: `.drawer { pointer-events: none }` sola perdía contra `.table-layer > * { pointer-events: auto }`
    // (igual de específica y posterior) y el cajón Herencias cerrado tapaba la pestaña Mesa de la mesa 5.
    const css = readFileSync('src/ui/style.css', 'utf8');
    const layer = css.indexOf('.table-layer > * { pointer-events: auto; }');
    const drawer = css.indexOf('.table-layer > .drawer { pointer-events: none; }');
    expect(layer).toBeGreaterThan(-1);
    expect(drawer).toBeGreaterThan(layer);
    expect(css).toContain('.table-layer > .drawer > * { pointer-events: auto; }');
  });
});
