# DNS gobernado para agentes

Ejemplo mínimo de una capa de control entre un agente de IA y la API de un proveedor DNS.

La idea es sencilla: el agente nunca recibe el token. En su lugar llama a una función limitada que:

1. valida la zona permitida;
2. restringe los tipos de registro;
3. lee el token desde el entorno del proceso;
4. ejecuta solo las operaciones previstas;
5. devuelve resultados saneados.

Este patrón acompaña a la guía de Auri-Orion sobre automatizar DNS sin entregar el token a la IA.

## Qué demuestra

- allowlist de zona;
- validación de nombres DNS;
- separación entre lectura y escritura;
- credenciales fuera del código;
- respuesta sin secretos;
- base para añadir autorización humana antes de mutaciones.

## Requisitos

- Python 3.11+
- cuenta de Cloudflare con un API Token limitado a DNS de una zona concreta
- variables de entorno:

```bash
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_ZONE_ID='...'
export ALLOWED_ZONE='example.com'
```

No pongas esos valores en Git.

## Probar

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python example.py list
```

Para crear o actualizar un registro:

```bash
python example.py upsert demo.example.com A 203.0.113.10
```

## Importante

Este ejemplo no sustituye un sistema completo de autorización. En producción conviene añadir:

- control de identidad;
- aprobación explícita para cambios;
- auditoría;
- idempotencia;
- límites de frecuencia;
- almacenamiento del secreto en Vault, KMS o equivalente.

El ejemplo usa variables de entorno solo para mantenerlo portátil y comprensible.
