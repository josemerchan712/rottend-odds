# Progreso

Archivo de continuidad: si la sesión se corta, la siguiente retoma desde aquí.
Reglas: commits pequeños, actualizar este archivo tras cada commit, no repetir simulaciones largas si
no han cambiado los números. Carpeta de trabajo: `C:\videojuego` (fuera de OneDrive).

## Sesión 5 (bloques 1-6: sin trastienda en 2-4, auditoría de ayudantes, texto nítido, mesa 5, publicación, sonido)

Remoto: `origin` (GitHub, privado). Push al final de cada bloque, nunca con force.

### Hecho

- [x] **B1 Sin trastienda en las mesas 2-4.** Fuera puerta, Tab, basura, jugador, aprendices y mejoras de
  trabajo (código, provisionales, assets y entradas del pipeline de las mesas 2-4; la mesa 1 intacta).
  - Suelo del pasivo `conversion.floor = 1`/s en las mesas 2-4 (`max(suelo, k·√ingreso)`); test
    `tests/floor.test.ts`: con saldo 0 la apuesta mínima llega en ≤ 10 s y un ayudante agresivo nunca
    deja la mesa más de 10 s sin poder apostar.
  - Guardado v8: la migración borra `work` y las mejoras de trabajo y devuelve su coste en la moneda de
    cada mesa (test). shared/config.json v8 y servidor (fixtures y tests a v8; la validación de basura
    ya era solo de la mesa 1). plausibility.json regenerado.
  - Recalibración (200 partidas, sin basura): mesa 2 (d) 11:51 con tramo final de 18 s → **techo máximo
    nivel 11 → 10**: 12:23 y tramo 47 s. Mesa 3 (d) 13:38, tramo 1:01; mesa 4 (d) 12:25, tramo 1:01:
    sin cambios. Mesas 1-4 ≈ 46 min.
  - Decisión: los diálogos de entrar/salir de la trastienda de las mesas 2-4 quedan vacíos (`{}`).

- [x] **B2 Auditoría de ayudantes.** `npm run audit:helpers` (cada ayudante solo, 4 suertes, sin y con
  mejoras, saldo de 10 y 2 techos). Criterio común nuevo en `src/game/helperPolicy.ts`: Kelly exacto sobre
  la probabilidad real de la apuesta (penalización, suerte propia, retener/relanzar), riesgo máximo en 2 min
  por perfil (prudente 3%, normal 15%, agresivo sin límite) y espera si no compensa. Interfaz: neto del
  último minuto (+N/min verde, −N/min rojo, "Esperando") y estrellita en el perfil recomendado.
  - **Qué hacía perder al camarero**: apostaba una fracción fija del techo aunque no tuviera ventaja, y con
    "Más de 9/Doble/Doble seis" desbloqueados perseguía el doble seis (p ≈ 8%) también mejorado y con suerte
    alta (11% de ventanas de 2 min negativas, p10 −2 techos/min con el prudente); su agresivo (100% del
    techo, 60% del saldo) perdía el 98-100% con suerte baja. Lo mismo, en menor grado, en todas las mesas
    (crupier prudente: 35% de ventanas negativas con suerte baja).
  - Ahora: ningún perfil llega a 0; prudente ≤ 4% de ventanas negativas; normal 0-5% desde suerte media con
    mejoras; agresivo el más rápido con suerte alta en las 4 mesas.
  - Números: mesa 3 conversión k 0,3 → 0,38 (sin eso, 15:57 en vez de ~14). Mesas 1, 2 y 4 sin cambios.
  - Rendimiento: memoria del riesgo y del ingreso para el pasivo (las simulaciones iban 10× más lentas).

- [x] **B3 Texto nítido.** Capa que emborronaba: sobre todo el **canvas** (640x360 estirado por CSS, con
  `fillText` antialias a 1 px por unidad: el 92-100% de los píxeles del texto eran grises) y el HTML dentro de
  `transform: scale(k/dpr)`; encima, el grano CRT al 60% y una capa CRT muerta en el canvas. Ahora: escenario
  con `zoom` = k/dpr (`--u`, esquina alineada a píxel físico), canvas a resolución física 640k x 360k con
  transformación k y sin suavizado (99,98% de bloques k x k uniformes medidos en el navegador con dpr 1,5),
  texto del canvas por máscaras umbralizadas (`src/ui/pixelText.ts`), CRT aparte con tres niveles
  (Apagado/Suave/Fuerte, por defecto Suave, guardado en Ajustes v2) y recolocado al cambiar el dpr. Test de
  escala entera (11 tamaños x 7 dpr). Comprobado en el navegador a 1280x720 con dpr 1 y 1,5.

