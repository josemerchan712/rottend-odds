# Progreso

Archivo de continuidad: si la sesión se corta, la siguiente retoma desde aquí.
Reglas: commits pequeños, actualizar este archivo tras cada commit, no repetir simulaciones largas si
no han cambiado los números. Carpeta de trabajo: `C:\videojuego` (fuera de OneDrive).

## Sesión 12 (menú principal que no se corta y documentación al estado real)

### Parte A: el menú principal se cortaba con la sesión iniciada

- **Diagnóstico** (medido con `scripts/e2e/titleMenu.ts`, en unidades del escenario de 640x360, igual con dpr 1, 1,5 y 2
  en ventana y en pantalla completa, porque el escenario se escala con un factor entero): el menú empezaba en 166 y medía
  287 en el peor caso (guardado con final, sesión, servidor: 9 botones y 2 líneas pequeñas) → acababa en 453. Con
  guardado y sin sesión acababa en 424, y sin guardado con sesión en 379: todos se cortaban. Además la línea de Continuar
  («Mesa 5 · 58:13 · casa saldada», 166 px) no cabía en el botón de 176 (hueco útil 150).
- [x] **Cuenta** agrupa lo de la cuenta: sin sesión abre Iniciar sesión; con sesión, un submenú en el mismo sitio y con la
  misma estética (nombre de jugador, Sincronizar partida, Cerrar sesión, Volver). Teclado, ratón y Esc para volver.
- [x] **Medidas** en `src/game/menuLayout.ts` (las mismas que style.css): el menú va de 150 (la gota de la «S» del título
  acaba en 142) a 352, 202 unidades. Normal: botón 23, separación 6, línea 16. Compacto (solo si no cabe en normal):
  botón 19, separación 5 y la línea de Continuar pegada; el subtítulo del demo pasa a la misma línea («· sin jugar»).
  Peor caso: 201 de 202. Ancho 196 (antes 176), desde x=372: sigue en la zona oscura, sin tapar el pasillo ni la puerta.
- [x] **Scroll interno** de seguridad (si algún día no cupiera): sin barra, con «▾ más» abajo mientras quede algo por
  debajo; la navegación con teclado desplaza solo la lista (no `scrollIntoView`, que movería el escenario).
- [x] «Sesión: nombre» abajo a la izquierda con fondo oscuro y recorte con «…»; no se solapa con la versión.
- [x] Tests: `tests/menuLayout.test.ts` (las 32 combinaciones de guardado, sesión, final, servidor y demo caben) y
  `tests/menu.test.ts`. `npm run test:e2e:menu` (Chrome sin interfaz, sin Docker): mide el menú real en 3 casos × dpr 1,
  1,5 y 2 × ventana y pantalla completa, comprueba con `elementFromPoint` que todo botón se puede pulsar, el submenú y
  Esc, y revisa Ajustes, Ranking (respuesta simulada con nombres de 20 caracteres), Créditos, el final, Iniciar sesión y
  Privacidad sin textos cortados. Capturas antes y después en el scratchpad de la sesión (no en `docs/capturas`).
- Decisiones propias:
  - «Con y sin demo» se interpreta como con y sin la entrada «Modo demo» en el menú (hoy siempre sale).
  - Densidad automática en vez de compacta siempre: los casos habituales conservan el aspecto de antes.
  - Separación mínima de 5: con 4, el marco pixel (box-shadow de 3) de un botón tapaba el borde dorado del anterior.
  - Volver de Sincronizar lleva al menú principal (no al submenú de la cuenta).
  - Ventanas más pequeñas que 640x360 píxeles físicos: el escenario entero se recorta (factor mínimo 1) y sale el aviso de
    pantalla pequeña; el scroll interno no cambia eso.

## Sesión 11 (cuentas sin email y preparación para un VPS)

### Parte A: cuentas sin email

- [x] **Servidor:** registro, login, «¿nombre disponible?», restablecer con código, borrar cuenta y exportar datos
  (`AuthController`, `AuthService`, `PlayerNames`, `RecoveryCodes`). Sin email en API, BD, DTO, OpenAPI ni tests.
- [x] **Cliente:** pantalla de cuenta con modos entrar / crear / contraseña nueva / código de recuperación
  (`src/ui/online.ts`), aviso del nombre al escribir (formato al momento, disponibilidad con debounce de 400 ms),
  sugerencias como botones, «No uses tu nombre real», código con Copiar y Descargar .txt. Validación local del
  formato en `src/api/playerName.ts` (la misma regla que el servidor). Tests `tests/accounts.test.ts`.
- [x] README (API, decisiones y limitaciones) y `.env.example` (`NAME_CHECK_RATE_LIMIT`).
- Decisiones propias:
  - **Flyway: se reescribe `V1__init.sql`** en vez de añadir una V2: la V1 nunca se ha aplicado a una base real (no
    hay despliegue). Un volumen local antiguo de Docker hay que borrarlo (`docker compose down -v`).
  - Restricción única sobre `player_name_key` (el nombre en minúsculas); se guarda también el nombre tal cual.
  - Filtro de nombres: lista de reservados (admin, moderador, sistema, claude, anthropic, rottenodds, lacasa, personajes
    y prestamista…, también con números detrás) y de insultos ES/EN con sustitución leet y sin separadores. Para no
    bloquear palabras normales («Reputacion», «Computadora», «Assassin»), algunas raíces solo cuentan al principio o
    al final. Límites: es una lista corta; se esquiva con faltas creativas.
  - Sugerencias: candidatos intercalados (sufijo temático, número, sufijo…), se filtran con las mismas reglas y se
    comprueban libres en una sola consulta; hasta 5.
  - Carrera de dos registros: inserción en transacción corta (`TransactionTemplate`); el choque con la restricción
    única → 409 con sugerencias buscadas fuera de esa transacción (en PostgreSQL una transacción fallida no admite
    más consultas).
  - Límites por IP: login, registro y restablecer comparten cubo (10/min); la disponibilidad tiene el suyo (30/min).
  - Código de recuperación: 16 caracteres de un alfabeto sin 0/O/1/I, en grupos de 4; se compara sin guiones ni
    mayúsculas. Restablecer también inicia sesión y muestra el código nuevo con la misma pantalla.
  - En `localStorage` la sesión sigue usando el campo `displayName` (se rellena con `playerName`): así no se
    invalidan sesiones guardadas ni hay que migrar nada.
  - Esc no cierra la pantalla del código de recuperación (hay que pulsar «Lo he guardado, continuar»).

### Parte B: preparación para un VPS (nada desplegado)

- [x] **Verificación con PostgreSQL real** (Docker, `.env` de prueba con secretos aleatorios que no se imprimieron y ya
  borrado): Flyway aplica la V1 en Postgres 16; `scripts/e2e/backend.ts` (mismo cliente HTTP que el juego) pasa registro,
  409 con sugerencias libres, carrera de 6 registros (un 201 y cinco 409), login genérico, guardar, leer, deuda saldada,
  ranking, restablecer (código de un solo uso), exportar; tras reiniciar los contenedores sigue todo y borrar la cuenta
  la saca del ranking y libera el nombre.
  - **Qué falló:** nada del backend con Postgres real. Fallaron cosas alrededor: Docker Desktop no arrancaba (sockets
    AF_UNIX corruptos en `%LOCALAPPDATA%\Docker\run` y `docker-secrets-engine`: se apartaron las carpetas; y WSL
    agotaba el tiempo al crear la VM con poca RAM libre); el compose de desarrollo usaba Postgres 17 (producción 16:
    alineado) y no pasaba `AUTH_RATE_LIMIT` (añadido); y **`deploy.sh` no volvía atrás** con una versión rota porque
    `docker compose up -d` falla (Caddy depende de la API sana) y `set -e` cortaba antes: corregido y probado.
