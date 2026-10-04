/**
 * Sprites generados por `npm run assets` en assets/sprites/. Vite los empaqueta (import.meta.glob)
 * y aquí se cargan como imágenes. Mientras no cargan, la escena dibuja un marcador o nada.
 */

// Vite exige las opciones escritas literalmente en cada llamada a import.meta.glob.
const urls = {
  trash: import.meta.glob<string>('../../assets/sprites/trash/*.png', { eager: true, query: '?url', import: 'default' }),
  player: import.meta.glob<string>('../../assets/sprites/player/*.png', { eager: true, query: '?url', import: 'default' }),
  lender: import.meta.glob<string>('../../assets/sprites/lender/*.png', { eager: true, query: '?url', import: 'default' }),
  lenderScene: import.meta.glob<string>('../../assets/sprites/lender-scene/*.png', { eager: true, query: '?url', import: 'default' }),
  roulette: import.meta.glob<string>('../../assets/sprites/roulette/*.png', { eager: true, query: '?url', import: 'default' }),
  chips: import.meta.glob<string>('../../assets/sprites/chips/*.png', { eager: true, query: '?url', import: 'default' }),
  helpers: import.meta.glob<string>('../../assets/sprites/helpers/*.png', { eager: true, query: '?url', import: 'default' }),
  backgrounds: import.meta.glob<string>('../../assets/sprites/backgrounds/*.png', { eager: true, query: '?url', import: 'default' }),
  slots: import.meta.glob<string>('../../assets/sprites/slots/*.png', { eager: true, query: '?url', import: 'default' }),
  lender2Scene: import.meta.glob<string>('../../assets/sprites/lender2-scene/*.png', { eager: true, query: '?url', import: 'default' }),
  trash2: import.meta.glob<string>('../../assets/sprites/trash2/*.png', { eager: true, query: '?url', import: 'default' }),
};

export type PlayerFrame = 'walk-1' | 'walk-2' | 'crouch' | 'lift';
export type Sprites = Record<keyof typeof urls, Map<string, HTMLImageElement>>;

function loadAll(group: Record<string, string>): Map<string, HTMLImageElement> {
  const images = new Map<string, HTMLImageElement>();
  for (const [path, url] of Object.entries(group)) {
    const name = path.split('/').pop()!.replace('.png', '');
    const img = new Image();
    img.src = url;
    images.set(name, img);
  }
  return images;
}

export function loadSprites(): Sprites {
  return Object.fromEntries(Object.entries(urls).map(([k, group]) => [k, loadAll(group)])) as Sprites;
}

export function ready(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}
