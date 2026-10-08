#!/bin/bash
# Diagnóstico de red de la sala (macOS). Solo lee información, no cambia nada.
# Uso:  bash ~/Sala-In/web/tools/diagnostico-red.sh
# Genera ~/Desktop/diagnostico-sala.txt para pasárselo a Claude.

OUT="$HOME/Desktop/diagnostico-sala.txt"
WO_IP="${WO_IP:-192.168.0.12}"
QLAB_IP="${QLAB_IP:-192.168.0.109}"
PRODUCER_IP="${PRODUCER_IP:-192.168.0.10}"
WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"

section() { printf '\n==================== %s ====================\n' "$1"; }

{
  section "EQUIPO"
  echo "Nombre: $(scutil --get ComputerName 2>/dev/null)"
  echo "Usuario: $(whoami)"
  sw_vers 2>/dev/null
  echo "Node: $(node -v 2>/dev/null || echo 'no instalado')"
  echo "Fecha: $(date)"

  section "ADAPTADORES DE RED"
  networksetup -listallhardwareports 2>/dev/null | awk '/Hardware Port/{port=substr($0,16)} /Device/{print port " -> " $2}' | while IFS= read -r line; do
    dev="${line##*-> }"
    ip="$(ipconfig getifaddr "$dev" 2>/dev/null)"
    mask="$(ipconfig getoption "$dev" subnet_mask 2>/dev/null)"
    router="$(ipconfig getoption "$dev" router 2>/dev/null)"
    status="$(ifconfig "$dev" 2>/dev/null | awk '/status:/{print $2}')"
    printf '%-40s estado=%-9s ip=%-16s mascara=%-16s router=%s\n' "$line" "${status:--}" "${ip:--}" "${mask:--}" "${router:--}"
  done
  echo
  echo "Configuración IP de cada servicio de red:"
  networksetup -listallnetworkservices 2>/dev/null | tail -n +2 | while IFS= read -r svc; do
    echo "--- $svc"
    networksetup -getinfo "$svc" 2>/dev/null | grep -E 'DHCP|Manual|IP address|Subnet|Router' | sed 's/^/    /'
  done

  section "WI-FI"
  WIFI_DEV="$(networksetup -listallhardwareports 2>/dev/null | awk '/Wi-Fi/{getline; print $2; exit}')"
  echo "Dispositivo Wi-Fi: ${WIFI_DEV:--}"
  [ -n "$WIFI_DEV" ] && networksetup -getairportnetwork "$WIFI_DEV" 2>/dev/null
  echo
  echo "Redes Wi-Fi (actual y disponibles):"
  system_profiler SPAirPortDataType 2>/dev/null | sed -n '/Current Network Information:/,/Software Versions:/p; /Other Local Wi-Fi Networks:/,$p' | grep -vE 'MAC Address|Serial' | head -80

  section "RUTAS"
  netstat -rn -f inet 2>/dev/null | head -30

  section "DNS"
  scutil --dns 2>/dev/null | awk '/nameserver/{print $3}' | sort -u

  section "EQUIPOS VISTOS EN LA RED (ARP)"
  arp -an 2>/dev/null | grep -v incomplete | awk '{print $2, "en", $6}' | tr -d '()' | sort -u

  section "CONEXIÓN CON LOS EQUIPOS DE LA SALA"
  for target in "WATCHOUT (WO-SUELO)=$WO_IP" "QLab (Mac mini)=$QLAB_IP" "Portátil Producer=$PRODUCER_IP"; do
    name="${target%%=*}"; ip="${target##*=}"
    if ping -c 1 -t 2 "$ip" >/dev/null 2>&1; then r="responde"; else r="NO responde"; fi
    echo "ping $name $ip: $r (ruta por: $(route -n get "$ip" 2>/dev/null | awk '/interface:/{print $2}'))"
  done
  echo
  echo "API de WATCHOUT ($WO_IP:3019/info):"
  curl -s -m 4 "http://$WO_IP:3019/info" || echo "  sin respuesta"
  echo
  echo "Web Sala-In en este equipo (127.0.0.1:${PORT:-8080}):"
  curl -s -m 3 "http://127.0.0.1:${PORT:-8080}/api/session" || echo "  no está arrancada"
  echo

  section "PROGRAMAS ESCUCHANDO EN LA RED"
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR==1 || /QLab|node|obs|OBS|NDI|BetterDisplay|Keynote/' | awk '{print $1, $9}' | sort -u
  lsof -nP -iUDP 2>/dev/null | awk '/QLab|node/{print $1, $9}' | sort -u

  section "CORTAFUEGOS"
  /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null
  /usr/libexec/ApplicationFirewall/socketfilterfw --getblockall 2>/dev/null

  section "APLICACIONES"
  for app in QLab Keynote OBS BetterDisplay "NDI Video Monitor"; do
    if pgrep -fiq "$app"; then echo "$app: abierta"; else echo "$app: cerrada"; fi
  done

  section "AJUSTES DE LA WEB (sin passcode)"
  if [ -f "$WEB_DIR/data/settings.json" ]; then
    node -e 'const s=require(process.argv[1]); if (s.qlab) s.qlab.passcode = s.qlab.passcode ? "(guardado)" : ""; console.log(JSON.stringify(s, null, 2))' "$WEB_DIR/data/settings.json" 2>/dev/null
  else
    echo "No hay $WEB_DIR/data/settings.json (la web aún no se ha configurado en este equipo)"
  fi
} > "$OUT" 2>&1

echo "Listo. Diagnóstico guardado en: $OUT"
echo "Ábrelo con:  open \"$OUT\"   y copia su contenido a Claude."
