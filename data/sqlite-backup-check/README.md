# Verifica copias SQLite sin tocar la base de origen

**Resultado:** el programa abre una base SQLite en modo solo lectura, crea una instantánea consistente con la API sqlite3.Connection.backup() en un directorio temporal, ejecuta PRAGMA integrity_check sobre esa copia y elimina la instantánea al terminar.

No requiere paquetes de terceros ni acceso a la nube. Se ha probado con bases de prueba, no con bases reales de producción.

## Requisitos

- Python 3.11+ con módulo estándar sqlite3.
- Acceso de lectura a la base y permisos para crear archivos temporales.
- Espacio libre para una copia completa de la base, potencialmente mayor durante la operación.
- Para bases en modo WAL, acceso a los archivos auxiliares necesarios (-wal, -shm) y a su directorio.

## Uso

~~~bash
python3 sqlite_backup_check.py ./mi-base.sqlite3
python3 sqlite_backup_check.py ./mi-base.sqlite3 --json
python3 sqlite_backup_check.py ./mi-base.sqlite3 --timeout 30
~~~

Ejemplo ilustrativo de salida (la duración depende del equipo):

~~~text
Estado: VALID
Origen: /ruta/absoluta/mi-base.sqlite3
Integridad: ok
Detalle: La instantánea pasó PRAGMA integrity_check
Tiempo: 0.012 s
~~~

Los estados y códigos de salida son: VALID (0), INVALID (1, copia con errores detectados por el PRAGMA) y ERROR (2, no se pudo comprobar: permisos, archivo incorrecto, bloqueo, timeout, etc.). Un error no demuestra corrupción.

El tiempo máximo se comprueba en el callback de progreso de backup(); no es un límite absoluto para cada espera interna del motor SQLite.

## Pruebas

~~~bash
python3 -m unittest discover -s . -p 'test_*.py' -v
~~~

Se incluyen casos de base válida, bytes del origen inalterados, ausencia de archivo, cabecera inválida, timeout inválido, modo WAL con transacción confirmada, JSON de CLI y código de error de CLI.

## Seguridad, privacidad y límites

- El script **no modifica los datos del origen**; abre SQLite con mode=ro. En WAL, SQLite puede crear/usar archivos auxiliares de coordinación según permisos y configuración.
- La instantánea temporal se borra al finalizar, pero mientras existe contiene todos los datos de la base: usa un directorio temporal local y seguro.
- La comprobación verifica la estructura interna de SQLite en la instantánea, **no** la integridad semántica de tus datos, la presencia de todas las tablas esperadas, las claves foráneas ni la posibilidad de recuperar toda una aplicación.
- PRAGMA integrity_check no comprueba violaciones de claves foráneas; para eso utiliza PRAGMA foreign_key_check por separado.
- No sustituye una política de backup, la restauración periódica de pruebas, cifrado o retención.
- Si la base cambia continuamente, la instantánea puede tardar más o agotar el tiempo disponible.
- No ejecutes contra bases ajenas sin autorización. El JSON puede revelar rutas internas y detalles de la estructura; revisa antes de compartir.
- No uses una copia de archivos a ciegas de una base WAL activa: la API de backup es la elegida para obtener una instantánea consistente.
- Coste de licencias: 0 €; el almacenamiento temporal y el tiempo de CPU/disco tienen coste operativo.

## Referencias oficiales

- [Python sqlite3 backup](https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup)
- [SQLite integrity_check](https://www.sqlite.org/pragma.html#pragma_integrity_check)
- [SQLite backup API](https://www.sqlite.org/backup.html)
- [SQLite WAL](https://www.sqlite.org/wal.html)
