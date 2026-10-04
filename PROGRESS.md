# Progreso

Archivo de continuidad: si la sesión se corta, la siguiente retoma desde aquí.
Reglas: commits pequeños, actualizar este archivo tras cada commit, no repetir simulaciones largas si
no han cambiado los números. Carpeta de trabajo: `C:ideojuego` (fuera de OneDrive).

## Sesión actual (bloques 0-3: comprobaciones y push, regeneración rápida y mesa 3, mesa 4, cierre)

### Hecho

- [x] B0.1 Rutas absolutas: ninguna en el código, la configuración, los scripts ni los tests.
- [x] B0.2 Tests en la ruta nueva: cliente 208 en verde, servidor 26 en verde.
- [x] B0.3 Seguridad: `.env` no está en git ni en su historial; `.env.example` sin valores reales. Sin
      secretos en el árbol ni en el historial; el único "secreto" es el de prueba del perfil `test`
      (`test-secret-only-for-automated-tests-...`, solo H2 y tests). `.gitignore` ampliado: `.env.*`
      (salvo `.env.example`), `*.pem`, `*.key`, `server/target/`.
- [x] B0.4 **Push pendiente: falta remoto** (no hay `git remote` y `gh` no está instalado).
- [x] B0.5 README: "Cómo arrancar el proyecto desde cero en otra máquina", comprobado con un clon
      limpio (npm ci, tests, build y servidor respondiendo en ~28 s).

- [x] B1.1 Regeneración rápida de `shared/plausibility.json`:
      - Antes: 817 s (la última, secuencial; ~14 min). Ahora: **81 s** con cambios en la mesa 1 y
        **3 s** si la mesa 1 no cambió (caché). Tabla idéntica byte a byte a la anterior y a la
        secuencial (`--workers 1`).
      - Workers (`sim/plausibility-worker.ts`): uno por núcleo, lotes dinámicos de 8 partidas, cada
        partida con estrategia y semilla fijas y su resultado en su índice. Los workers se cierran al
        acabar y el proceso sale con `process.exit(0)`: sin huérfanos (comprobado).
      - Caché por mesa en `shared/plausibility-cache.json`: hash de lo que determina la tabla de la mesa
        1 (su parte de `shared/config.json`, su parte de `config.ts` y el código del motor). La tabla
        estadística es solo de la mesa 1 (el servidor no valida estadísticamente las demás), así que
        cambiar las mesas 2+ solo recalcula el hash del archivo.
      - `--full` (300 por estrategia, la de `npm run plausibility`) y `--quick` (200 en total,
        `npm run plausibility:quick`); el test exige `mode: full`.
      - Motor más rápido sin cambiar resultados: casillas de la ruleta memorizadas, `WorkHost` uno
        por estado (con getters), `itemValue` sin construir el host, y comprobaciones baratas antes que
        las de la estrategia en el bucle de compras.
      - **Objetivo de "una mesa sola por debajo de 1 min" no alcanzado en esta máquina**: la mesa 1
        son 2.100 partidas de 30 min de juego y el portátil (i5-8265U) tiene 4 núcleos físicos; ya va
        3,7 veces más rápido que en secuencial y está limitado por la CPU.

### Pendiente

- B1.2 camarero agresivo, B1.3 tramo final de la mesa 3, B1.4 regenerar --full
- B2 mesa 4 (blackjack, la Crupier)
- B3 cierre

---

## Sesión anterior


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

## Pendiente (mesa 3, en este orden; marcar al terminar cada uno)

- [x] M3.1 config (`shared/config.json` → `dice`, `config.ts` → `dice`) y estado (`src/game/dice/`)
- [x] M3.2 lógica: dados, objetivos, relanzamientos, penalización, jackpot con racha y pozo; tests
- [x] M3.3 mesa: mejoras, ayudante (camarero fantasma), trabajo, conversión desde la mesa 2, deuda; tests
- [x] M3.4 guardado v6 + migración; activeTable 1|2|3; tests (plausibility.json pendiente de regenerar al final: su test falla hasta entonces)
- [x] M3.5 simulación (`npm run simulate:dice`) y calibración: suerte base 420, techo base 350, recarga de relanzamientos 16 s; k = 0,3. (d) 13:41 con 30 partidas; el informe de 200 partidas queda en el scratchpad y se resume en GAME_DESIGN 4c. El camarero elige objetivo por crecimiento (Kelly), no por VE: por VE perseguía el doble seis y hundía el saldo.
- [x] M3.6 assets (barman, dados, fondo-mesa3, camarero) + provisionales (trastienda3, basura3, friegaplatos)
- [x] M3.7 escena, HUD/cajones, pestaña 3, transición, cartel "Mesa 2 saldada"
- [x] M3.8 diálogo del Barman (pendiente de revisión)
- [x] M3.9 servidor v6 (validación estructural de la mesa 3)
- [x] M3.9b `shared/plausibility.json` regenerada (2.100 partidas en 817 s) · 208 tests de cliente y 26 de servidor en verde.
- [x] M3.10 docs (GAME_DESIGN 4c, README) y resumen final aquí

