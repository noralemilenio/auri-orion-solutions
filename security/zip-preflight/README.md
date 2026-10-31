# ¿Qué contiene ese ZIP? Inspección preventiva sin extraer archivos

**Resultado:** analiza un archivo ZIP en local, sin extraer ni ejecutar su contenido, y detecta señales que merecen revisión: rutas peligrosas, enlaces simbólicos, duplicados, tamaño declarado excesivo, alta compresión y entradas cifradas. Opcionalmente comprueba CRC leyendo los miembros bajo límites.

**PASS no significa seguro.** Es una inspección preliminar, no un antivirus, sandbox ni un validador de restauraciones.

## Requisitos y uso

Python 3.11 o superior. Solo biblioteca estándar. No se envían archivos a terceros.

~~~bash
python3 zip_preflight.py ./copia.zip
python3 zip_preflight.py ./copia.zip --json
python3 zip_preflight.py ./copia.zip --check-crc
python3 zip_preflight.py ./copia.zip --max-entries 1000 --max-total-mib 256 --max-file-mib 128 --max-ratio 50
~~~

### Ejemplo reproducible

~~~bash
python3 - <<'PY'
from zipfile import ZipFile
with ZipFile('/tmp/auri-zip-ejemplo.zip', 'w') as z:
    z.writestr('docs/nota.txt', 'Hola desde Auri-Orion')
PY
python3 zip_preflight.py /tmp/auri-zip-ejemplo.zip --check-crc
~~~

Resultado esperado: Estado PASS, Entradas 1, CRC CHECKED. El contenido de este ejemplo está bajo nuestro control.

## Estados y automatización

- PASS (código 0): no se detectaron señales definidas; no certifica seguridad.
- WARN (código 2): una o más señales de riesgo o lectura CRC fallida.
- ERROR (código 1): archivo ausente, corrupto, ilegible o configuración inválida.
- CRC NOT_REQUESTED: solo metadatos.
- CRC CHECKED: miembros leídos y CRC verificado.
- CRC SKIPPED_LIMIT_OR_ENCRYPTION: lectura omitida por límites o cifrado.
- CRC FAILED: error de lectura o CRC.

Salida --json: ruta, estado, número de entradas, tamaños declarados, CRC y hallazgos. Los nombres internos del ZIP pueden contener información sensible: protege el JSON generado.

## Pruebas

~~~bash
python3 -m unittest discover -s . -p 'test_*.py' -v
~~~

Las pruebas usan ZIP temporales: rutas peligrosas, rutas Windows, enlaces simbólicos, duplicados, límites, compresión, CRC, errores y JSON.

## Seguridad, límites y privacidad

- **Nunca extrae** ni ejecuta archivos. No modifica el ZIP.
- Lee el directorio central de ZIP; los tamaños son declarados, no garantía del contenido real.
- --check-crc puede consumir CPU y memoria; los límites reducen riesgo pero no eliminan ataques por archivos manipulados. Evita ejecutarlo sobre entradas hostiles en máquinas críticas.
- No analiza malware, macros, scripts, documentos ni archivos anidados.
- No valida que una copia de seguridad sea restaurable.
- ZIP cifrados no se descifran; se señalan para revisión.
- En sistemas de archivos diferentes pueden existir reglas de nombres y permisos adicionales.
- Las barras invertidas se marcan como ambiguas de forma conservadora.
- La detección de rutas peligrosas es preventiva; zipfile.extractall() implementa normalizaciones propias. No uses este informe como autorización para extraer.
- No utiliza red, servicios externos ni dependencias pip. Coste software 0 €; usa CPU y almacenamiento locales.

## Referencias

- Documentación oficial Python zipfile: https://docs.python.org/3/library/zipfile.html
- pathlib: https://docs.python.org/3/library/pathlib.html

Licencia: consultar [LICENSE](../../LICENSE) del repositorio.
