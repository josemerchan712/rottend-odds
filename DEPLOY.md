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
- Backend (aparte, en un VPS): `docker-compose.prod.yml`, `server/Dockerfile.prod`, `deploy/Caddyfile`,
  `.env.prod.example`, `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/restore.sh` y `deploy/systemd/`. Ver «Backend en
  el VPS» al final.

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

   (Para el modo en línea, con el backend ya desplegado, ver «Reconstruir el juego para que use el backend» en
   «Backend en el VPS», al final: cambia lo que debe salir en esta comprobación.)

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

## Backend en el VPS

El backend (Spring Boot, `server/`) va en un VPS propio con Docker: **Caddy** (HTTPS automático) delante de la
**API** y **PostgreSQL 16**, todo con `docker-compose.prod.yml`. Pensado para Hetzner con Ubuntu 24.04 (x86, 4 GB) y
Docker con Compose ya instalados. Dominio de la API: `rottenodds-api.josemariamerchan.dev`.

Qué hace cada pieza:

- **Caddy** es lo único con puertos publicados (80 y 443). Pide y renueva el certificado de Let's Encrypt, redirige
  HTTP a HTTPS, limita el cuerpo de las peticiones a 256 KB, añade cabeceras de seguridad y reenvía a la API. No
  guarda registro de accesos. Ignora el `X-Forwarded-For` que mande el cliente y pone la IP real.
- **API** (`server/Dockerfile.prod`): JRE 21, usuario sin privilegios, perfil `prod`, `-XX:MaxRAMPercentage=60` y
  healthcheck contra `/health`. Sin puertos publicados. Solo acepta `X-Forwarded-For` de la IP fija de Caddy
  (`172.28.0.10`), así el límite de intentos cuenta por la IP real del jugador y nadie puede falsearla. En `prod` no
  hay Swagger ni `/v3/api-docs`, y los logs no llevan SQL, tokens, cuerpos ni IPs.
- **PostgreSQL 16** con volumen nombrado (`rottenodds_db-data`), sin puertos publicados y con healthcheck.
- Red `internal` sin salida a Internet (API y base de datos) y red `edge` para Caddy. Todo con `restart: unless-stopped`.

### Variables (el `.env` de producción vive fuera del repositorio)

Plantilla: `.env.prod.example`. En el VPS va en `/opt/rottenodds/.env.prod`, con permisos 600.

| Variable | Qué es |
| --- | --- |
| `DB_PASSWORD` | Contraseña de PostgreSQL. Aleatoria, larga. |
| `JWT_SECRET` | Firma de las sesiones, 32+ caracteres (sin él, o corto, la API no arranca). Si cambia, se cierran todas las sesiones. |
| `CORS_ORIGINS` | `https://rottenodds.josemariamerchan.dev` (sin barra final). |
| `API_DOMAIN` | `rottenodds-api.josemariamerchan.dev`. |
| `DB_USER` | Opcional (`casino`). |

### Primera vez

1. **DNS**: un registro `A` (y `AAAA` si el VPS tiene IPv6) de `rottenodds-api.josemariamerchan.dev` a la IP del VPS.
   Si el dominio está en Cloudflare, **sin proxy** (nube gris): Caddy necesita recibir la conexión directa para
   pedir el certificado y ver la IP real.
2. **Cortafuegos** (en el VPS y, si lo hay, en el panel de Hetzner): abrir solo 22, 80 y 443.

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
   ```

   (Docker publica sus puertos por delante de ufw: por eso la API y la base de datos no publican ninguno.)
3. **Clave de despliegue de solo lectura** para clonar desde GitHub sin usar tu cuenta:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/rottenodds_deploy -N "" -C "rottenodds-vps"
   ```

   ```bash
   cat ~/.ssh/rottenodds_deploy.pub
   ```

   En GitHub: repositorio → *Settings* → *Deploy keys* → *Add deploy key*, pega la clave pública y deja **sin marcar**
   *Allow write access*. Luego, en `~/.ssh/config` del VPS:

   ```text
   Host github-rottenodds
     HostName github.com
     User git
     IdentityFile ~/.ssh/rottenodds_deploy
     IdentitiesOnly yes
   ```

4. **Clonar y preparar** (la copia del VPS es solo para desplegar: nunca se edita a mano):

   ```bash
   sudo mkdir -p /opt/rottenodds && sudo chown "$USER" /opt/rottenodds
   ```

   ```bash
   git clone git@github-rottenodds:josemerchan712/casino-incremental.git /opt/rottenodds/app
   ```

   ```bash
   install -m 600 /opt/rottenodds/app/.env.prod.example /opt/rottenodds/.env.prod
   ```

   Rellena `/opt/rottenodds/.env.prod` con un editor. Para generar los secretos sin que se vean en pantalla ni queden
   en el historial, se pueden escribir directamente al archivo:

   ```bash
   sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')|; s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=')|" /opt/rottenodds/.env.prod
   ```

5. **Primer despliegue**:

   ```bash
   /opt/rottenodds/app/deploy/deploy.sh
   ```

   Construye la imagen, levanta los tres servicios, espera al healthcheck de la API y muestra el estado y la
   respuesta de `https://rottenodds-api.josemariamerchan.dev/health`. El primer certificado puede tardar unos
   segundos; si falla, mira `docker compose -f docker-compose.prod.yml --env-file /opt/rottenodds/.env.prod logs caddy`
   (casi siempre es el DNS o el puerto 80 cerrado).

### Desplegar una versión nueva y volver atrás

```bash
/opt/rottenodds/app/deploy/deploy.sh
```

