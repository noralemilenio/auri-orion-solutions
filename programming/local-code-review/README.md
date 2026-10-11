# Revisa tu código con IA local antes del commit

Una revisión local del `git diff` antes de hacer commit, sin enviar el repositorio a un servicio externo.

Acompaña a la guía de Auri-Orion **“Revisa tu código con IA local antes del commit”**.

## Qué hace

1. obtiene el diff preparado (`git diff --cached`);
2. evita archivos binarios y limita el tamaño enviado al modelo;
3. exige un endpoint local de Ollama por defecto;
4. pide una revisión centrada en errores, seguridad, regresiones y mantenibilidad;
5. devuelve observaciones, pero no modifica el repositorio.

## Requisitos

- Python 3.11+
- Git
- Ollama en `http://127.0.0.1:11434`
- un modelo local adecuado para código

## Uso

```bash
export OLLAMA_MODEL='tu-modelo-de-codigo'
python review_diff.py
```

Para revisar cambios todavía no preparados:

```bash
python review_diff.py --worktree
```

Para comprobar qué se enviaría sin consultar el modelo:

```bash
python review_diff.py --dry-run
```

## Seguridad

El script rechaza por defecto endpoints que no sean localhost. Esto evita convertir accidentalmente una herramienta “local” en una subida de código a otro equipo.

Aun así, un diff puede contener secretos. No uses esta herramienta como sustituto de un detector de secretos ni de una revisión humana.

## Limitaciones

Una revisión generada por un modelo puede equivocarse, omitir problemas o sugerir cambios innecesarios. Debe tratarse como una segunda opinión, no como aprobación automática.
