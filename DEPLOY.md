# Despliegue de ROTTEN ODDS (Cloudflare Workers con assets estáticos)

El juego es una web estática: `npm run build` deja todo en `dist/` y funciona entero sin servidor (sin
`VITE_API_URL` se ocultan *Cuenta* y *Ranking*). Cloudflare la sirve como un
Worker **solo de assets** (sin código de servidor), configurado en `wrangler.jsonc`. El nombre del juego
(«ROTTEN ODDS · La casa siempre cobra») sale de `GAME_TITLE` y `GAME_TAGLINE` en `src/game/config.ts`: el
build lo escribe en el `<title>` y los metadatos de `index.html`. El Worker y el paquete npm conservan su
nombre técnico (`casino-incremental`); el repositorio es `josemerchan712/rottend-odds`.

**Dominio**: `SITE_URL` en `src/game/config.ts` (por defecto `https://rottenodds.josemariamerchan.dev`, sin barra
final). El build lo escribe en `og:url`, `og:image` y `twitter:image` de `index.html` (tienen que ser URLs
absolutas para que la vista previa al compartir el enlace funcione). Para otro dominio, cambia la constante o
defínelo solo para un build: en PowerShell `$env:SITE_URL="https://otro-dominio.com"; npm run build`.

**Estado:** el juego está publicado en `https://rottenodds.josemariamerchan.dev` (Cloudflare) y usa la API desplegada
en un VPS de Hetzner (ver «Backend en el VPS», al final).

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

2. Build de producción. **La versión publicada usa el backend**: constrúyela con `VITE_API_URL` como se explica en
   «Reconstruir el juego para que use el backend» (al final), con su comprobación (sí la URL de producción, ni
   `localhost` ni `8080`). Lo que sigue es el build **sin servidor** (para probar o si la API no estuviera). Antes,
   comprueba en PowerShell que `VITE_API_URL` está vacía en esta terminal (si sale algo, la sesión la tenía definida:
   quítala con `Remove-Item Env:VITE_API_URL`):

   ```powershell
   if ($env:VITE_API_URL) { "VITE_API_URL está definida: $env:VITE_API_URL" } else { "VITE_API_URL vacía" }
   ```

   Y construye desde cero (Vite solo lee `.env.development.local` en `npm run dev`, nunca en el build):

   ```powershell
   Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npm run build
   ```

   **Comprobación antes de desplegar (build sin servidor).** El build no debe llevar ninguna URL de
   desarrollo. Esta búsqueda no debe devolver ningún archivo:

   ```powershell
   Get-ChildItem dist -Recurse -File -Include *.js,*.html,*.css,*.json | Select-String -Pattern "localhost","8080" -List | Select-Object Path
   ```

   Y con `npm run preview`, el menú principal no debe mostrar **Ranking** ni **Cuenta** (sin `VITE_API_URL` se
   ocultan cuentas, sincronización y ranking).

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
- [ ] **Menú en línea** (la versión publicada usa el backend): salen **Ranking** y **Cuenta**, el menú no se corta con
  la sesión iniciada y la consola no muestra errores de CORS ni de CSP. (Con un build sin servidor no salen.)
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

**Estado: desplegado.** La API corre en un VPS de Hetzner (Núremberg, Alemania; Ubuntu 24.04, x86, 4 GB) con
**Caddy** (HTTPS automático) delante de la **API** y **PostgreSQL 16**, todo con `docker-compose.prod.yml`. Dominio de la
API: `rottenodds-api.josemariamerchan.dev`. La versión publicada del juego ya la usa. Hay una copia diaria de la base
de datos con un temporizador de systemd, guardada 14 días en el mismo servidor. La restauración se probó en local (no en
el servidor).

Qué hace cada pieza:

- **Caddy** es lo único con puertos publicados (80 y 443). Pide y renueva el certificado de Let's Encrypt, redirige
  HTTP a HTTPS, limita el cuerpo de las peticiones a 256 KB, añade cabeceras de seguridad y reenvía a la API. No
  guarda registro de accesos. Ignora el `X-Forwarded-For` que mande el cliente y pone la IP real.
