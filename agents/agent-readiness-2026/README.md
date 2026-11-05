# Tendencia 2026 · ¿Está listo un agente de IA para producción?

Herramienta local de evaluación **orientativa** para seleccionar agentes capaces de trabajar con garantías mínimas. No analiza modelos, no ejecuta agentes y no concede permisos. Es una rúbrica editorial **propia de Auri-Orion**, no una certificación ni una escala avalada por Gartner o LangChain.

## Requisitos

Python 3.10 o superior, únicamente biblioteca estándar (`json`, `pathlib`, `argparse`). Sin API, sin conexiones de red, sin dependencias, sin claves y sin datos personales.

## Ejecutar

```bash
python3 agent_readiness.py ejemplo.json
python3 -m unittest -v test_agent_readiness.py
```

## Cómo puntuar cada factor

| Factor JSON | 0 (no cumple) | 1 (parcial) | 2 (acreditado) |
|---|---|---|---|
| `objetivo` | No existe caso de uso medible | Objetivo definido sin baseline | Objetivo y métrica con baseline |
| `calidad` | No hay pruebas | Pruebas informales | Casos representativos + umbral verificable |
| `coste` | No se mide | Estimación por ejecución | Coste y supervisión medidos |
| `supervision` | Sin controles humanos | Escalado parcial | Aprobación antes de acciones sensibles |
| `permisos` | Acceso excesivo/desconocido | Parcialmente limitado | Mínimo privilegio verificable |
| `trazabilidad` | Sin registro | Registros incompletos | Traza y evidencias sin secretos |
| `recuperacion` | No reanuda/duplica | Recuperación manual | Checkpoints e idempotencia ensayados |

Puntuación ponderada sobre 36. Calidad, supervisión, permisos y recuperación son factores críticos: un **0** en cualquiera impide marcarlo listo, aunque la suma sea elevada. Rangos editoriales: **0–21 = NO LISTO**, **22–30 = PILOTO SUPERVISADO**, **31–36 = CANDIDATO A PRODUCCIÓN**, siempre que no haya bloqueos críticos. Un resultado alto **no autoriza** producción ni cambios reales: exige auditoría técnica, legal, de seguridad y aprobación humana cuando proceda.

Salida: JSON con estado, puntuación y bloqueos. Salidas CLI: código 0 candidato/piloto, 1 no listo y 2 configuración/lectura inválida. Lectura limitada a 64 KiB; no imprime valores de entrada, solo indicadores.

## Fuentes de la tendencia (consultadas 05-11-2026)

- Gartner, *AI Agent Success Requires Reliability Before Autonomy* (02-10-2026): https://www.gartner.com/en/articles/ai-agent-reality-check
- LangChain, *State of Agent Engineering* (12-06-2026): https://www.langchain.com/state-of-agent-engineering
- Gartner, *What the 2026 Hype Cycle for Agentic AI Reveals* (15-04-2026): https://www.gartner.com/en/articles/hype-cycle-for-agentic-ai

Los criterios y umbrales de esta rúbrica son elaboración de Auri-Orion; las fuentes contextualizan la tendencia, no validan numéricamente la rúbrica.
