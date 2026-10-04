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

- El jugador elige la apuesta con **fichas de cantidades reales**. Por debajo siguen siendo el **1%, 10% y 50% del techo de apuesta** (el máximo que se mejora comprando), redondeados hacia abajo a un número redondo de la serie 1, 2, 5, 10, 20, 50…; si dos coinciden tras redondear, la repetida desaparece. La cuarta es **TODO** = lo menor entre el saldo y el techo. Se apuesta exactamente la cantidad que se ve; una ficha que el saldo no cubre sale apagada. Teclas 1-4: las fichas visibles.
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

- **Las apuestas manuales se hacen solo en el casino y la basura se recoge solo en la trastienda.** Cambiar de sala cuesta 0,3 s de fundido por mitad en el juego; la simulación cuenta 1,5 s por sentido (lo que tarda una persona en decidir, pulsar y ubicarse).
- **Simulación con salas** (200 partidas, jugador con una acción cada 0,5 s, va a la trastienda con el suelo lleno o si no quiere apostar, apuesta las cantidades redondeadas): (c) óptima de color **8:18** de media (p10 6:02, p90 10:47); (d) con docena y número **7:51**. Dentro del objetivo de ~8 min ±45 s: no hizo falta tocar números.
  - **Basura:** menos del 1% de las fichas de una partida, pero decisiva al principio: es el capital con el que se compran los primeros niveles de suerte. Si el jugador solo recoge cuando no puede apostar, la mesa pasa de ~8 a ~35 min (de suerte 5 a 10 tarda 7-19 min en vez de 0,5-3).
  - **Activo frente a solo ayudante:** jugar como (c) hasta comprar el Crupier y desde ahí solo comprar mejoras tarda 22:49 de mediana y el 19% de las partidas no termina en una hora. Jugar activo es ~3 veces más rápido.

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

## 4b. Mesa 2: Tragaperras (hecha)

**Prestamista**: la Tragaperras viviente. **Sin trastienda ni trabajo** (solo la mesa 1 la tiene). **Moneda**: monedas. **Deuda**: 10M de monedas.

### 4b.1 Desbloqueo, pestañas y conversión

- Al pagar la deuda de la mesa 1 sale el cartel **"Mesa 1 saldada"** y aparecen las **pestañas de mesa** en el HUD. Cambiar de mesa es un fundido a negro con un rótulo ("MESA 2 · LAS TRAGAPERRAS"), de ~1,5 s. El ranking de la mesa 1 no cambia.
- La mesa 1 **sigue jugando sola** con su ayudante y su limpiador (las dos mesas se actualizan a la vez) y se puede volver a ella en cualquier momento para gastar fichas en sus mejoras.
- **Conversión**: la mesa 2 recibe `monedas/s = k * (ingreso/s de la mesa 1)^0,5`, con **k = 0,3** y un **suelo de 1 moneda/s** (`max(suelo, k·√ingreso)`, igual en todas las mesas sin trastienda: con saldo 0 la apuesta mínima llega en 1 s y ningún ayudante puede dejar la mesa bloqueada). El ingreso de la mesa 1 es el **esperado** de lo que gana sola: el valor esperado de la apuesta actual de su ayudante entre su intervalo (si es positivo) más su ayudante de limpieza. Subir las mejoras de la mesa 1 (o que su ayudante rehaga saldo) sube el pasivo. El HUD de la mesa 2 lo enseña ("+88/s de la mesa 1").

### 4b.2 La máquina

- 3 carretes y 6 símbolos: cereza, calavera, diamante, limón podrido, siete y ojo. **Dos iguales pagan x1,5** y **tres iguales x10** (pago bruto: lo que devuelve la máquina con la apuesta incluida); sin pareja se pierde. Con apuestas impares la pareja se redondea (1 → 2).
- Como en la ruleta, primero se decide el resultado y después se eligen unos carretes que lo enseñen: lo que se ve al pararse siempre es lo que se cobra.
- **Suerte** = probabilidad de premio (pareja o trío), curva convexa: `p(n) = 96/216 + (0,97 − 96/216) * (n/20)^1,6`. Sin suerte es la de unos carretes honrados (44,4%), con valor esperado −10%; con suerte máxima, el 97% de las tiradas tienen premio. De los premios, 1 de cada 16 es un trío (como con carretes honrados).
- **Penalización por apostar fuerte**: la misma que la ruleta (`0,20 → 0,04` según la suerte, por `fracción^1,5`).
- **Selector**: las mismas fichas de cantidades reales que la ruleta (1%, 10%, 50% del techo redondeados y TODO). Techo: 15 × 2,5^nivel.
- **Retener carrete** (mejora de 5 niveles): clic en un carrete para que conserve su símbolo en la siguiente tirada. Cuesta un **extra del 25% de la apuesta** y convierte en premio una parte de las tiradas que perderían: `p_retenida = p + (1 − p) * parte`, con `parte = 35% + 6% por nivel` (35-59%). Una tirada con retención **no puede dar el jackpot**, y **el diamante no se deja retener**.
  - Es una decisión real: compensa con poca suerte o con apuestas grandes (penalización alta) y deja de compensar con mucha suerte. El tooltip del carrete enseña la probabilidad con y sin retener.
  - El zombi retiene con un criterio sencillo: si el valor esperado con retención (y su extra, sin jackpot) supera al de no retener.