- [x] `docker-compose.prod.yml` + `deploy/Caddyfile` + `server/Dockerfile.prod` + `.env.prod.example`. Probado en local
  con `API_DOMAIN=localhost`: solo Caddy publica puertos, HTTP→HTTPS 308, cabeceras, Swagger 404, 413 con 300 KB,
  JVM con `MaxRAMPercentage=60` (heap ~616 MB con `mem_limit: 1g`), usuario `casino` (uid 999).
- [x] IP real: `forward-headers-strategy: native` + `internal-proxies` = IP fija de Caddy (172.28.0.10). Tests
  `ProdProfileTest` (desde fuera del proxy la cabecera se ignora) y `TrustedProxyTest` (desde el proxy cuenta la IP del
  cliente). En local con Caddy: la IP falsa no da cubos nuevos y otro cliente tiene el suyo.
- [x] Perfil `prod`: sin Swagger/api-docs, `/health` público (`{"status":"ok"}`, 503 sin base de datos), logs sin SQL,
  `RequestSizeFilter` (128 KB; 411 si el cuerpo no trae longitud), CSP `default-src 'none'` y `Referrer-Policy`.
- [x] `deploy/backup.sh` (custom comprimido, comprobado con `pg_restore --list`, 700/600, 14 días), `deploy/restore.sh`
  (copia previa, API parada, una transacción) y temporizador systemd. **Probado en local:** copia → borrar cuenta →
  restaurar → la cuenta, su partida y su puesto vuelven.
- [x] `deploy/deploy.sh` (pull, build, up, healthcheck, vuelta atrás automática y `rollback` a mano). Probado en local con
  un clon y un origin de prueba: despliegue bueno, versión rota (datasource inexistente) → vuelve sola a la anterior.
- [x] Cliente: mensaje «No se puede conectar con el servidor ahora mismo…» también con 502-504 (Caddy sin API), botón
  Reintentar en el ranking (la sincronización ya lo tenía); en Ajustes, con sesión, «Exportar mis datos» y «Borrar
  cuenta y datos» (dos confirmaciones con el diálogo del juego); enlace a `public/privacidad.html` (borrador).
- [x] DEPLOY.md «Backend en el VPS» (DNS, cortafuegos, deploy key de solo lectura, variables, despliegue, copias,
  comprobaciones con curl desde fuera y build del juego con `VITE_API_URL`), README.
- Decisiones propias:
  - Archivos de producción en `deploy/` y `docker-compose.prod.yml` en la raíz (junto al de desarrollo).
  - Caddy tiene IP fija en una red interna `internal: true` (sin salida a Internet para API y base de datos).
  - Healthcheck con bash y `/dev/tcp` (la imagen JRE no trae curl: no se instala nada).
  - Copias en el mismo VPS (`/var/backups/rottenodds`) con systemd timer a las 03:30; se avisa de que no protegen de
    perder el servidor.
  - `deploy.sh` exige una copia sin cambios locales y usa `git reset --hard` para volver atrás.
  - En prod no hay Swagger (más simple que protegerlo); en local sigue.
  - Privacidad: sin cookies ni analítica; IP solo en memoria para el límite. Faltan la ubicación del centro de datos y
    un contacto (marcados como pendientes).
  - `shared/plausibility.json` no cambia (no cambian números).

## Sesión 10 (preparación para el portfolio)

- [x] **Modo demo público** (`src/game/demo.ts`): menú «Modo demo · Ver todas las mesas sin jugar» y enlaces
  `?demo=mesa1…5`, `?demo=final`, también en producción y tras «Pulsa para entrar». Hueco propio
  (`casino-incremental-save-demo`), sin sincronización ni ranking, final visto propio. «MODO DEMO · Salir» centrado bajo
  la barra (a la izquierda tapaba la cabecera de los cajones). Reutiliza la semilla del modo desarrollador (`seedState`,
  ahora en `demo.ts`), que sigue solo en `npm run dev`. Tests `tests/demo.test.ts` (enlaces, hueco, sin sincronizar,
  sin ?dev= en producción) y comprobación del bundle en el script de capturas.
  - Decisiones: el demo recuerda su progreso en su hueco (un enlace ?demo=mesaN solo cambia de mesa); en la pausa del demo
    no se puede exportar, importar ni borrar (esas acciones son de la partida normal); en la mesa 5 la partida demo tiene
    suerte 12 y herencias a nivel 2 (se ven las cadenas y las herramientas sin regalar el final); ?demo=final usa una
    partida terminada con cifras de una partida típica (~59 min) para el libro de cuentas.
- [x] **Capturas** (`npm run capture:portfolio`, Chrome sin interfaz sobre el build, modo demo): 10 capturas en
  `docs/portfolio/` en PNG y WebP a 1920×1080 (×3 entero): portada con menú, mesa 1 (casino y trastienda), mesas 2-4,
  cajón de mejoras (mesa 4), mesa 5 con una cadena en marcha, epílogo y libro de cuentas. **Vídeo**: no hay ffmpeg en esta
  máquina; el script graba ~210 fotogramas (screencast de Chrome: ruleta girando, cambio de mesa, mesa 5 y final) en
  `capture-frames/` con su duración real e imprime los comandos de ffmpeg para WebM y MP4 (también en DEPLOY.md).
- [x] **Resumen técnico** `docs/portfolio/RESUMEN.md`: qué es, mesas, tecnologías, retos, transparencia (arte con IA,
  desarrollo con Claude Code, backend no desplegado), cifras verificadas (336 tests del cliente, 30 del servidor, líneas
  de código) y pie de foto y texto alternativo de cada captura.

## Sesión 9 (cajón «Mesa» de la mesa 5 e informe del backend)

- [x] **Bug: la pestaña «MESA» de la mesa 5 no abría con clic** (con M sí). Causa: en la sesión 8 se puso
  `.drawer { pointer-events: none }` para que el cajón solo recibiera el ratón en su pestaña y su cuerpo, pero
  `.table-layer > * { pointer-events: auto }` es igual de específica y va después, así que la anulaba. El `aside` de
  Herencias cerrado (pegado al borde, encima en el DOM, de toda la altura) se tragaba el clic de la pestaña Mesa;
  la regla antigua que lo evitaba (`.drawer.left.second[data-open='false']`) se quitó en la sesión 8. Arreglo:
  `.table-layer > .drawer { pointer-events: none }` y `> * { auto }`, después y más específicas.
  - Nuevo: un clic fuera de los cajones los cierra (antes no); si cae en la escena, solo cierra (no apuesta).
  - Prueba de extremo a extremo con clics reales (`npm run build && npm run test:e2e`, `scripts/e2e/drawers.ts`):
    Chrome sin interfaz contra `vite preview`, cinco mesas, dpr 1 y 1,5, ventana y pantalla completa; comprueba que
    nada tapa ninguna pestaña, que un clic abre y otro cierra, que abrir uno cierra el otro del mismo lado, que un
    clic fuera y Esc cierran, y que ningún texto queda cortado ni tapado. Con el build anterior falla (Mesa tapada
    por «drawer left second»); con el arreglo pasa entero. Test de vitest de la cascada CSS.

