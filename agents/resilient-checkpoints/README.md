# Agente recuperable con checkpoints

Ejemplo pequeño para mostrar tres ideas que convierten una demo en un flujo más fiable: checkpoints persistentes, acciones idempotentes y reintentos limitados.

Acompaña a la guía de Auri-Orion “Haz que un agente pueda fallar sin empezar de cero”.

## Cómo funciona

Cada ejecución tiene un run_id. Antes de ejecutar un paso, el programa consulta SQLite:

- si ya terminó correctamente, reutiliza el resultado;
- si falló, puede reintentarlo hasta el límite;
- si supera el límite, se detiene;
- cada paso deja estado, número de intentos y salida.

## Probar

    python example.py --run-id demo-001 --fail-once

La primera ejecución simula un fallo en el segundo paso.

Vuelve a ejecutar:

    python example.py --run-id demo-001

El paso ya completado se recupera desde el checkpoint y no se repite desde cero.

## Por qué SQLite

No porque sea la única opción, sino porque permite demostrar el patrón sin instalar infraestructura adicional. En sistemas distribuidos puede sustituirse por PostgreSQL, Redis, una cola persistente o el backend de estado del orquestador.

## Qué falta para producción

- locking si varios workers pueden ejecutar el mismo paso;
- expiración o migración de estados;
- métricas y trazas;
- clasificación de errores recuperables/no recuperables;
- revisión humana para acciones de riesgo;
- idempotency keys en APIs externas.
