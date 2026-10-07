# Organizador local de documentos

Ejemplo reproducible para convertir una carpeta de entrada en un flujo local:

    archivo → OCR → clasificación local → nombre propuesto → copia segura → auditoría

Acompaña a la guía de Auri-Orion “Organiza documentos sin subirlos a la nube”.

## Qué demuestra

- OCR local para PDF e imágenes.
- Clasificación mediante un modelo servido por Ollama.
- Nombres consistentes y saneados.
- Modo dry-run por defecto.
- Conservación del original.
- Registro JSONL de cada decisión.

## Requisitos

- Python 3.11+
- OCRmyPDF: https://ocrmypdf.readthedocs.io/
- Tesseract OCR
- pdftotext (Poppler)
- Ollama en http://127.0.0.1:11434
- un modelo local compatible con tu equipo

## Configuración

    export OLLAMA_MODEL='tu-modelo-local'

El script nunca necesita una clave de API. Todo el procesamiento está pensado para ejecutarse en el propio equipo.

## Prueba segura

    mkdir -p inbox archive
    python example.py inbox archive

El modo por defecto no copia ni mueve nada: únicamente imprime y registra qué haría.

Para aplicar las copias propuestas:

    python example.py inbox archive --apply

El original permanece en inbox. El ejemplo copia el documento al destino normalizado; no borra ni sobrescribe originales.

## Convención de nombre

    AAAA-MM-DD__tipo__entidad.ext

Si falta una fecha o entidad fiable, se usa sin-fecha o sin-entidad en lugar de inventar el dato.

## Límites

El OCR no garantiza una lectura perfecta y un modelo local puede clasificar mal. Antes de automatizar movimientos definitivos conviene mantener una carpeta de cuarentena o una revisión humana.

Este ejemplo es deliberadamente pequeño: enseña el patrón, no pretende sustituir a un gestor documental completo.