- [x] **Primeros pasos en la mesa 1** (probador: al empezar con 0 fichas no se veía que el dinero sale de la
  trastienda). Rótulo con flecha sobre la puerta de la trastienda, aviso en el tapete al intentar apostar sin
  fichas y líneas de partida nueva del Encargado que nombran la trastienda (pendientes de revisión). Todo se
  deriva del guardado (`stats.workEarned` y `stats.bets`, que solo crecen): **sin campo nuevo, sin migración ni
  cambios en el servidor, sin regenerar plausibility.json**. Economía intacta. Tests `tests/onboarding.test.ts`.
  - Decisiones: el rótulo va en tres líneas («TRASTIENDA / aquí se gana / el primer dinero») porque en una o
    dos la pestaña del cajón Mesa (HTML, por encima del canvas) tapaba el principio y el final rozaba la ruleta;
    el aviso corto («A la trastienda.») sigue saliendo si se queda sin fichas después de haber recogido algo (es
    un recordatorio, no el rótulo); con el CRT apagado el rótulo no parpadea.
  - Capturas con el build, dpr 1 y 1,5, ventana y pantalla completa, con los diálogos desactivados: el rótulo se
    ve, no toca la ruleta ni el Encargado, y el aviso sale bajo el tapete; 0 errores en consola
    (`docs/capturas/sesion9/mesa1-trastienda-rotulo-y-aviso.jpg`).

## Sesión 8 (bugs de interfaz, ruleta nueva, multiplicadores acumulativos en la mesa 5)

Remoto: `origin`. Push al final de cada bloque, nunca con force. Sin desplegar.

### Hecho

- [x] **B1 Dos bugs de interfaz.**
  - **Cajones.** Causa: cada cajón es un `aside` absoluto con su pestaña dentro; el segundo cajón del lado izquierdo
    (Herencias, mesa 5) seguía anclado a `left: 0` con su pestaña a la altura de 112, así que con «Mesa» abierto
    (cuerpo de 0 a 120) la pestaña de Herencias quedaba encima del contenido (Moneda cargada, Estadísticas).
    Además el hueco transparente del cajón abierto podía tragarse los clics de otra pestaña. Arreglo (CSS): las
    pestañas de un lado van apiladas (Mesa arriba, Herencias debajo); si hay un cajón abierto en ese lado, los
    cerrados se desplazan 123 unidades (cuerpo de 120 + marco de 3), con lo que todas las pestañas quedan pegadas
    al borde exterior del cajón abierto, o al borde de la pantalla si están todos cerrados. El cajón solo recibe el
    ratón en su pestaña y su cuerpo. El abierto va por encima (z 11 frente a 10). Solo un cajón abierto por lado
    (ya lo hacía `toggleDrawer5`); Esc cierra todos. Lado derecho (Ayuda) con la misma regla. Comprobado que
    ningún texto de ningún cajón se corta (medido en el navegador en las cinco mesas) y en capturas.
  - **Barra superior.** Causa: `fitHud` decidía el modo con el contenido de la mesa que se veía: «FICHAS NEGRAS
    1,00B» (79 unidades) desbordaba la mesa 4 en 20 unidades y la pasaba a compacto; en la mesa 5 ya no se ve
    «Pagar deuda» y cabía. La pantalla completa no da más ancho: el escenario mide siempre 640 unidades (escala
    entera), así que el modo dependía solo del texto de cada mesa. Arreglo: las partes que cambian de una mesa a
    otra tienen un ancho reservado en modo completo (saldo 88, pasivo 84, botones 164); el aviso del ayudante sale
    debajo de la barra (no ocupa sitio en la fila); `fitHuds` mide las cinco barras en modo completo y aplica a
    todas el mismo modo con `hudMode` (pura): completo si cabe la más ancha. Se mide al recolocar, al cargar la
    fuente y como mucho una vez por segundo. Resultado: completo en las cinco mesas.
  - Tests `tests/hud.test.ts` (modo idéntico en las cinco mesas para un mismo ancho, anchos reservados, regla de
    los cajones). Capturas de las cinco mesas y de los tres cajones de la mesa 5 con dpr 1 y 1,5, en ventana y en
    pantalla completa (build de producción, Chrome sin interfaz): las cinco barras en modo completo en las cuatro
    combinaciones, 0 errores en consola. Hojas en `docs/capturas/sesion8/`.

- [x] **B2 Arreglo de la ruleta.** No había `ruleta_aro.*`: se usa `ruleta_limpia.*` (el pipeline prefiere `ruleta_aro`
  si aparece).
  - **Qué se usa de la imagen**: solo el **aro de madera** (máscara anular desde su filo dorado interior hasta el borde)
    y el **cono central con su pomo** (disco hasta su filo dorado), sano y roto. Radios medidos en la imagen
    (rueda llevada a un círculo: el dibujo es un 4% más alto que ancho): aro exterior 648 px, interior del aro 463,
    cono 252 (0,714 R y 0,389 R). La rota usa las proporciones de la sana (misma plantilla; sus casillas
    desgastadas son tan claras como los filos y confunden la medida). Se descarta todo el anillo de casillas
    (con la bola roja, la dorada y los dos ceros verdes). En la escena: radio 86, interior del aro 61, cono 33
    (`assets/sprites/roulette/geometry.json`, lo escribe el pipeline). Bola (9 px) y marcador (13 px) salen de
    `bola_marcador.*` como sprites aparte.
  - **Pipeline**: `splitAtSeparator` (separa por la línea del medio, magenta o negra, y la deja fuera con margen),
    cian quitado desde los bordes (huecos interiores solo si son casi idénticos al cian; además se borran los
    píxeles con verde y azul muy por encima del rojo, restos del JPEG en las grietas de la rota), `radialProfile` +
    `measureWheel` (los dos filos dorados son los máximos de luminancia en el 30-48% y el 62-82% del radio) y
    `annulus`. Tests nuevos del pipeline (separador, medida, máscara, y que los sprites exportados no tienen nada
    entre el cono y el aro ni rojo puro).
  - **Qué se dibuja en código** (`src/ui/rouletteView.ts`): el anillo de **37 casillas** entre el cono y el aro
    (de 39 a 61), en el **orden europeo**, 18 negras y 18 blanco hueso alternadas y un único cero verde, todas
    iguales, con separadores y filos dorados; banda exterior con los números (VT323 14 px en la capa de texto, a lo
    largo del radio) y fondo de casilla más oscuro donde cae la bola; la rota añade mugre, desconchones, arañazos
    y verdín (generador con semilla). Aro, anillo y cono giran como una pieza; bola y marcador no giran (el
    marcador, fijo arriba con la punta en el borde del anillo). Centro de la rueda en y 113 (antes 118) para que el
    radio 86 quepa entre la barra y el tapete.
  - **Decisiones**: para que negro y blanco se alternen en el orden europeo, los colores pasan a ser los de la
    ruleta real (negros = negros, rojos = blanco hueso; `BLACK_NUMBERS`) en vez de la paridad, también en el
    tapete; siguen 18 y 18, las probabilidades no cambian. El jackpot (Cero Dorado, sin casilla propia en 37) cae
    en el cero con el destello dorado del anillo. Números a lo largo del radio: en horizontal («36» mide 14) no
    caben en una casilla de 9 de arco; a lo largo del radio caben con 14 px.
  - Tests: los 37 números (la bola se para en su casilla), orden europeo, un solo cero, alternancia, color igual
    al lógico. Capturas sana y rota en reposo, girando y al caer, con dpr 1 y 1,5, en ventana y en pantalla
    completa (build de producción), 0 errores: `docs/capturas/sesion8/ruleta-*.jpg`.

