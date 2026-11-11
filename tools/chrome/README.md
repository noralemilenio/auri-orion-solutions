# Extensiones Chrome · Auri–Orion (uso interno)

Esta carpeta mantiene el código fuente **reproducible** de dos extensiones Manifest V3. Se usan localmente para documentar páginas web y grabar audio de la pestaña activa. **No son servicios desplegados ni publican contenido**.

| Herramienta | Versión | Función | Código |
| --- | --- | --- | --- |
| AO-WRE Visual Explorer | `1.1.0` | Capturas PNG de página completa; menús laterales SPA, pestañas y enlaces internos; galería ZIP. | [Fuente](ao-wre-visual-explorer/) |
| Auri–Orion Audio Recorder | `0.2.0` | Captura el audio de la pestaña con botones independientes **PARAR (sin descargar)** y **Guardar audio**. | [Fuente](auri-orion-audio-recorder/) |

## Instalación en Chrome

1. Descarga la carpeta correspondiente desde este repositorio y mantenla en una ubicación estable. También puedes descargar el [paquete de ambas extensiones](releases/auri-orion-chrome-extensions-internal-v2026-11-11.tar.xz) y extraerlo con `tar -xf <archivo>.tar.xz` (Windows 10/11 incluye `tar`).
2. En Chrome abre `chrome://extensions` y activa **Modo desarrollador**.
3. Selecciona **Cargar descomprimida** y elige la carpeta concreta que contiene `manifest.json`; repite para la otra extensión.
4. Para actualizar conservando permisos y grabaciones locales, sustituye los archivos en **la misma ubicación** y pulsa **Recargar**; no reinstales desde una ruta diferente si tienes audios pendientes.

## Verificación

- AO-WRE Visual Explorer: `cd ao-wre-visual-explorer && npm test` (5 pruebas unitarias aprobadas en Node.js 22).
- Audio Recorder: `node --check` en todos los archivos `.js`; inspección de `manifest.json` y recursos PNG existentes.
- Integridad del paquete `tar.xz`: SHA-256 `6629c4def8ba236227458bd298ee3d9d7c0bb961de3eb969276c2fcbd0109000`.

**Límites:** la exploración visual puede omitir widgets complejos y los clics de navegación podrían ocasionar efectos laterales si una web los programa así. Audio Recorder guarda fragmentos en IndexedDB hasta que se descargan; no se debe cambiar la ubicación/ID de la extensión con audios pendientes. Revisa capturas y audios antes de compartirlos.

**Privacidad:** no hay envío de grabaciones ni capturas a servidores Auri–Orion. Este repositorio es público: no almacenar grabaciones, capturas reales, sesiones, contraseñas ni tokens. **Uso interno** describe el destino operativo de las herramientas, no la visibilidad del código en GitHub.