- **Jackpot**: tres diamantes, **x1000** la apuesta, con **tope del 25% de la deuda** (2,5M) y **pozo progresivo**. Probabilidad: 0,1% base + hasta 0,7% por la suerte (curva L) + 0,07% por nivel de su mejora, **tope 1,5%**.
  - **Pozo** (decisión propia): el jackpot paga como mucho lo que haya en el pozo. Empieza en 50 y crece con el 15% de cada apuesta de la mesa (del jugador y del zombi); al salir el jackpot vuelve a 50. Sin pozo, x1000 con un 0,1% de probabilidad ya daba +100% de valor esperado por tirada desde el primer segundo y el jackpot era casi todo el dinero de la mesa. Con el pozo, el jackpot es el ~6% de las monedas, como pedía el diseño. La tabla de premios de la máquina enseña el pozo.

### 4b.3 Sin trastienda (sesión 5)

- Las mesas 2 a 5 no tienen trastienda, puerta, Tab, basura, jugador, aprendiz ni mejoras de trabajo: la basura era < 1% de las monedas y solo añadía clics. La red de seguridad es el suelo del pasivo. Los guardados viejos (v7) devuelven lo que costaron esas mejoras en la moneda de su mesa.

### 4b.4 Ayudante: el empleado zombi

- Juega en la máquina de al lado (sus tiradas salen como texto junto a él). Mejoras de velocidad (4 s → ~0,6 s), suerte propia (+0,5% por nivel) y perfiles: **prudente** (5% del techo, como mucho el 3% del saldo; siempre seguro), **normal** (20% / 10%) y **agresivo** (50% / 30%; solo compensa con suerte alta).

### 4b.5 Mejoras de la mesa 2 (calibradas con simulación)

| Mejora | Efecto por nivel | Coste base | Crecimiento | Niveles máx. |
|---|---|---|---|---|
| Suerte | Probabilidad de premio (convexa hasta 97%) | 140 | 1,6 | 20 |
| Apuesta máxima | x2,5 el techo (de 15) | 130 | 2,0 | 10 (antes 11) |
| Empleado zombi | Desbloquea el ayudante | 800 | - | 1 |
| Velocidad del zombi | −12% al intervalo | 500 | 1,6 | 15 |
| Perfil del zombi | Normal y agresivo | 1.500 | 4 | 2 |
| Suerte del zombi | +0,5% solo para el zombi | 1.200 | 1,8 | 10 |
| Jackpot | +0,07% de probabilidad | 3.000 | 1,8 | 10 |
| Retener carrete | Desbloquea y mejora la retención | 300 | 2,2 | 5 |

La suerte y el techo cuestan mucho más que en la mesa 1 porque aquí el pasivo de la mesa 1 (~60-130 monedas/s) da capital desde el primer segundo: con los costes de la mesa 1, la tragaperras se terminaba en 2:40.

### 4b.6 Simulación (`npm run simulate:slots`, 200 partidas por estrategia)

Empieza al pagar la deuda de la mesa 1, con el estado real de una partida (c) de la mesa 1 de la misma semilla (la mesa 1 sigue sola y alimenta la conversión). Mismo jugador que en la mesa 1: una acción cada 0,5 s, una tirada por segundo como mucho.

| Estrategia | Media | p10 | p50 | p90 | Último tramo | Mesa 1 + 2 |
|---|---|---|---|---|---|---|
| (a) Ficha mínima | 51:05 | 48:53 | 51:09 | 53:42 | 13:05 | 59:23 |
| (b) Siempre TODO | 20:21 | 14:10 | 20:00 | 27:46 | 0:47 | 28:40 |
| (c) Ficha óptima, sin retener | 14:53 | 13:10 | 14:48 | 16:46 | 0:47 | 23:12 |
| (d) Ficha óptima y retener cuando compensa | **12:23** | 10:50 | 12:22 | 13:49 | **0:47** | **20:41** |