- **API** (`server/Dockerfile.prod`): JRE 21, usuario sin privilegios, perfil `prod`, `-XX:MaxRAMPercentage=60` y
  healthcheck contra `/health`. Sin puertos publicados. Solo acepta `X-Forwarded-For` de la IP fija de Caddy dentro de
  la red interna de Docker (`172.28.0.10`), así el límite de intentos cuenta por la IP real del jugador y nadie puede
  falsearla. En `prod` no hay Swagger ni `/v3/api-docs`, y los logs no llevan SQL, tokens, cuerpos ni IPs.
- **PostgreSQL 16** con volumen nombrado (`rottenodds_db-data`), sin puertos publicados y con healthcheck.
- Red `internal` sin salida a Internet (API y base de datos) y red `edge` para Caddy. Todo con `restart: unless-stopped`.

### Dónde está cada cosa en el VPS

| Qué | Dónde |
| --- | --- |
| Clon del repositorio (solo para desplegar; nunca se edita a mano) | `~/rottenodds` |
| Secretos de producción (permisos 600, fuera del repositorio) | `/opt/rottenodds/.env.prod` |
| Copias de la base de datos (carpeta 700, archivos 600) | `/var/backups/rottenodds` |
| Temporizador de las copias | `/etc/systemd/system/rottenodds-backup.{service,timer}` |

Los scripts de `deploy/` leen los secretos de `/opt/rottenodds/.env.prod` por defecto (variable `ENV_FILE`) y trabajan
sobre el clon en el que están, así que da igual dónde esté el clon.

### Variables (`/opt/rottenodds/.env.prod`)

Plantilla: `.env.prod.example`.

| Variable | Qué es |
| --- | --- |
| `DB_PASSWORD` | Contraseña de PostgreSQL. Aleatoria, larga. |
| `JWT_SECRET` | Firma de las sesiones, 32+ caracteres (sin él, o corto, la API no arranca). Si cambia, se cierran todas las sesiones. |
| `CORS_ORIGINS` | `https://rottenodds.josemariamerchan.dev` (sin barra final). |
| `API_DOMAIN` | `rottenodds-api.josemariamerchan.dev`. |
| `DB_USER` | Opcional (`casino`). |

### Primera vez (como se hizo)

1. **DNS**: un registro `A` (y `AAAA` si el VPS tiene IPv6) de `rottenodds-api.josemariamerchan.dev` a la IP del VPS.
   Si el dominio está en Cloudflare, **sin proxy** (nube gris): Caddy necesita recibir la conexión directa para
   pedir el certificado y ver la IP real.
2. **Cortafuegos** (en el VPS y, si lo hay, en el panel de Hetzner): abrir solo 22, 80 y 443.

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
   ```

   (Docker publica sus puertos por delante de ufw: por eso la API y la base de datos no publican ninguno.)
3. **Clonar en `~/rottenodds`**. El repositorio es público, así que basta HTTPS:

   ```bash
   git clone https://github.com/josemerchan712/rottend-odds.git ~/rottenodds
   ```

   (Si algún día pasa a privado: una *deploy key* de solo lectura. En el VPS, `ssh-keygen -t ed25519 -f
   ~/.ssh/<clave-de-despliegue> -N ""`; en GitHub, repositorio → *Settings* → *Deploy keys* → *Add deploy key* con la
   clave pública y **sin** *Allow write access*; en `~/.ssh/config` un `Host <alias>` con `HostName github.com`,
   `IdentityFile ~/.ssh/<clave-de-despliegue>` e `IdentitiesOnly yes`; y `git remote set-url origin
   git@<alias>:josemerchan712/rottend-odds.git`.)
4. **Secretos en `/opt/rottenodds/.env.prod`**:

   ```bash
   sudo mkdir -p /opt/rottenodds && sudo chown "$USER" /opt/rottenodds
   ```

   ```bash
   install -m 600 ~/rottenodds/.env.prod.example /opt/rottenodds/.env.prod
   ```

   Rellena `CORS_ORIGINS` y `API_DOMAIN` con un editor. Los secretos se pueden generar directamente en el archivo, sin
   que se vean en pantalla ni queden en el historial:

   ```bash
   sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')|; s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=')|" /opt/rottenodds/.env.prod
   ```

5. **Primer despliegue**:

   ```bash
   ~/rottenodds/deploy/deploy.sh
   ```

   Construye la imagen, levanta los tres servicios, espera al healthcheck de la API y muestra el estado y la
   respuesta de `https://rottenodds-api.josemariamerchan.dev/health`. El primer certificado puede tardar unos
   segundos; si falla, mira los logs de Caddy (casi siempre es el DNS o el puerto 80 cerrado):

   ```bash
   cd ~/rottenodds && docker compose -f docker-compose.prod.yml --env-file /opt/rottenodds/.env.prod logs caddy
   ```