- [x] **B3 Mesa 5: multiplicadores acumulativos** (detalle y tablas en GAME_DESIGN 4f).
  - Cada acierto multiplica por **f_i = i + `CHAIN_FACTOR_OFFSET`** (2 en `config.ts`: ×3, ×4, ×5, ×6; apostando 2:
    6, 24, 120, 720). Lógica, interfaz y tests dependen solo de la constante. La cargada acierta 2/3 y paga ×1,5 el
    factor (mismo valor esperado de base).
  - **Probabilidad**: ventaja / f (1/f sería justo). Ventaja de 0,9 (la casa) a 2,0 con suerte máxima, menos la
    penalización por apostar fuerte, y **×0,75 por paso** (sin eso, con suerte todos los pasos compensaban y "seguir
    siempre" empataba con la óptima). La fatiga desaparece: el campo `fatigue` de las cadenas pasa a `decay` (pasos
    de caída). **Retener** congela la caída del siguiente paso (solo ese); **Relanzar** repite con la probabilidad de 3
    pasos más adelante; **Temple** suaviza la caída del denominador (γ de 1 a 0,8).
  - **Cadena de 4** aciertos con el jackpot en la completa (×360): con 10 el tope del 25% llegaba en 3-4 pasos y el
    resto no tenía sentido; con 7-8 la cadena completa sería imposible (∝ 1/f); con 5 el jackpot no pasaba del 1-2%.
  - Interfaz: `n/4`, «SIGUIENTE ×f → valor», «EN JUEGO», botones de moneda con su factor, «RETIRARSE <cantidad>»,
    flotante «CARA ×f»; tooltips con probabilidad real, factor y valor resultante (sin % de saldo). Hitos del Dueño a
    los 2 y 3 aciertos (líneas reescritas: «Dos…», «Tres. Una más…»; las del jackpot, «Cuatro caras»; pendientes de
    revisión). Captura del panel: `docs/capturas/sesion8/mesa5-panel-dpr1.5.png`.
  - Guardado **v12** (migración: `fatigue` → `decay`; las cadenas a medias de guardados anteriores se cobran con la
    regla antigua, ×2 por cara o su valor guardado). Servidor v12 con validación estructural de las cadenas (sin
    `fatigue`, `wins`/`decay` enteros no negativos, `value` finito). plausibility.json regenerada (--full).
  - **Calibración** (40 partidas, --quick): (d) óptima **12:09-13:25** (dos tandas con la configuración final),
    tramo final **1:21**, jackpot **5-6%**, mesas 1-5 **59-60 min**; siempre TODO 12:53-13:40 con quiebras del 15-45%;
    siempre justa 11:05, siempre cargada 12:00, seguir hasta el final 12:10 (dentro del ruido: p10-p90 de 5 a 19 min,
    error de la media ~0,7 min); seguir hasta 3 15:38; retirarse a la primera 20:45; sin herencias 22:13. Herencias
    solas frente a (c): Cero dorado −7%, Retener −35%, Relanzar −18%, Marcar −23%. Diablillo: sin quiebras con ningún
    perfil (el prudente juega desde la fase alta, cuando el primer paso pasa del 50%).
  - Simulador: la óptima elige la apuesta con Kelly (logaritmo) y la moneda y la parada con el valor esperado; todas
    las estrategias con herencias miran con Marcar antes de decidir (antes la óptima no miraba si iba a retirarse).

## Cierre de la sesión 8

- **Bug de los cajones**: el segundo cajón del lado izquierdo (Herencias) seguía anclado a `left: 0`, así que con
  «Mesa» abierto su pestaña quedaba encima del contenido; el hueco transparente de un cajón abierto además tapaba
  clics. Ahora las pestañas de un lado van apiladas y pegadas al borde exterior del cajón abierto (los cerrados se
  desplazan 123 unidades); el cajón solo recibe el ratón en su pestaña y su cuerpo.
- **Bug de la barra**: cada mesa decidía su modo con su propio texto («FICHAS NEGRAS 1,00B» desbordaba la mesa 4 en 20
  unidades; en la 5 ya no se veía «Pagar deuda»). La pantalla completa no da más ancho (el escenario mide siempre 640
  unidades). Ahora las partes variables tienen ancho reservado, el aviso del ayudante va debajo de la barra y un solo
  modo se aplica a las cinco barras: completo en todas.
- **Ruleta**: de la imagen se usan solo el aro de madera y el cono con su pomo (radios medidos: 648, 463 y 252 px);
  la rota, con las proporciones de la sana. En código: el anillo de 37 casillas en orden europeo (18 negras, 18
  blanco hueso alternadas, un cero verde), números de 14 px a lo largo del radio, desgaste de la rota; bola y
  marcador como sprites que no giran. Negro y blanco siguen los colores de la ruleta real (`BLACK_NUMBERS`) para
  alternarse; el jackpot cae en el cero con destello dorado.
- **Probabilidades y cadena**: ventaja/f con ventaja 0,9 → 2,0 y caída ×0,75 por paso; cadena de 4 con jackpot.
- **Números cambiados**: `CHAIN_FACTOR_OFFSET` 2; cadena 10 → 4; suerte 47-97% → ventaja 0,9-2,0 (tope 95%); fatiga →
  caída ×0,75 por paso y temple γ −0,04/nivel; cargada ×3 → ×1,5 el factor; Relanzar 8 caras de fatiga → 3 pasos;
  penalización por apostar fuerte 0,2/0,04 → 0,35/0,30; techo 3 × 2,5^n → 2 × 2,5^n (máx. 19.073); pozo 400.000/+35%
  → 1M/+50%; suerte de la mesa 5 560 → 600; guardado 11 → 12.
- **Decisiones por mi cuenta**: además de lo anterior, la ventaja también cae por paso (necesario para que seguir no
  sea siempre rentable); Retener solo congela el siguiente paso (congelándolo para el resto de la cadena, las
  herencias juntas eran obligatorias); la óptima del simulador decide la parada por valor esperado; hitos del Dueño a
  los 2 y 3 aciertos. **Objetivos no alcanzados del todo**: "seguir hasta el final" y "siempre TODO" no ganan pero
  empatan con la óptima dentro del ruido (las cadenas son tan cortas que la parada pesa poco; TODO a cambio quiebra a
  menudo). Propuesta mínima, sin aplicar: subir algo más la penalización por apostar fuerte (de 0,15 a 0,30 TODO
  pasó de ganar por un 4-13% a empatar) para que TODO pierda claramente, a costa de alargar un poco la mesa.
- **Tests y push**: cliente 320 en verde, servidor 30 en verde, `tsc` limpio y build correcto. Push de los tres
  bloques a `origin/main` sin force. Sin desplegar.

## Sesión 7 (pantalla de título y pantalla final: ROTTEN ODDS)

Remoto: `origin`. Push al final de cada bloque, nunca con force. Sin desplegar.

### Hecho

