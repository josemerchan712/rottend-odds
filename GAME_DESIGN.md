# Casino incremental de terror: documento de diseño

Título provisional: por decidir.

## 1. Resumen

Juego incremental en el navegador, 2D pixel art retro, ambiente de terror. El jugador es un trabajador del casino que debe dinero. Hay **5 mesas**, cada una con su propio juego de azar, su propia moneda y su propio prestamista. Para salir de una mesa hay que **saldar una deuda de 10.000.000** de la moneda de esa mesa. Las mesas antiguas siguen vivas y alimentan a las nuevas.

- Duración total objetivo: **~1 hora** (mesa 1 ~8 min, mesas 2-5 ~12 min cada una).
- Fantasía de poder: al principio pierdes y sufres, al final casi nunca pierdes. Cada mesa nueva te devuelve a la humildad.
- Tono: oscuro y tenso. Nada de humor absurdo; la deuda es "absurda" por su cantidad, no por el tono.
- **No copiar** elementos reconocibles de otros incrementales (en especial: no fregar platos, no un prestamista llamado Tony).

## 2. Bucle principal

1. Empiezas sin fichas. Haces el **trabajo humillante** de la mesa para ganar fichas pequeñas.
2. Apuestas en el juego de la mesa. Si ganas, ganas la apuesta; si pierdes, la pierdes.
3. Compras mejoras con las fichas: suerte, valor de apuesta, ayudante y sus mejoras.
4. El **ayudante** (sprite que apuesta por ti) automatiza las apuestas.
5. Al llegar a 10.000.000 de fichas de la mesa, **pagas la deuda** y se desbloquea la mesa siguiente.
6. La moneda de la mesa vieja produce de forma pasiva moneda de la nueva (ver sección 5). Se puede volver a la mesa vieja para seguir mejorándola.

El saldo nunca baja de 0 y no se puede apostar más de lo que se tiene. Si te quedas sin fichas, el trabajo manual es la red de seguridad.

## 3. Sistema de suerte (común a todas las mesas)

- La suerte es un nivel que aumenta la probabilidad de ganar de la mesa.
- Empieza por debajo del 50% (ventaja de la casa) y sube con una **curva convexa** hasta un **tope de 97%** (nunca 100%, para que perder siga siendo un momento dramático):
  `p(n) = base + (tope - base) * (n / niveles)^1.6`. En la ruleta: `p(n) = 0,486 + 0,484 * (n/20)^1,6`.
- Los primeros niveles apenas mueven la probabilidad (~60% hacia el nivel 8-9); los últimos dan los saltos grandes. Así el azar importa durante casi toda la mesa: con poca suerte, apostar fuerte pierde dinero.
- La recompensa por apuesta **crece poco**; lo que acelera es ganar casi siempre y apostar más veces (velocidad del ayudante) y más fuerte (valor de apuesta).
- En las fórmulas, **L** es el progreso de esa curva: `L = (n / niveles)^1.6`, de 0 (sin suerte) a 1 (suerte máxima). La suerte mueve con L la probabilidad, la penalización por riesgo (3.1), el jackpot y las apuestas especiales (4.1).
- **Jackpot por mesa**: probabilidad base 0,1%. La suerte aporta hasta +0,7% (`0,7% * L`) y la mejora de Jackpot otro +0,7%, con **tope total de 1,5%**. Raro pero alcanzable. Paga **x50** la apuesta con un **tope de 500.000** (5% de la deuda): con apuestas grandes el tope salta en ~40% de los jackpots, y así el jackpot aporta ~5% de las fichas de una partida en vez de dominar la economía (con x500 llegaba al 75-80%).

### 3.1 Selector de apuesta y penalización por riesgo

- El jugador elige la apuesta con botones rápidos: **1%, 10%, 50%, TODO** **del techo de apuesta** (el máximo que se mejora comprando). Si el saldo es menor, la apuesta se limita al saldo.
- **Penalización por apostar fuerte**: la probabilidad efectiva baja según la fracción del techo apostada, y la penalización se suaviza con la suerte:
  `p_efectiva = p_suerte - factor * fraccion^1.5`, con `factor = 0,20 - 0,16 * L` (fraccion = apuesta / techo, entre 0 y 1).
  El factor vale 0,20 sin suerte, ~0,15 con suerte 10 y 0,04 con suerte máxima. Con suerte máxima, apostar el techo da 97% - 4% = **93% de acierto**: al final casi nunca pierdes.