6. **Copias diarias** (ver «Copias de seguridad» abajo) y **reconstruir el juego** con la URL de la API y desplegarlo
   (ver «Reconstruir el juego para que use el backend»), en ese orden: primero la API funcionando, después el juego que
   la usa.

### Desplegar una versión nueva y volver atrás

```bash
~/rottenodds/deploy/deploy.sh
```

Hace `git pull --ff-only`, guarda la versión actual (commit en `.deploy-previous` e imagen `rottenodds-api:previous`),
construye, levanta y espera al healthcheck. **Si la API nueva no llega a estar sana, vuelve sola a la anterior.** Para
volver atrás a mano:

```bash
~/rottenodds/deploy/deploy.sh rollback
```

Ojo: Flyway solo va hacia delante. Si una versión trae una migración nueva y hay que volver atrás, la versión anterior
puede no arrancar con el esquema nuevo: entonces restaura la copia de antes del despliegue (abajo). Antes de desplegar
una migración, haz una copia a mano (`~/rottenodds/deploy/backup.sh`).

### Copias de seguridad

`deploy/backup.sh` hace un `pg_dump` en formato custom comprimido, lo comprueba con `pg_restore --list` y lo deja en
`/var/backups/rottenodds` (carpeta 700, archivos 600). Borra las de más de 14 días. Tarea diaria con systemd (03:30,
con hasta 10 minutos de margen aleatorio):

```bash
sudo mkdir -p /var/backups/rottenodds && sudo chmod 700 /var/backups/rottenodds
```

```bash
sudo cp ~/rottenodds/deploy/systemd/rottenodds-backup.* /etc/systemd/system/
```

El `.service` del repositorio trae `ExecStart=/home/USUARIO/rottenodds/deploy/backup.sh`: hay que adaptarlo a la ruta
real del clon (con `$HOME`, sin escribir el usuario a mano):

```bash
sudo sed -i "s|^ExecStart=.*|ExecStart=$HOME/rottenodds/deploy/backup.sh|" /etc/systemd/system/rottenodds-backup.service
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now rottenodds-backup.timer
```

El servicio corre como root (para usar Docker). Comprobar el temporizador y lanzar una copia a mano:

```bash
systemctl list-timers rottenodds-backup.timer
```

```bash
sudo systemctl start rottenodds-backup.service && journalctl -u rottenodds-backup.service -n 5
```

Las copias están en el mismo VPS: protegen de errores y de una mala migración, no de perder el servidor. Para eso,
copia de vez en cuando la carpeta fuera (p. ej. `scp` a tu equipo) o activa los *Backups* de Hetzner.

**Restaurar** (sustituye los datos actuales; antes hace una copia del estado actual, para la API, restaura en una sola
transacción y la vuelve a arrancar):

```bash
~/rottenodds/deploy/restore.sh /var/backups/rottenodds/casino-AAAAMMDDTHHMMSSZ.dump
```