- [x] **B1 Pantalla de título y menú.**
  - Título: `GAME_TITLE = "ROTTEN ODDS"`, `GAME_TAGLINE = "La casa siempre cobra"` (y `GAME_VERSION`, `GAME_AUTHOR`,
    `REPO_URL = null`) en `src/game/config.ts`. `index.html` los toma en el build (plugin de `vite.config.ts` con
    `%GAME_TITLE%`/`%GAME_TAGLINE%`); README, DEPLOY.md, créditos, OpenAPI del servidor y la imagen para compartir
    (`npm run meta`, ahora la portada con el subtítulo). Test `tests/title.test.ts`: no queda «CASINO» como título
    (el letrero de la puerta de la trastienda pasa a «SALA»; el nombre del repo, del paquete y del Worker no cambian).
  - Assets: `assets/raw/titulo.*` y `final.*` → `assets/sprites/screens/` (640x360, vecino más próximo). El título
    traía un filo blanco abajo (3-4 px) y a la derecha (2 px): `trimBrightEdges` (test en pipeline) lo recorta con
    una línea más de margen. El logo no se dibuja en código; si faltara la imagen, sale un provisional.
  - «Pulsa para entrar» tras la carga (texto que respira); el primer clic o tecla desbloquea el audio, pide
    pantalla completa si el ajuste está activo y funde desde negro a la portada (una vez por carga).
  - Portada (`src/ui/titleScene.ts`): la imagen tal cual; halo verde de la lámpara que respira (~6 s), 40 motas de
    polvo de 1 px y oscilación de 1 px (sin oscilación ni temblor de la lámpara con el CRT apagado, como las mesas).
    Subtítulo en la capa de texto (14 px, dorado apagado, contorno). Zumbido propio de la portada (más grave).
  - Menú vertical en la zona oscura a la derecha del pasillo (x 398-560, y 166+): Continuar (con «Mesa N · tiempo ·
    deuda X%» / «deuda saldada» / «casa saldada»), Nueva partida, Ajustes, Ranking e Iniciar sesión (solo con
    `VITE_API_URL`; Sincronizar solo con sesión), Ver final (solo con el juego completado), Créditos. Versión abajo a
    la izquierda y «Pantalla completa» en la esquina. Flechas, Intro, Esc y ratón; un único resaltado y tic suave.
  - Diálogos propios (`src/ui/dialog.ts`) en vez de `confirm()`: nueva partida con guardado, borrar e importar.
  - Ajustes con la misma estética: volumen (−/+, flechas, clic sube y da la vuelta), Filtro CRT, pantalla completa al
    iniciar, diálogos, **silencio** (ahora se guarda en los ajustes, también con N), exportar, importar, borrar.
  - Créditos (`src/content/credits.es.ts`): arte con IA, VT323 con su licencia, autor; repositorio solo si `REPO_URL`.
  - Pausa: Esc sin cajones abiertos (o el botón Menú del HUD) → Reanudar, Ajustes (vuelve a la pausa), Menú
    principal (guarda antes). En pausa no avanza nada (ni ayudantes, ni diálogos, ni fundidos).
  - Decisiones: el botón «Menú» del HUD abre la pausa en vez de salir de golpe; «Sincronizar partida» se conserva
    (con sesión) aunque no estaba en la lista; con el CRT apagado no hay oscilación; el clic en Volumen sube 10% y
    da la vuelta; borrar la partida desde la pausa deja la partida en curso cerrada (vuelve al menú al salir).

- [x] **B2 Pantalla final.** Se activa al pagar al Dueño; máquina de estados pura `src/game/ending.ts` (tests en
  `tests/ending.test.ts`): última línea del Dueño (espera a que se cierre su bocadillo, máx. 9 s) → 2 s → fundido a
  negro (1,5 s) → epílogo → libro de cuentas → créditos → botones.
  - Epílogo: `assets/sprites/screens/final.png` a pantalla completa (la luz de las puertas respira) y 4 líneas
    (`src/content/ending.es.ts`, **pendientes de revisión**) a máquina de escribir (28 letras/s), una por clic o
    sola a los 5 s, en una caja oscura semitransparente en la franja inferior (se parte en dos renglones; la sombra
    se ve a través). Zumbido al 30% en el epílogo y el libro; vuelve entero en los créditos.
  - Libro de cuentas (dos páginas de papel con margen rojo): tiempo total y por mesa, apuestas y % ganadas,
    jackpots, veces a cero, ganado por mesa en su moneda y total, ayudantes comprados (de 5) y mejor racha de la
    mesa 5. Contadores nuevos: `stats.won` en cada mesa (suma de los resultados positivos de las apuestas, jugador
    y ayudante) y `stats.paidAt` (tiempo de juego al pagar cada deuda; las pagadas antes de v11 salen «—»).
  - Créditos que suben (24 u/s; un clic los salta). Botones: Volver al menú, Seguir jugando (vuelve a la partida
    con todas las mesas, sin nada nuevo), Copiar resumen (portapapeles, sin servidor; con alternativa si el
    navegador no deja).
  - Esc o mantener una tecla 1,2 s salta a los botones. `endingSeen` (finalVisto) se guarda al empezar el final:
    no se repite al recargar ni al volver a la mesa; «Ver final» en el menú lo repite desde el epílogo.
  - Guardado **v11** (migración: una partida ya terminada cuenta como final visto; mesas pagadas con tiempo
    desconocido). Servidor v11: `endingSeen` booleano y solo con la deuda del Dueño pagada; `stats.paidAt` lista
    de 5 tiempos (−1, 0 o hasta el tiempo total) y solo en mesas pagadas. plausibility.json regenerada (--full).
  - Decisiones: los botones finales van en una barra baja (sin título) para no tapar la figura; durante la
    última línea y el fundido la mesa queda bloqueada (no se puede apostar ni pausar); el libro espera un clic
    (no avanza solo); «fichas totales ganadas» se muestra por mesa en su moneda y un total de todas juntas.

- [x] **B3 Pruebas y cierre.**
  - Tests nuevos: navegación del menú (con y sin guardado, con y sin servidor, sesión, Ver final), máquina de
    estados del final, resumen y texto para copiar, migración v10→v11 y finalVisto, recorte del filo blanco,
    título sin «CASINO». Cliente 311 tests en verde; servidor 29 en verde.
  - Capturas automáticas con Chrome sin interfaz por CDP contra `vite preview` (build de producción): pulsa para
    entrar, título, ajustes, créditos, pausa, última línea, fundido, epílogo, libro, créditos y botones, con dpr 1,
    1,5 y 2, en ventana (1280x720) y en pantalla completa real (ventana de Chrome a pantalla completa +
    `requestFullscreen`, 1920x1080), y el CRT en los tres niveles: 198 capturas, **0 errores en consola**, escala
    entera en todas (escenario de 1280x720 a 3840x2160 píxeles físicos). Subtítulo y menú legibles sobre la
    imagen también con el CRT fuerte (el menú y el texto van por encima del CRT). Hojas de contacto en
    `docs/capturas/sesion7/`. Ajuste tras revisarlas: menú 14 unidades más ancho (la línea de Continuar rozaba).
  - Build: en `vite preview` se cargó un guardado con la mesa 5 a punto de pagar y se recorrió el final entero
    (lo hace el mismo script). `?dev=` no existe en el build: no se crea ninguna clave `-dev` y el bundle no
    contiene `devState` ni el hueco de desarrollo.

## Sesión 6 (bloques 1-4: texto legible, barra superior, aciertos de los ayudantes, rediseño de la mesa 5)

Remoto: `origin`. Push al final de cada bloque, nunca con force. Simulaciones de una en una, con --quick.

### Hecho

