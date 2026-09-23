# Sala-In web

Control web de la sala inmersiva. Cualquier persona con usuario, conectada a la Wi‑Fi de la sala, abre
`http://<IP-del-Mac>:8080` en el móvil o la tablet y lanza las demos. No tiene que conectarse a QLab:
el servidor mantiene una única conexión con QLab (OSC/UDP) y con WATCHOUT 7 (API HTTP) en nombre de todos.

```
Móvil / tablet ──Wi‑Fi──▶ Servidor web (Mac de QLab) ──OSC/UDP──▶ QLab 5
                                                   └──HTTP 3019──▶ WATCHOUT 7 Director (WO-SUELO)
```

Lo que hace:

- **Demos**: lanzar (configurar sala + Preparación + Lanzamiento), mando en vivo y Finalizar.
  Solo hay una demo activa: **si se lanza otra, primero se ejecuta la Finalización de la activa**.
  Los pasos pueden ser comandos OSC de QLab, reproducir/pausar/parar un timeline de WATCHOUT, esperas,
  confirmaciones o instrucciones (aparecen en todos los móviles conectados).
- **Editor de demos** en el navegador (usuarios con rol *editor* o *admin*).
- **Constellation**, **Check** (check altavoces, stop, reset AVB) y **ON/OFF** de la sala, igual que en la app de iPad.
- **Usuarios** con tres roles: *operador* (lanza), *editor* (crea y edita demos) y *admin* (además ajustes y usuarios).
- **Importar/exportar** el archivo `QLab-Remote-Cues.qlabremote.json` de la app de iPad.
- **Registro** de todo lo enviado y de quién lanzó cada demo.

Sin dependencias externas: solo Node.js 20 o posterior.

## Instalación en el Mac

1. Instala Node.js (LTS) desde <https://nodejs.org> o con Homebrew: `brew install node`.
2. Copia o clona este repositorio en el Mac, por ejemplo en `~/Sala-In`.
3. Arranca la web:

   ```sh
   cd ~/Sala-In/web
   npm start
   ```

   En la consola aparecen las direcciones, por ejemplo `→ http://192.168.1.50:8080`.
4. Abre esa dirección desde el propio Mac o un móvil en la misma Wi‑Fi. La primera vez pide crear el
   usuario administrador.
5. En **Ajustes**:
   - **QLab**: si la web corre en el mismo Mac que QLab, IP `127.0.0.1`, puerto `53000`, el nombre del
     workspace y el passcode de *Workspace Settings → Network → OSC Access* (necesita permiso *control*).
   - **WATCHOUT**: IP del equipo donde corre el Director (en la sala, **WO-SUELO**), puerto `3019`.
     Al guardar, la web lee la lista de timelines con sus IDs para usarlos en los pasos.
   - **Usuarios**: crea los usuarios de la sala.
   - **Importar**: sube el `.qlabremote.json` exportado desde la app de iPad para traer las demos,
     los botones de Constellation y los comandos.

Los datos se guardan en `web/data/` (configuración, ajustes, usuarios con contraseñas cifradas con
scrypt). Haz copia de esa carpeta si quieres conservarlos. No se sube al repositorio.

### Arranque automático

`deploy/es.rmsproaudio.salain.plist` arranca la web al iniciar sesión y la reinicia si se cierra.
Edita las rutas del archivo (instrucciones dentro) y:

```sh
cp deploy/es.rmsproaudio.salain.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/es.rmsproaudio.salain.plist
```

La primera vez, macOS preguntará si permites a `node` aceptar conexiones entrantes: pulsa **Permitir**.

### Recomendaciones de red

- Da al Mac una **IP fija** (o una reserva DHCP en el router) para que la dirección no cambie.
- La Wi‑Fi de la sala debe permitir que los móviles vean al Mac (sin aislamiento de clientes).
- La web usa HTTP dentro de la red de la sala. Úsala solo en esa red; no la publiques en internet.

## Comprobaciones al llegar a la sala

1. Desde el Terminal del Mac, comprueba la API de WATCHOUT (cambia la IP por la de WO-SUELO):

   ```sh
   curl http://IP-WO-SUELO:3019/info           # versión de WATCHOUT
   curl http://IP-WO-SUELO:3019/v0/timelines   # timelines con sus IDs
   curl -X POST http://IP-WO-SUELO:3019/v0/play/24   # lanza «Cine ASTRYA» (ID 24)
   curl -X POST http://IP-WO-SUELO:3019/v0/stop/24
   ```

   Si `/v0/timelines` responde con un formato distinto y la web no muestra la lista, los pasos siguen
   funcionando escribiendo el ID a mano. Pásame la respuesta para ajustarlo.
2. En la web, **Ajustes** debe mostrar QLab y WATCHOUT en verde.
3. Crea una demo de prueba con un paso *WATCHOUT: reproducir timeline* y otro de QLab, y lánzala.

## Desarrollo y pruebas sin la sala

Simuladores incluidos:

```sh
npm run mock:qlab       # QLab falso en UDP 53000 (PASSCODE=1234 para exigir passcode)
npm run mock:watchout   # WATCHOUT falso en http://localhost:3019 con timelines de ejemplo
npm run dev             # web con recarga automática
npm test                # pruebas (codec OSC, modelo, ejecutor y flujo completo con los simuladores)
```

Configura en Ajustes QLab `127.0.0.1:53000` y WATCHOUT `127.0.0.1:3019`.

## Compatibilidad con la app de iPad

El archivo exportado mantiene el formato de la app, así que puede ir y volver. Dos diferencias:

- Los pasos y botones de **WATCHOUT** solo existen en la web. La app de iPad no los reconoce: si una
  demo los usa, no la importes en el iPad.
- Los comandos OSC admiten argumentos separados por espacios (`/cue/1/sliderLevel 0 -10`). La app de
  iPad envía el texto entero como dirección.

## Siguiente fase: presentaciones por NDI

Pendiente de probar en la sala. Plan: Keynote en pantalla completa en el Mac → NDI (NDI Tools
Scan Converter o alternativas) → fuente *NDI Capture* en un timeline «Presentación» de WATCHOUT 7
colocada sobre la tira de las 4 paredes. La web tendrá un tipo de demo «Presentación» para subir el
archivo, abrirlo en Keynote y pasar diapositivas (AppleScript: `show next` / `show previous`).
