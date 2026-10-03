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
- **Jackpot por mesa**: probabilidad base 0,1%. La suerte aporta hasta +0,7% siguiendo su misma curva y la mejora de Jackpot otro +0,7%, con **tope total de 1,5%**. Raro pero alcanzable. El pago tiene un tope del 25% de la deuda.

### 3.1 Selector de apuesta y penalización por riesgo

- El jugador elige la apuesta con botones rápidos: **1%, 10%, 50%, TODO** **del techo de apuesta** (el máximo que se mejora comprando). Si el saldo es menor, la apuesta se limita al saldo.
- **Penalización por apostar fuerte**: la probabilidad efectiva baja según la fracción del techo apostada.
  `p_efectiva = p_suerte - 0.20 * fraccion^1.5` (fraccion = apuesta / techo, entre 0 y 1).
- Consecuencia buscada: con poca suerte, apostar el techo tiene valor esperado negativo, y la fracción óptima sube con la suerte (aprox. `(2p - 1)^(2/3)`: 0 por debajo del 50%, ~34% con p = 0,6 y ~96% con p = 0,97).
- Perder una apuesta de TODO tiene un castigo extra pequeño: el ayudante se bloquea 5 segundos.
- El ayudante usa un **perfil fijo** que se mejora (fracción del techo): prudente (1-10%), normal (10-25%), agresivo (50%+).

## 4. Mesa 1: Ruleta (la que se construye primero)

**Prestamista**: el Encargado. **Trabajo**: recoger colillas y vasos del suelo.

### 4.1 Ruleta

- 37 casillas: 18 negro, 18 blanco, 1 cero verde (la casa gana).
- Tres tipos de apuesta:

| Apuesta | Pago | Prob. base | Disponible |
|---|---|---|---|
| Color (negro o blanco) | 1:1 | 48,6% (18/37) | Desde el inicio |
| Docena (1-12, 13-24, 25-36) | 2:1 | 32,4% (12/37) | Mejora "Apuesta a docena" |
| Número (1-36) | 35:1 | 2,7% (1/37) | Mejora "Apuesta a número" |

- La suerte y la penalización se calculan sobre el color y se aplican **en proporción a las casillas**: `p_docena = p_color_efectiva * 12/18`, `p_número = p_color_efectiva * 1/18`. Con los pagos de una ruleta real, los tres tipos tienen siempre **el mismo valor esperado**; solo cambia la varianza. El color es la apuesta segura; docena y número sirven para buscar un golpe (por ejemplo, alcanzar una compra) a cambio de más riesgo.
- Jackpot **Cero Dorado**: casilla extra que paga **x500** la apuesta (con cualquier tipo de apuesta), con tope de pago del 25% de la deuda. Probabilidad del 0,1% al 1,5% (ver sección 3).

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

- Mejoras del trabajo: **Pinzas** (recoger 2 objetos por clic), **Bolsa grande** (+valor por objeto), **Ayudante de limpieza** (otro sprite que recoge solo).
- Atajo de teclado "recoger el más cercano" como accesibilidad.

### 4.3 Mejoras (valores iniciales, a ajustar con simulación)

Fórmula de coste: `coste(n) = base * crecimiento^n`.

| Mejora | Efecto por nivel | Coste base | Crecimiento | Niveles máx. |
|---|---|---|---|---|
| Suerte | Sube la prob. (curva convexa hasta 97%) | 50 | 2,1 | 20 |
| Apuesta máxima | x1,8 el techo de apuesta (empieza en 10) | 100 | 2,3 | 12 |
| Crupier (ayudante) | Desbloquea el ayudante | 500 | - | 1 |
| Velocidad del ayudante | -12% al tiempo entre apuestas (de 4 s a ~0,5 s) | 300 | 2,0 | 15 |
| Perfil del ayudante | Desbloquea normal y agresivo (prudente viene con el Crupier) | 1.000 | 4 | 2 |
| Suerte del ayudante | +0,5% de prob. solo para el ayudante | 800 | 2,2 | 10 |
| Jackpot | +0,035% de prob. de Cero Dorado | 2.000 | 2,5 | 20 |
| Apuesta a docena | Desbloquea la docena (2:1) | 3.000 | - | 1 |
| Apuesta a número | Desbloquea el número (35:1) | 25.000 | - | 1 |

Objetivo: llegar a 10M en **~8 minutos** de juego activo, con el último tramo (desde suerte máxima hasta 10M) de 1-2 minutos y el arranque (primera apuesta y primera mejora de suerte) en menos de ~30 s. Calibrar con `npm run simulate` (ver sección 10).

**Estado:** estos valores aún son los iniciales. La simulación muestra que con ellos ninguna estrategia llega a 10M en una hora (las mejoras suman ~121.000M). Hay una propuesta de ajuste en `sim/propuesta.json`, pendiente de aprobar.

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

## 11. Plan por hitos para Claude Code

1. **Esqueleto**: proyecto, bucle de juego, guardado, formateo de números.
2. **Lógica de la mesa 1** sin arte: ruleta, suerte, penalización por apuesta, tienda de mejoras.
   - **Mini-hito 2b. Pantalla de inicio**: Continuar, Nueva partida y Ajustes (CRT, volumen, borrar partida), un solo hueco de guardado, ajustes guardados aparte y botón de volver al menú desde el juego (ver 9.1).
3. **Simulación** y ajuste de números hasta que la mesa 1 dure ~8 min.
4. **Trabajo manual**: basura clicable, animación del jugador, ayudante de limpieza.
5. **Ayudante de apuestas** con perfiles.
6. **Arte y escena**: pipeline de assets, fondo, ruleta, retrato del Encargado con 3 fases.
7. **Efectos**: CRT, temblor, glitch, luces parpadeantes.
8. **Deuda y paso a la mesa 2**: pago, pestañas, conversión de monedas.
9. Mesas 3 a 5, una por una, reutilizando el sistema de suerte, mejoras y prestamistas.
10. Sonido, textos de cobro, pulido y equilibrio final.

## 12. Decisiones abiertas

- Título del juego.
- Qué dispara el cambio de fase de los prestamistas (propuesta: % de deuda reunido).
- Trabajo de la mesa 5.
- Si el final (tras pagar al Dueño) tiene una pantalla de cierre o un modo de prestigio.
- Frases y nombres de los 5 prestamistas.