- Mesa 2 de ~12 minutos con la mejor estrategia; **mesa 1 + mesa 2 ≈ 20:40**. Último tramo (de suerte 20 a 10M) de ~47 s (sesión 5: sin basura, el techo máximo baja del nivel 11 al 10; antes el tramo duraba ~18 s porque la apuesta máxima de 357K liquidaba la deuda en 30 tiradas).
- Ninguna estrategia trivial es mejor: siempre TODO tarda un 64% más y quiebra en casi todas las partidas en las fases media y alta.
- **Retener** da una ventaja real (−15% de tiempo frente a no retener nunca) pero no es obligatorio: sin retener se termina igual, en 14:53.
- Sin bancarrotas en las fases inicial y media con las estrategias (c) y (d); el **zombi prudente** no deja el saldo a 0 en ninguna fase (tampoco normal ni agresivo, gracias al límite por saldo). El zombi agresivo acaba antes (11:33 frente a 15:49 con prudente).
- **Monedas por fuente** (d): máquina 92%, jackpot 7%, pasivo 1%. El jackpot sale ~2,4 veces por partida y casi siempre lo recorta el pozo.
- **La conversión importa mucho al principio**: sin pasivo (k = 0) la mesa 2 tarda 48 minutos; con él, 12. Aporta poco en total, pero es el capital inicial.
- Una variante que además gasta las fichas de la mesa 1 en ella sale igual, porque el jugador simulado paga la mesa 1 con todo comprado: el pasivo solo sube porque el ayudante de la mesa 1 rehace saldo (de ~65 a ~130 monedas/s).

### 4b.7 Escena

- **Sala**: el fondo de la mesa 2; la Tragaperras viviente (96 px) asoma la cabeza por detrás de la máquina central, con respiración y un foco verde; la máquina (200x252) con los tres carretes en su pantalla, que giran de verdad y se paran de izquierda a derecha con un pequeño rebote (0,7 / 0,95 / 1,2 s), línea de premio y destello al ganar; placa "TIRAR" y palanca (clic o Espacio); la columna de fichas; la tabla de premios con el pozo; el zombi en la máquina de la izquierda.
- Temblor al perder una tirada grande y el CRT de siempre; el diálogo en el mismo bocadillo (a la derecha de la cabeza).

## 4c. Mesa 3: Dados (hecha)

**Prestamista**: el Barman. **Sin trastienda ni trabajo**. **Moneda**: chapas. **Deuda**: 10M de chapas.

### 4c.1 Desbloqueo y conversión

- Al pagar la deuda de la mesa 2 sale el cartel **"Mesa 2 saldada"** y aparece la pestaña **MESA 3**. Las mesas 1 y 2 siguen jugando solas con sus ayudantes.
- **Conversión**: `chapas/s = k * (ingreso/s de la mesa 2)^0,5`, con **k = 0,3**. Suelo de 1 chapa/s. El ingreso de la mesa 2 es el esperado de su zombi (sin retener). Sin pasivo, la mesa 3 tarda ~57 min (la mitad no termina en una hora); con él, ~13.

### 4c.2 El juego

- Se tiran **dos dados** a un **objetivo** elegido antes de tirar. Los objetivos funcionan como los tipos de apuesta de la ruleta: `p = p_par · r · m(L)` y pago neto `2/r − 1`, así que **el valor esperado base es el mismo** (con la ventaja de la casa) y cambia el riesgo:

| Objetivo | Honrado | r | Pago | m sin suerte → con suerte máxima | Disponible |
|---|---|---|---|---|---|
| Par | 50% | 1 | 1:1 | 1 → 1 | Desde el inicio |
| Más de 7 | 41,7% | 15/18 | 1,4:1 | 0,97 → 1,15 | Desde el inicio |
| Más de 9 | 16,7% | 1/3 | 5:1 | 0,90 → 1,40 | Mejora "Más de 9 y doble" |
| Doble | 16,7% | 1/3 | 5:1 | 0,85 → 1,50 | Mejora "Más de 9 y doble" |
| Doble seis | 2,8% | 1/18 | 35:1 | 0,80 → 1,80 | Mejora "Doble seis" |

- **Suerte**: `p_par = 0,486 → 0,97` (curva 1,6). Como m < 1 en los arriesgados con poca suerte, **el objetivo seguro es el mejor al principio**; con mucha suerte los arriesgados tienen más valor esperado (doble seis: +250% por ficha frente al +94% de par).
- **Penalización por apostar fuerte**: la de siempre (`0,20 → 0,04` por `fracción^1,5`).
- **Relanzamientos** (la mecánica del Barman): la suerte da **cargas**, como mucho `1 + nivel/4` (1 a 6), que se recargan solas (una cada `16 s × 0,93^nivel`, de 16 s a ~3,7 s). Tras una tirada **perdida** se puede gastar una para **relanzar un dado** (clic en él) o aceptar la tirada. El dado nuevo sale al azar (honrado): la probabilidad de convertir depende del dado que se queda y del objetivo (con un 6 y un 2 a "más de 9", relanzar el 2 convierte el 50% de las veces; relanzar el 6, nunca). El tooltip la enseña. La reserva es común con el ayudante.
- **Jackpot**: **tres dobles seises seguidos**, con la **racha visible** en el tapete (0/3, 1/3, 2/3). Los dados del Barman están **cargados**: el doble seis sale con probabilidad `j^(1/3)` dentro de las tiradas ganadoras, con `j` la probabilidad de jackpot de siempre (0,1% → 1,5% con la suerte y su mejora), así que tres seguidos salen ~j de las veces y el casi-premio (2/3) se ve a menudo. Paga **min(apuesta × 500, pozo, 25% de la deuda)**, con **pozo progresivo** (semilla 50, +15% de cada apuesta), la lección de la mesa 2. Aporta ~4% de las chapas.
- **Selector**: las mismas fichas de cantidades reales. Techo: 20 × 2,5^nivel.
- **Ayudante**: el **camarero fantasma**, al otro lado de la barra. Elige el objetivo que más hace crecer su saldo con su apuesta (criterio de Kelly: por valor esperado perseguía el doble seis con apuestas grandes y hundía el saldo) y relanza el mejor dado si convierte con al menos 1/3. Perfiles prudente, normal y agresivo con límite por saldo, como en las otras mesas.