- [x] **B1 Texto legible en todas las mesas.**
  - Causa: el texto del canvas salía de máscaras umbralizadas a 1 píxel por unidad (sesión 5) y los números del
    tapete de una fuente bitmap de 3x5: a 9-12 px VT323 quedaba en glifos de 3x5 (el 2 parecía un 7) y el CRT
    pasaba por encima. Los botones desactivados eran dorado al 35% sobre oscuro (casi negro).
  - Ahora todo el texto de escena va por `src/ui/sceneText.ts`: VT323 con `fillText` a resolución física en una
    **capa de texto propia** (segundo canvas) encima del CRT y debajo del HUD. Elegido frente a HTML superpuesto:
    misma nitidez (mismo motor de fuentes y tamaño físico) y sigue a la escena en el mismo fotograma (temblor,
    flotantes, cartas). Orden de capas: escena → CRT → texto → HUD/menús (el CRT ya no tapa ningún texto).
  - Tamaños: mínimo 14 px (altura de mayúscula 8 unidades; VT323 ≈ 0,6 × tamaño, medido); números del tapete,
    de las fichas y flotantes 16 px; palos de las cartas 22 px. Contorno oscuro de 1 unidad en el texto sobre la
    escena. Contraste ≥ 4,5:1 en todos los estilos (también botones desactivados: caja apagada, borde punteado).
  - Inventario (estilo → dónde): `label` contadores (POZO, BANCA, APUESTA/EN JUEGO, PREMIOS…), `muted` etiquetas
    secundarias (RACHA, RELANZ., DESCARTES, MANOS, OTRA VEZ, pagos de los objetivos), `value` valores encendidos
    (TÚ 21, racha, 7·7·7 posible, RET, ELIGE UN DADO, D), `danger` (TE HAS PASADO), `button/buttonHover/
    buttonDisabled` (TIRAR, ACEPTAR, REPARTIR, PEDIR, PLANTARSE, APOSTAR, SEGUIR, RETIRARSE, OTRA VEZ),
    `numberOnDark/numberOnBone/zoneOnFelt` (tapete: números, NEGRO/BLANCO, docenas), `chip/chipSelected/
    chipDisabled/chipTag` (fichas y TODO), `float/floatBad` (+N, −N, JACKPOT), `cardInk/cardRed/cardPip/
    cardPipRed` (cartas), `locked` (BLOQ.).
  - Colisiones: TODO a la izquierda de su ficha (en su línea); zombi desplazado para no taparlo; tapete de la
    ruleta más alto (celdas 16x14); bandeja de los dados 184x72 y objetivos de 54x32 (dos líneas); tabla de premios
    de la tragaperras 116x112; paño de la mesa 5 262x78; contadores separados de los bordes.
  - Verificado en el navegador en las cinco mesas (1280x720, dpr 1; en ventana): texto nítido y legible, igual que
    el HUD. dpr 1,5/2 y pantalla completa no se pueden emular en el panel: la escala entera ya tiene test (11
    tamaños × 7 dpr) y el texto se rasteriza a la resolución física, así que escala igual. Test nuevo
    `tests/sceneText.test.ts` (tamaño mínimo y contraste de cada estilo; ninguna escena dibuja texto por su cuenta).

- [x] **B2 Barra superior que cambia de tamaño.**
  - Causa: el contenido de la barra ya no cabe en 640 unidades en todas las mesas (cinco pestañas, «FICHAS
    NEGRAS», pasivo, deuda, aviso del ayudante, botones). El HUD es flex sin `nowrap` en sus hijos: cuando el
    contenido supera el ancho, los elementos encogen y su texto se parte en dos líneas («MONEDAS» sobre la cifra,
    «Pantalla completa» en dos). Al volver de otra pestaña cambian las cifras (saldo, pasivo, «SALDADA», aviso) y,
    además, se recolocaba el escenario con medidas transitorias de la página oculta (tamaño 0 / dpr temporal), así
    que la barra salía distinta. Reproducido en el navegador (mesas 2 y 4 en dos líneas a 1280x720).
  - Arreglo: `stageLayout` pura y con límites (devuelve null con tamaño 0, dpr 0 o NaN y se conserva la composición
    anterior); recolocar con debounce en resize, al volver a ser visible (`visibilitychange`, `pageshow`), en
    `fullscreenchange` y al cambiar el dpr (`matchMedia`); un cálculo descartado se reintenta hasta tener medidas
    válidas. No se bloquea por `document.hidden` (el panel del navegador la da por oculta mientras se ve: con ese
    bloqueo el escenario se quedaba sin escalar al cargar; encontrado y corregido). HUD: `nowrap` en todos sus
    elementos, alto de 20 unidades, y modo **compacto** controlado (`fitHud`): si no cabe, abrevia (MESA n → n,
    «Pantalla completa» → «Pantalla», «FICHAS NEGRAS» → «NEGRAS», pasivo sin «de la mesa N», sin barra de deuda);
    vuelve al normal solo con margen (sin oscilar).
  - Tests: escala (null con medidas imposibles, k ≥ 1, determinista). Comprobado con capturas en la mesa 4 antes y
    después de cambiar de pestaña: barra en una línea y misma altura. Zoom del navegador, otro monitor y pantalla
    completa no se pueden provocar en el panel; pasan por el mismo recolocado con debounce.

- [x] **B3 Ayudantes que pierden demasiadas apuestas.** Auditoría con el **motor real** (`npm run audit:engine`:
  updateGame, cinco mesas, tres perfiles, cuatro suertes, 30 min de juego, saldo inicial de 20 techos; 16 s).
  - Causa (mesa 3): el criterio de Kelly sobre el crecimiento elegía el objetivo de más valor esperado: «Más de 9»
    (5:1) con suerte media o alta y el doble seis (35:1) con suerte máxima, también con el perfil prudente. El neto
    era positivo (no era un fallo de dinero), pero acertaba un 10-44% de las tiradas. Lo mismo el diablillo
    agresivo (3-6% de cadenas ganadas) y el normal con suerte media (15%).
  - Arreglo (en la decisión, sin tocar pagos): restricción de probabilidad por perfil además de Kelly
    (`helperPolicy.ts`): **prudente** solo la apuesta u objetivo de más probabilidad y con ≥ 50%; **normal** ≥ 40%;
    **agresivo** libre. Diablillo: paradas prudente 1, normal 1-4, agresivo 2-10. Zombi prudente con 10% de riesgo
    en 2 min (con 3% no jugaba con suerte media: la pareja paga solo +0,5).
  - Interfaz: el aviso del ayudante (flotante junto a él y aviso del HUD) muestra el **neto agregado de 2,5 s**
    (con cuántas apuestas suma) en vez de una línea roja por apuesta perdida; los jackpots siguen al momento. El
    +N/min junto al ayudante no cambia.
  - Duraciones sin cambios (40 partidas, --quick): mesa 2 11:29, mesa 3 14:24, mesa 4 12:32, mesa 5 11:34. Ningún
    número tocado: no hace falta regenerar plausibility.json.
  - Test: con el motor real, prudente ≥ 50% y normal ≥ 40% de aciertos desde suerte media en las cinco mesas.

Tabla (suerte media, alta y máxima; con suerte baja casi todos esperan, salvo el agresivo):