**Probado solo en local** (6 de octubre de 2026, PostgreSQL 16 en Docker): copia → borrar una cuenta → restaurar → la
cuenta, su partida y su puesto en el ranking vuelven. En el servidor todavía no se ha probado una restauración.

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

Debe devolver JSON con `content`.

- [ ] `http://rottenodds-api.josemariamerchan.dev/health` redirige a HTTPS (308).
- [ ] `https://rottenodds-api.josemariamerchan.dev/swagger-ui.html` y `/v3/api-docs` dan 404.
- [ ] Desde fuera no responden los puertos 8080 ni 5432 (`nc -zv <ip-del-vps> 8080` y `5432` fallan).
- [ ] En el VPS, `docker compose -f docker-compose.prod.yml --env-file /opt/rottenodds/.env.prod ps` (desde
  `~/rottenodds`) muestra la API `(healthy)`, la base de datos `(healthy)` y Caddy en marcha.
- [ ] **El servidor se recupera solo tras un reinicio**: Docker arranca con el sistema (`systemctl is-enabled docker` →
  `enabled`) y los contenedores tienen `restart: unless-stopped`. Para comprobarlo, `sudo reboot`, espera un par de
  minutos, vuelve a entrar y repite el `docker compose … ps`: los **tres servicios** tienen que estar en marcha, con la
  API y la base de datos `(healthy)`, y el `curl` a `/health` desde fuera tiene que dar `200` sin haber tocado nada.
  `systemctl list-timers rottenodds-backup.timer` debe seguir mostrando la próxima copia.
- [ ] Desde el juego publicado: crear cuenta, guardar el código, sincronizar, salir en el ranking, exportar mis datos y
  borrar la cuenta desde Ajustes.

### Reconstruir el juego para que use el backend

El juego (Cloudflare) solo muestra cuentas, sincronización y ranking si se construye con la URL de la API. El orden es:
**API desplegada y comprobada → reconstruir el juego con `VITE_API_URL` → comprobar el build → desplegar el juego**.

1. Reconstruir, en PowerShell, desde `C:\videojuego`:

   ```powershell
   $env:VITE_API_URL="https://rottenodds-api.josemariamerchan.dev"; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; npm run build
   ```

2. Comprobar el build: **ninguna** aparición de `localhost` ni de `8080`…

   ```powershell
   Get-ChildItem dist -Recurse -File -Include *.js,*.html,*.css,*.json | Select-String -Pattern "localhost","8080" -List | Select-Object Path
   ```

   …y **sí** la URL de producción:

   ```powershell
   Get-ChildItem dist\assets -Filter *.js | Select-String -Pattern "rottenodds-api.josemariamerchan.dev" -List | Select-Object Path
   ```

   La primera no debe listar nada; la segunda, al menos un archivo. (El build ya falla solo si queda algún marcador
   pendiente.) Con `npx vite preview` el menú **sí** muestra **Ranking** y **Cuenta**; desde `localhost:4173` la API
   rechazará las peticiones por CORS, es lo esperado.
3. Desplegar y limpiar la variable de la terminal para que el próximo build sin servidor no la herede:

   ```powershell
   npx wrangler deploy
   ```

   ```powershell
   Remove-Item Env:VITE_API_URL
   ```

4. En el juego publicado, con una ventana privada: salen **Ranking** y **Cuenta**, la consola no muestra errores de CORS
   ni de CSP al abrir el ranking, y se puede crear una cuenta. La CSP de `public/_headers` ya permite
   `connect-src https:`.

### Privacidad

`privacidad.html` (en la raíz: el build la procesa como segunda página para escribir el contacto, `CONTACT_EMAIL` de
`src/game/config.ts`; enlazada desde Ajustes) sigue marcada como **borrador pendiente de revisión legal**. El build
falla si en `dist/` queda algún marcador pendiente (`[PONER …]`, `[… PENDIENTE …]` o una constante `%ASÍ%` sin sustituir).
