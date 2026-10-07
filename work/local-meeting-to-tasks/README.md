# De reunión a tareas, en local

Patrón reproducible para transformar una transcripción en decisiones, tareas, responsables explícitamente mencionados, fechas explícitas y dudas pendientes.

Acompaña a la guía de Auri-Orion “Convierte reuniones en tareas sin enviar el audio a terceros”.

## Arquitectura

    audio
      → transcripción local
      → texto
      → modelo local
      → JSON estructurado
      → revisión humana
      → gestor de tareas

Este ejemplo comienza en la transcripción para no imponer un motor de audio concreto.

## Transcripción local

Dos opciones habituales son whisper.cpp y faster-whisper:

- https://github.com/ggml-org/whisper.cpp
- https://github.com/SYSTRAN/faster-whisper

## Extracción de acciones

    export OLLAMA_MODEL='tu-modelo-local'
    python extract_actions.py sample-transcript.txt

El script consulta Ollama en 127.0.0.1 y devuelve JSON.

Regla fundamental: si un responsable o una fecha no aparecen de forma explícita, se devuelve null. El modelo no debe completar huecos por intuición.

## Producción

Antes de crear tareas automáticamente:

1. conserva la transcripción original;
2. guarda evidencia literal para cada acción;
3. solicita revisión humana cuando haya ambigüedad;
4. registra qué versión del modelo produjo el resultado;
5. evita enviar audio o transcripción fuera del equipo salvo decisión explícita.
