/**
 * Todos los números del diseño en un solo sitio.
 * La lógica lee de aquí; para ajustar el equilibrio solo se toca este archivo.
 */
export const CONFIG = {
  tech: {
    /** Clave de localStorage. */
    saveKey: 'casino-incremental-save',
    /** Segundos entre autoguardados. */
    autosaveInterval: 5,
    /** Tope de tiempo delta por frame (s), para que una pestaña dormida no dé un salto enorme. */
    maxFrameDt: 0.25,
  },
} as const;

export type Config = typeof CONFIG;