| Ayudante | Suerte | Perfil | Ganadas antes → después | Neto/min (media · p10 · p90) después | Minutos + después | Caída máx. después | Elige antes → después |
|---|---|---|---|---|---|---|---|
| Crupier (mesa 1) | media | prudente | 63% → 63% | 0.79 · 0.20 · 2.90 | 93% | 1% | color 100% → color 100% |
| Crupier (mesa 1) | media | normal | 66% → 66% | 5.87 · 0.80 · 13.0 | 100% | 4% | color 100% → color 100% |
| Crupier (mesa 1) | media | agresivo | 60% → 60% | 5.92 · 1.00 · 9.00 | 93% | 11% | color 100% → color 100% |
| Crupier (mesa 1) | alta | prudente | 82% → 82% | 1.88 · 1.05 · 4.05 | 100% | 1% | color 100% → color 100% |
| Crupier (mesa 1) | alta | normal | 81% → 81% | 9.12 · 4.00 · 17.4 | 100% | 1% | color 100% → color 100% |
| Crupier (mesa 1) | alta | agresivo | 77% → 77% | 20.4 · 9.50 · 39.5 | 100% | 6% | color 100% → color 100% |
| Crupier (mesa 1) | máx | prudente | 97% → 97% | 2.72 · 1.95 · 4.05 | 100% | 0% | color 100% → color 100% |
| Crupier (mesa 1) | máx | normal | 96% → 96% | 8.32 · 7.20 · 10.3 | 100% | 1% | color 100% → color 100% |
| Crupier (mesa 1) | máx | agresivo | 96% → 96% | 19.6 · 18.0 · 21.1 | 100% | 1% | color 100% → color 100% |
| Zombi (mesa 2) | media | prudente | 0% → 78% | 0.79 · 0.18 · 1.81 | 93% | 2% | - → retener 100% |
| Zombi (mesa 2) | media | normal | 79% → 79% | 3.26 · 0.30 · 6.78 | 97% | 6% | retener 100% → retener 100% |
| Zombi (mesa 2) | media | agresivo | 76% → 76% | 6.34 · 0.50 · 16.3 | 90% | 22% | retener 100% → retener 100% |
| Zombi (mesa 2) | alta | prudente | 78% → 89% | 1.11 · 0.41 · 1.85 | 100% | 1% | tirar 100% → retener 100% |
| Zombi (mesa 2) | alta | normal | 78% → 78% | 5.98 · 2.80 · 9.97 | 100% | 3% | tirar 100% → tirar 100% |
| Zombi (mesa 2) | alta | agresivo | 78% → 78% | 15.1 · 5.75 · 27.8 | 97% | 4% | tirar 100% → tirar 100% |
| Zombi (mesa 2) | máx | prudente | 97% → 99% | 1.49 · 0.51 · 2.65 | 100% | 0% | tirar 100% → retener 100% |
| Zombi (mesa 2) | máx | normal | 97% → 97% | 9.17 · 5.66 · 14.0 | 100% | 1% | tirar 100% → tirar 100% |
| Zombi (mesa 2) | máx | agresivo | 95% → 95% | 22.3 · 17.3 · 29.8 | 100% | 1% | tirar 100% → tirar 100% |
| Camarero (mesa 3) | media | prudente | 29% → 72% | 1.19 · 0.50 · 1.63 | 93% | 2% | over9 100% → par 100% |
| Camarero (mesa 3) | media | normal | 29% → 63% | 5.40 · 2.62 · 10.6 | 100% | 3% | over9 100% → over7 100% |
| Camarero (mesa 3) | media | agresivo | 27% → 27% | 26.6 · 0.00 · 57.3 | 87% | 16% | over9 94%, over7 6% → over9 94%, over7 6% |
| Camarero (mesa 3) | alta | prudente | 44% → 91% | 2.00 · 1.50 · 2.73 | 100% | 0% | over9 100% → par 100% |
| Camarero (mesa 3) | alta | normal | 39% → 85% | 9.88 · 7.91 · 13.5 | 100% | 1% | over9 83%, boxcars 17% → over7 100% |
| Camarero (mesa 3) | alta | agresivo | 38% → 38% | 60.2 · 30.0 · 94.4 | 100% | 14% | over9 100% → over9 100% |
| Camarero (mesa 3) | máx | prudente | 10% → 98% | 2.30 · 1.90 · 3.45 | 100% | 0% | boxcars 100% → par 100% |
| Camarero (mesa 3) | máx | normal | 13% → 56% | 21.0 · 15.8 · 26.4 | 100% | 3% | boxcars 97%, over9 3% → over9 100% |
| Camarero (mesa 3) | máx | agresivo | 13% → 13% | 102.9 · 31.0 · 211.0 | 93% | 9% | boxcars 91%, over9 9% → boxcars 91%, over9 9% |
| Esqueleto (mesa 4) | media | prudente | 73% → 73% | 1.02 · 0.55 · 1.91 | 100% | 2% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | media | normal | 73% → 73% | 3.98 · 1.80 · 6.73 | 97% | 3% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | media | agresivo | 68% → 68% | 9.29 · 4.20 · 16.3 | 100% | 5% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | alta | prudente | 89% → 89% | 1.72 · 1.25 · 2.49 | 100% | 0% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | alta | normal | 89% → 89% | 6.81 · 4.80 · 8.82 | 100% | 2% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | alta | agresivo | 85% → 85% | 18.2 · 13.8 · 25.3 | 100% | 3% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | máx | prudente | 99% → 99% | 2.13 · 1.90 · 2.52 | 100% | 0% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | máx | normal | 98% → 98% | 8.59 · 7.60 · 10.1 | 100% | 1% | mano 100% → mano 100% |
| Esqueleto (mesa 4) | máx | agresivo | 98% → 98% | 25.6 · 22.8 · 30.5 | 100% | 2% | mano 100% → mano 100% |
| Diablillo (mesa 5) | media | prudente | 48% → 63% | 0.54 · 0.10 · 0.96 | 93% | 1% | perdida 52%, 2 caras 48% → 1 caras 63%, perdida 37% |
| Diablillo (mesa 5) | media | normal | 15% → 48% | 2.72 · 1.67 · 3.89 | 100% | 2% | perdida 85%, 4 caras 15% → perdida 52%, 2 caras 48% |
| Diablillo (mesa 5) | media | agresivo | 3% → 22% | 12.6 · 1.50 · 25.5 | 90% | 11% | perdida 97%, 6 caras 2%, 5 caras 1% → perdida 78%, 3 caras 21%, 4 caras 0% |
| Diablillo (mesa 5) | alta | prudente | 79% → 80% | 1.23 · 1.00 · 1.59 | 100% | 1% | 2 caras 79%, perdida 21% → 1 caras 80%, perdida 20% |
| Diablillo (mesa 5) | alta | normal | 60% → 60% | 32.6 · 25.0 · 41.2 | 100% | 3% | 4 caras 60%, perdida 40% → 4 caras 60%, perdida 40% |
| Diablillo (mesa 5) | alta | agresivo | 6% → 6% | 194.5 · -11.0 · 504.4 | 60% | 15% | perdida 94%, 9 caras 3%, 8 caras 2%, 7 caras 1%, 6 caras 0% → perdida 94%, 9 caras 3%, 8 caras 2%, 7 caras 1%, 6 caras 0% |
| Diablillo (mesa 5) | máx | prudente | 96% → 97% | 1.97 · 1.85 · 2.10 | 100% | 0% | 2 caras 96%, perdida 4% → 1 caras 97%, perdida 3% |
| Diablillo (mesa 5) | máx | normal | 96% → 96% | 45.6 · 44.6 · 48.0 | 100% | 1% | 4 caras 96%, perdida 4% → 4 caras 96%, perdida 4% |
| Diablillo (mesa 5) | máx | agresivo | 72% → 72% | 617.6 · 431.9 · 781.9 | 100% | 3% | 8 caras 72%, perdida 28%, 7 caras 0% → 8 caras 72%, perdida 28%, 7 caras 0% |

