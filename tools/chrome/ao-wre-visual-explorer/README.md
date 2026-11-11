# AO-WRE Visual Explorer · Chrome Extension 1.1.0

Captura páginas enteras en PNG y recorre menús laterales de aplicaciones SPA (React/Vue/etc.), pestañas y enlaces internos. Guarda las imágenes y un índice `galeria.html` dentro de un ZIP local. Es independiente de **AO-WRE Inspector** y **AO-WRE Web Saver**.

## Instalar o actualizar desde la versión 1.0

1. Descomprime `AO-WRE-Visual-Explorer-Chrome-v1.1.0.zip`.
2. Abre `chrome://extensions` y activa **Modo desarrollador**.
3. Si tienes **AO-WRE Visual Explorer 1.0** instalado desde otra carpeta, elimínalo de Chrome para evitar dos botones similares. No afecta a las demás extensiones AO-WRE.
4. Pulsa **Cargar descomprimida** y selecciona `ao-wre-visual-explorer` (donde está `manifest.json`). Si sustituyes los archivos en la misma carpeta antigua, basta con pulsar **Actualizar/Recargar** sobre la extensión.
5. Abre la página con la sesión ya iniciada, pulsa el icono de Visual Explorer y elige **Recorrido automático**.
6. Marca **Recorrer los menús laterales**, concede el permiso del dominio cuando Chrome lo solicite y pulsa **Iniciar captura visual**.
7. Mantén la web visible. En Descargas recibirás el ZIP; descomprímelo y abre `galeria.html`.

## Novedades 1.1.0

- **Menús laterales SPA**: detecta grupos de navegación lateral hechos con `aside`, `nav`, clases CSS habituales o encabezados «SECCIONES / PASOS / ETAPAS / MÓDULOS». Reconoce `<a>`, `<button>`, controles con roles ARIA y filas `<div>` con clases interactivas. Captura también pantallas cuya URL **no cambia**.
- **Más alcance**: hasta **200 URLs distintas** y **500 vistas** como máximo configurable (valores independientes). Predeterminados: 25 URLs / 100 vistas. Antes el límite era de 10 URL.
- **Prioridad al menú lateral**: registra primero todas las secciones laterales y después inspecciona sus paneles internos, para no gastar el presupuesto en capturas repetitivas de scroll.
- **Límite de memoria de 500 MB** para datos PNG antes de generar el ZIP y botón **Detener**: al alcanzar el límite se guarda el trabajo parcial.
- Intenta restaurar la sección inicial del menú y la URL original.

## Alcance de cada opción

- **Solo página completa**: hace scroll por el documento y une los mosaicos PNG, en varias partes si exceden el límite gráfico.
- **Página + controles interiores**: captura pestañas ARIA / Bootstrap, elementos `<details>` y contenedores con desplazamiento propio.
- **Recorrido automático**: además, visita enlaces internos del origen seleccionado y recorre los menús laterales detectados en cada URL. Cada sección puede tener sus propias pestañas y paneles interiores.

`Máximo de páginas (URL)` limita las rutas distintas visitadas. `Máximo total de pantallas` limita las vistas grabadas, que pueden ser mucho más numerosas aunque la URL permanezca igual. Ambas opciones se aplican en modo Recorrido automático.

## Estructura del ZIP descargado

```
galeria.html
informe-captura.json
capturas/
  01-pagina-principal/pagina-completa.png
  01-identificar-problemas-menu-lateral-1/pagina-completa.png
  01-soluciones-ia-menu-lateral-2/pagina-completa.png
  01-menu-2-pestana-1/pagina-completa.png
  02-otra-url-principal/pagina-completa.png
```

El informe registra vistas, imágenes, URLs, errores, interrupciones y si se alcanzó un límite.

## Seguridad y límites

- Todo se realiza localmente en Chrome, sin enviar PNG a servidores Auri-Orion.
- Solicita permisos solo al dominio seleccionado; evita enlaces externos, rutas peligrosas conocidas, formularios y controles con textos de envío, borrado, compra o ejecución.
- **Ningún clasificador de menús puede garantizar efectos secundarios nulos**: una web puede implementar acciones de escritura detrás de una navegación aparente. Úsalo en webs confiables y, para aplicaciones con datos sensibles, empieza por un proyecto de prueba.
- No elude autenticación, permisos de acceso, captchas ni restricciones de origen.
- Los PNG pueden contener datos privados visibles en pantalla. Revisa antes de compartir el ZIP.
- Solo captura la pestaña visible. No cambies de pestaña ni minimices su ventana durante el recorrido.
- El recorrido no cubre interacciones arbitrarias en canvas, arrastre libre, tooltips solo por hover, sombras DOM cerradas o todas las posibilidades de formularios y asistentes complejos.
- Una aplicación con scroll infinito puede necesitar una nueva pasada. En casos muy amplios, el límite de vistas/bytes genera un ZIP parcial en vez de saturar la memoria.
- Abandonar una sección durante el recorrido podría descartar ediciones sin guardar, como ocurre al navegar manualmente.

## Desarrollo y pruebas

Código Manifest V3 sin dependencias externas. Node 22+ para los tests unitarios; Playwright para la prueba de detección con Chromium.

```
npm test
python tests/navigation_test.py
```

Estado de verificación: pruebas unitarias **5/5 PASS**, navegación DOM en Chromium **2/2 PASS** (menú SPA de 9 secciones y menú sin roles semánticos), ZIP validado. La ejecución completa de la extensión en una sesión real de Chrome con `inicial.mkthackers.com` sigue pendiente de comprobación en el equipo del usuario (el entorno CI bloquea `file://` y destinos locales con `ERR_BLOCKED_BY_ADMINISTRATOR`).

© 2026 Auri-Orion. Para investigación visual de webs a las que tienes acceso legítimo.
