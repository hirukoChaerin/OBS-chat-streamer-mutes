---
"obs-chat-overlay": minor
---

Cloudflare Tunnel desde Docker y endurecimiento del login y del overlay

**Cloudflare Tunnel**

- Nuevos servicios opcionales en `docker-compose.yml`, activados con profiles:
  - `docker compose --profile quick up -d`: Quick Tunnel (`*.trycloudflare.com`, sin cuenta).
  - `docker compose --profile tunnel up -d`: túnel con nombre y URL fija, usando `CF_TUNNEL_TOKEN` en `.env`.
- README: instalación de `cloudflared` en Windows (winget), macOS (brew) y Debian/Ubuntu (repositorio oficial), y configuración del túnel desde Docker (`app:3000`) o desde el PC (`localhost:3000`).

**Seguridad**

- Límite de intentos de login cada 15 minutos: 10 por usuario y 30 por IP. Antes solo era por IP, así que repartir intentos entre muchas IP ya no sirve para adivinar contraseñas.
- El overlay sin `OVERLAY_KEY` solo acepta conexiones con `Host` `localhost`/`127.0.0.1`/`::1` y sin cabeceras de reenvío (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, `forwarded`). Antes solo se revisaba `cf-connecting-ip`.
- La búsqueda de usuarios usa `Object.hasOwn`, así que nombres como `__proto__` o `constructor` ya no resuelven a propiedades del prototipo. El usuario se recorta a 64 caracteres antes de procesarlo.
- La IP del visitante usa `cf-connecting-ip`, luego `x-forwarded-for` y, por último, la IP del socket.

**Conexión**

- Socket.IO con `pingInterval` de 10 s y `pingTimeout` de 20 s: detecta antes las conexiones caídas y evita peticiones largas si la conexión cae a long-polling.