- [x] **B4 Rediseño de la mesa 5** (detalle y tablas en GAME_DESIGN 4f).
  - **Herencias** en vez de la segunda oportunidad: Cero dorado (ruleta, Z), Retener (tragaperras, H), Relanzar
    (dados, S), Marcar (cartas, C). Nivel 0-3 = cargas por cadena, se rellenan al empezar cada cadena. Cajón
    **Herencias** (E) que cobra en la moneda de la mesa de origen; botones en el paño; el diablillo las usa.
  - **Dos monedas** antes de cada lanzamiento (Q): justa ×2, cargada ×3 (mejora de 5.000) con probabilidad
    `base · 2/3 · (1 + 0,06 · suerte)`; misma fatiga para las dos.
  - **Monedas del escritorio**: montón del jugador y de la casa, el Dueño empuja al ganar y barre al perder;
    líneas del Dueño en los hitos 3/6/9 (disparadores `chain3/6/9`, 5 líneas cada uno, vacíos en las mesas 1-4).
  - Guardado v10 (migración desde v9), `shared/config.json`, servidor v10 con validación de herencias y moneda,
    `?dev=mesa5` con moneda de las otras mesas para probar el cajón. plausibility.json regenerada (--full).
  - Calibración (40 partidas, --quick): (d) **11:37**, tramo final 0:25, jackpot 4% (bj 9%); mesas 1-5 **58:44**.
    Herencias solas frente a (c) sin ellas (17:43): −5,6% / −11,3% / −17,2% / −11,3%.
  - Probado en el navegador: compra de las cuatro herencias, cargada desbloqueada, cadena con Marcar (sale
    «MARCADA: CRUZ», retirada a tiempo) y cargas rellenas en la siguiente cadena. Rótulo «sin herencia» bajo las
    herramientas se solapaba: ahora «—».

## Cierre de la sesión 6

- **Texto ilegible**: el texto del canvas se rasterizaba a 1 píxel por unidad (máscaras umbralizadas y una fuente
  bitmap de 3x5) y el CRT pasaba por encima. Ahora va a resolución física en su propia capa sobre el CRT, con
  tamaño mínimo de 14 px y contraste ≥ 4,5:1.
- **Barra que cambiaba de tamaño**: el contenido no cabía en 640 unidades y los elementos flex encogían y partían
  su texto en dos líneas; además, al volver de otra pestaña se recolocaba el escenario con medidas transitorias
  (tamaño 0 / dpr temporal). Ahora `nowrap`, modo compacto y una escala pura que ignora medidas imposibles.
- **Auditoría de ayudantes**: tabla antes/después en B3 (arriba). Lo que cambió: camarero prudente 10-44% → 72-98%
  de aciertos, normal 13-39% → 56-85%; diablillo normal con suerte media 15% → 48%, agresivo 3% → 22%; zombi
  prudente con suerte media ahora juega (0% → 78%). Crupier y esqueleto ya estaban bien.
- **Números cambiados y por qué**:
  - Mesa 5 suerte 400 → 560 de base: para que con herencias medias la mesa siga en ~12 min.
  - Pozo: semilla 50 → 400.000 y aportación 6% → 35%: el jackpot aportaba < 1% (una cadena completa temprana se
    llevaba un pozo diminuto); ahora 4-9%.
  - Segundas oportunidades fuera (y su recarga); herencias con costes en cientos de millones de la moneda de origen
    (las otras mesas acumulan eso con sus ayudantes al llegar aquí); Cero dorado devuelve 25%; Relanzar con 8 caras
    más de fatiga y solo con alguna cara (con 2-4 y sin esa condición era casi obligatoria).
  - Cargada: ratio 2/3, pago ×3, +6% con la suerte, fatiga igual que la justa.
  - Ayudantes (B3): paradas del diablillo normal 3-4 → 1-4, agresivo 5-10 → 2-10; el prudente se queda en la más segura (1).
- **Decisiones por mi cuenta**: capa de canvas propia para el texto (no HTML); abreviaturas del HUD compacto;
  probabilidad mínima por perfil (50/40/libre) en vez de tocar pagos; aviso del ayudante con neto de 2,5 s;
  Relanzar y Cero dorado solo protegen lo acumulado (no la apuesta inicial); Marcar enseña la cara con la moneda
  elegida en ese momento; tramo final de 25 s no alcanza los 45-90 s: propuesta mínima anotada en GAME_DESIGN 4f.4
  (tope por cadena al 10%), sin aplicar; `?dev=mesa5` con 1.000M en cada mesa para probar las herencias.
- **Tests y push**: cliente 287 en verde (`npx vitest run`, `npx tsc` limpio); servidor 28 en verde
  (`./mvnw -q test`). Push de los cuatro bloques a `origin/main` sin force. Sin desplegar.

---

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

### Cierre de la sesión 5

- **Push**: los seis bloques están en `origin/main` (push normal al final de cada bloque, nunca con force). Nada
  desplegado.
- **Qué hacía perder a los ayudantes** (sobre todo al camarero de la mesa 3): apostaban una fracción fija del techo
  aunque no tuvieran ventaja; el camarero, además, perseguía el doble seis con suerte alta y su agresivo apostaba el
  techo entero con suerte baja. Ahora: Kelly sobre la probabilidad real, riesgo por perfil y espera si no compensa.
- **Qué capa emborronaba el texto**: el canvas de 640x360 estirado (texto con antialias a 1 px por unidad) y el HTML
  escalado con `transform`, más el grano CRT. Ahora: zoom entero, canvas a resolución física y texto sin antialias.
- **Números cambiados**: mesa 2 techo máx. nivel 11 → 10 (tramo final 18 s → 47 s, sin basura); mesa 3 conversión
  k 0,3 → 0,38 (el zombi con Kelly rinde menos al empezar la mesa 3); mesa 5 nueva (techo base 3, suerte 400 × 1,25^n,
  fatiga 5 puntos por cara). Mesas 1 y 4 sin cambios. Duraciones (estrategia óptima): 8:18 / 11:31 / ~14:20 / 12:26 /
  11:42 → mesas 1-5 ≈ 58 min.
- **Decisiones propias**: ver cada bloque (diálogos de trastienda vacíos en 2-5; agresivo sin umbral de riesgo; temple
  como mejora de la mesa 5; Espacio/R/S en la mesa 5; tramo final de la mesa 5 en 40 s; silencio no persistente;
  créditos con el nombre del autor del repositorio).
- **Llegar a la mesa 5**: `npm run dev` y abrir `http://localhost:5173/?dev=mesa5` (hueco de guardado aparte, mesas
  1-4 saldadas, 4.000 de oro). Pestaña MESA 5.
- **Assets que faltan** (pendientes de antes; mismo estilo: pixel art de terror, contorno negro, paleta verde
  enfermizo, óxido y rojo seco, fondo magenta plano):

| Asset | Archivo | Tamaño | Prompt de Nano Banana |
|---|---|---|---|
| Jugador en reposo (idle) | hoja magenta de 2 frames → `assets/sprites/player/idle-1.png`, `idle-2.png` | 64x64 | "Pixel art, el mismo jugador harapiento de casino de terror de pie y quieto, respirando, 2 frames de animación idle, vista lateral, fondo magenta plano, contorno negro" |
| Ruleta limpia sin bola ni marcador | `assets/raw/ruleta-limpia.*` | 150x150 (o mayor, cuadrada) | "Pixel art, ruleta de casino vista desde arriba, vieja y oxidada, números legibles en anillo, sin bola y sin ningún marcador, centrada sobre fondo magenta plano, contorno negro" |
| Bola y marcador | hoja magenta: bola de marfil manchada y flecha verde del marcador | 16x16 cada uno | "Pixel art, dos objetos pequeños sobre fondo magenta plano: una bola de ruleta de marfil manchada de sangre y una flecha marcadora verde enfermizo, contorno negro" |

- **Desplegar**: seguir DEPLOY.md (`npm ci`, `npm test`, `npm run build`, `npx wrangler login`, `npx wrangler deploy`
  y el paso del dominio personalizado).
- **Tests**: cliente 276 en verde (`npm test`), servidor en verde (`./mvnw test`), `tsc` sin errores.

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
