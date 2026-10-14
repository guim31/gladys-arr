# Sonarr & Radarr

Lleve su [Sonarr](https://sonarr.tv) (series) y su [Radarr](https://radarr.video)
(películas) a Gladys, a través de su red local: los episodios y películas que
salen esta semana en el panel, con sus carteles, el estado de las colas de
descarga, los pendientes, los avisos de estado, y escenas que reaccionan cuando
se descarga un episodio o una película.

La integración se ha probado con instancias reales de Sonarr 4 y Radarr 6 (las
imágenes Docker oficiales), aún no en una instalación real de Gladys: sus
comentarios son bienvenidos en el [foro de Gladys](https://community.gladysassistant.com)
o en las [issues](https://github.com/guim31/gladys-arr/issues).

## Qué necesita

- Gladys Assistant 5.1.0 o posterior.
- **Sonarr** v3 o v4, y/o **Radarr** v3 o posterior, accesibles desde Gladys
  (misma red). Hasta dos de cada uno.
- La **clave de API** de cada instancia: en Sonarr o Radarr, **Settings** →
  **General** → **Security** → **API Key**.

## Puesta en marcha

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, sección _Sonarr_, introduzca la **Dirección** de su
   Sonarr con su puerto (por ejemplo `192.168.1.2:8989`), su **Clave de API** y,
   si lo desea, un **Nombre**. Lo mismo en la sección _Radarr_ (puerto `7878`
   por defecto). ¿Un Sonarr detrás de un proxy inverso con una base de URL?
   Introdúzcala también: `https://example.org/sonarr`. Deje vacía la sección de
   una aplicación que no use. ¿Un segundo Sonarr (4K, anime…) o Radarr? Rellene
   la sección _Segundo Sonarr_ o _Segundo Radarr_.
3. Guarde y haga clic en **Probar la conexión**: el mensaje bajo el botón
   indica, para cada instancia, si responde, su versión, su cola, sus
   pendientes y sus avisos de estado.
4. Abra la pestaña **Descubrir**: un dispositivo por instancia. Haga clic en
   **Añadir**, elija una habitación y guarde.

Opciones:

- **Intervalo de actualización**: con qué frecuencia se leen las instancias
  (cola, calendario, historial, estado), de 1 a 10 minutos (2 minutos por
  defecto). Cada lectura hace 6 pequeñas peticiones a cada instancia, 7 una vez
  por hora.
- **Idioma de los nombres de funciones**: inglés, francés, alemán o español.
  Los nombres se asignan al añadir un dispositivo (francés por defecto); el
  idioma también define la frase de la acción de resumen.

## El dispositivo de cada instancia

Todas las funciones son de solo lectura. Los nombres hablan de «episodios» en
un Sonarr y de «películas» en un Radarr.

| Función                                                             | Qué es                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| En línea                                                            | 1 mientras la instancia responde, 0 si no                                               |
| Cola de descargas                                                   | Elementos de la cola de Sonarr o Radarr (Activity → Queue)                              |
| Descargas con error                                                 | Elementos de la cola con aviso o error: importación bloqueada, descarga fallida…        |
| Episodios que faltan / Películas que faltan                         | Episodios o películas vigilados sin archivo (Wanted → Missing)                          |
| Episodios de los próximos 7 días / Películas de los próximos 7 días | Episodios emitidos, o películas que se estrenan (cine, digital, disco), de hoy a 6 días |
| Espacio libre                                                       | Espacio libre de las carpetas raíz, en GB; el menor si hay varias                       |
| Avisos de estado                                                    | Avisos de System → Status (indexador, cliente de descarga…)                             |
| Errores de estado                                                   | Errores de System → Status                                                              |
| Versión                                                             | Versión de Sonarr o Radarr                                                              |

## Panel

Añada el widget **Próximos estrenos** (los widgets de la integración, en el
editor del panel). Por defecto cubre todas las instancias; su ajuste
**Instancia** lo limita a una.

Muestra:

- dos mosaicos: los elementos **En cola** y los **Pendientes**, para todas las
  instancias mostradas;
- una cuadrícula de los episodios y películas que salen de hoy a los 6 días
  siguientes, con su cartel, su fecha y una insignia _Descargado_ cuando el
  archivo está ahí (para una película, antes: _En cines_, _Digital_ o
  _Blu-ray / DVD_). Toque una tarjeta para ver el título del episodio y la
  sinopsis;
- una línea por instancia: cola, descargas con error, avisos de estado, o
  _Inaccesible_;
- dos botones: **Buscar pendientes** (como la acción de abajo) y
  **Actualizar**.

Los carteles vienen de Sonarr y Radarr (la pequeña copia que guardan), a
través de Gladys: su navegador nunca carga una dirección externa.

## Escenas

### Disparadores

| Disparador                      | Cuándo                                                                          | Filtros                      | Variables                                                          |
| ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Episodio o película descargados | Sonarr o Radarr ha importado una descarga terminada a la biblioteca             | instancia, aplicación        | nombre de la instancia, título, título con episodio o año, calidad |
| Descarga fallida                | Una descarga se ha marcado como fallida                                         | instancia, aplicación        | nombre de la instancia, título, título con episodio o año, motivo  |
| Nuevo aviso de estado           | Aparece un aviso o un error en System → Status (una vez, hasta que desaparezca) | instancia, aplicación, nivel | nombre de la instancia, nivel, comprobación, mensaje               |

La integración lee el historial de cada instancia en cada actualización: una
descarga se anuncia como mucho un intervalo después de la importación, una sola
vez, incluso tras un reinicio. Los eventos de más de una hora no se anuncian
(un Gladys detenido una noche no repite la noche). Los avisos de estado
presentes al añadir una instancia son el punto de partida: solo se anuncian los
nuevos.

### Acciones

| Acción                                      | Qué hace                                                                                                                       | Salidas                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Buscar episodios o películas pendientes     | Inicia la búsqueda de todos los episodios o películas vigilados pendientes, en una instancia o en todas                        | instancias que iniciaron la búsqueda           |
| Actualizar la biblioteca de Sonarr o Radarr | Pide la actualización de la información y los archivos de cada serie o película (Sonarr o Radarr la ejecutan en segundo plano) | instancias actualizadas                        |
| Leer el resumen de Sonarr/Radarr            | Construye una frase: estrenos de la semana, cola, pendientes, avisos de estado                                                 | frase, estrenos, elementos en cola, pendientes |

Nunca se borra nada: la integración solo lee, e inicia búsquedas y
actualizaciones.

### Ideas de escenas

- **Noche de cine**: disparador _Episodio o película descargados_ con la
  aplicación _Radarr_, luego una notificación con la variable _Título con
  episodio (S01E02) o año_: «Avatar (2009) está listo».
- **Resumen de la mañana**: cada día a las 8:00, _Leer el resumen de
  Sonarr/Radarr_, luego enviar su frase por Telegram o hacer que la diga el
  altavoz.
- **Descargas atascadas**: disparador _Descarga fallida_, luego un mensaje con
  el motivo; o una escena sobre la función _Descargas con error_ por encima de 0.
- **Puesta al día semanal**: cada domingo por la noche, _Buscar episodios o
  películas pendientes_.

## Solución de problemas

- **«no responde»**: compruebe la dirección y el puerto desde la máquina de
  Gladys (`http://<dirección>:8989` para Sonarr, `:7878` para Radarr). Gladys
  ejecuta la integración en un contenedor: `localhost` es el propio contenedor,
  use la dirección IP de la máquina.
- **«clave de API rechazada»**: vuelva a copiar la clave desde Settings →
  General → Security. Una clave nueva en Sonarr o Radarr debe copiarse aquí.
- **«esta dirección es la otra aplicación»**: una dirección de Radarr en una
  sección de Sonarr, o al revés (con la clave de esa otra aplicación; con la
  clave correcta, una dirección equivocada responde «clave de API rechazada»).
- **«no hay ninguna API de Sonarr o Radarr en esta dirección»** o **«la
  dirección redirige»**: una instancia detrás de un proxy inverso necesita su
  base de URL (`https://example.org/sonarr`), y una página de inicio de sesión
  del proxy bloquea la API: use la dirección local.
- **«certificado rechazado»**: HTTPS con un certificado autofirmado no es
  compatible; use la dirección `http://` de su red.
- Sin cartel: Sonarr o Radarr aún no lo ha descargado (MediaCover); llega con
  la próxima actualización de la serie o película.

## Límites

- Sin webhook: el entorno aislado de Gladys no tiene puerto de entrada, así que
  las importaciones se leen del historial en cada actualización, no se envían
  al instante.
- El número de _Descargas con error_ lee los 100 primeros elementos de la cola.
- El widget muestra 12 estrenos como máximo, los primeros en el tiempo.
- Sin calendario en la vista de calendario de Gladys: una integración es o un
  dispositivo o un proveedor de calendario, y aquí cuentan más los
  dispositivos, disparadores y acciones. El widget hace de calendario.
- Lidarr, Readarr, Prowlarr y los clientes de descarga no están cubiertos.
- Sin relación con los proyectos Sonarr o Radarr.
