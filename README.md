# Aquella vez

Sitio web del manual de español para extranjeros **Aquella vez**, de Luis Fader.

## Estructura

- `index.html`: portada, prólogo y unidades.
- `unidad-1.html` … `unidad-10.html`: cada unidad con sus secciones (A, B, C, Gramática, Cultura, Historieta y Notas).
- `entrevista.html`: entrevista con el autor.
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
