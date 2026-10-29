# Comprueba cuándo caducan tus certificados HTTPS

**Resultado:** un listado de hosts se transforma en un informe de fechas de caducidad de los certificados TLS presentados por esos servidores. El programa no cambia configuraciones, no guarda certificados y no requiere paquetes de Python de terceros.

## Requisitos

- Python 3.11 o superior.
- OpenSSL disponible en el PATH (comando: openssl version).
- Conexión de red hacia los servidores que tú autorices.

## Uso

1. Copia hosts.example.txt como hosts.txt y sustituye los dominios por hosts que administras.
2. Ejecuta desde esta carpeta:

~~~bash
python3 tls_expiry.py --file hosts.txt --warn-days 30
~~~

Para obtener JSON apto para automatizaciones:

~~~bash
python3 tls_expiry.py --file hosts.txt --warn-days 14 --json
~~~

Admite dominio.tld, dominio.tld:8443 y comentarios que empiezan por #. Máximo 200 destinos por ejecución. --timeout ajusta el tiempo máximo de espera de cada conexión (5 segundos por defecto).

## Interpretación

- VIGENTE: caducidad posterior a la ventana de aviso.
- CADUCA_PRONTO: vence dentro de la ventana configurada.
- CADUCADO: la fecha de caducidad ya ha pasado.
- ERROR: fallo de conexión, negociación TLS, nombre de host, lectura del certificado o OpenSSL.

Códigos de salida: 0 si todos están vigentes, 1 si existe algún aviso/caducado, 2 si existe al menos un error. Un código 1 no implica que la conexión HTTPS esté caída.

## Prueba funcional sin servicios externos

~~~bash
python3 -m unittest -v test_tls_expiry.py
~~~

Las pruebas crean temporalmente un certificado **autofirmado** de cinco días con OpenSSL y un servidor TLS local. Comprueban fechas, avisos, simulación de caducidad, errores, validación de destinos y códigos de salida. El certificado de prueba no es válido para producción.

## Privacidad y seguridad

El script solo envía la conexión TLS necesaria a los destinos listados. No envía archivos, credenciales ni información a un tercero central. **Los nombres de los hosts pueden ser información sensible**: no publiques un inventario privado ni la salida del programa.

**Limitación crítica:** para poder inspeccionar certificados caducados y autofirmados, la conexión de inspección desactiva deliberadamente la validación de la cadena de confianza y del nombre del servidor. Por tanto, **NO certifica que un sitio HTTPS sea seguro, confiable ni que el certificado corresponda al dominio solicitado**. Solo examina la fecha notAfter del certificado presentado. Un intermediario activo podría presentar otro certificado.

No detecta todos los certificados alternativos que pueda servir un balanceador, ni inspecciona rutas HTTP, ni renueva certificados. No reemplaza un monitor de TLS validado.

## Coste y alternativas

Software: 0 € si ya tienes Python y OpenSSL; puede haber costes de infraestructura o conectividad propios. Para comprobar un único servidor, openssl s_client y openssl x509 -noout -dates son suficientes. Para monitorización continua, utiliza herramientas como Prometheus Blackbox Exporter con comprobación de confianza y alertas.

## Fuentes

- [Python ssl](https://docs.python.org/3/library/ssl.html)
- [Python socket](https://docs.python.org/3/library/socket.html)
- [OpenSSL x509](https://docs.openssl.org/3.0/man1/openssl-x509/)

## Estado de verificación

El resultado de pruebas ejecutadas se registra en la publicación de Auri-Orion. El ejemplo de servidor autofirmado es deliberadamente local y no representa un certificado público válido.
