# Despliegue de ROTTEN ODDS (Cloudflare Workers con assets estáticos)

El juego es una web estática: `npm run build` deja todo en `dist/` y funciona entero sin servidor (sin
`VITE_API_URL` se ocultan *Iniciar sesión*, *Sincronizar* y *Ranking*). Cloudflare la sirve como un
Worker **solo de assets** (sin código de servidor), configurado en `wrangler.jsonc`. El nombre del juego
(«ROTTEN ODDS · La casa siempre cobra») sale de `GAME_TITLE` y `GAME_TAGLINE` en `src/game/config.ts`: el
build lo escribe en el `<title>` y los metadatos de `index.html`. El Worker y el repositorio conservan su
nombre técnico (`casino-incremental`).

**Dominio**: `SITE_URL` en `src/game/config.ts` (por defecto `https://rottenodds.josemariamerchan.dev`, sin barra
final). El build lo escribe en `og:url`, `og:image` y `twitter:image` de `index.html` (tienen que ser URLs
absolutas para que la vista previa al compartir el enlace funcione). Para otro dominio, cambia la constante o
defínelo solo para un build: en PowerShell `$env:SITE_URL="https://otro-dominio.com"; npm run build`.

**Nada de esto se ha ejecutado.** Son los pasos exactos para cuando se quiera publicar.

## Qué hay preparado

- `wrangler.jsonc`: nombre `casino-incremental`, `assets.directory = ./dist`,
  `not_found_handling = single-page-application`.
- `public/_headers` (Vite lo copia a `dist/`):
  - `/assets/*`: `Cache-Control: public, max-age=31536000, immutable` (los nombres llevan hash).
  - `/` e `/index.html`: `Cache-Control: no-cache` (cada despliegue se ve al recargar).
  - Cabeceras de seguridad en todo: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
    `Permissions-Policy`, `Cross-Origin-Opener-Policy` y una CSP: solo recursos propios
    (`script-src 'self'`; `style-src 'self' 'unsafe-inline'` por los estilos que pone el código;
    imágenes `data:`/`blob:` para el grano del CRT; `connect-src 'self' https:` para el servidor opcional;
    `frame-ancestors 'none'`).
  - `Permissions-Policy` solo desactiva cámara, micrófono, geolocalización, pago y USB. **No** menciona
    `fullscreen` ni `autoplay`, así que quedan en su valor por defecto (`self`): la pantalla completa y el sonido
    funcionan en el propio sitio. Comprobado sirviendo `dist/` con estas cabeceras (`vite preview` no aplica
    `_headers`): `requestFullscreen` funciona, el `AudioContext` arranca tras un gesto y no hay errores de CSP.
  - **Decisión consciente: el juego no se puede incrustar en un iframe.** `X-Frame-Options: DENY` y
    `frame-ancestors 'none'` impiden mostrarlo dentro de otra página (un portfolio, itch.io en modo HTML
    incrustado...): protege contra el clickjacking. Si algún día se quiere incrustar, habría que cambiar las dos
    a una lista de orígenes permitidos (`frame-ancestors https://tu-portfolio.dev https://*.itch.zone` y quitar
    `X-Frame-Options`) y permitir la pantalla completa al marco (`allow="fullscreen; autoplay"` en el iframe).
- `public/favicon.png`, `public/og.png` (`npm run meta` los regenera) y `public/licencias/VT323-OFL.txt`.

## Pasos

Desde la carpeta del proyecto (`C:\videojuego`), con Node 20 o superior:

1. Dependencias y comprobaciones:

   ```bash
   npm ci
   ```

   ```bash
   npm test
   ```

2. Build de producción (sin servidor). Antes, comprueba en PowerShell que `VITE_API_URL` está vacía
   en esta terminal (si sale algo, la sesión la tenía definida: quítala con `Remove-Item Env:VITE_API_URL`):

   ```powershell
   if ($env:VITE_API_URL) { "VITE_API_URL está definida: $env:VITE_API_URL" } else { "VITE_API_URL vacía" }
   ```

   Y construye desde cero (Vite solo lee `.env.development.local` en `npm run dev`, nunca en el build):

   ```powershell
   Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npm run build
   ```

   (Si se quiere el modo en línea, se define la URL del servidor desplegado antes del build, p. ej.
   `$env:VITE_API_URL="https://api.rottenodds.josemariamerchan.dev"`, y su `CORS_ORIGINS` tiene que incluir el
   dominio del juego.)

   **Comprobación antes de desplegar (build sin servidor).** El build no debe llevar ninguna URL de
   desarrollo. Esta búsqueda no debe devolver ningún archivo:

   ```powershell
   Get-ChildItem dist -Recurse -File -Include *.js,*.html,*.css,*.json | Select-String -Pattern "localhost","8080" -List | Select-Object Path
   ```

   Y con `npm run preview`, el menú principal no debe mostrar **Ranking** ni **Iniciar sesión** (sin
   `VITE_API_URL` se ocultan cuentas, sincronización y ranking). Si se ha construido a propósito con
   `VITE_API_URL` de un servidor público, esas opciones sí deben salir y la URL será la de ese servidor
   (nunca `localhost`).

