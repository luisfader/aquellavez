# Aquella vez

Sitio web del manual de español para extranjeros **Aquella vez**, de Luis Fader.

## Estructura

- `index.html`: portada, prólogo y unidades.
- `unidad-1.html` … `unidad-10.html`: cada unidad con sus secciones (A, B, C, Gramática, Cultura, Historieta y Notas).
- `entrevista.html`: entrevista con el autor.
- `test-final.html`: test final de gramática, vocabulario y traducción (inglés, ruso y serbio).
- `content/`: el texto de cada unidad en formato simple (fácil de editar).
- `img/`: ilustraciones del manual.
- `assets/`: estilos (`style.css`) y comportamiento (`site.js`).

## Cómo editar el contenido

1. Cambia el texto en `content/uXX.txt`.
2. Ejecuta `python3 build.py` (requiere `pip install pillow`).
3. Sube los cambios.

Formato rápido de `content/`:

- `## A | Título`: nueva sección de la unidad.
- `### Subtítulo`
- `img: 633-8`: ilustración (archivo `img/633-8.jpg`).
- `ref: ser y tener`: enlace a la sección de gramática.
- `:::dialog … :::`: diálogo (`Nombre: texto`).
- `:::exercise Título … :::`: ejercicio. `___` crea un espacio para escribir.
- `:::vf … :::`: frases de verdadero o falso. `:::q … :::`: preguntas con respuesta.
- `:::box Título … :::`, `:::tip … :::`, `:::table … :::` (columnas con `|`), `:::cols` / `:::col`.

## Publicación

El sitio se publica con GitHub Pages desde la rama `main` (carpeta raíz).

## Cómo editar el test final

Las preguntas están en `assets/test-data.js`. Cada intento elige al azar 25 preguntas
(10 de gramática, 7 de vocabulario y 8 de traducción; se cambia en `draw`).
Se aprueba con más del 70 % (`pass`). En la cabecera del archivo se explica el formato
de cada tipo de pregunta. Después de editar, ejecuta `python3 build.py`.

## Audio del test

Las frases y palabras en español del test suenan con grabaciones de voz neuronal
(voz «Daniela», español de Argentina) guardadas en `audio/`. Si cambias o agregas
preguntas, vuelve a generar los audios:

1. `pip install sherpa-onnx numpy` (también hacen falta `ffmpeg` y `node`).
2. `python3 tools/audio.py` — graba solo los textos nuevos y borra los que ya no se usan.
3. `python3 build.py` y sube los cambios.