- Consecuencia buscada: con poca suerte, apostar el techo tiene valor esperado negativo (hasta suerte ~9), y la fracción óptima sube con la suerte (0 por debajo del 50%, el techo entero con suerte máxima).
- Perder una apuesta de TODO tiene un castigo extra pequeño: el ayudante se bloquea 5 segundos.
- El ayudante usa un **perfil fijo** que se mejora. Cada perfil apuesta una fracción del techo, pero **nunca más de una fracción del saldo**; si eso no llega a la apuesta mínima, espera. Así el ayudante nunca puede dejar el saldo a 0.

| Perfil | Fracción del techo | Máximo del saldo | Cuándo compensa |
|---|---|---|---|
| Prudente | 5% | 3% | Siempre seguro; crece desde suerte ~3 |
| Normal | 20% | 10% | Desde suerte ~6 |
| Agresivo | 50% | 30% | Solo con suerte alta (~12+); antes hunde el saldo a la larga |

  Simulación (200 partidas por perfil): ningún perfil deja el saldo a 0 en ninguna fase, ni provoca caídas fuertes en las fases inicial y media. Con agresivo, el 38% de las partidas sufre en la fase alta una racha que se lleva la mitad del saldo, pero aun así termina la mesa antes (8:42 frente a 9:19 con prudente).

## 4. Mesa 1: Ruleta (la que se construye primero)

**Prestamista**: el Encargado. **Trabajo**: recoger colillas y vasos del suelo.

### 4.1 Ruleta

- 37 casillas: 18 negro, 18 blanco, 1 cero verde (la casa gana).
- Tres tipos de apuesta:

| Apuesta | Pago | Prob. base | Disponible |
|---|---|---|---|
| Color (negro o blanco) | 1:1 | 48,6% → 97% | Desde el inicio |
| Docena (1-12, 13-24, 25-36) | 2:1 | 29,2% → 90,5% | Mejora "Apuesta a docena" |
| Número (1-36) | 35:1 | 2,2% → 9,7% | Mejora "Apuesta a número" |

  (Probabilidades sin suerte → con suerte máxima, apostando poco.)

- La suerte y la penalización se calculan sobre el color, y la docena y el número las amplifican con un multiplicador que crece con la suerte:
  `p_tipo = p_color_efectiva * casillas/18 * m`, con `m_docena = 0,90 + 0,50 * L` y `m_número = 0,80 + 1,00 * L`.
  Con los pagos de ruleta real, el valor esperado por ficha de cualquier tipo es `2 * p_color * m - 1`:
  - **Con poca suerte (hasta suerte 7) el color es la mejor apuesta**: docena y número tienen m < 1 (sin suerte, valor esperado -2,8% el color, -12,5% la docena, -22% el número).
  - Desde suerte 8 docena y número rinden más, y con suerte máxima mucho más (+83% y +165% de valor esperado respecto al color), a cambio de mucha más varianza.
  - Por qué tanto: un jugador que apuesta con cabeza está limitado por su saldo, y su crecimiento por apuesta va como `VE² / varianza`. La docena tiene ~2 veces la varianza del color y solo compensa con ~+40% de valor esperado; el número, con mucho más. Con +10%/+20% nadie las usaría.
  - Simulación: la estrategia que mezcla color, docena y número termina la mesa un ~8% antes que la que solo juega a color (7:26 frente a 8:07).
- Jackpot **Cero Dorado**: casilla extra que paga **x50** la apuesta (con cualquier tipo de apuesta), con tope de pago de 500.000. Probabilidad del 0,1% al 1,5% (ver sección 3).

### 4.2 Trabajo manual: recoger basura

- Aparece basura en el suelo del casino en posiciones aleatorias, máximo **6 objetos a la vez**; reaparece uno cada ~2 segundos si hay hueco.
- Clic en un objeto (con zona de clic generosa): el jugador hace la animación de agacharse, lo recoge y suma fichas.
- Valores iniciales:

| Objeto | Fichas | Frecuencia |
|---|---|---|
| Colilla | 1 | 45% |
| Vaso | 3 | 30% |
| Botella rota | 5 | 12% |
| Billete arrugado | 15 | 7% |
| Ficha olvidada | 40 | 4% |
| Cartera | 120 | 1,5% |
| Dedo con anillo | 500 | 0,5% |