- [x] **B4 Mesa 5: Doble o nada (el Dueño).** Lógica (`src/game/coin/`), guardado v9, servidor v9 (validación
  estructural), assets procesados (Dueño 3 fases, moneda cara/cruz, fondo, diablillo = quinta celda de la hoja de
  ayudantes), escena con la moneda que gira, pila de la cadena, n/10, pozo y botones en el paño, HUD/cajones,
  tooltips, diálogo del Dueño (pendiente de revisión), `?dev=mesa5`. Simulación `npm run simulate:coin -- --cache`
  (guarda en `sim/.cache/` los estados de salida de la mesa 4). Ver GAME_DESIGN 4f.
  - Calibración: (d) 11:42, mesas 1-5 ≈ 58:20, tramo final 40 s (pedido 45-90: anotado; bajar el techo alarga la
    mesa sin estirar el final). Ninguna estrategia trivial gana; la segunda oportunidad da −5%.
  - Decisiones: deuda 10M como las otras; probabilidad base 47%, fatiga 5 puntos por cara, temple como mejora
    propia (en vez de "jackpot"); botones Espacio/R/S (la A es el cajón de Ayuda); el pago final de momento
    muestra "LA CASA ES TUYA" (la pantalla final es del bloque 5).

- [x] **B5 Final y publicación (sin desplegar).** Pantalla final al pagar al Dueño (su última línea y, a los
  4,5 s, epílogo, estadísticas: tiempo total, apuestas, % ganadas, jackpots, veces sin fichas; créditos con el
  arte por IA y la licencia OFL de VT323 en `public/licencias/`; volver al menú; sin prestigio). Build de
  producción: pantalla de carga con barra (sprites y fuente), sin `console.log`, sin rastro de `?dev=` (comprobado
  en el bundle), sprites PNG a compresión máxima (los originales de `assets/raw` no se empaquetan; 4,4 MB en
  total). Sin `VITE_API_URL` se ocultan sesión, sincronizar y ranking (el juego va entero sin servidor).
  `wrangler.jsonc` (Workers solo con assets) y `public/_headers` (caché larga para `/assets/*`, sin caché para
  `index.html`, cabeceras de seguridad y CSP); **DEPLOY.md** con los comandos exactos (incluidos
  `wrangler login` y el dominio personalizado). Aviso "pensado para ordenador" en pantallas táctiles o pequeñas
  (con "Seguir de todos modos"). Metadatos: título, descripción, favicon pixel (una ficha) e imagen para compartir
  (la mesa 5 a escala 2 con título; `npm run meta`). Exportar/importar la partida en JSON desde Ajustes.
  Verificado con `vite preview`: arranca, carga una partida con la mesa 5 abierta, el Dueño habla al pagar y sale
  la pantalla final; sin errores en consola.

- [x] **B6 Sonido (opcional).** Web Audio sintetizado en `src/audio.ts`, sin archivos: zumbido ambiente distinto
  por mesa (dos sierras desafinadas con filtro que respira), tic de la ruleta que se espacia, fichas (comprar,
  retirarse), carretes, dados, cartas, moneda (tintineo y giro), acordes de ganar, perder y jackpot, y un susurro
  filtrado al perder una apuesta de al menos medio techo. Respeta el volumen de Ajustes; arranca con el primer gesto;
  **N** silencia o reactiva todo (no se guarda: es por sesión). Solo suenan los resultados del jugador, no los de los
  ayudantes.

### Pendiente

- Nada de esta sesión. Revisar a oído los sonidos (no se han podido escuchar desde aquí) y los diálogos marcados
  como pendientes de revisión (mesas 2 a 5).

---

## Sesión 4 (bloques 0-3: comprobaciones y push, regeneración rápida y mesa 3, mesa 4, cierre)

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

- [x] B1.2 Camarero de la mesa 3 por fase (40 partidas, el jugador como (d); tiempo en cada fase):
      antes, agresivo (50% del techo, 30% del saldo) ganaba en la media y la alta (9:26 y 1:18 frente a
      11:11/2:17 de prudente). Con los relanzamientos el camarero gana a menudo incluso a media suerte,
      así que subir la fracción del techo no bastaba. Ahora agresivo = 100% del techo y hasta el 60% del
      saldo (por encima del Kelly de media suerte): prudente gana la fase inicial (1:48), normal la media
      (9:50 frente a 10:21 de agresivo) y agresivo solo la alta (1:07). Sin quiebras en ninguna fase.

