# ⚽ Mundial Blaster 2026 — Quiniela del Mundial

Una quiniela para el Mundial 2026: cada jugador envía sus predicciones (campeón, subcampeón, máximo goleador, equipo revelación y los 4 semifinalistas) y una clasificación interactiva ordena a todos por puntos. Todos los datos viven en una [hoja de Google](https://docs.google.com/spreadsheets/d/1jwXb2Ksj-eRe4M0bVej_YWAHbWBR3p0jT5ojX3NOcjs/edit).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La web — formulario de predicciones + clasificación |
| `main.js` | Lógica del front-end (envío del formulario, clasificación) |
| `config.js` | **Esto lo editas tú** — pega aquí la URL de tu aplicación web |
| `apps-script/Code.gs` | Backend — se pega en el editor de Apps Script de la hoja |

## Puesta en marcha (una sola vez, ~3 minutos)

1. **Abre la hoja de Google** → `Extensiones` → `Apps Script`
2. Borra el código de ejemplo, **pega el contenido completo de `apps-script/Code.gs`** y guarda (💾)
3. En el desplegable de funciones elige **`setupSheets`** → **Ejecutar** → autoriza cuando lo pida
   - Esto crea tres pestañas: `Predicciones`, `Resultados` y `Clasificación`
   - *(Opcional)* ejecuta **`seedDemoData`** para añadir 4 jugadores de prueba — luego borra sus filas en `Predicciones`
4. **Desplegar → Nueva implementación** → icono de engranaje → tipo **Aplicación web**:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier usuario**
   - Pulsa **Desplegar** y copia la **URL de la aplicación web** (termina en `/exec`)
5. Abre `config.js` y pega la URL en `GOOGLE_SCRIPT_URL`
6. Abre `index.html` en el navegador (o sube la carpeta a GitHub Pages / Netlify) — listo ✅

> ⚠️ **Si algún día editas `Code.gs`:** los cambios no se aplican hasta que vuelvas a desplegar —
> `Desplegar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Desplegar`. La URL no cambia.

## Durante el torneo

- Los jugadores envían sus predicciones desde la web. Mismo nombre = se **actualizan** sus picks, así que pueden cambiar de opinión hasta el cierre.
- Las predicciones se **bloquean solas** al inicio del Mundial (11 de junio de 2026 — se configura en `PICKS_DEADLINE` dentro de `Code.gs`; pon `''` para desactivarlo).
- Según haya resultados oficiales, escríbelos en las **celdas amarillas de la pestaña `Resultados`** (campeón, subcampeón, goleador, revelación y los 4 semifinalistas).
- La clasificación de la web se recalcula **en vivo** en cada carga; la pestaña `Clasificación` de la hoja se refresca sola al editar `Resultados`.

## Puntuación (editable en la pestaña `Resultados`)

| Predicción | Puntos |
|---|---|
| 🏆 Campeón | 50 |
| 🥈 Subcampeón | 30 |
| ⚽ Máximo goleador | 25 |
| 💎 Equipo revelación | 20 |
| 🔥 Cada semifinalista acertado | 10 por equipo |

Los empates se deshacen a favor de quien envió antes. La comparación de nombres ignora mayúsculas y acentos ("japon" = "Japón"), pero la grafía debe coincidir — el desplegable de equipos del formulario ayuda a que todos escriban igual (la lista se edita en `index.html` → `<datalist id="team-list">`).

## Endpoints de la API (referencia)

| Método | Llamada | Devuelve |
|---|---|---|
| `GET` | `{URL}?action=leaderboard` | Clasificación completa + resultados + puntuación en JSON |
| `GET` | `{URL}?action=ping` | Comprobación de estado |
| `POST` | `{URL}` con cuerpo JSON `{playerName, champion, runnerUp, goldenBoot, revelation, semi1..semi4}` | `{ok, updated}` |

> Los POST usan `Content-Type: text/plain` a propósito — evita el preflight CORS que las aplicaciones web de Apps Script no saben responder. No lo cambies a `application/json`.

## Problemas frecuentes

- **"El backend aún no está conectado"** → la URL de `config.js` sigue siendo el texto de ejemplo.
- **No se envían las predicciones** → comprueba que el acceso del despliegue es **Cualquier usuario** (no "Cualquier usuario con cuenta de Google") y que tras cambiar código desplegaste una *Nueva versión*.
- **Clasificación vacía** → aún no hay filas en `Predicciones`; ejecuta `seedDemoData` para probar.
- **Todos con 0 puntos** → es lo normal hasta que rellenes la pestaña `Resultados`.