- Mejoras del trabajo: **Pinzas** (recoger 2 objetos por clic), **Bolsa grande** (+50% de valor por objeto y nivel), **Ayudante de limpieza** (otro sprite que recoge solo el objeto más cercano a él; nivel 1 cada 4 s, −20% por nivel). Costes en 4.3.
- Atajo de teclado "recoger el más cercano" como accesibilidad: tecla **E** (el más cercano al jugador).
- Implementado (hito 4): la basura aparece en una zona del suelo de la escena (640x360), con una distancia mínima entre objetos para que no se tapen. El suelo empieza lleno. La zona de clic es un radio de 26 px alrededor de cada objeto, y al pasar el ratón se resalta. El jugador está fijo abajo a la izquierda y no camina: al recoger se agacha y levanta el objeto, y sale un "+N" flotante. La animación es solo visual: la basura se suma al hacer clic.
- Efecto en la economía: la basura está limitada por su aparición (1 cada 2 s), así que para un jugador activo las pinzas y el ayudante de limpieza no dan más fichas (sí ahorran clics y sirven cuando no se atiende el suelo). Solo la bolsa grande sube los ingresos.

### 4.3 Mejoras (valores calibrados con simulación)

Fórmula de coste: `coste(n) = base * crecimiento^n` (redondeado).

| Mejora | Efecto por nivel | Coste base | Crecimiento | Niveles máx. | Coste total |
|---|---|---|---|---|---|
| Suerte | Sube la prob. (curva convexa hasta 97%) | 3 | 1,55 | 20 | ~35K |
| Apuesta máxima | x2,5 el techo de apuesta (de 10 a ~95K) | 10 | 2,0 | 11 | ~20K |
| Crupier (ayudante) | Desbloquea el ayudante | 500 | - | 1 | 500 |
| Velocidad del ayudante | -12% al tiempo entre apuestas (de 4 s a ~0,6 s) | 300 | 1,6 | 15 | ~575K |
| Perfil del ayudante | Desbloquea normal y agresivo (prudente viene con el Crupier) | 1.000 | 4 | 2 | 5K |
| Suerte del ayudante | +0,5% de prob. solo para el ayudante | 800 | 1,8 | 10 | ~356K |
| Jackpot | +0,07% de prob. de Cero Dorado | 2.000 | 1,8 | 10 | ~890K |
| Apuesta a docena | Desbloquea la docena (2:1) | 200 | - | 1 | 200 |
| Apuesta a número | Desbloquea el número (35:1) | 1.500 | - | 1 | 1,5K |
| Pinzas | Recoge 2 objetos por clic | 50 | - | 1 | 50 |
| Bolsa grande | +50% de valor por objeto | 35 | 2,25 | 4 | ~1,3K |
| Ayudante de limpieza | Recoge solo; nivel 1 cada 4 s, −20% por nivel | 200 | 2 | 5 | ~6,2K |

Las tres mejoras del trabajo (hito 4) están calibradas: con los valores iniciales (pinzas 120, bolsa 60 · 2,5^n, limpieza 250 · 2,2^n) la mesa se alargaba a 8:31. Con los actuales vuelve a ~8 minutos: 7:55 de media con la fracción óptima y 7:19 mezclando color, docena y número (200 partidas por estrategia).

Todas las mejoras suman ~1,9M. La suerte y el techo son baratos porque, con la curva convexa, entre los niveles 5 y 10 la ruleta apenas da dinero: el progreso depende del trabajo y de un saldo que crece despacio, y unos costes más altos alargan mucho la mesa (con la suerte en base 10, la mesa pasa de 8 a 12 minutos).

**Objetivo y resultado** (`npm run simulate`, 200 partidas por estrategia; el jugador simulado apuesta como mucho una vez por segundo):

| Estrategia | Media | p10 | p90 | Último tramo (media / p90) |
|---|---|---|---|---|
| Color con apuesta mínima | 23:41 | 20:13 | 27:06 | 8:30 / 9:42 |
| Siempre el techo | 10:29 | 5:02 | 16:40 | 0:40 / 0:49 |
| Fracción óptima, solo color | 8:07 | 5:45 | 10:36 | 0:54 / 1:06 |
| Fracción óptima con docena y número | 7:26 | 5:29 | 9:41 | 0:40 / 0:52 |