### 4c.4 Mejoras (calibradas con simulación)

| Mejora | Coste base | Crecimiento | Niveles |
|---|---|---|---|
| Suerte (y cargas de relanzamiento) | 550 | 1,5 | 20 |
| Apuesta máxima | 350 | 2,0 | 8 (techo máximo 30.517) |
| Camarero fantasma | 1.000 | - | 1 |
| Velocidad / perfil / suerte del camarero | 600 / 2.000 / 1.500 | 1,6 / 4 / 1,8 | 15 / 2 / 10 |
| Jackpot | 4.000 | 1,8 | 10 |
| Más de 9 y doble | 300 | - | 1 |
| Doble seis | 2.500 | - | 1 |

### 4c.5 Simulación (`npm run simulate:dice`)

Empieza al pagar la deuda de la mesa 2 con el estado real de una partida (d) de la mesa 2 de la misma semilla (que a su vez empieza desde una (c) de la mesa 1). Mismo jugador: una acción cada 0,5 s, una tirada por segundo como mucho; decidir un relanzamiento gasta una acción.

Con los números actuales (200 partidas por estrategia, sesión 5, sin basura):

| Estrategia | Media | p10 | p50 | p90 | Tramo final | Mesas 1+2+3 |
|---|---|---|---|---|---|---|
| (b) Par, siempre TODO | 19:34 | 16:03 | 19:26 | 24:16 | 2:00 | 39:44 |
| (b2) Siempre doble seis, ficha óptima | 17:37 | 15:34 | 17:34 | 19:43 | 1:01 | 37:47 |
| (c) Óptima, solo par, sin relanzar | 16:17 | 15:22 | 16:17 | 17:24 | 1:59 | 36:27 |
| (c2) Óptima, todos los objetivos, sin relanzar | 15:24 | 14:16 | 15:19 | 16:33 | 1:11 | 35:34 |
| (d) Óptima, todos los objetivos y relanzando | **13:38** | 12:19 | 13:30 | 15:09 | **1:01** | **33:48** |

- Mesa 3 de ~14 minutos con la mejor estrategia; mesas 1+2+3 ≈ 34 min. Sin basura no hizo falta tocar números.
- **Tramo final** (de suerte 20 a 10M) de ~1 minuto: el momento de dominar el casino. Antes duraba ~6 s porque el techo llegaba a 238K y el último nivel de suerte costaba 3,2M (se compraba casi al final). Ajuste mínimo: techo máximo en el nivel 8 (30.517) y suerte con crecimiento 1,5 (base 550) para que la suerte 20 llegue antes y la duración total siga en ~14 min.
- Ninguna estrategia trivial gana: siempre TODO quiebra en casi todas las partidas en las fases media y alta; perseguir siempre el doble seis tarda un 26% más.
- Los relanzamientos dan una ventaja real (−12% frente a no relanzar) y no son obligatorios.
- Sin bancarrotas con las estrategias (b2), (c) y (d).
- **Camarero por fase** (tiempo en cada fase con perfil fijo): prudente gana la inicial, normal la media y agresivo solo la alta (agresivo: todo el techo y hasta el 60% del saldo; con 50% / 30% ganaba en todas las fases por los relanzamientos). Ningún perfil deja el saldo a 0.

### 4c.6 Escena

- **Bar**: el fondo de la mesa 3; el Barman (96 px) tras la barra, recortado por ella, con respiración; un tapete verde delante con los dos dados, que ruedan desde la izquierda con rebote y caras cambiando (y el dado en 3/4) y se paran en el resultado; la racha 6·6, el pozo y las cargas; los cinco objetivos (clic o Q W E R T); TIRAR (o Espacio) y ACEPTAR; la columna de fichas; el camarero fantasma a la derecha.

## 4d. Mesa 4: Blackjack (hecha)

**Prestamista**: la Crupier. **Sin trastienda ni trabajo**. **Moneda**: fichas negras. **Deuda**: 10M.

