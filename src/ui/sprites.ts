/**
 * Sprites generados por `npm run assets` en assets/sprites/. Vite los empaqueta (import.meta.glob)
 * y aquí se cargan como imágenes. Mientras no cargan, la escena dibuja un marcador.
 */

const trashUrls = import.meta.glob<string>('../../assets/sprites/trash/*.png', { eager: true, query: '?url', import: 'default' });
const playerUrls = import.meta.glob<string>('../../assets/sprites/player/*.png', { eager: true, query: '?url', import: 'default' });

export type PlayerFrame = 'walk-1' | 'walk-2' | 'crouch' | 'lift';

function loadAll(urls: Record<string, string>): Map<string, HTMLImageElement> {
  const images = new Map<string, HTMLImageElement>();
  for (const [path, url] of Object.entries(urls)) {
    const name = path.split('/').pop()!.replace('.png', '');
    const img = new Image();
    img.src = url;
    images.set(name, img);
  }
  return images;
}

export interface Sprites {
  trash: Map<string, HTMLImageElement>;
  player: Map<string, HTMLImageElement>;
}

export function loadSprites(): Sprites {
  return { trash: loadAll(trashUrls), player: loadAll(playerUrls) };
}

export function ready(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}
