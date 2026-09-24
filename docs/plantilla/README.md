# Plantilla de presentaciones para las 4 paredes

Medidas tomadas del show de WATCHOUT 7 de la sala (`node web/tools/watchout-displays.js 192.168.0.12`):

| Pared | Proyectores (X en el Stage) | Solape | Zona en el Stage |
|---|---|---|---|
| A | A1 = 0 · A2 = 1580 | 340 px | 0 → 3500 |
| B | B1 = 3500 · B2 = 5080 | 340 px | 3500 → 7000 |
| C | C1 = 7000 · C2 = 8580 | 340 px | 7000 → 10500 |
| D | D1 = 10500 · D2 = 12080 | 340 px | 10500 → 14000 |

Cada proyector es de 1920 × 1200. Las 4 paredes forman una tira de **14000 × 1200** (35:3). El suelo
(6 proyectores) no entra en la presentación: lleva un fondo fijo.

## Tamaños

| | Tamaño | En WATCHOUT |
|---|---|---|
| **Diapositiva de Keynote y pantalla virtual** | **7000 × 600** | NDI en x = 0, y = 0, escala **200 %** |
| Alternativa si Keynote no admite 7000 | 5600 × 480 | escala 250 % |

Cada pared ocupa 1750 px de ancho en la diapositiva: A 0–1750, B 1750–3500, C 3500–5250, D 5250–7000.

## Uso

1. En Keynote: **Documento → Tamaño de diapositiva → Personalizado**, 7000 × 600.
2. Pon `guia-paredes-7000x600.png` como fondo en el **maestro** para saber dónde cae cada pared, y
   quítalo (o usa un maestro sin él) antes de presentar.
3. Deja unos 60 px de margen a cada lado de las uniones (zonas más claras de la guía) para que ningún texto
   quede partido entre dos paredes.