### 4d.1 Desbloqueo y conversión

- Al pagar la deuda de la mesa 3 sale **"Mesa 3 saldada"** y la pestaña **MESA 4**. Las mesas 1 a 3 siguen solas con sus ayudantes.
- **Conversión**: `fichas/s = k * (ingreso/s de la mesa 3)^0,5`, con **k = 0,3** y suelo de 1 ficha/s (ingreso esperado del camarero, sin relanzar). Sin pasivo la mesa 4 tarda ~33 min; con él, ~12,5.

### 4d.2 El juego

- **Blackjack simplificado**: una baraja de 52 barajada en cada mano; la banca pide hasta 17 (se planta también con 17 blando); solo **pedir o plantarse** (sin doblar ni dividir); ganar paga **1:1** (también el blackjack natural); **empate devuelve** la apuesta. Con estrategia básica y baraja honrada se gana el 43,3% de las manos (empate 9,3%): valor esperado **−4%**, la ventaja de la casa.
- **Suerte = baraja que favorece**: cada carta se elige entre varias candidatas (1 + parte entera de la intensidad, y una más con la probabilidad de la parte decimal) y se queda la que más conviene al jugador (acercarse a 21 sin pasarse; a la banca, pasarse o quedarse corta). Con intensidad negativa favorece a la banca. Una tabla calibrada por simulación (`sim/cardsRig.ts` → `src/game/cards/rigTable.ts`, 60.000 manos por punto) traduce intensidad en probabilidad de ganar con estrategia básica, así que la suerte sigue la curva de siempre: `p(ganar) = 43,3% + (97% − 43,3%) · L` con `L = (n/20)^1,6`.
- **Penalización por apostar fuerte**: la de siempre (`0,20 → 0,04` por `fracción^1,5`), restada de esa probabilidad; con poca suerte la baraja llega a favorecer a la banca si se apuesta fuerte.
- **Descartes** (la mecánica de la Crupier): cargas como mucho `1 + nivel/3` (1 a 7) que se recargan solas (una cada `6 s × 0,93^nivel`). Justo después de recibir una carta (también si te has pasado) se puede **descartar la última** (clic en ella o D) y recibir otra, elegida con **dos candidatas más** y nunca a favor de la banca. Si te pasas y tienes cargas, la mano espera: descartar o ACEPTAR. La reserva es común con el ayudante.
- **Jackpot 7-7-7** (21 con tres sietes): con probabilidad `j` por mano (0,1% → 1,5% con la suerte y su mejora) la baraja trae 7-7 al jugador y otro 7 arriba: **hay que pedir con 14** para cobrarlo (el indicador "7·7·7 POZO" se enciende con dos sietes en la mano). Paga **min(apuesta × 500, pozo, 25% de la deuda)**; pozo progresivo (semilla 50, +8% de cada apuesta). Aporta ~5-6% de las fichas.
- **Selector**: las mismas fichas de cantidades reales. Techo: 15 × 2,5^nivel (máximo 143K en el nivel 10).
- **Ayudante**: el **esqueleto barajador**. Juega con estrategia básica (y pide con 7-7), descarta solo si se pasa y quedan al menos 2 cargas, y apuesta lo menor entre su fracción del techo, su máximo del saldo y `kelly ×` la fracción de Kelly del saldo (prudente ½, normal 1, agresivo 2): **con valor esperado negativo espera**. Agresivo (60% del techo, 40% del saldo, 2× Kelly) solo compensa cuando lo limita el techo.

### 4d.4 Mejoras (calibradas con simulación)

| Mejora | Coste base | Crecimiento | Niveles |
|---|---|---|---|
| Suerte (y cargas de descarte) | 150 | 1,5 | 20 |
| Apuesta máxima | 350 | 2,0 | 10 |
| Esqueleto barajador | 1.200 | - | 1 |
| Velocidad / perfil / suerte del esqueleto | 700 / 2.500 / 1.800 | 1,6 / 4 / 1,8 | 15 / 2 / 10 |
| Jackpot | 5.000 | 1,8 | 10 |

### 4d.5 Simulación (`npm run simulate:cards`, 200 partidas por estrategia, sesión 5, sin basura)

Empieza al pagar la deuda de la mesa 3 con el estado real de una partida (d) de la mesa 3 de la misma semilla. Cada decisión (repartir, pedir, plantarse, descartar, aceptar) gasta una acción del jugador (0,5 s) y entre manos pasa al menos 1 s.

| Estrategia | Media | p10 | p50 | p90 | Tramo final | Mesas 1-4 |
|---|---|---|---|---|---|---|
| (b) Siempre TODO, estrategia básica | 15:08 | 13:22 | 15:00 | 17:19 | 1:00 | 48:57 |
| (e) Óptima, nunca pide (no se pasa) | 13:22 | 12:39 | 13:19 | 14:08 | 1:01 | 47:10 |
| (c) Óptima, estrategia básica, sin descartes | 13:13 | 12:26 | 13:11 | 14:03 | 1:01 | 47:01 |
| (d) Óptima, estrategia básica y descartes | **12:25** | 11:51 | 12:25 | 13:05 | **1:01** | **46:14** |

