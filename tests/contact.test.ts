import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from '../src/game/config';
import { REPORT_SUBJECT, reportMailto } from '../src/game/contact';
import { findPendingMarkers } from '../scripts/pendingMarkers';

describe('reportar un problema', () => {
  it('abre el correo al contacto con el asunto, la versión y el navegador', () => {
    const href = reportMailto('1.2.3', 'Mozilla/5.0 (Prueba) Firefox/140.0');
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe(CONTACT_EMAIL);
    expect(url.searchParams.get('subject')).toBe('Rotten Odds · problema');
    expect(REPORT_SUBJECT).toBe('Rotten Odds · problema');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('Versión del juego: 1.2.3');
    expect(body).toContain('Navegador: Mozilla/5.0 (Prueba) Firefox/140.0');
  });

  it('el cuerpo no lleva nada de la partida ni de la cuenta', () => {
    const body = new URL(reportMailto('1.0.0', 'X')).searchParams.get('body')!;
    expect(body).not.toMatch(/fichas|saldo|token|sesión|jugador:|partida:/i);
    expect(body.split('\n').filter((l) => l.includes(':')).length).toBe(3); // la pregunta, versión y navegador
  });
});

describe('contacto en una sola constante', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

  it('la dirección solo aparece escrita en src/game/config.ts', () => {
    const found = [...files('src'), 'index.html', 'privacidad.html'].filter((f) => readFileSync(f, 'utf8').includes(CONTACT_EMAIL));
    expect(found.map((f) => f.replaceAll('\\', '/'))).toEqual(['src/game/config.ts']);
  });

  it('la página de privacidad la recibe del build (%CONTACT_EMAIL%) y no tiene marcadores pendientes', () => {
    const html = readFileSync('privacidad.html', 'utf8');
    expect(html).toContain('href="mailto:%CONTACT_EMAIL%">%CONTACT_EMAIL%</a>');
    expect(html).toMatch(/borrado no hace falta pedirlo: puedes hacerlo tú directamente\s+desde Ajustes/);
    const sinConstantes = html.replaceAll('%CONTACT_EMAIL%', CONTACT_EMAIL).replaceAll('%GAME_TITLE%', 'X');
    expect(findPendingMarkers(sinConstantes)).toEqual([]);
  });
});

describe('marcadores pendientes (el build falla si quedan)', () => {
  it('detecta los marcadores entre corchetes y las constantes sin sustituir', () => {
    expect(findPendingMarkers('Contacto: [PONER CONTACTO].')).toEqual(['[PONER CONTACTO]']);
    expect(findPendingMarkers('Servidor ([UBICACIÓN PENDIENTE: país del centro de datos])')).toHaveLength(1);
    expect(findPendingMarkers('[CONTACTO PENDIENTE: añadir una dirección]')).toHaveLength(1);
    expect(findPendingMarkers('<a href="mailto:%CONTACT_EMAIL%">')).toEqual(['%CONTACT_EMAIL%']);
  });

  it('no confunde textos normales del juego ni del código', () => {
    expect(findPendingMarkers('[`${all ? `TODO · ` : ``}5 fichas`]')).toEqual([]);
    expect(findPendingMarkers('BORRADOR pendiente de revisión')).toEqual([]);
    expect(findPendingMarkers('width: 100%; height: 50%')).toEqual([]);
  });
});