Hace `git pull --ff-only`, guarda la versión actual (commit en `.deploy-previous` e imagen `rottenodds-api:previous`),
construye, levanta y espera al healthcheck. **Si la API nueva no llega a estar sana, vuelve sola a la anterior.** Para
volver atrás a mano:

```bash
/opt/rottenodds/app/deploy/deploy.sh rollback
```

Ojo: Flyway solo va hacia delante. Si una versión trae una migración nueva y hay que volver atrás, la versión anterior
puede no arrancar con el esquema nuevo: entonces restaura la copia de antes del despliegue (abajo). Antes de desplegar
una migración, haz una copia a mano (`deploy/backup.sh`).

### Copias de seguridad

`deploy/backup.sh` hace un `pg_dump` en formato custom comprimido, lo comprueba con `pg_restore --list` y lo deja en
`/var/backups/rottenodds` (carpeta 700, archivos 600). Borra las de más de 14 días. Tarea diaria con systemd (03:30):

```bash
sudo mkdir -p /var/backups/rottenodds && sudo chown "$USER" /var/backups/rottenodds && chmod 700 /var/backups/rottenodds
```

```bash
sudo cp /opt/rottenodds/app/deploy/systemd/rottenodds-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now rottenodds-backup.timer
```

El servicio corre como root (para usar Docker); si prefieres otro usuario del grupo `docker`, añade `User=` en el
`.service`. Comprobar y lanzar una copia a mano:

```bash
systemctl list-timers rottenodds-backup.timer
```

```bash
sudo systemctl start rottenodds-backup.service && journalctl -u rottenodds-backup.service -n 5
```

(Con cron en vez de systemd: `30 3 * * * /opt/rottenodds/app/deploy/backup.sh >> /var/log/rottenodds-backup.log 2>&1`.)

Las copias están en el mismo VPS: protegen de errores y de una mala migración, no de perder el servidor. Para eso,
copia de vez en cuando la carpeta fuera (p. ej. `scp` a tu equipo) o activa los *Backups* de Hetzner.

**Restaurar** (sustituye los datos actuales; antes hace una copia del estado actual, para la API, restaura en una sola
transacción y la vuelve a arrancar):

```bash
/opt/rottenodds/app/deploy/restore.sh /var/backups/rottenodds/casino-AAAAMMDDTHHMMSSZ.dump
```

Probado en local el 6 de octubre de 2026 (Postgres 16 en Docker): copia → borrar una cuenta → restaurar → la cuenta,
su partida y su puesto en el ranking vuelven.

### Comprobaciones después de desplegar el backend

Desde **tu equipo** (fuera del VPS):

```bash
curl -i https://rottenodds-api.josemariamerchan.dev/health
```

Debe responder `200` con `{"status":"ok"}` y cabeceras `Strict-Transport-Security`, `X-Content-Type-Options`,
`Content-Security-Policy` y `Referrer-Policy`.

```bash
curl -s "https://rottenodds-api.josemariamerchan.dev/api/ranking?page=0&size=5"
```

Debe devolver JSON con `content` (vacío al principio).

- [ ] `http://rottenodds-api.josemariamerchan.dev/health` redirige a HTTPS (308).
- [ ] `https://rottenodds-api.josemariamerchan.dev/swagger-ui.html` y `/v3/api-docs` dan 404.
- [ ] Desde fuera no responden los puertos 8080 ni 5432 (`nc -zv <ip-del-vps> 8080` y `5432` fallan).
- [ ] En el VPS, `docker compose -f docker-compose.prod.yml --env-file /opt/rottenodds/.env.prod ps` muestra la API
  `(healthy)` y la base de datos `(healthy)`.
- [ ] Desde el juego en línea: crear cuenta, guardar el código, sincronizar, salir en el ranking, exportar mis datos y
  borrar la cuenta desde Ajustes.

### Reconstruir el juego para que use el backend

El juego (Cloudflare) solo muestra cuentas, sincronización y ranking si se construye con la URL de la API. En
PowerShell, desde `C:\videojuego`:

```powershell
$env:VITE_API_URL="https://rottenodds-api.josemariamerchan.dev"; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npm run build
```

**Qué cambia en la comprobación antes de desplegar** (paso 2 de arriba): la búsqueda de `localhost` y `8080` debe
seguir sin devolver nada, pero ahora **sí debe aparecer la URL de producción**:

```powershell
Get-ChildItem dist -Recurse -File -Include *.js,*.html,*.css,*.json | Select-String -Pattern "localhost","8080" -List | Select-Object Path
```

```powershell
Get-ChildItem dist\assets -Filter *.js | Select-String -Pattern "rottenodds-api.josemariamerchan.dev" -List | Select-Object Path
```

La primera no debe listar nada; la segunda, al menos un archivo. Y con `npx vite preview` el menú **sí** muestra
**Ranking** e **Iniciar sesión** (desde `localhost:4173` la API rechazará las peticiones por CORS: es lo esperado; se
prueba de verdad ya desplegado). La CSP de `public/_headers` ya permite `connect-src https:`, no hay que tocarla.
Después, `npx wrangler deploy` como siempre y, al acabar, borra la variable de la terminal
(`Remove-Item Env:VITE_API_URL`) para que el próximo build sin servidor no la herede.

En las comprobaciones después de desplegar el juego, el punto «Menú sin servidor» pasa a ser: **salen Ranking e Iniciar
sesión**, y la consola no muestra errores de CORS ni de CSP al abrir el ranking.

### Privacidad

`public/privacidad.html` (enlazada desde Ajustes) es un **borrador para revisar**: falta la ubicación del centro de
datos y un contacto. Revísala antes de anunciar las cuentas.