- Mesa 4 de ~12,5 minutos con la mejor estrategia; tramo final de ~1 minuto; mesas 1 a 4 ≈ 46 min. Sin basura no hizo falta tocar números.
- Ninguna estrategia trivial gana: siempre TODO tarda un 21% más. "Nunca pedir" casi empata con la estrategia básica sin descartes (la baraja que favorece hace que la banca se pase a menudo), pero pierde frente a la mejor.
- Los **descartes** dan una ventaja real (−6,4% de tiempo, ~130 por partida del jugador) y no son obligatorios.
- Sin bancarrotas en ninguna fase.
- **Esqueleto por fase**: normal gana la fase media (8:24) y agresivo solo la alta (2:48 frente a 4:46 y 6:39); prudente es el más lento pero nunca arriesga. Ningún perfil deja el saldo a 0.
- Fichas por fuente (d): manos 94%, jackpot 5%, pasivo < 1%.

### 4d.6 Escena

- **Sala**: el fondo de la mesa 4; la Crupier (96 px) tras la mesa, recortada por ella, con respiración; un tapete delante con las cartas de la banca y del jugador, que salen del zapato, se deslizan y **se voltean** (la de la banca boca abajo hasta que te plantas); caras dibujadas en código (papel viejo, índices, palo y una corona en las figuras) y el dorso del arte; **PEDIR, PLANTARSE, REPARTIR y ACEPTAR impresos en el propio tapete**; la última carta resaltada con una "D" para descartar; totales, manos, descartes, pozo y 7·7·7; la columna de fichas; el esqueleto a la derecha. Teclas: Espacio (repartir / plantarse), P, S, D, 1-4.

## 5. Conversión de monedas entre mesas

- Cada mesa tiene su moneda (fichas, monedas, etc.).
- La mesa N+1 recibe **producción pasiva** de la mesa N: `pasivo_N+1 por segundo = k * (ingreso_por_segundo_N)^0.5`, con `k` ajustable.
- La raíz evita que la mesa vieja sustituya a la nueva: mejorar la vieja ayuda de verdad, pero no la vuelve inútil.
- La mesa vieja sigue funcionando con su ayudante, y el jugador puede volver a gastar su moneda en mejoras (que a su vez suben la producción pasiva de la nueva). Interfaz con **pestañas por mesa**.
- Al pagar la deuda se descuentan los 10M del saldo; lo que sobre se conserva.
- Implementado de la mesa 1 a la 2, de la 2 a la 3 y de la 3 a la 4, con k = 0,3 (ver 4b.1, 4c.1 y 4d.1).

## 6. Mesas 2 a 5 (resumen)

Cada mesa mantiene suerte, valor de apuesta, ayudante y jackpot. Cambia el juego y el trabajo.

| Mesa | Juego | Trabajo | Prestamista | Particularidad |
|---|---|---|---|---|
| 2 | Tragaperras (3 carretes, 6 símbolos) | Limpiar tragaperras | Tragaperras viviente | Dos iguales x1,5, tres iguales x10. Mejora **retener carrete**. Jackpot: 3 diamantes x1000 con pozo. **Hecha: ver 4b.** |
| 3 | Dados, mayor o menor | Servir copas | Barman | El jugador elige objetivo (más de 7, más de 9, doble seis) y cuanto más difícil más paga. Suerte = relanzar un dado. Jackpot: tres dobles seises seguidos. **Hecha: ver 4c.** |
| 4 | Blackjack simplificado (pedir o plantarse) | Barajar y repartir | Crupier | Sin doblar ni dividir, pago 1:1. Suerte = descartar una carta mala. Jackpot: 21 con tres sietes. **Hecha: ver 4d.** |
| 5 | Doble o nada encadenado | Por decidir (siniestro) | El Dueño | Cada acierto duplica y decides retirarte o seguir; fallar lo pierde todo. Jackpot: racha de 10 aciertos. |

Detalles finos de la mesas 2 a 5 se diseñan cuando la mesa 1 esté jugable.

## 7. Prestamistas

Cada uno tiene una hoja de 3 frames (calmado, inquieto, deformado), 128x128 por frame.

1. **Encargado**: encargado de sala cansado, sonrisa demasiado ancha.
2. **Tragaperras viviente**: cobrador con una tragaperras fusionada en el torso.
3. **Barman**: barman demacrado, ojos negros.
4. **Crupier**: máscara de porcelana agrietada, ojos cosidos.
5. **El Dueño**: silueta con sombrero de copa, al final calavera de monedas.

