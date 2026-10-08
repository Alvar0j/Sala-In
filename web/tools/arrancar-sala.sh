#!/bin/bash
# Arranca todo lo necesario para las presentaciones en la sala (macOS).
#
#   bash ~/Sala-In/web/tools/arrancar-sala.sh                  # arrancar
#   bash ~/Sala-In/web/tools/arrancar-sala.sh --parar          # parar (no toca QLab)
#   bash ~/Sala-In/web/tools/arrancar-sala.sh --acceso-directo # icono en el Escritorio
#   bash ~/Sala-In/web/tools/arrancar-sala.sh --instalar-inicio # arrancar solo al iniciar sesión
#   bash ~/Sala-In/web/tools/arrancar-sala.sh --quitar-inicio   # dejar de arrancar solo
#
# Orden: pantalla virtual (BetterDisplay) → OBS con la salida NDI → web Sala-In →
# Keynote preparado → evitar reposo → comprobación final.
# Variables opcionales: PANTALLA_VIRTUAL (por defecto "Keynote NDI"), PORT (8080).

PANTALLA_VIRTUAL="${PANTALLA_VIRTUAL:-Keynote NDI}"
PORT="${PORT:-8080}"
WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/Library/Logs/Sala-In"
PID_WEB="$LOG_DIR/web.pid"
PID_CAFE="$LOG_DIR/caffeinate.pid"
mkdir -p "$LOG_DIR"

# Colores solo en el Terminal; en el registro (arranque.log) se escribe texto limpio.
if [ -t 1 ]; then V=$'\033[32m'; A=$'\033[33m'; R=$'\033[31m'; N=$'\033[1m'; X=$'\033[0m'; else V=; A=; R=; N=; X=; fi
ok()   { printf '  %s✓%s %s\n' "$V" "$X" "$1"; }
warn() { printf '  %s!%s %s\n' "$A" "$X" "$1"; }
fail() { printf '  %s✗%s %s\n' "$R" "$X" "$1"; }
paso() { printf '\n%s%s%s\n' "$N" "$1" "$X"; }

app_abierta() { pgrep -x "$1" >/dev/null 2>&1 || pgrep -f "/$1.app/" >/dev/null 2>&1; }
pantalla_conectada() { system_profiler SPDisplaysDataType 2>/dev/null | grep -qi "$PANTALLA_VIRTUAL"; }
web_activa() { curl -s -m 2 "http://127.0.0.1:$PORT/api/session" >/dev/null 2>&1; }

betterdisplay() {
  # Herramienta de línea de comandos de BetterDisplay (requiere activar la integración en
  # BetterDisplay → Ajustes → Aplicación → Integración; algunas funciones son de la versión Pro).
  if command -v betterdisplaycli >/dev/null 2>&1; then betterdisplaycli "$@"
  elif [ -x /Applications/BetterDisplay.app/Contents/MacOS/BetterDisplay ]; then /Applications/BetterDisplay.app/Contents/MacOS/BetterDisplay "$@"
  else return 1; fi
}

# ---------------------------------------------------------------------------------------------
AGENTE="$HOME/Library/LaunchAgents/es.rmsproaudio.salain.arranque.plist"
if [ "$1" = "--instalar-inicio" ]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  # launchd arranca con un PATH mínimo: se añaden las rutas donde suelen estar node y brew.
  cat > "$AGENTE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>es.rmsproaudio.salain.arranque</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WEB_DIR/tools/arrancar-sala.sh</string>
    <string>--al-iniciar</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/arranque.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/arranque.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)" "$AGENTE" >/dev/null 2>&1
  launchctl bootstrap "gui/$(id -u)" "$AGENTE" 2>/dev/null || launchctl load "$AGENTE"
  echo "Listo: se arrancará solo cada vez que este usuario inicie sesión."
  echo "Registro de cada arranque: $LOG_DIR/arranque.log"
  echo
  echo "IMPORTANTE para que funcione tras un reinicio sin nadie delante:"
  echo "  Ajustes del Sistema → Usuarios y grupos → «Iniciar sesión automáticamente como» → $(whoami)"
  echo "  (si FileVault está activado, macOS no permite el inicio de sesión automático)."
  exit 0
fi
if [ "$1" = "--quitar-inicio" ]; then
  launchctl bootout "gui/$(id -u)" "$AGENTE" >/dev/null 2>&1 || launchctl unload "$AGENTE" >/dev/null 2>&1
  rm -f "$AGENTE"
  echo "Quitado: ya no se arrancará solo al iniciar sesión."
  exit 0
fi
if [ "$1" = "--al-iniciar" ]; then
  # Recién iniciada la sesión, el escritorio, la red y BetterDisplay tardan en estar listos.
  echo "=== Arranque automático $(date) ==="
  sleep 30
fi

if [ "$1" = "--acceso-directo" ]; then
  DESTINO="$HOME/Desktop/Arrancar Sala-In.command"
  printf '#!/bin/bash\nbash "%s"\necho\nread -n 1 -s -r -p "Pulsa una tecla para cerrar esta ventana…"\n' "$WEB_DIR/tools/arrancar-sala.sh" > "$DESTINO"
  chmod +x "$DESTINO"
  DESTINO_STOP="$HOME/Desktop/Parar Sala-In.command"
  printf '#!/bin/bash\nbash "%s" --parar\necho\nread -n 1 -s -r -p "Pulsa una tecla para cerrar esta ventana…"\n' "$WEB_DIR/tools/arrancar-sala.sh" > "$DESTINO_STOP"
  chmod +x "$DESTINO_STOP"
  echo "Creados en el Escritorio: «Arrancar Sala-In» y «Parar Sala-In» (doble clic para usarlos)."
  echo "La primera vez macOS puede pedir confirmación: clic derecho → Abrir."
  exit 0