- [x] B1.3 Tramo final de la mesa 3: de ~6 s a **1:00**, con la duración total en 13:57 (40 partidas).
      Cambios en `shared/config.json` → `dice`: techo máximo nivel 11 → **8** (238K → 30.517) y suerte
      base 420 → **550** con crecimiento 1,6 → **1,5** (el último nivel costaba 3,2M y se compraba casi al
      final; ahora la suerte 20 llega antes y el techo acotado marca el ritmo del final). Los
      relanzamientos ganan peso (−12% de tiempo).
- [x] B1.4 `npm run plausibility` (--full): 3,6 s (la mesa 1 no cambió: caché). Cliente 208 y
      servidor 26 tests en verde.

### Pendiente (mesa 4, en este orden)

- [x] M4.1 reglas y baraja (`src/game/cards/`): mano, banca a 17, pedir/plantarse, empate devuelve
- [x] M4.2 suerte = baraja "amañada" con tabla calibrada (`sim/cardsRig.ts`), descartes, jackpot 7-7-7 con pozo
- [x] M4.3 mesa: mejoras, esqueleto (estrategia básica + Kelly + descartes), trabajo, conversión desde la 3
- [x] M4.4 guardado v7, activeTable 1-4, tests
- [x] M4.5 simulación `npm run simulate:cards` y calibración (30 partidas): mejor estrategia (d) 12:42,
      tramo final 1:02, mesas 1-4 ≈ 48 min; triviales peores; descartes −6,4%; jackpot 5-6%; sin quiebras;
      sin conversión 33 min. Esqueleto: normal gana la fase media, agresivo solo la alta.
      Ajustes respecto al diseño inicial: suerte base 550 → 150; techo máx. nivel 10 con base 15 (143K);
      descartes cada 6 s y 1 + nivel/3, la sustituta con 2 candidatas más; pozo 8% de cada apuesta; el
      esqueleto solo descarta si se pasa y quedan 2+ cargas.
- [x] M4.6 assets (crupier, cartas, fondo, esqueleto) + provisionales
- [x] M4.7 escena (cartas que se reparten y voltean, PEDIR/PLANTARSE en la mesa), HUD, pestaña, ?dev=mesa4
- [x] M4.8 diálogo de la Crupier (pendiente de revisión)
- [x] M4.9 servidor v7 (validación estructural de la mesa 4) + plausibility --full (83 s) + docs (GAME_DESIGN 4d, README)
- [x] B3 cierre (abajo)

## Cierre de esta sesión (bloque 3)

### Push

**Pendiente: falta remoto.** No hay `git remote` y `gh` no está instalado, así que no se ha subido
nada ni se ha creado el repositorio. Para subirlo: crea un repositorio privado vacío y ejecuta
`git remote add origin <url>` y `git push -u origin main`. Seguridad comprobada antes: sin `.env` en
git ni en su historial, sin secretos en el árbol ni en el historial (solo el secreto de prueba del
perfil `test`), `.gitignore` ampliado.

### Rutas absolutas corregidas

Ninguna: no había rutas absolutas en el código, la configuración, los scripts ni los tests. (Fuera
del repositorio: el `.claude/launch.json` de la carpeta antigua de OneDrive tiene una configuración
`dev-c` que arranca el servidor de desarrollo de `C:/videojuego`, porque el panel de vista previa de
esta sesión arranca desde la carpeta antigua.)

### Regeneración de `shared/plausibility.json`

- Antes: **817 s** (secuencial). Ahora: **81-83 s** si cambia la mesa 1 (8 workers en un i5-8265U de 4
  núcleos) y **~3 s** si no (caché por mesa). Tabla idéntica a la secuencial.
- "Una mesa sola por debajo de 1 minuto" no se alcanza en esta máquina: la mesa 1 son 2.100 partidas
  de 30 minutos de juego y ya va 3,7 veces más rápido que en secuencial (límite de CPU).

### Números cambiados y por qué

- Mesa 3: camarero agresivo 50%/30% → **100% del techo / 60% del saldo** (ganaba en todas las fases);
  techo máximo nivel 11 → **8** y suerte 420/1,6 → **550/1,5** (tramo final de 6 s a 1 min, total ~14 min).
- Mesa 4 (nueva): suerte base 150 (crec. 1,5), techo base 15 hasta nivel 10, descartes cada 6 s y
  1 + nivel/3 con la sustituta elegida entre 2 candidatas más, pozo 8%, k = 0,3. Guardado v7.

### Decisiones propias

