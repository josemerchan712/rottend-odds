# Despliegue (Cloudflare Workers con assets estáticos)

El juego es una web estática: `npm run build` deja todo en `dist/` y funciona entero sin servidor (sin
`VITE_API_URL` se ocultan *Iniciar sesión*, *Sincronizar* y *Ranking*). Cloudflare la sirve como un
Worker **solo de assets** (sin código de servidor), configurado en `wrangler.jsonc`.

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

2. Build de producción (sin servidor). Si se quiere el modo en línea, antes se define la URL del
   servidor desplegado, p. ej. en PowerShell `$env:VITE_API_URL="https://api.tu-dominio.com"`:

   ```bash
   npm run build
   ```

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

   Queda publicado en `https://casino-incremental.<tu-subdominio>.workers.dev`.

5. Dominio personalizado (el dominio tiene que estar ya en tu cuenta de Cloudflare): en
   `wrangler.jsonc` descomenta la línea de `routes` y pon el tuyo, por ejemplo

   ```jsonc
   "routes": [{ "pattern": "casino.tu-dominio.com", "custom_domain": true }]
   ```

   y vuelve a desplegar:

   ```bash
   npx wrangler deploy
   ```

   (También se puede hacer en el panel: *Workers & Pages* → `casino-incremental` → *Settings* →
   *Domains & Routes* → *Add* → *Custom domain*.) Cloudflare crea el registro DNS y el certificado.

## Servidor (opcional)

El backend (Spring Boot, `server/`) no forma parte de este despliegue. Si se publica aparte, sus
secretos van solo en variables de entorno (ver `.env.example`; `JWT_SECRET` de 32+ caracteres) y su
`CORS_ORIGINS` debe incluir el dominio del juego.
