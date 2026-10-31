---
"obs-chat-overlay": minor
---

Sonido por persona al enviar un mensaje, con opción de activarlo o desactivarlo

**Sonidos**

- Cada mensaje hace sonar el sonido de quien lo envió en su overlay de OBS.
- 8 sonidos incluidos, generados con Web Audio sin archivos externos: `pop`, `ding`, `blip`, `chime`, `bubble`, `boop`, `knock`, `sparkle`.
- Sonidos propios: archivos `.mp3`, `.ogg` o `.wav` en `public/sounds/`. Si el archivo no existe, suena `pop`.
- Al crear un usuario se le asigna un sonido que nadie más use. Los usuarios creados antes reciben uno fijo según su nombre.
- Nuevo comando `npm run add-user -- --sound <usuario> <sonido>`. Se aplica sin reiniciar el servidor. `--list` ahora muestra el sonido de cada usuario.
- Nueva página `/sonidos` para escuchar y elegir los sonidos.

**Activar o desactivar**

- Overlay: parámetro `sound` (`1` = el de cada persona, `0` = sin sonido, o un nombre para forzarlo) y `volume` (0 a 100, default 60).
- Chat de los compañeros: botón 🔔/🔕 en la cabecera, guardado en su navegador. Suenan los mensajes de los demás, no los propios.
- En vivo desde OBS con "Controlar audio mediante OBS" y el mezclador de audio.
- La burbuja de prueba (`demo=1`) usa el color y el sonido reales del personaje.

**Otros cambios**

- Puerto por defecto `3100` (antes `3000`) en el servidor, el Dockerfile, `docker-compose.yml`, los túneles de Cloudflare y el README. Actualiza las URLs de las fuentes de OBS y el Public Hostname del túnel con nombre.
- `docker-compose.yml` monta `./public/sounds` para agregar sonidos sin reconstruir la imagen.
