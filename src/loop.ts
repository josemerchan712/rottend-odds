export interface LoopCallbacks {
  /** Lógica: recibe el tiempo delta en segundos. */
  update(dt: number): void;
  /** Pintado: una vez por frame, después de update. */
  render(): void;
}

/**
 * Bucle con requestAnimationFrame y tiempo delta.
 * El delta se limita a maxDt para que volver a una pestaña dormida no provoque un salto enorme
 * (el progreso offline se calculará aparte).
 */
export function startLoop(callbacks: LoopCallbacks, maxDt: number): () => void {
  let last: number | null = null;
  let handle = 0;

  const frame = (now: number) => {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, maxDt);
    last = now;
    callbacks.update(dt);
    callbacks.render();
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);

  return () => cancelAnimationFrame(handle);
}