## Diseño de la mesa 3 (decisiones propias)

- Moneda: **chapas**. Deuda 10M.
- 2 dados. Objetivos (como los tipos de apuesta de la ruleta: mismo VE base, distinto riesgo):
  `p = p_par · r · m(L)`, pago neto `2/r − 1`:
  par (r 1, 1:1), más de 7 (r 15/18, 1,4:1), más de 9 (r 1/3, 5:1), doble (r 1/3, 5:1),
  doble seis (r 1/18, 35:1). m sube con la suerte más en los arriesgados. Par y más de 7 desde el
  principio; más de 9 y doble con una mejora; doble seis con otra.
- p_par: 0,486 → 0,97 (curva 1,6); penalización por fracción del techo como siempre.
- Relanzamientos: cargas que da la suerte (máximo 1 + nivel/4) y se recargan con el tiempo (cada
  24 s × 0,93^nivel); tras una tirada perdida se puede relanzar un dado (honrado). Reserva común con
  el ayudante, que relanza si la probabilidad de convertir es ≥ 1/3.
- Jackpot: tres dobles seises seguidos (racha visible). Los dados del Barman están cargados: el doble
  seis sale con probabilidad `j^(1/3)` (siempre dentro de las tiradas ganadoras), con j la
  probabilidad de jackpot de siempre (0,1% → 1,5%). Paga min(apuesta × 500, pozo, 25% deuda); pozo
  progresivo como en la mesa 2.
- Trabajo: servir copas (vaso sucio, servilleta, botella vacía, copa rota, propina, dentadura de oro).
- Ayudante: camarero fantasma (tercer panel de la hoja de ayudantes).
- Duración objetivo: ~14 min con la mejor estrategia (el mensaje se cortó antes de dar una cifra).
- Ajustes tras simular: suerte base 420 y techo base 350 (con 140/130 la mesa duraba 7:30), recarga
  de relanzamientos 16 s (con 24 s apenas importaban), y el camarero elige objetivo por crecimiento
  del saldo (por valor esperado perseguía el doble seis con apuestas grandes y hundía el saldo).

## Resumen final de esta sesión

### Cómo probar

`npm run dev` y abre http://localhost:5173/?dev=mesa3 → Continuar (hueco de guardado aparte con
las mesas 1 y 2 saldadas). `?dev=mesa2` sigue funcionando (ahora en `casino-incremental-save-dev2`).
Mesa 3: elige objetivo (clic o Q W E R T), ficha (1-4), Espacio para tirar; si fallas y hay cargas,
clic en un dado para relanzarlo o ACEPTAR.

### Resultados de la mesa 3 (200 partidas)

Mejor estrategia (todos los objetivos y relanzando) 13:14; solo par sin relanzar 14:32; siempre
doble seis 16:19; siempre TODO 20:57 (quiebra); mesas 1+2+3 ≈ 34 min. Jackpot ~4% de las chapas,
~3,6 por partida. Sin pasivo de la mesa 2 tardaría ~57 min. Detalle en GAME_DESIGN 4c.

### Números que cambiaron

- Nuevos: sección `dice` de `shared/config.json` y `config.ts` (ver GAME_DESIGN 4c.4).
- Guardado v6 (con migración desde v5), `shared/plausibility.json` regenerada.
- Mesa 2: el objeto raro pasa a ser la llave dorada (lo trae el arte). Nada más.

### Decisiones propias

Moneda "chapas"; objetivos como los tipos de apuesta de la ruleta (mismo VE base vía `r·(1+pago)=2`,
multiplicador de suerte mayor en los arriesgados); cargas de relanzamiento ligadas al nivel de
suerte y reserva común con el ayudante; una tirada perdida queda abierta hasta relanzar, aceptar o
volver a tirar; dados cargados (doble seis con probabilidad j^(1/3)) para que la racha de tres sea
visible sin que el jackpot domine; pago x500 con pozo; camarero por criterio de Kelly; duración ~14
min; atajos Q W E R T para los objetivos.

### Assets que faltan (provisionales; tamaños y prompts en GAME_DESIGN 8.1)

Trastienda del bar (640x360), 6 objetos de basura de la mesa 3 (32x32), friegaplatos (64x64, 2
frames). Pendientes de antes: idle del jugador; ruleta con bola y marcador aparte.

### Problemas conocidos

- El mensaje de esta sesión llegó cortado en "Con mejoras" (bloque 2, punto 6): no llegó el resto
  del bloque 2 ni el bloque 3. Hay que reenviarlo para seguir.
- Las líneas del Barman y de la Tragaperras viviente están pendientes de revisión.
- Las piernas translúcidas del camarero fantasma conservan algo de tono rosado.
- Jugar a "más de 7" o a los arriesgados sin relanzar empata con jugar solo a par: compensan con
  suerte alta, pero esa fase es corta. Si se quiere que pesen más, subir sus multiplicadores máximos.
- Las mesas 2 y 3 no tienen validación estadística en el servidor (solo estructural).

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
