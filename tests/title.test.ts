import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_TAGLINE, GAME_TITLE } from '../src/game/config';

/** Todos los .ts de una carpeta, recursivo. */
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, 'utf8');

describe('nombre del juego', () => {
  it('es ROTTEN ODDS, con su subtítulo', () => {
    expect(GAME_TITLE).toBe('ROTTEN ODDS');
    expect(GAME_TAGLINE).toBe('La casa siempre cobra');
  });

  it('la página, el README y DEPLOY.md usan el título; index.html lo toma de config', () => {
    const html = read('index.html');
    expect(html).toContain('<title>%GAME_TITLE% · %GAME_TAGLINE%</title>');
    expect(html).toContain('og:title" content="%GAME_TITLE%"');
    expect(read('README.md').split(/\r?\n/)[0]).toBe(`# ${GAME_TITLE}`);
    expect(read('DEPLOY.md')).toContain(GAME_TITLE);
  });

  it('no queda ninguna aparición del título provisional "CASINO"', () => {
    const files = ['index.html', 'README.md', 'DEPLOY.md', 'server/src/main/java/dev/casino/config/OpenApiConfig.java', ...tsFiles('src'), ...tsFiles('scripts')];
    // El título provisional: CASINO en mayúsculas, o "Casino" como título (en una etiqueta, un
    // atributo, un encabezado o un texto entre comillas). La palabra "casino" del juego (la sala) y los
    // identificadores (returnCasino, CasinoTarget) no cuentan.
    const provisional = [/\bCASINO\b/, /<title>\s*Casino/, /content="Casino/, /<h1>\s*Casino/, /^#\s*Casino/m, /['"`]Casino\b/, /\.title\("Casino/];
    const offenders = files.flatMap((file) => {
      const text = read(file);
      return provisional.filter((re) => re.test(text)).map((re) => `${file}: ${re}`);
    });
    expect(offenders).toEqual([]);
  });
});
