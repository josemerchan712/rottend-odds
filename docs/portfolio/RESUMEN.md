# ROTTEN ODDS — resumen técnico

*La casa siempre cobra.*

## Qué es

Un juego incremental de terror en pixel art para el navegador. Empiezas debiendo diez millones en un casino
podrido y tienes que saldar cinco deudas, una por mesa, a cinco prestamistas cada vez más deformes. Cada mesa
tiene su propio juego de azar, sus mejoras y un ayudante que juega solo; al saldarla se abre la siguiente.

| Mesa | Juego | Lo propio de la mesa |
|---|---|---|
| 1 · La ruleta | Ruleta de 37 casillas (negro, blanco, docenas, número) | El primer dinero sale de recoger basura en la trastienda; un crupier mecánico apuesta por ti |
| 2 · Las tragaperras | Tres carretes con pozo progresivo | Retener un carrete a cambio de una tarifa; un empleado zombi tira de la palanca |
| 3 · Los dados | Dos dados con cinco objetivos de distinto pago | Relanzar un dado tras fallar; racha de dobles seis para el jackpot |
| 4 · El blackjack | Veintiuna contra la banca | Descartes; jackpot con tres sietes |
| 5 · La moneda del Dueño | Cadena de lanzamientos con multiplicadores crecientes (×3, ×4, ×5…) | Retirarse o seguir; moneda justa o cargada; "herencias" de las mesas anteriores |

Hay pantalla de título, pantalla final con epílogo y libro de cuentas, y un **modo demo** (menú o `?demo=mesa1…5`,
`?demo=final`) para ver todas las mesas sin jugar.

## Tecnologías

**Frontend**
- TypeScript estricto y Vite; sin framework de interfaz (DOM y Canvas 2D a mano).
- Escenario interno de 640×360 escalado siempre por un **factor entero** de píxeles físicos (sin suavizado, nítido en
  cualquier dpr y en pantalla completa).
- **Capa de texto aparte**: el texto de las escenas se dibuja con VT323 a resolución física en su propio canvas, por
  encima del filtro CRT, con tamaño mínimo de 14 px y contraste ≥ 4,5:1 comprobados por test.
- Sonido sintetizado con Web Audio (sin archivos de audio). Guardado en `localStorage` con migraciones versionadas
  (12 versiones de formato).

**Backend** (opcional; en el repositorio, no desplegado)
- Spring Boot 3.5 y Java 21: registro e inicio de sesión con **JWT**, guardado en la nube y ranking.
- JPA con **Flyway**; **PostgreSQL** en Docker Compose o **H2** en memoria para desarrollo y tests.
- OpenAPI (springdoc), **límite de intentos** por IP en el login (Bucket4j), secretos solo por variables de entorno.
- **Validación del guardado** en el servidor: estructura, niveles de mejora, coherencia entre mesas y una tabla de
  plausibilidad (cuánto se puede ganar como mucho en un tiempo dado) para no verificar partidas imposibles.

**Calidad y balance**
- Vitest para la lógica (pura, sin DOM) y JUnit + MockMvc en el servidor.
- **Simulador** de partidas completas en Node (con `worker_threads` para la tabla de plausibilidad), con varias
  estrategias por mesa: apuesta por **criterio de Kelly** y decisiones de parada por **programación dinámica**.
- Un único `shared/config.json` con los números que usan cliente y servidor, con un test que comprueba que ambos lo
  leen igual y que la tabla de plausibilidad corresponde a esa configuración.
- Pruebas de extremo a extremo con Chrome sin interfaz (protocolo de depuración) para los clics sobre los cajones.

**Despliegue**
- Web estática en **Cloudflare Workers con assets estáticos** (`wrangler`), sin servidor.
- Cabeceras de seguridad y **CSP** estricta (solo recursos propios, sin incrustación en iframes), caché inmutable para los
  assets con hash; metadatos Open Graph con URLs absolutas.

## Retos y decisiones

- **Equilibrar la economía con simulaciones, no a ojo.** Cada mesa se calibró con el simulador hasta durar ~12 minutos
  con la mejor estrategia, sin que ninguna estrategia trivial (apostar siempre todo, retirarse siempre al primero,
  seguir siempre) fuera claramente mejor, y con el jackpot en torno al 6% de lo ganado. Cuando dos objetivos chocaban
  quedó anotado qué se priorizó y por qué.
