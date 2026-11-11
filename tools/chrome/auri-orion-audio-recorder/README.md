# Auri–Orion Audio Recorder v0.2.0

Extensión Chrome Manifest V3. Graba **solo el audio de la pestaña**; no accede al micrófono ni envía la grabación a ningún servidor.

## Botones

- **Iniciar grabación**: comienza a capturar sonido.
- **Pausar / Reanudar**: pausa o continúa la misma toma.
- **■ PARAR** (nuevo): termina MediaRecorder y libera la captura **SIN descargar**. Los fragmentos quedan almacenados en IndexedDB, en este mismo perfil de Chrome.
- **↓ Guardar audio** (existente): desde una grabación activa, la termina y descarga un archivo WebM/Opus como anteriormente; si ya pulsaste PARAR, descarga la toma detenida.
- **Recuperar grabaciones**: muestra las tomas pendientes que aún quedan en almacenamiento local.

Mientras queda una grabación detenida sin guardar, hay que guardarla para iniciar otra desde el popup. Esto evita reemplazar por accidente una toma pendiente.

## Actualización

1. Antes de actualizar, guarda o recupera cualquier grabación pendiente desde la extensión original.
2. Descomprime el ZIP en una carpeta estable.
3. Abre `chrome://extensions`, activa **Modo desarrollador**, y pulsa **Cargar descomprimida** sobre `auri-orion-audio-recorder` (o reemplaza los archivos en la carpeta anterior y pulsa **Actualizar**).
4. Mantener el mismo ID de extensión es importante para conservar el acceso a los fragmentos anteriores. Instalar desde otra ubicación puede generar otro ID de extensión y un almacenamiento independiente.

Si Chrome cierra o reinicia el proceso entre PARAR y Guardar, recupera la toma desde **Recuperar grabaciones** (los fragmentos sobreviven en IndexedDB). El atajo `Alt+Shift+R` inicia o para sin descarga automática.
