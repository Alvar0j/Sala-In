<p align="center">
  <img src="public/img/icon.png" width="72" alt="Sala-In">
</p>

<h1 align="center">Guía de Sala-In</h1>

<p align="center">
  Instalación en el Mac mini, configuración y uso diario de la web de la sala.<br>
  <a href="../README.md">← Volver a la portada</a>
</p>

---

**Contenido**

1. [Antes de empezar](#1-antes-de-empezar)
2. [Instalar en el Mac mini](#2-instalar-en-el-mac-mini)
3. [Configurar las conexiones](#3-configurar-las-conexiones)
4. [Probar desde el móvil](#4-probar-desde-el-móvil)
5. [Presentaciones con Keynote](#5-presentaciones-con-keynote)
6. [Arranque automático](#6-arranque-automático)
7. [Uso diario](#7-uso-diario)
8. [Solución de problemas](#8-solución-de-problemas)
9. [Modo demostración y estética](#9-modo-demostración-y-estética)
10. [Para desarrolladores](#10-para-desarrolladores)

---

## 1. Antes de empezar

| Necesitas | Dónde se comprueba |
|---|---|
| **Mac mini** con QLab 5 y la sesión de usuario iniciada | — |
| **Node.js 20 o posterior** | Terminal: `node -v` |
| QLab con **OSC Access** activado y un passcode con permiso *control* | QLab → *Workspace Settings → Network* |
| **IP del Director de WATCHOUT** (equipo WO-SUELO) | En WO-SUELO: `ipconfig` en la consola de Windows |
| Keynote y **NDI Tools** (solo para presentaciones) | App Store · [ndi.video/tools](https://ndi.video/tools/) |

> [!TIP]
> Si en Terminal `node -v` dice *command not found*, instala Node.js (versión LTS) con el instalador `.pkg`
> de [nodejs.org](https://nodejs.org). No hace falta Homebrew.

## 2. Instalar en el Mac mini

**1. Descarga el proyecto.** La forma más sencilla: en GitHub abre la rama `claude/peaceful-gauss-az6pog`,
pulsa **Code → Download ZIP** y descomprímelo en tu carpeta de usuario. O, si tienes git:

```sh
cd ~
git clone -b claude/peaceful-gauss-az6pog https://github.com/Alvar0j/Sala-In.git
```

**2. Arranca la web:**

```sh
cd ~/Sala-In/web
npm start
```

Verás algo así (la IP será la del Mac):

```
Sala-In web escuchando en el puerto 8080. Datos en /Users/sala/Sala-In/web/data
  → http://192.168.1.50:8080
```

> [!NOTE]
> Si macOS pregunta si `node` puede **aceptar conexiones entrantes**, pulsa **Permitir**. Sin eso los móviles
> no podrán entrar. Deja la ventana de Terminal abierta: al cerrarla se para la web (en el
> [paso 6](#6-arranque-automático) se configura para que arranque sola).

**3. Crea el administrador.** Abre `http://localhost:8080` en Safari, en el propio Mac. La primera vez pide
un usuario y una contraseña de administrador.

## 3. Configurar las conexiones

Todo se hace en **⚙️ Ajustes**. Cada sección muestra un punto verde cuando la conexión funciona.

### QLab

| Campo | Valor |
|---|---|
| IP del Mac de QLab | `127.0.0.1` (QLab está en el mismo Mac) |
| Puerto OSC | `53000` |
| Workspace | Nombre del workspace, tal como aparece en QLab (vacío = el que esté delante) |
| Puerto local para respuestas | `53001` |
| Passcode | El de *OSC Access* |

### WATCHOUT 7

Antes de tocar la web, comprueba desde Terminal que el Mac llega al Director (cambia la IP):

```sh
curl http://192.168.1.XX:3019/info            # debe responder con la versión de WATCHOUT
curl http://192.168.1.XX:3019/v0/timelines    # lista de timelines con su ID
```

Después, en Ajustes: **IP del Director** y puerto `3019`. Al guardar, la web lee los timelines y los ofrece
por nombre en el editor.

> [!IMPORTANT]
> Si `curl` no responde, el firewall de Windows de WO-SUELO puede estar bloqueando el puerto 3019. Si responde
> pero la web no muestra la lista de timelines, los pasos siguen funcionando escribiendo el ID a mano;
> guarda la salida de `curl .../v0/timelines` para ajustar la web a su formato.

### Traer las demos del iPad

En la app de iPad, exporta la configuración (`QLab-Remote-Cues.qlabremote.json`), pásala al Mac por AirDrop y
en **Ajustes → Importar / exportar** súbela. Se importan demos, botones de Constellation y comandos. El
passcode no viaja en el archivo.

### Usuarios

En **Ajustes → Usuarios** crea las cuentas de la sala:

| Rol | Puede |
|---|---|
| **Operador** | Lanzar y finalizar demos, usar los mandos, Constellation y Check |
| **Editor** | Lo anterior, y crear y editar demos y subir presentaciones |
| **Admin** | Todo, incluidos ajustes y usuarios |

## 4. Probar desde el móvil

1. Conecta el móvil a la Wi‑Fi de la sala.
2. Abre la dirección que mostró Terminal, por ejemplo `http://192.168.1.50:8080`, y entra con tu usuario.
3. En Safari, **Compartir → Añadir a pantalla de inicio**: queda como una app más.
4. Crea una demo de prueba con un paso *Comando OSC* y otro *WATCHOUT: reproducir timeline*, lánzala y mira
   **📜 Registro**: cada comando aparece como enviado o con su error.

## 5. Presentaciones con Keynote

Se hace en dos partes: primero comprobar que la web controla Keynote y después llevar la imagen a las paredes.

### 5.1 Que la web controle Keynote

1. **Ajustes → Presentaciones**: reproductor **Keynote en este Mac**. Guarda.
2. **Demos → ＋ Presentación**: sube un Keynote corto con alguna animación y pulsa **Crear**.
3. Lanza la demo. Keynote debe abrirse y empezar la presentación.
4. La primera vez, macOS pide permiso para que **Terminal** (o **node**, con el arranque automático) controle
   Keynote: pulsa **Aceptar**.
5. Pulsa **Siguiente** en el móvil: debe avanzar la animación o la diapositiva.

> [!WARNING]
> Al abrir una presentación, la web **cierra sin guardar** los documentos que haya abiertos en Keynote.
> No trabajes en Keynote en el Mac de la sala mientras se usa la web.

> [!TIP]
> Si el navegador no deja elegir un `.key`, está guardado como paquete: en Keynote usa **Archivo → Avanzado →
> Cambiar tipo de archivo → Archivo único**, o comprímelo en `.zip`. Los `.pptx` los abre Keynote importándolos.

### 5.2 Llevar Keynote a las cuatro paredes

1. **Pantalla para Keynote.** Si Keynote presenta en la pantalla principal del Mac mini, tapa QLab mientras dura
   la presentación. Crea una **pantalla virtual de 7000 × 600** (por ejemplo con BetterDisplay; la función puede
   requerir su licencia) y en **Keynote → Ajustes → Presentación** elige esa pantalla. Las medidas de la sala y la
   plantilla de diapositivas están en [docs/plantilla](../docs/plantilla/README.md).
2. **NDI.** Abre **NDI Scan Converter** (de NDI Tools) capturando esa pantalla. Si no la detecta, otros usuarios
   lo han resuelto con *Sienna NDI ScanConverter* (App Store, de pago).
3. **WATCHOUT.** En Producer crea un timeline **«Presentación»** con una fuente **NDI Capture** en x = 0, y = 0
   escalada al 200 % (cubre la tira de 14000 × 1200 de las 4 paredes) y un fondo fijo en el suelo.
4. **Ajustes → Presentaciones**: elige ese timeline. Las presentaciones nuevas lo reproducen al lanzar y lo
   paran al finalizar.

Qué observar en la prueba: calidad en las paredes, retardo al pulsar *Siguiente* y consumo del Mac en el
Monitor de Actividad mientras QLab suena.

## 6. Arranque automático

Para que la web arranque al encender el Mac y se reinicie si se cierra:

1. Abre `deploy/es.rmsproaudio.salain.plist` y cambia `RUTA_AL_REPO` por la carpeta del proyecto
   (por ejemplo `/Users/sala/Sala-In`). Comprueba la ruta de node con `which node` y ponla en el archivo.
2. En Terminal:

   ```sh
   cp deploy/es.rmsproaudio.salain.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/es.rmsproaudio.salain.plist
   ```

El registro de la web queda en `/tmp/salain.log`. Para pararla:
`launchctl unload ~/Library/LaunchAgents/es.rmsproaudio.salain.plist`.

> [!TIP]
> Da al Mac mini una **IP fija** (o una reserva DHCP en el router) para que la dirección de la web no cambie.

## 7. Uso diario

| Quiero… | Dónde |
|---|---|
| Encender o apagar la sala | **Demos** → *Encender sala* / *Apagar sala* |
| Lanzar una demo | **Demos** → la demo → *▶ Lanzar demo*. Si había otra en curso, se finaliza antes |
| Pasar diapositivas | Pantalla de la demo, o el mando pequeño del banner superior desde cualquier pantalla |
| Terminar | *Finalizar demo* en el banner |
| Parar una demo a medias sin finalizarla | *Detener* en el banner |
| Crear una presentación | **Demos → ＋ Presentación** |
| Ver qué se ha enviado y quién | **📜 Registro** |

Los datos (demos, ajustes, usuarios y archivos subidos) se guardan en `web/data/`. Haz copia de esa carpeta
de vez en cuando. No se sube al repositorio.

## 8. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El móvil no abre la web | Móvil en otra red, o firewall del Mac | Misma Wi‑Fi; *Ajustes del Sistema → Red → Firewall* → permitir `node` |
| QLab en rojo: *QLab no responde* | OSC Access desactivado o workspace mal escrito | Revisa *Workspace Settings → Network* y el nombre exacto |
| QLab en rojo: *Passcode incorrecto* o *sin permiso de control* | Passcode sin permiso *control* | En QLab, marca *control* para ese passcode |
| WATCHOUT en rojo: *conexión rechazada* | Director cerrado o API no disponible | Abre Producer en WO-SUELO; prueba `curl .../info` |
| WATCHOUT en rojo: *tiempo agotado* | IP incorrecta o firewall de Windows | Comprueba la IP con `ipconfig`; abre el puerto 3019 |
| *macOS no permite que la web controle Keynote* | Permiso de Automatización denegado | *Ajustes del Sistema → Privacidad y seguridad → Automatización* |
| Keynote se abre en la pantalla equivocada | Ajuste de Keynote | *Keynote → Ajustes → Presentación* → pantalla |
| Una demo se queda en *Error* | Un paso ha fallado | El error aparece en la demo y en **Registro**; marca *Continuar si falla* en pasos no críticos |

## 9. Modo demostración y estética

Para ver la web completa en cualquier ordenador, con QLab y WATCHOUT simulados y demos de ejemplo:

```sh
npm run demo                 # → http://localhost:8080 · admin / demo1234 · sala / demo1234
npm run demo -- --reset      # vuelve a los datos de ejemplo
PORT=9000 npm run demo       # en otro puerto
```

Usa su propia carpeta (`data-demo/`) y puertos distintos de los reales: se puede lanzar en el Mac de la sala
sin afectar a QLab.

**Dónde tocar la estética** (guardar y recargar el navegador, sin reiniciar):

| Archivo | Qué contiene |
|---|---|
| `public/styles.css` | Colores (variables del principio: `--bg`, `--surface`, `--accent`, `--ok`, `--danger`), botones, tarjetas, barra inferior |
| `public/app.js` | Textos, iconos disponibles (`ICONS`), paleta del editor (`COLORS`) y la estructura de cada pantalla |
| `public/img/` | Icono y logos |

## 10. Para desarrolladores

```sh
npm test                 # pruebas: OSC, modelo, ejecutor, presentaciones y flujo completo con simuladores
npm run dev              # servidor con recarga automática
npm run mock:qlab        # QLab simulado en UDP 53000 (PASSCODE=1234 para exigir passcode)
npm run mock:watchout    # WATCHOUT simulado en http://localhost:3019
```

| Archivo | Responsabilidad |
|---|---|
| `src/server.js` | Punto de entrada (`PORT`, `HOST`, `DATA_DIR`) |
| `src/app.js` | API HTTP, sesiones, eventos en tiempo real (SSE), archivos estáticos |
| `src/runner.js` | Ejecutor de demos: una sola demo activa, finalización automática al cambiar |
| `src/qlab.js` · `src/osc.js` | Conexión con QLab 5 y codec OSC |
| `src/watchout.js` | Cliente de la API HTTP de WATCHOUT 7 |
| `src/presenter.js` | Control de Keynote por AppleScript y reproductor simulado |
| `src/files.js` | Subida y almacenamiento de presentaciones |
| `src/auth.js` · `src/store.js` · `src/model.js` | Usuarios, persistencia y formato de datos |

**Compatibilidad con la app de iPad.** El archivo exportado mantiene el formato de la app. Los pasos de WATCHOUT
y de presentaciones solo existen en la web: si una demo los usa, no la importes en el iPad. Los comandos OSC con
argumentos separados por espacios también son exclusivos de la web.

**Seguridad.** Contraseñas con scrypt, sesión en cookie firmada, passcodes que nunca salen del servidor y
protección contra peticiones de otros sitios. La web usa HTTP dentro de la red de la sala: úsala solo en esa
red y no la publiques en internet.
