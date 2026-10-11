# Pregunta a tus PDFs con IA local y citas

Un RAG local pequeño: extrae texto de PDFs, genera embeddings con Ollama, recupera fragmentos relevantes y pide al modelo que responda citando la página de origen.

Acompaña a la guía de Auri-Orion **“Pregunta a tus PDFs con IA local y respuestas con citas”**.

## Arquitectura

```text
PDF → texto por página → chunks → embeddings locales → índice JSON
pregunta → embedding local → similitud → contexto → LLM local → respuesta con citas
```

## Requisitos

- Python 3.11+
- Ollama local
- PyMuPDF

```bash
pip install -r requirements.txt
```

Necesitas un modelo de embeddings y otro de generación disponibles en Ollama.

## Indexar

```bash
export OLLAMA_EMBED_MODEL='tu-modelo-embeddings'
python index.py documentos/ index.json
```

## Preguntar

```bash
export OLLAMA_MODEL='tu-modelo-local'
python ask.py index.json "¿Qué plazo indica el contrato?"
```

## Citas

Cada fragmento conserva una referencia con formato:

```text
[nombre.pdf#p12]
```

El prompt obliga al modelo a citar solo referencias presentes en el contexto y a reconocer cuando no encuentra evidencia suficiente.

## Privacidad

El ejemplo exige por defecto Ollama en localhost. No sube PDFs ni fragmentos a un servicio externo.

## Limitaciones

Esto no garantiza respuestas correctas. La recuperación puede omitir información y un modelo puede citar mal. Para decisiones importantes, abre siempre la página original indicada.
