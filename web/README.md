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
- **Presentaciones**: subir un Keynote o PowerPoint desde el móvil y presentarlo en las 4 paredes con mando de diapositivas (ver más abajo).
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

## Verla en tu ordenador (modo demostración)

Para ver la web completa sin estar en la sala, con QLab y WATCHOUT simulados y demos de ejemplo:

```sh
cd Sala-In/web
npm run demo
```

Abre <http://localhost:8080> y entra con **admin / demo1234** (todo) o **sala / demo1234** (solo lanzar).
Desde el móvil, en la misma Wi‑Fi, usa la IP del ordenador: `http://IP-del-ordenador:8080`.
Usa su propia carpeta `data-demo/` y puertos distintos de los reales, así que no afecta a la sala.
`npm run demo -- --reset` restaura los datos de ejemplo. `PORT=9000 npm run demo` cambia el puerto.

### Dónde tocar la estética

- `public/styles.css`: colores (variables al principio: `--bg`, `--surface`, `--accent`, `--ok`, `--danger`…),
  tipografía, tamaños de botones (`.big-button`), tarjetas (`.card`, `.demo-card`) y la barra inferior (`.tabs`).
- `public/app.js`: textos, iconos disponibles (`ICONS`), paleta de colores del editor (`COLORS`) y la
  estructura de cada pantalla (funciones `demosView`, `demoDetailView`, `constellationView`, `checkView`…).
- `public/img/`: logos e icono de la app.

Basta con guardar y recargar el navegador: no hay que compilar ni reiniciar el servidor.

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

- Los pasos y botones de **WATCHOUT** y de **presentaciones** solo existen en la web. La app de iPad no los reconoce: si una
  demo los usa, no la importes en el iPad.
- Los comandos OSC admiten argumentos separados por espacios (`/cue/1/sliderLevel 0 -10`). La app de
  iPad envía el texto entero como dirección.

## Presentaciones (Keynote en las 4 paredes)

Desde **Demos → ＋ Presentación** se sube un Keynote (`.key`) o PowerPoint (`.pptx`) y se crea una demo que:

1. **Al lanzar**: abre el archivo en Keynote en este Mac, empieza la presentación a pantalla completa y
   reproduce en WATCHOUT el timeline de presentaciones (el que tiene la fuente NDI).
2. **Mientras está en curso**: el móvil muestra el mando de diapositivas (Anterior / Siguiente, ir a una
   diapositiva). «Siguiente» avanza también las animaciones, igual que el clicker. En un ordenador valen las
   flechas del teclado y la barra espaciadora. El mando también aparece en el banner de la demo activa.
3. **Al finalizar** (o al lanzar otra demo): para el timeline de WATCHOUT y cierra Keynote.

Los archivos subidos se gestionan en **Demos → 📁** (máximo 2 GB por archivo). Los pasos
«Presentación: abrir y empezar» y «Presentación: cerrar» se pueden añadir a cualquier demo en el editor.

Sobre los archivos de Keynote: si el navegador no deja elegir un `.key` (ocurre cuando está guardado como
paquete), en Keynote usa **Archivo → Avanzado → Cambiar tipo de archivo → Archivo único**, o comprímelo en
`.zip` y sube el `.zip`. Los `.pptx` los abre Keynote importándolos (puede cambiar alguna fuente o transición).

### Puesta a punto en la sala (una sola vez)

1. **Keynote en el Mac** donde corre la web. En *Keynote → Ajustes → Presentación*, elige en qué pantalla se
   presenta. Para la resolución ultra-ancha de las 4 paredes se puede crear una pantalla virtual con
   BetterDisplay.
2. **NDI**: instala NDI Tools y abre **NDI Scan Converter** capturando esa pantalla. Si no detecta la pantalla
   de Keynote, la alternativa probada por otros usuarios es *Sienna NDI ScanConverter* (App Store, de pago).
3. **WATCHOUT 7**: crea un timeline «Presentación» con una fuente *NDI Capture* colocada sobre la tira de las
   4 paredes y un fondo fijo en el suelo.
4. **Web → Ajustes → Presentaciones**: reproductor «Keynote en este Mac» y el timeline del paso 3.
5. La primera vez que la web abra Keynote, macOS pedirá permiso para que *node* controle Keynote: pulsa
   **Aceptar**. Si se deniega, se cambia en *Ajustes del Sistema → Privacidad y seguridad → Automatización*.

La web debe ejecutarse con la sesión del usuario abierta en el Mac (el arranque automático de
`deploy/` ya lo hace así); Keynote necesita la pantalla del usuario para presentar.

En el modo demostración y en pruebas se usa el reproductor **simulado** (12 diapositivas ficticias).