Cambio de fase: **% de la deuda de su mesa reunido** (0-33% calmado, 33-66% inquieto, 66-100% deformado). Diálogo con el mismo motor (9.3): el Encargado tiene sus líneas aprobadas; las de la Tragaperras viviente (`src/content/dialogue2.es.ts`, ≥5 por disparador y fase, tono de cobrador mecánico y frío) están **pendientes de revisión**.

## 8. Arte y estética

- Resolución interna **640x360**, escalado entero con `image-rendering: pixelated`, sin suavizado.
- Paleta: negro casi puro, verde enfermizo, rojo sangre seco, naranja óxido, dorado sucio, blanco hueso.
- Filtro CRT: scanlines, viñeta, grano, parpadeo leve. Debe poder desactivarse.
- Implementado en la mesa 1 (hito 6): con el ajuste "Filtro CRT" activado, la escena tiene scanlines, viñeta, grano, parpadeo y apagones breves de las 5 lámparas del fondo, y temblor de pantalla al perder una apuesta grande (la apuesta era al menos el 25% del saldo). Con el ajuste desactivado no se dibuja ninguno de estos efectos. Los efectos se aplican solo a la escena, no a los paneles HTML. Pendiente: el glitch por tensión de la deuda.
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
- Ampliado en el hito 6:
  - El color de fondo se detecta en el borde, así que vale para magenta y para cian (la ruleta). El halo se limpia por el tono del fondo.
  - Los huecos encerrados se borran también por relleno: una región conectada parecida al fondo se borra entera solo si la mayoría de sus píxeles son casi idénticos al fondo. Nunca hay un filtro de color global.
  - Fichas y ayudantes se trocean por cuadrícula, con un margen para saltar las líneas de la rejilla. Cada celda se recorta desde sus propios bordes.
  - La fila de pilas de la hoja de fichas tiene dos pilas por celda y se parte en dos (8 pilas). Los paneles de ayudantes no miden lo mismo; solo se usa el brazo mecánico.
  - Salidas: Encargado 3 × 128x128, ruleta sana y rota a 150x150 (tamaño en escena), 8 fichas y 8 pilas a 32x32, brazo a 64x64 y fondo de la mesa 1 a 640x360 (recorte centrado a 16:9, sin quitar fondo).
- Ampliado para la mesa 2:
  - Hoja de la tragaperras troceada con cajas a mano (la máquina con su palanca a 200x252 y los 6 símbolos a 32x32 con su cuadro negro, que hace de carrete). La Tragaperras viviente a 96x96 (detección de bloques), el empleado zombi a 64x64 (segunda celda de la hoja de ayudantes) y el fondo de la mesa 2 a 640x360.
  - El brazo esquelético de la Tragaperras viviente conserva un halo rosado de 1 px en algunos píxeles.
  - Mesa 4: la Crupier a 96x96 con cajas a mano (la hoja trae un degradado blanco en los bordes de los paneles que unía los tres frames; se recorta por encima), el dorso de las cartas a 32x48 (las caras se dibujan con código porque la hoja solo trae A, K y 7), el esqueleto barajador a 64x64 (cuarta celda de la hoja de ayudantes) y el fondo de la mesa 4. Lo que falta, con tamaños y prompts, está en PROGRESS.md.
  - Mesa 3: el Barman a 96x96 (bloques), las 6 caras de los dados a 32x32 y el dado en 3/4 (cajas a mano), el camarero fantasma a 64x64 (tercera celda de la hoja de ayudantes; sus piernas translúcidas conservan algo de tono rosado) y el fondo de la mesa 3.

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

Rediseño en 8 pasos (hecho). Todo vive en un escenario de 640x360 escalado por un factor entero de píxeles físicos, con los menús HTML dentro del escenario y el CRT encima de todo.

- **Pantalla completa** (botón y tecla F; ajuste para pedirla al empezar).
- **Dos salas (solo la mesa 1)**: el **casino** (ruleta, tapete y Encargado) y la **trastienda** (basura, jugador y limpiador). Se cambia con las puertas o con Tab, con un fundido de 0,3 s por mitad. La sala no se guarda: siempre se empieza en el casino. Las tiradas del ayudante fuera del casino se avisan en el HUD.
- **Ruleta** en el centro del casino, con anillo de casillas propio (0, Cero Dorado y 1-36 en negro y blanco hueso). La rueda se para recta y la bola cae en la casilla del resultado lógico (`src/ui/wheelMath.ts`, con tests). Debajo, la tira de las últimas tiradas.
- **Tapete de apuestas** con zonas clicables (negro, blanco, docenas y la rejilla de números; candados en lo bloqueado) y un tooltip con pago, probabilidad y valor esperado. Al lado, la columna de **fichas** con cantidades reales (3.1).
- **El Encargado detrás de la mesa** (96 px), con respiración y un giro de cabeza hacia la rueda en cada tirada; su sprite según la fase (0-33% calmado, 33-66% inquieto, 66-100% deformado).
- **HUD** arriba: fichas, barra de deuda con %, pagar deuda, pantalla completa y menú.
- **Cajones laterales** colapsados en una pestaña de 20 px: **Mesa** (M, izquierda: suerte, techo, jackpot, docena, número y estadísticas) y **Ayuda** (A, derecha: crupier, perfiles, velocidad, suerte del ayudante y trabajo). Abiertos ocupan ≤140 px. Un punto avisa de que hay algo comprable. Esc los cierra.
- **Brazo mecánico** del crupier junto a la mesa cuando el ayudante está comprado.