- Mesa de ~8 minutos para quien juega bien; las estrategias triviales son claramente peores (y "siempre el techo" es una lotería).
- Último tramo (desde suerte 20 hasta 10M) por debajo de 1 minuto.
- Primera mejora de suerte en el segundo 0-1 (cuesta 3 fichas); primera apuesta con valor positivo hacia los 11 s (p90 25 s).
- Pendiente: las mejoras del trabajo (hito 4) acelerarán las fases inicial y media; habrá que recalibrar.

### 4.4 Deuda

- Deuda: **10.000.000 fichas**. Botón "Pagar deuda" activo al alcanzarla.
- Retrato del Encargado en una esquina, con 3 fases (ver sección 7).

## 5. Conversión de monedas entre mesas

- Cada mesa tiene su moneda (fichas, monedas, etc.).
- La mesa N+1 recibe **producción pasiva** de la mesa N: `pasivo_N+1 por segundo = k * (ingreso_por_segundo_N)^0.5`, con `k` ajustable.
- La raíz evita que la mesa vieja sustituya a la nueva: mejorar la vieja ayuda de verdad, pero no la vuelve inútil.
- La mesa vieja sigue funcionando con su ayudante, y el jugador puede volver a gastar su moneda en mejoras (que a su vez suben la producción pasiva de la nueva). Interfaz con **pestañas por mesa**.
- Al pagar la deuda se descuentan los 10M del saldo; lo que sobre se conserva.

## 6. Mesas 2 a 5 (resumen)

Cada mesa mantiene suerte, valor de apuesta, ayudante y jackpot. Cambia el juego y el trabajo.

| Mesa | Juego | Trabajo | Prestamista | Particularidad |
|---|---|---|---|---|
| 2 | Tragaperras (3 carretes, 6 símbolos) | Limpiar tragaperras | Tragaperras viviente | Dos iguales x1,5, tres iguales x10. Mejora **retener carrete**. Jackpot: 3 diamantes x1000. |
| 3 | Dados, mayor o menor | Servir copas | Barman | El jugador elige objetivo (más de 7, más de 9, doble seis) y cuanto más difícil más paga. Suerte = relanzar un dado. Jackpot: tres dobles seises seguidos. |
| 4 | Blackjack simplificado (pedir o plantarse) | Barajar y repartir | Crupier | Sin doblar ni dividir, pago 1:1. Suerte = descartar una carta mala. Jackpot: 21 con tres sietes. |
| 5 | Doble o nada encadenado | Por decidir (siniestro) | El Dueño | Cada acierto duplica y decides retirarte o seguir; fallar lo pierde todo. Jackpot: racha de 10 aciertos. |

Detalles finos de la mesas 2 a 5 se diseñan cuando la mesa 1 esté jugable.

## 7. Prestamistas

Cada uno tiene una hoja de 3 frames (calmado, inquieto, deformado), 128x128 por frame.

1. **Encargado**: encargado de sala cansado, sonrisa demasiado ancha.
2. **Tragaperras viviente**: cobrador con una tragaperras fusionada en el torso.
3. **Barman**: barman demacrado, ojos negros.
4. **Crupier**: máscara de porcelana agrietada, ojos cosidos.
5. **El Dueño**: silueta con sombrero de copa, al final calavera de monedas.

Decisión pendiente: qué dispara el cambio de fase. Propuesta inicial: **% de la deuda reunido** (0-33% calmado, 33-66% inquieto, 66-100% deformado). Cada prestamista debería tener 3-4 frases de cobro por fase (escribir cuando la mesa 1 funcione).

## 8. Arte y estética

- Resolución interna **640x360**, escalado entero con `image-rendering: pixelated`, sin suavizado.
- Paleta: negro casi puro, verde enfermizo, rojo sangre seco, naranja óxido, dorado sucio, blanco hueso.
- Filtro CRT: scanlines, viñeta, grano, parpadeo leve. Debe poder desactivarse.
- Efectos: la pantalla tiembla al perder una apuesta grande, glitch cuando sube la tensión de la deuda, luces parpadeantes en los fondos.
- Las mesas viejas se ven más podridas cuando las dejas atrás (versión sana y rota de cada asset).
- Sonido (después de la lógica): zumbido de fondo, fichas huecas, susurro al perder, sonido de la ruleta. Efectos libres de Freesound.

### 8.1 Assets existentes y tratamiento