3. Probar el build en local (http://localhost:4173):

   ```bash
   npx vite preview
   ```

4. Iniciar sesión en Cloudflare (abre el navegador; una sola vez por máquina) y desplegar:

   ```bash
   npx wrangler login
   ```

   ```bash
   npx wrangler deploy
   ```

   Queda publicado en `https://casino-incremental.<tu-subdominio-de-cloudflare>.workers.dev`.

5. Dominio personalizado (el dominio tiene que estar ya en tu cuenta de Cloudflare): en
   `wrangler.jsonc` descomenta la línea de `routes` y pon el del juego:

   ```jsonc
   "routes": [{ "pattern": "rottenodds.josemariamerchan.dev", "custom_domain": true }]
   ```

   y vuelve a desplegar:

   ```bash
   npx wrangler deploy
   ```

   (También se puede hacer en el panel: *Workers & Pages* → `casino-incremental` → *Settings* →
   *Domains & Routes* → *Add* → *Custom domain*.) Cloudflare crea el registro DNS y el certificado. Si el
   dominio no es el de `SITE_URL`, cambia la constante y vuelve a construir antes de desplegar.

## Comprobaciones después de desplegar

En `https://rottenodds.josemariamerchan.dev`, con una ventana privada (sin caché ni guardados viejos):

- [ ] **Consola sin errores** (F12 → Consola), ni de carga ni de CSP, desde «Pulsa para entrar» hasta la partida.
- [ ] **Pantalla completa**: el botón de la portada, la tecla F y el ajuste «Iniciar en pantalla completa».
- [ ] **Sonido**: tras el primer clic suena el zumbido de la portada y el tic del menú; el volumen y el silencio (N)
  funcionan.
- [ ] **Guardado**: jugar un poco, recargar y comprobar que «Continuar» recupera la partida.
- [ ] **Exportar e importar**: en Ajustes, exportar la partida (descarga un .json), borrarla e importarla de nuevo.
- [ ] **Menú sin servidor**: no salen Ranking ni Iniciar sesión (salvo que se construyera con `VITE_API_URL`).
- [ ] **Imagen al compartir el enlace**: `https://rottenodds.josemariamerchan.dev/og.png` se abre, y un validador de
  Open Graph (o pegar el enlace en un chat) muestra el título, el subtítulo y la portada. Las redes guardan la
  vista previa en caché: si se cambió la imagen, puede tardar en actualizarse.
- [ ] **Modo demo**: la opción del menú y `?demo=mesa3` abren el demo con «MODO DEMO» en el HUD; «Salir» vuelve al menú y
  la partida normal sigue igual.
- [ ] **Cabeceras**: en F12 → Red → el documento, aparecen la CSP, `X-Frame-Options: DENY` y la
  `Permissions-Policy` de `public/_headers`.

## Modo demo y portfolio

- **Modo demo** (también en producción): opción «Modo demo · Ver todas las mesas sin jugar» del menú, o enlaces directos
  `https://rottenodds.josemariamerchan.dev/?demo=mesa1` … `?demo=mesa5` y `?demo=final` (el final con una partida de
  demostración). Siempre piden antes el primer clic en «Pulsa para entrar» (audio y pantalla completa). Usa su propio hueco
  de guardado: nunca toca la partida normal, no se sincroniza, no registra tiempos en el ranking y su final visto es solo
  suyo. En el HUD se ve «MODO DEMO» con un botón «Salir».
- **Modo desarrollador** (`?dev=mesa2…5`): solo con `npm run dev`; el build no lo contiene (lo comprueban un test y el
  script de capturas).
- **Capturas para el portfolio**: `npm run build && npm run capture:portfolio` deja en `docs/portfolio/` las capturas en
  PNG y WebP (1920×1080, escala entera) y los fotogramas de un vídeo corto en `capture-frames/` (ignorado por git). Sin
  ffmpeg en el PATH, el vídeo se monta así (el script imprime estos comandos):

  ```powershell
  ffmpeg -y -f concat -safe 0 -i capture-frames/frames.txt -vf "fps=30,scale=1920:1080:flags=neighbor" -c:v libvpx-vp9 -b:v 0 -crf 32 docs/portfolio/video-portfolio.webm
  ```

  ```powershell
  ffmpeg -y -f concat -safe 0 -i capture-frames/frames.txt -vf "fps=30,scale=1920:1080:flags=neighbor" -c:v libx264 -pix_fmt yuv420p -crf 20 docs/portfolio/video-portfolio.mp4
  ```

  (ffmpeg en Windows: `winget install Gyan.FFmpeg`.) Resumen técnico y pies de foto: `docs/portfolio/RESUMEN.md`.

## Servidor (opcional)

El backend (Spring Boot, `server/`) no forma parte de este despliegue. Si se publica aparte, sus
secretos van solo en variables de entorno (ver `.env.example`; `JWT_SECRET` de 32+ caracteres) y su
`CORS_ORIGINS` debe incluir el dominio del juego.