### 9.3 Diálogo del prestamista

- Una línea cada vez, en un **bocadillo** sobre su cabeza en el casino (a la derecha de la rueda, para no taparla) y en una **caja abajo con su nombre** en la trastienda. Se escribe letra a letra, se queda 4 s y se desvanece. Un clic completa el texto; otro lo cierra. Se puede desactivar en Ajustes.
- **Reglas** (`src/game/dialogue.ts` y `src/game/dialogueWatch.ts`): 25 s mínimo entre líneas (salvo el pago de la deuda); como mucho una línea cada 3 apuestas para lo que disparan las apuestas; nunca durante un cambio de sala ni con una tirada girando a la vista (el motivo espera, y caduca a los 6 s); sin repetir las 8 últimas; si coinciden varios motivos, gana la prioridad (deuda pagada > bienvenida > jackpot > fases > crupier > sin fichas > perder grande > ganar grande > salas > silencio).
- **Disparadores:** partida nueva; volver a la partida (solo si han pasado ≥5 min reales desde el último guardado, con líneas para ausencias cortas, <1 h, o largas, ≥1 h); perder o ganar grande (solo apuestas **manuales** de ≥50% del techo y ≥20 fichas); Cero Dorado (también del ayudante); quedarse sin fichas (solo cuando el saldo pasa de >0 a 0 jugando, nunca al cargar); entrar en la trastienda y volver al casino; comprar el crupier; pasar a inquieto y a deformado; pagar la deuda; silencio largo (75 s sin clics ni teclas, como mucho 2 líneas hasta la siguiente acción).
- **Texto** en `src/content/` (≥5 líneas por disparador y fase, ≤90 caracteres).

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
6. ✅ **Arte y escena**: pipeline de assets, fondo, ruleta, retrato del Encargado con 3 fases. Hecho para la mesa 1 (ver 8.1 y 9.2). Falta el arte limpio de la ruleta y el idle del jugador.
   - ✅ **Rediseño de la interfaz en 8 pasos**: pantalla completa, dos salas, tapete y selector con cantidades reales, cajones laterales, el Encargado detrás de la mesa, diálogo conectado a la escena, simulación con coste de cambiar de sala (mesa 1 ≈ 8:18 con (c), sin tocar números) y documentación (3.1, 9.2, 9.3).
7. 🔲 **Efectos**: CRT, temblor, glitch, luces parpadeantes. Hechos en el hito 6 para la mesa 1: CRT (scanlines, viñeta, grano), temblor y luces parpadeantes. Falta el glitch.
8. ✅ **Deuda y paso a la mesa 2**: pago, cartel "Mesa 1 saldada", pestañas, transición, conversión de monedas y guardado v5 (con migración desde v4; el servidor acepta v5 con validación estructural de la mesa 2).
   - ✅ **Mesa 4 (blackjack)** jugable completa (ver 4d): baraja real que favorece según la suerte (tabla calibrada), descartes, jackpot 7-7-7 con pozo, esqueleto barajador con criterio de Kelly, la Crupier con diálogo (pendiente de revisión), guardado v7. Sin trastienda desde la sesión 5.
   - ✅ **Mesa 3 (dados)** jugable completa (ver 4c): objetivos con el mismo VE base, relanzamientos, jackpot de tres dobles seises con racha visible y pozo, camarero fantasma, el Barman con diálogo (pendiente de revisión), guardado v6. Sin trastienda desde la sesión 5.
   - ✅ **Mesa 2 (tragaperras)** jugable completa (ver 4b): máquina con retención y jackpot con pozo, zombi, Tragaperras viviente con diálogo (pendiente de revisión), escena con carretes que giran, simulación (~12 min; mesa 1 + 2 ≈ 20:40). Sin trastienda desde la sesión 5.
9. 🔲 Mesa 5 (de la 2 a la 4 ya están), reutilizando el sistema de suerte, mejoras y prestamistas.
10. 🔲 Sonido, textos de cobro, pulido y equilibrio final.

## 12. Decisiones abiertas

- Título del juego.
- Qué dispara el cambio de fase de los prestamistas (propuesta: % de deuda reunido).
- Trabajo de la mesa 5.
- Si el final (tras pagar al Dueño) tiene una pantalla de cierre o un modo de prestigio.
- Frases y nombres de los 5 prestamistas.
