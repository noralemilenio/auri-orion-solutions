# Genera subtítulos y prepara un vídeo en local

Un flujo local para transcribir un vídeo, generar un archivo SRT y, opcionalmente, producir una copia con subtítulos incrustados.

Acompaña a la guía de Auri-Orion **“Genera subtítulos y prepara un vídeo sin subirlo a la nube”**.

## Qué hace

- extrae/transcribe audio con faster-whisper;
- crea subtítulos `.srt`;
- conserva el vídeo original;
- puede generar una copia subtitulada usando FFmpeg;
- no necesita enviar el contenido a un servicio web.

## Requisitos

- Python 3.11+
- FFmpeg
- `faster-whisper`

```bash
pip install -r requirements.txt
```

La primera ejecución del modelo puede requerir descargar sus pesos. Después, el procesamiento puede mantenerse local.

## Uso

Solo subtítulos:

```bash
python video_prep.py entrada.mp4 salida/
```

Subtítulos y copia con subtítulos incrustados:

```bash
python video_prep.py entrada.mp4 salida/ --burn
```

Elegir modelo/idioma:

```bash
python video_prep.py entrada.mp4 salida/ --model small --language es
```

## Privacidad

El script no contiene ninguna subida a terceros. Revisa igualmente dónde se descargan y almacenan los modelos y evita procesar grabaciones sin los permisos necesarios.

## Limitaciones

La calidad depende del audio, idioma, voces simultáneas y modelo. Los subtítulos deben revisarse antes de publicarse.
