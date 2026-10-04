# Progreso de la sesión

Archivo de continuidad: si la sesión se corta, la siguiente retoma desde aquí.
Reglas: commits pequeños, sin push ni despliegue, actualizar este archivo tras cada commit, no repetir
simulaciones largas si no han cambiado los números.

## Encargo (resumen)

1. **Bloque 1 — cierre**: estado verde, procesar assets nuevos de la mesa 2, revisar diálogos en la
   mesa 2, resumen del antiguo bloque 4 (abajo).
2. **Bloque 2 — mesa 3 (dados, el Barman)**: paso desde la mesa 2 ("Mesa 2 saldada", pestaña),
   conversión k·ingreso^0,5 calibrada, dos dados con objetivos (más de 7, más de 9, par, doble, doble
   seis) del mismo VE base y distinto riesgo (los difíciles con mejoras), suerte = cargas de
   relanzamiento que se recargan + probabilidad base hasta ~97% en el objetivo seguro (la suerte
   mejora más los arriesgados), penalización por apostar fuerte, jackpot de tres dobles seises
   seguidos con pozo (tope 25% de la deuda, ~6% de las fichas) y racha visible (0/3...), trabajo
   "servir copas" con objetos clicables en su trastienda (vasos sucios, botellas vacías, copas rotas,
   servilletas, propina, objeto raro) "con mejoras"...
3. **El mensaje llegó cortado** en ese punto ("Con mejoras"): el resto del bloque 2 y el bloque 3 no
   llegaron. Se completa la mesa 3 con el mismo patrón que la mesa 2 (ayudante, prestamista con
   diálogo, escena, guardado, servidor, simulación, tests, docs) y se deja anotado.

## Hecho

- [x] B1.1 Estado: git limpio (salvo assets nuevos), 186 tests de cliente y 25 de servidor en verde,
      `shared/plausibility.json` al día.
- [x] B1.2 Assets nuevos de la mesa 2 procesados (trastienda2, basura2, ayudante2) y provisionales
      fuera. Commit 24efc7a.
- [x] B1.3 Diálogos en la mesa 2: mismo motor, mismos cooldowns y mismo ajuste "Diálogos" (si está
      apagado no se dice nada y se cierra el bocadillo). Solo habla el prestamista de la mesa activa;
      al cambiar de mesa se re-basa su vigilante (no comenta lo que pasó mientras no se le veía).
      Commit 24efc7a.
- [x] B1.4 Resumen de la mesa 2 (abajo).

## Pendiente

- Bloque 2: mesa 3 completa (ver plan abajo cuando empiece).

---

## Resumen de la mesa 2 (antiguo bloque 4)

### Cómo arrancar y llegar rápido a la mesa 2

```
npm install
npm run dev
```

Abre http://localhost:5173/?dev=mesa2 y pulsa **Continuar**. Solo en desarrollo: usa un hueco de
guardado aparte (`casino-incremental-save-dev`) con la mesa 1 saldada y todo comprado, y 2.000
monedas; la partida normal no se toca. Para recrearlo, borra la partida en Ajustes con el parámetro
puesto. Backend opcional: `cd server && ./mvnw spring-boot:test-run -Dspring-boot.run.profiles=test`
(con `JWT_SECRET` de 32+ caracteres en el entorno).

### Números que cambiaron y por qué

- Mesa 1: nada (con salas, 8:18 de media con la estrategia (c), dentro de 8 min ±45 s).
- Mesa 2 (nueva, `shared/config.json` → `slots` y `src/game/config.ts` → `slots`):
  - Suerte: base 140, crecimiento 1,6; techo: base 130. Con los costes de la mesa 1 el pasivo de la
    mesa 1 resolvía la tragaperras en 2:40.
  - Conversión k = 0,3 (sin pasivo la mesa 2 tarda 48 min; con k = 1, unos 3).
  - Retener: extra del 25%, salva el 35% + 6%/nivel de las pérdidas, anula el jackpot, el diamante
    no se retiene. Antes, retener un diamante anulaba los tríos y se quedaba fijo: hundía el saldo.
  - Jackpot con pozo progresivo (semilla 50, +15% de cada apuesta, tope 25% de la deuda): sin pozo,
    x1000 al 0,1% daba +100% de valor esperado por tirada.
  - Pareja con apuesta impar redondeada (1 → 2).
  - Resultado (200 partidas): mejor estrategia 12:21, mesa 1 + 2 ≈ 20:40, último tramo ~20 s,
    retener −15% de tiempo, jackpot ~6% de las monedas.
- Guardado v5 (mesa 2 + mesa activa), `shared/plausibility.json` regenerada.

### Decisiones propias

Pozo progresivo; diamante no retenible y retener sin jackpot; el zombi juega en la máquina de al
lado; la trastienda de la mesa 2 tiene la puerta a la izquierda; el objeto raro es una llave dorada
(lo trae el arte); modo `?dev=mesa2`; las líneas de la Tragaperras viviente están pendientes de
revisión (`src/content/dialogue2.es.ts`).

### Assets

Mesa 2 completa. Pendientes de antes: idle del jugador; ruleta con bola y marcador aparte.

### Problemas conocidos

- El brazo esquelético de la Tragaperras viviente conserva un halo rosado de 1 px.
- La mesa 2 no tiene validación estadística en el servidor (solo estructural).
- El panel del navegador integrado recorta las capturas a escala 1 (artefacto del zoom 1,5 de
  Windows); para revisar la escena se exporta el canvas.
