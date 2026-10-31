# Chat de compañeros para OBS

Cada compañero entra con su usuario y contraseña desde el celular o PC, escribe, y su mensaje aparece como burbuja **encima de su personaje** en OBS. Cada personaje tiene su propio overlay, así que los mensajes nunca se mezclan.

```
Compañero (navegador) ──► Cloudflare Tunnel ──► tu PC :3100 ──► OBS (Fuente de navegador por personaje)
```

## 1. Arrancar

### Con Node (24.22.1 LTS o superior)
Requiere **Node 24.22.1+** (parche de seguridad del 21-oct-2026). `npm install` falla a propósito con versiones anteriores (`engine-strict` en `.npmrc`). Si usas nvm: `nvm install && nvm use` (lee `.nvmrc`).

Stack: Express 5.3 + Socket.IO 4.8.4, sin otras dependencias.

```bash
npm install
npm run add-user -- ana 1234 "Ana" "#ff4d6d"
npm run add-user -- luis abcd "Luis" "#4dabff"
npm start
```

### Con Docker
```bash
docker compose up -d --build
docker compose exec app npm run add-user -- ana 1234 "Ana" "#ff4d6d"
```
La imagen usa `node:24.22.1-slim` (Debian bookworm, la build oficial con glibc), y el build falla si el Node de la imagen es menor a 24.22.1.

Cuando salga un nuevo parche de Node 24, cambia el tag o usa la línea 24 y reconstruye:
```bash
docker compose build --pull --build-arg NODE_VERSION=24-slim
```

Los usuarios se guardan en `./data/users.json` (contraseñas con hash scrypt). El servidor recarga el archivo solo: no hace falta reiniciar al crear, cambiar o borrar usuarios.

```bash
npm run add-user -- --list
npm run add-user -- --remove ana     # le cierra la sesión al instante
npm run add-user -- ana nuevaClave   # cambiar contraseña (mantiene nombre y color)
```

## 2. Compartir con Cloudflare Tunnel

Hay dos tipos de túnel y dos formas de correrlos (Docker o instalado en tu PC):

| | Quick Tunnel | Túnel con nombre |
|---|---|---|
| Cuenta / dominio | No hace falta | Cuenta gratis + un dominio en Cloudflare |
| URL | Aleatoria `*.trycloudflare.com`, **cambia en cada reinicio** | Fija, ej. `chat.tudominio.com` |
| Ideal para | Probar, o streams ocasionales | Uso de todos los días |

### Opción A: desde Docker (no instalas nada)

Ya viene en el `docker-compose.yml`, con *profiles*: solo arranca el túnel que pidas.

**Quick Tunnel:**
```bash
docker compose --profile quick up -d
docker compose logs tunnel-quick | grep trycloudflare.com   # aquí sale tu URL
```

**Túnel con nombre:**
1. En el panel de Cloudflare entra a **Zero Trust → Networks → Tunnels → Create a tunnel**, elige **Cloudflared** y ponle un nombre.
2. En el paso de instalación, copia el **token** (la cadena larga después de `--token` en el comando que te muestra). Pégalo en `.env`:
   ```
   CF_TUNNEL_TOKEN=eyJhIjoi...
   ```
3. En **Public Hostname** elige subdominio y dominio, tipo **HTTP** y URL **`app:3000`** (el nombre del servicio dentro de Docker, no `localhost`).
4. Arranca:
   ```bash
   docker compose --profile tunnel up -d
   docker compose logs -f tunnel    # debe decir "Registered tunnel connection"
   ```

### Opción B: instalar cloudflared en tu PC