- **Pipeline de assets en Node** (sharp): recorta fondos por relleno desde los bordes (no con un filtro de color, que se
  comía la sangre y el fieltro), trocea hojas de sprites, quita filos blancos y, para la ruleta, separa las dos ruedas
  de la imagen, **mide sus radios** en un perfil radial y conserva solo el aro y el cono: el anillo de casillas se dibuja
  en código para que la casilla donde cae la bola sea siempre la del resultado.
- **Texto legible en pixel art.** El texto rasterizado a 1 píxel por unidad (y una fuente bitmap de 3×5) era ilegible y
  el CRT lo emborronaba: pasó a dibujarse a resolución física en una capa propia, con reglas de tamaño y contraste.
- **Azar con riesgo real.** Las probabilidades tienen ventaja de la casa y la suerte la invierte poco a poco. En la mesa
  5, cada paso paga más (×3, ×4, ×5…) y acierta en proporción inversa a su factor, con una ventaja que cae a cada paso:
  seguir no es siempre rentable. Los ayudantes usan el mismo criterio (Kelly con un mínimo de acierto por perfil) para no
  perder sistemáticamente.

## Transparencia

- El **arte está generado con IA** (Nano Banana) y procesado por el pipeline del repositorio.
- El **desarrollo se hizo con asistencia de Claude Code**. El diseño del juego, las decisiones de balance y la dirección
  del proyecto son del autor.
- El **backend está en el repositorio pero no desplegado**: la versión publicada funciona entera sin servidor (sin
  cuentas, sincronización ni ranking, que se ocultan por diseño).

## Cifras (verificadas en el repositorio)

- **5 mesas**, cada una de ~12 minutos con la mejor estrategia; partida completa de **~60 minutos** (simulaciones de 40
  partidas por estrategia).
- **336 tests del cliente** (35 archivos, Vitest) y **30 tests del servidor** (JUnit).
- Código: ~15.900 líneas de TypeScript del juego (`src/`), ~3.900 del simulador (`sim/`), ~1.400 de scripts (assets,
  capturas, pruebas de extremo a extremo), ~4.100 de tests; ~1.800 líneas de Java en el servidor y ~1.000 de sus tests.
- 12 versiones del formato de guardado, todas con migración.

## Capturas

| Archivo | Pie de foto | Texto alternativo |
|---|---|---|
| `01-titulo-menu` | Portada con el menú principal. | Pasillo sucio iluminado por una lámpara verde con el título ROTTEN ODDS goteando sangre y el menú a la derecha: Nueva partida, Ajustes, Modo demo y Créditos. |
| `02-mesa1-casino` | Mesa 1: la ruleta y el Encargado. | Sala de casino ruinosa con una ruleta de casillas negras y blanco hueso, un tapete de apuestas y un encargado de sonrisa forzada. |
| `03-mesa1-trastienda` | Mesa 1: la trastienda, donde se gana el primer dinero recogiendo basura. | Almacén lleno de bolsas de basura y contenedores, con el jugador agachado recogiendo objetos del suelo. |
| `04-mesa2-tragaperras` | Mesa 2: la tragaperras viviente. | Máquina tragaperras oxidada con tres carretes, una tabla de premios y un empleado zombi a su lado. |
| `05-mesa3-dados` | Mesa 3: los dados del Barman. | Barra de bar con un barman pálido, dos dados sobre el tapete y una fila de objetivos de apuesta con su pago. |
| `06-mesa4-blackjack` | Mesa 4: el blackjack de la Crupier. | Mesa de cartas con una crupier enmascarada, la mano del jugador frente a la banca y un esqueleto que juega solo. |
| `07-mesa4-cajon-mejoras` | Cajón de mejoras abierto en la mesa 4. | La mesa de blackjack con un panel lateral de mejoras: suerte, apuesta máxima y jackpot, todas al máximo. |
| `08-mesa5-cadena` | Mesa 5: una cadena en marcha (siguiente paso ×4). | Despacho del Dueño, una silueta con sombrero tras un escritorio lleno de oro, con una moneda dorada y el panel de la cadena: en juego 60, siguiente ×4. |
| `09-final-epilogo` | El epílogo: la salida. | Una figura pequeña de espaldas sube una escalera hacia unas puertas abiertas con luz fría, con una bolsa en la mano; abajo, una línea del epílogo. |
| `10-final-libro-de-cuentas` | El libro de cuentas de la partida. | Dos páginas de papel con el tiempo por mesa, las apuestas, los jackpots, lo ganado en cada mesa y la mejor racha. |

Generadas con `npm run build && npm run capture:portfolio` (Chrome sin interfaz sobre el build, modo demo, 1920×1080
a escala entera). El vídeo se monta con `ffmpeg` a partir de los fotogramas que deja el script (ver DEPLOY.md).