- `--quick` = 200 partidas en total; la tabla estadística sigue siendo solo de la mesa 1.
- Mesa 4: moneda "fichas negras"; una baraja por mano; la banca se planta con 17 blando; el natural
  paga 1:1; la suerte es una baraja que favorece (intensidad calibrada con una tabla) en vez de decidir
  el resultado antes, para que pedir, plantarse y descartar sigan importando; si te pasas con cargas, la
  mano espera; el jackpot trae 7-7 y otro 7 arriba (hay que pedir con 14); el esqueleto apuesta con un
  tope de Kelly (con valor esperado negativo espera) y solo descarta si se pasa con 2+ cargas; una
  mano a medias no sobrevive a cargar la partida (se pierde la apuesta); el objeto raro es un anillo de
  sello; atajos Espacio, P, S, D.
- "Nunca pedir" casi empata con la estrategia básica sin descartes (la baraja hace que la banca se pase
  a menudo); no gana a la mejor estrategia, así que se deja y se anota.

### Cómo probar la mesa 4 rápido

`npm run dev` y abre http://localhost:5173/?dev=mesa4 → Continuar → pestaña MESA 4 (hueco de guardado
aparte con las mesas 1-3 saldadas y 4.000 fichas negras). Espacio reparte; P pide, S se planta, D
descarta (o clic en las zonas del tapete y en la última carta).

### Assets que faltan (provisionales en el juego)

Mismo estilo que los anteriores (pixel art de terror, contorno negro, paleta verde enfermizo, óxido y
rojo seco, fondo magenta plano para los sprites):

(Ninguno de la mesa 4: eran la trastienda, su basura y el repartidor, que la sesión 5 quitó.)

Pendientes de antes: idle del jugador; ruleta con bola y marcador aparte.

### Tests

Cliente **230** en verde (`npx vitest run`), servidor **27** en verde (`cd server && ./mvnw test`),
`shared/plausibility.json` al día (--full), build de producción correcto.

### Problemas conocidos

- Las líneas de la Crupier, el Barman y la Tragaperras viviente están pendientes de revisión.
- Las mesas 2-4 no tienen validación estadística en el servidor (solo estructural).
- El camarero fantasma conserva algo de tono rosado en las piernas translúcidas.

## Diseño de la mesa 4 (decisiones propias)

- Moneda: **fichas negras**. Deuda 10M.
- Una baraja de 52 cartas, barajada en cada mano. La banca pide hasta 17 (se planta con 17). Sin doblar
  ni dividir; blackjack natural paga 1:1 como cualquier victoria; empate devuelve la apuesta.
  Ventaja de la casa con estrategia básica: ~3%.
- **Suerte = baraja que favorece**: cada carta se elige entre varias candidatas (más con más suerte) y
  se queda la que más conviene al jugador (o a la banca, si la suerte efectiva es negativa). La
  intensidad s sale de una tabla calibrada por simulación (s → probabilidad de ganar con estrategia
  básica), así que la suerte sigue la misma curva que en las otras mesas: p(ganar) de la honrada
  (~43%) a 97% con suerte máxima. La penalización por apostar fuerte resta de esa p.
- **Descartes**: cargas como los relanzamientos de la mesa 3 (máximo 1 + nivel/4, recarga 16 s ×
  0,93^nivel, reserva común con el ayudante). Tras recibir una carta, se puede descartar la última y
  recibir otra. Si te pasas y tienes cargas, la mano espera tu decisión.
- **Jackpot 7-7-7** (21 con tres sietes): con probabilidad j por mano (0,1% → 1,5%) la baraja trae 7-7 al
  jugador y otro 7 arriba: hay que **pedir con 14** para cobrarlo (el casi-premio se ve). Indicador del
  pozo y de los sietes en la mesa. Paga min(apuesta × 500, pozo, 25% deuda); pozo progresivo.
- Esqueleto barajador: estrategia básica, descarta si se pasa, y apuesta lo menor entre su perfil y un
  múltiplo de la fracción de Kelly (prudente ½, normal 1, agresivo 2): con valor esperado negativo
  espera; agresivo solo compensa cuando lo limita el techo (suerte alta).
- Trabajo: barajar y repartir (cartas sueltas, fichas de otros, mazo atascado, cenizas de puro,
  propina, objeto raro: un dedo con anillo de sello... → "anillo de sello").
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

(Sesión 5: la trastienda de las mesas 2-4 ya no existe; sus assets ya no hacen falta.) Pendientes de antes: idle del jugador; ruleta con bola y marcador aparte.

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