| Asset | Contenido | Tamaño por frame | Fondo a eliminar |
|---|---|---|---|
| Prestamistas (5 hojas) | 3 frames cada una | 128x128 | Magenta |
| Jugador | idle (pendiente), agachado con pinza, levantando objeto | 64x64 | Magenta |
| Ayudantes | 5 sprites (brazo mecánico, zombi, camarero fantasma, esqueleto, diablillo) | 64x64 | Magenta |
| Ruleta | versión sana y versión rota | 512x512 | Cian |
| Tragaperras | máquina + 6 símbolos | 32x32 los símbolos | Magenta |
| Dados | 6 caras planas + dado 3/4 | 32x32 | Magenta |
| Cartas | dorso, as, rey, siete | 32x48 | Magenta |
| Fichas | 6 colores (sucia a brillante) y pilas | 32x32 | Magenta |
| Basura | 7 objetos (ver 4.2) | 32x32 | Magenta |
| Fondos | 5 mesas | 640x360 | Ninguno |

Pipeline de procesado (script de Claude Code):

1. Recortar el color de fondo desde los **bordes hacia dentro** (flood fill, no un filtro de color global), porque el rojo del fieltro y la sangre se parece al magenta.
2. Dividir las hojas en sprites sueltos con una cuadrícula o detectando bloques.
3. Reescalar con **nearest neighbor** al tamaño final.
4. Exportar PNG con transparencia a `assets/`.

Implementado para la basura y el jugador (`npm run assets`; código en `scripts/`, sprites en `assets/sprites/`):

- Las hojas originales son JPEG, así que el fondo no es un magenta uniforme. El relleno desde los bordes usa una tolerancia de color (110) respecto a la mediana del borde.
- Los huecos de fondo encerrados por el sprite (a los que no llega el relleno) se borran solo si el píxel es casi idéntico al fondo (distancia < 70). La sangre y el fieltro quedan a más de 200 de distancia, así que no se tocan.
- El halo rosado del JPEG se limpia en los bordes por su tono, y las motas sueltas por tamaño.
- Las hojas se trocean detectando bloques de columnas, y el alfa del resultado es binario.
- Hoja del jugador: los frames 1-2 son otro personaje (cara verde, caminando) y los 3-4 el jugador (agachado con la pinza y levantando el objeto). Mientras falta el idle, el jugador usa el frame 3 en reposo y para agacharse (bajado 2 px), y el 4 para levantar. Los frames 1-2 los usa el ayudante de limpieza.

Pendientes de arte conocidos: idle del jugador, ruleta con la bola y el marcador verde en sprites aparte (para que no giren con la rueda), un dado repetido que hay que descartar.

## 9. Pantallas

### 9.1 Pantalla de inicio

- Tres opciones: **Continuar**, **Nueva partida** y **Ajustes**.
- **Continuar** solo aparece si hay una partida guardada, y muestra el tiempo de juego y el estado de la mesa (deuda reunida o saldada).
- **Nueva partida** pide confirmación si ya existe un guardado, porque lo sobrescribe.
- **Un solo hueco de guardado.**
- **Ajustes**: interruptor del filtro CRT, volumen y borrar partida. Los ajustes se guardan aparte de la partida: borrarla no los borra. El botón de borrar partida solo está aquí, no en la pantalla de juego.
- Desde el juego hay un botón para **volver al menú**, que guarda antes.
- El clic en Continuar o Nueva partida es el gesto del usuario que activa el audio (requisito de los navegadores).

### 9.2 Pantalla de la mesa 1

- **Fondo**: cuarto del casino (fijo).
- **Centro**: ruleta con apuesta y resultado.
- **Esquina**: retrato del Encargado y barra de deuda (X / 10.000.000).
- **Suelo, abajo a la izquierda**: jugador pequeño, de lado. Basura que aparece en el suelo.
- **Panel lateral**: saldo, selector de apuesta (1%, 10%, 50%, TODO), tienda de mejoras.
- **Pestañas** para volver a mesas anteriores cuando se desbloqueen.
- Al desbloquear el ayudante, aparece su sprite junto a la mesa apostando solo.

## 10. Técnico

