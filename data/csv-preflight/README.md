# Inspección local de CSV antes de importarlos

Herramienta **de solo lectura** para revisar la estructura de archivos CSV antes de abrirlos en hojas de cálculo, importarlos en una base de datos o entregarlos a otro sistema. No sube información a internet, no modifica el CSV y **no imprime valores de celdas** en el informe.

## Qué revisa

- Encabezados vacíos, duplicados y colisiones de mayúsculas/minúsculas.
- Filas con número de columnas distinto al encabezado.
- Campos obligatorios vacíos y claves duplicadas (configurables).
- Celdas que empiezan por `=`, `+`, `-` o `@` tras espacios: **posibles fórmulas** si se abren en un programa de hojas de cálculo.
- Errores de lectura, codificación y CSV malformado.
- Límites preventivos de bytes, filas y longitud de campo.

No analiza malware, no valida semánticamente correos o fechas, no limpia fórmulas, no detecta todas las variantes de CSV injection y no garantiza que el archivo sea apto para importar. Los negativos numéricos pueden generar falsos positivos de fórmula. La detección de claves repetidas mantiene valores en memoria mientras dura la ejecución: usar un límite de filas adecuado.

## Requisitos

Python 3.11 o superior. Solo biblioteca estándar, sin `pip install`.

## Ejemplo reproducible

Desde esta carpeta:

```bash
python3 csv_preflight.py ejemplo.csv --required id --required correo --unique id
```

Resultado esperado:

```text
Estado: PASS | Filas: 3 | Columnas: 3
Nota: PASS no garantiza que el contenido sea seguro ni correcto.
```

Para un CSV separado por punto y coma:

```bash
python3 csv_preflight.py clientes.csv --delimiter ';' --required id --unique id --json
```

El resultado JSON contiene códigos, números de fila y nombres de columna, **no valores de celdas**. El campo `file` contiene únicamente el nombre del archivo, no la ruta completa. Si los encabezados contienen información sensible, podrían aparecer en el JSON; revísalos antes de compartir el informe.

## Salidas y códigos

- `PASS` / salida `0`: ninguna anomalía definida.
- `WARN` / salida `1`: hallazgos que deben revisarse.
- `ERROR` / salida `2`: no se pudo analizar de forma completa o configuración inválida.

Los hallazgos se limitan a los primeros 100; `suppressed_findings` indica los omitidos. Se analizan como máximo 100 000 filas y 50 MiB por defecto. Si se excede el límite de filas, el análisis se interrumpe y devuelve ERROR. Los CSV con BOM UTF-8 son compatibles. Para otros juegos de caracteres, especifica `--encoding` (p. ej., `latin-1`) si conoces la procedencia.

## Pruebas

```bash
python3 -m unittest -v test_csv_preflight.py
```

Los tests crean archivos temporales; no leen datos reales ni modifican ningún origen.

## Seguridad y límites

El archivo se abre en modo lectura. Un CSV enorme, con campos gigantes o contenido hostil puede consumir recursos o aprovechar fallos del intérprete; por eso se aplican límites, pero **no hay sandbox**. No ejecutar el análisis con privilegios elevados sobre archivos no confiables. Las fórmulas se señalan sin interpretarlas. Para compartir un CSV con terceros, no basta con detectar: hay que aplicar una política de escape/saneamiento en el destino.

El informe no contiene valores de celdas, pero nombres de columnas, filas y nombre del archivo sí pueden ser sensibles. No adjuntar informes de producción a tickets públicos sin revisión.

## Licencia y fuentes

Ejemplo educativo Auri-Orion. Documentación oficial de Python:
- [csv — CSV File Reading and Writing](https://docs.python.org/3/library/csv.html)
- [argparse](https://docs.python.org/3/library/argparse.html)

Información sobre inyección de fórmulas: [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection).
