# QLab Remote Cues

Aplicación nativa iOS/iPadOS para controlar QLab 5 mediante OSC sobre UDP.

## Puesta en marcha

1. Abre `QLabRemoteCues.xcodeproj`.
2. Selecciona tu equipo de firma y un iPhone/iPad con iOS 17 o posterior.
3. En QLab activa **Workspace Settings → Network → OSC Access**.
4. Crea un perfil con IP, puerto (53000 por defecto), nombre/ID del workspace y passcode.
5. Acepta el permiso de red local la primera vez.

No se usan dependencias de terceros. El passcode se guarda en Keychain y las configuraciones permanecen en el dispositivo.

## Versión web

La carpeta [`web/`](web/README.md) contiene un servidor para el Mac de la sala: cualquier usuario conectado a la Wi‑Fi lanza y edita las demos desde el navegador, sin conectarse a QLab, y además controla timelines de WATCHOUT 7. Instrucciones en [`web/README.md`](web/README.md).

## Flujo de demos

La pestaña **Demos** permite preparar una experiencia completa sin que el operador tenga que conocer OSC:

1. Crea una demo con `+`.
2. Añade pasos a **Preparación**, **Lanzamiento** y **Finalización**.
3. Configura cada dirección OSC exactamente como deba enviarse.
4. Añade esperas, confirmaciones o instrucciones entre comandos.
5. Añade controles opcionales que estarán disponibles mientras se presenta la demo.
6. Usa **Preparar**, **Lanzar demo** y **Finalizar** desde la pantalla operativa.

La configuración completa se puede compartir como `QLab-Remote-Cues.qlabremote.json`. Incluye demos, paneles y perfiles de conexión, pero nunca los passcodes almacenados en Keychain.

## Servidor simulado

Desde Terminal:

```sh
swift run MockQLabServer
```

El mock escucha UDP 53000 y devuelve una versión y una lista mínima de cues. Para recibir sus respuestas en el listener separado de la app puede ser necesario adaptar el mock al puerto de respuesta del dispositivo; está pensado principalmente para inspección local y pruebas de codec.

## Limitaciones conocidas

- La lista usa `/cueLists/shallow`, ya que la documentación de QLab advierte que listas anidadas completas pueden superar el máximo de un datagrama UDP. Una versión futura puede añadir OSC/TCP con framing SLIP.
- Bonjour está encapsulado y usa `_qlab._tcp`; la detección puede depender de la versión/configuración de QLab. La conexión manual siempre está disponible.
- Las rutas están centralizadas en `Services/QLabOSCPath.swift` y apuntan a QLab 5.