fi

# ---------------------------------------------------------------------------------------------
if [ "$1" = "--parar" ]; then
  paso "Parando la configuración de presentaciones (QLab no se toca)"
  if app_abierta Keynote; then
    osascript -e 'tell application "Keynote"' -e 'if playing then stop front document' -e 'close every document saving no' -e 'end tell' >/dev/null 2>&1
    ok "Presentación de Keynote cerrada"
  fi
  if [ -f "$PID_WEB" ] && kill -0 "$(cat "$PID_WEB")" 2>/dev/null; then
    kill "$(cat "$PID_WEB")" && rm -f "$PID_WEB" && ok "Web Sala-In parada"
  elif web_activa; then
    warn "La web sigue en marcha porque no la arrancó este script (arranque automático o una ventana de Terminal)"
  fi
  if app_abierta OBS; then osascript -e 'quit app "OBS"' >/dev/null 2>&1; ok "OBS cerrado"; fi
  if [ -f "$PID_CAFE" ]; then kill "$(cat "$PID_CAFE")" 2>/dev/null; rm -f "$PID_CAFE"; ok "El Mac vuelve a poder dormir"; fi
  if betterdisplay set -namelike="$PANTALLA_VIRTUAL" -connected=off >/dev/null 2>&1; then ok "Pantalla virtual desconectada"
  else warn "Desconecta la pantalla virtual a mano en BetterDisplay si quieres"; fi
  exit 0
fi

# ---------------------------------------------------------------------------------------------
echo "Arrancando la sala…  (registro en $LOG_DIR)"

paso "1. Pantalla virtual «$PANTALLA_VIRTUAL» (BetterDisplay)"
if [ ! -d /Applications/BetterDisplay.app ]; then
  fail "BetterDisplay no está en Aplicaciones"
else
  app_abierta BetterDisplay || { open -g -a BetterDisplay; sleep 4; }
  if pantalla_conectada; then
    ok "Ya estaba conectada"
  else
    betterdisplay set -namelike="$PANTALLA_VIRTUAL" -connected=on >/dev/null 2>&1
    for _ in 1 2 3 4 5 6 7 8 9 10; do pantalla_conectada && break; sleep 1; done
    if pantalla_conectada; then
      ok "Conectada"
    else
      warn "No se ha podido conectar sola (la línea de comandos de BetterDisplay puede necesitar Pro o estar desactivada)."
      warn "Conéctala tú: icono de BetterDisplay → «$PANTALLA_VIRTUAL» → Conectar. Espero hasta 60 s…"
      for _ in $(seq 1 60); do pantalla_conectada && break; sleep 1; done
      pantalla_conectada && ok "Conectada" || fail "Sigue sin conectarse: Keynote presentará en tu monitor"
    fi
  fi
fi

paso "2. OBS con la salida NDI"
if [ ! -d /Applications/OBS.app ]; then
  fail "OBS no está en Aplicaciones"
elif app_abierta OBS; then
  warn "OBS ya estaba abierto. Si se abrió ANTES que la pantalla virtual, ciérralo (⌘Q) y vuelve a lanzar este script"
else
  # --disable-shutdown-check evita el aviso de «modo seguro» si OBS se cerró mal la última vez.
  open -g -a OBS --args --minimize-to-tray --disable-shutdown-check
  sleep 6
  app_abierta OBS && ok "OBS abierto (la salida NDI «Keynote Sala» arranca sola si quedó activada)" || fail "OBS no ha arrancado"
fi

paso "3. Web Sala-In"
if web_activa; then
  ok "Ya estaba en marcha en el puerto $PORT"
else
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js no está instalado"
  else
    # exec: el PID guardado es el de node, para poder pararlo con --parar.
    (cd "$WEB_DIR" && exec nohup node src/server.js >> "$LOG_DIR/web.log" 2>&1) &
    echo $! > "$PID_WEB"
    for _ in 1 2 3 4 5 6 7 8 9 10; do web_activa && break; sleep 1; done
    web_activa && ok "Arrancada (registro: $LOG_DIR/web.log)" || fail "No arranca: mira $LOG_DIR/web.log"
  fi
fi

paso "4. Keynote y QLab"
if [ -d /Applications/Keynote.app ]; then
  app_abierta Keynote || open -g -a Keynote
  ok "Keynote preparado (la web abrirá la presentación al lanzarla)"
else
  fail "Keynote no está instalado"
fi
app_abierta QLab && ok "QLab abierto" || warn "QLab no está abierto: ábrelo con el workspace de la sala"

paso "5. Evitar que el Mac se duerma"
if [ -f "$PID_CAFE" ] && kill -0 "$(cat "$PID_CAFE")" 2>/dev/null; then
  ok "Ya activo"
else
  nohup caffeinate -dimsu >/dev/null 2>&1 &
  echo $! > "$PID_CAFE"
  ok "Activo hasta que uses --parar o reinicies"
fi

paso "Resumen"
IP_WIFI="$(ipconfig getifaddr en1 2>/dev/null)"
NOMBRE="$(scutil --get LocalHostName 2>/dev/null)"
pantalla_conectada && ok "Pantalla virtual conectada" || fail "Pantalla virtual NO conectada"
app_abierta OBS && ok "OBS abierto" || fail "OBS cerrado"
web_activa && ok "Web en marcha" || fail "Web parada"
echo
echo "  Desde el móvil:  http://${IP_WIFI:-IP-del-Mac}:$PORT"
[ -n "$NOMBRE" ] && echo "               o:  http://$NOMBRE.local:$PORT"
echo
echo "  Recuerda en la web: Ajustes → QLab y WATCHOUT en verde."