- Propuesta: **Vite + TypeScript**, escena en `canvas`, interfaz (tienda, panel) en HTML/CSS.
- Los números llegan a 10M por mesa y la conversión es sublineal, así que `number` normal sirve. Formatear con sufijos (K, M).
- Bucle: `requestAnimationFrame` con tiempo delta; la lógica del ayudante usa un temporizador acumulado.
- **Guardado** en `localStorage` cada pocos segundos y al cerrar. **Progreso offline** calculado al volver, con un tope razonable (por ejemplo 1 hora).
- Separar la lógica (reglas, costes, probabilidades) de la renderización, para poder testearla.
- Crear un **script de simulación** que juegue la mesa con una estrategia simple y devuelva cuánto tarda en llegar a 10M, para ajustar los costes sin jugar a mano.
- Despliegue estático (Cloudflare o similar).

### 10.1 Backend opcional (cuentas, nube y ranking)

El juego funciona sin servidor. El backend (carpeta `server/`) añade, para quien inicie sesión:

- **Stack:** Java 21, Spring Boot 3, Spring Security con JWT, Spring Data JPA, Flyway y PostgreSQL. H2 para tests y springdoc-openapi para la documentación.
- **Cuentas:** email y contraseña (BCrypt, 10+ caracteres), JWT de 24 h y límite de intentos por IP. Un nombre público para el ranking.
- **Guardado en la nube:** un hueco por usuario, con revisiones; si hay conflicto, el jugador elige qué partida conservar.
- **Ranking de la mesa 1:** quién saldó antes la deuda, por tiempo de juego.
- **Validación sin re-simular:** capa 1 (imposible → se rechaza) y capa 2 (estadísticamente implausible → se acepta como "no verificado" y no cuenta para el ranking). Detalles en el README.
- **Números compartidos:** `shared/config.json` es la fuente única de los números que necesita el servidor (deuda, versión del guardado, costes de mejoras, trabajo). `shared/plausibility.json` lo genera el simulador (`npm run plausibility`) y lleva un hash de `config.json`; hay que regenerarlo cada vez que cambie la economía.
- **En el menú de inicio:** "Iniciar sesión", "Sincronizar partida" y "Ranking". Si el servidor no responde, el juego sigue igual.
- **Limitación asumida:** el tiempo de juego lo reporta el cliente, así que el ranking no es a prueba de trampas.

## 11. Plan por hitos para Claude Code

Estado: ✅ hecho · 🔲 pendiente.

1. ✅ **Esqueleto**: proyecto, bucle de juego, guardado, formateo de números.
2. ✅ **Lógica de la mesa 1** sin arte: ruleta, suerte, penalización por apuesta, tienda de mejoras.
   - ✅ **Mini-hito 2b. Pantalla de inicio**: Continuar, Nueva partida y Ajustes (CRT, volumen, borrar partida), un solo hueco de guardado, ajustes guardados aparte y botón de volver al menú desde el juego (ver 9.1).
3. ✅ **Simulación** y ajuste de números hasta que la mesa 1 dure ~8 min.
   - ✅ **Hito 3b. Backend opcional** (ver 10.1): cuentas, guardado en la nube con conflictos, ranking de la mesa 1, validación de plausibilidad, configuración compartida con el frontend, Docker Compose para desarrollo y README para el portfolio. Cada vez que cambie la economía (por ejemplo, el hito 4) hay que regenerar `shared/plausibility.json`.
4. ✅ **Trabajo manual**: basura clicable, animación del jugador, ayudante de limpieza. Hecho: escena en canvas 640x360 con escalado entero en píxeles físicos, pipeline de assets para basura y jugador, mejoras del trabajo (costes calibrados) y guardado v4.
5. ✅ **Ayudante de apuestas** con perfiles. Se implementó dentro del hito 2: Crupier, velocidad, perfiles prudente/normal/agresivo con límite por saldo, suerte propia y bloqueo de 5 s; calibrado en el hito 3.
6. 🔲 **Arte y escena**: pipeline de assets, fondo, ruleta, retrato del Encargado con 3 fases.
7. 🔲 **Efectos**: CRT, temblor, glitch, luces parpadeantes.
8. 🔲 **Deuda y paso a la mesa 2**: pago, pestañas, conversión de monedas.
9. 🔲 Mesas 3 a 5, una por una, reutilizando el sistema de suerte, mejoras y prestamistas.
10. 🔲 Sonido, textos de cobro, pulido y equilibrio final.

## 12. Decisiones abiertas

- Título del juego.
- Qué dispara el cambio de fase de los prestamistas (propuesta: % de deuda reunido).
- Trabajo de la mesa 5.
- Si el final (tras pagar al Dueño) tiene una pantalla de cierre o un modo de prestigio.
- Frases y nombres de los 5 prestamistas.