| Sistema | Instalación |
|---|---|
| Windows | `winget install --id Cloudflare.cloudflared` (o el `.msi` de [GitHub releases](https://github.com/cloudflare/cloudflared/releases/latest)). En Windows **no se actualiza solo**: repite el comando con `winget upgrade` de vez en cuando. |
| macOS | `brew install cloudflared` |
| Debian / Ubuntu | ver abajo |

```bash
# Debian / Ubuntu (repositorio oficial)
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared
```

Comprueba con `cloudflared --version`.

**Quick Tunnel** (la URL aparece en la terminal):
```bash
cloudflared tunnel --url http://localhost:3100
```

**Túnel con nombre:** igual que en la opción A, pero en **Public Hostname** usa la URL **`localhost:3000`**, e instálalo como servicio para que arranque solo con tu PC:
```bash
cloudflared service install <TOKEN>
```

### Notas

- Los Quick Tunnels no funcionan si existe un `config.yaml` en tu carpeta `.cloudflared`; renómbralo mientras los usas.
- Los Quick Tunnels permiten hasta 200 peticiones simultáneas y no tienen garantía de disponibilidad. Para un grupo de compañeros sobra, pero si haces streams seguido, usa el túnel con nombre.
- No uses a la vez el túnel de Docker y el de tu PC: elige uno.

Pásale a cada compañero la URL del túnel + su usuario y contraseña.

## 3. Configurar OBS

Por **cada personaje**:

1. Agrega la imagen del personaje.
2. Agrega una **Fuente → Navegador** encima de la imagen:
   - URL: `http://localhost:3100/overlay?user=ana`
   - Ancho `600`, Alto `400` (ajusta a tu escena)
   - Deja el CSS personalizado que trae OBS por defecto (fondo transparente).
   - Marca **"Actualizar navegador cuando la escena se active"**.
3. Para acomodarla, usa temporalmente `...&demo=1`: muestra una burbuja fija. Muévela hasta que la colita apunte a la cabeza del personaje y luego quita `&demo=1`.
4. Selecciona imagen + fuente de navegador → clic derecho → **Agrupar**, así se mueven juntos.

La burbuja crece **hacia arriba** desde el borde inferior de la fuente, así que el borde inferior de la fuente debe quedar justo sobre la cabeza.

### Parámetros del overlay

| Parámetro | Default | Qué hace |
|---|---|---|
| `user` | `*` | Usuario(s): `ana`, `ana,luis` o `*` (todos) |
| `duration` | `8` | Segundos que dura cada burbuja. `0` = no desaparece |
| `max` | `3` | Burbujas apiladas como máximo |
| `size` | `28` | Tamaño de letra (px) |
| `width` | `520` | Ancho máximo de la burbuja (px) |
| `align` | `center` | `left` / `right`: hacia dónde se alinea la burbuja y su colita |
| `name` | `1` | `0` oculta el nombre dentro de la burbuja |
| `typing` | `1` | `0` oculta los "…" mientras el compañero escribe |
| `bg`, `fg` | `ffffff`, `14141c` | Color de fondo / texto en hex sin `#` |
| `key` | — | Necesario solo si configuraste `OVERLAY_KEY` |
| `demo` | — | `1` = burbuja fija de prueba |

Ejemplo estilo oscuro, una sola burbuja que se queda: 
`http://localhost:3000/overlay?user=luis&max=1&duration=0&bg=1a1a24&fg=ffffff&size=32`

## 4. Seguridad

- **Overlay protegido por defecto:** sin `OVERLAY_KEY`, el overlay solo acepta conexiones hechas a `http://localhost:3000` sin cabeceras de reenvío. Las que llegan por el túnel traen el dominio público (`*.trycloudflare.com` o tu dominio) o cabeceras como `cf-connecting-ip` / `x-forwarded-for`, y se rechazan. Si necesitas abrir el overlay desde otro equipo, o quieres una garantía extra, define `OVERLAY_KEY` y añade `&key=...` a la URL. Igualmente, el overlay solo muestra lo que ya sale en el stream.
- Nadie puede escribir a nombre de otro: el usuario sale de la sesión del servidor, no del navegador.
- Los mensajes se insertan como texto, nunca como HTML (no hay inyección de código en OBS).
- Límite de intentos de login cada 15 min: 10 por usuario y 30 por IP (la IP real la entrega Cloudflare en `cf-connecting-ip`).
- Anti-spam de 1.5 s entre mensajes y máximo 200 caracteres (configurable en `.env`).
- Las sesiones viven en memoria: si reinicias el servidor, los compañeros vuelven a iniciar sesión.

## Variables de entorno

Ver `.env.example`: `PORT` (default `3100`), `OVERLAY_KEY`, `MAX_MESSAGE_LENGTH`, `COOLDOWN_MS`, `SESSION_TTL_HOURS`, `USERS_FILE`.
