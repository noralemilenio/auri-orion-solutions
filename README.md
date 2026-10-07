# Auri-Orion Solutions

Soluciones prácticas, reproducibles y seguras que acompañan a las guías publicadas en [Auri-Orion](https://auri-orion.noralemilenio.com).

El objetivo no es acumular ejemplos, sino publicar código que realmente sirva para resolver problemas concretos con IA, automatización, agentes, privacidad e IA local.

## Principios

- Código genérico y reproducible.
- Sin secretos, IPs privadas ni detalles de infraestructura interna.
- Preferencia por software libre y dependencias mínimas.
- Seguridad y privacidad por defecto.
- Cada solución incluye contexto, requisitos, límites y forma de probarla.
- Ningún ejemplo debe requerir copiar credenciales dentro del código.

## Estructura

```text
security/
automation/
agents/
local-ai/
examples/
```

## Soluciones publicadas

- [Organizador local de documentos](personal/local-document-organizer/) — OCR, clasificación local, nombres consistentes y copia segura.
- [De reunión a tareas, en local](work/local-meeting-to-tasks/) — transcripción local + extracción de decisiones y acciones con evidencia.
- [Agente recuperable con checkpoints](agents/resilient-checkpoints/) — checkpoints, idempotencia y reintentos limitados.
- [DNS gobernado para agentes](security/governed-dns-agent/) — gestión DNS sin entregar el token directamente al agente.

## Licencia

El código de este repositorio se publica bajo licencia MIT salvo indicación contraria en una solución concreta.
