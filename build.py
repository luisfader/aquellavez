#!/usr/bin/env python3
"""Genera el sitio web de «Aquella vez» a partir de los archivos de content/.

Uso:  python3 build.py
Requiere Pillow (pip install pillow) para leer el tamaño de las ilustraciones.
"""
import html
import json
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(ROOT, "img")

UNITS = [
    (1, "58-40", "Saludos, profesiones y números"),
    (2, "633-86", "La familia, la casa y la hora"),
    (3, "2861-3", "La rutina diaria"),
    (4, "2866-9", "La ciudad y la casa"),
    (5, "2909-5", "Gustos y comida"),
    (6, "639-150", "Acciones en curso y descripciones"),
    (7, "639-404", "El pasado: ¿qué hiciste?"),
    (8, "639-412", "Recuerdos, salud y planes"),
    (9, "639-655", "Órdenes, comparaciones y misterios"),
    (10, "639-663", "Biografías, estados y despedida"),
]

_size_cache = {}


def _test_draw():
    with open(os.path.join(ROOT, "assets", "test-data.js"), encoding="utf-8") as f:
        m = re.search(r"draw:\s*\{([^}]*)\}", f.read())
    return {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", m.group(1))}


TEST_DRAW = _test_draw()


def img_size(iid):
    if iid not in _size_cache:
        with Image.open(os.path.join(IMG_DIR, iid + ".jpg")) as im:
            _size_cache[iid] = im.size
    return _size_cache[iid]


# ---------------------------------------------------------------- inline
def inline(text):
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)

    def blank(m):
        n = len(m.group(0))
        w = max(5, min(n, 34))
        return f'<input class="blank" style="--w:{w}ch" aria-label="Respuesta" autocomplete="off">'

    t = re.sub(r"_{3,}", blank, t)
    t = t.replace("□ ", "").replace("□", "")
    return t


# ---------------------------------------------------------------- blocks
def figure(spec, ctx):
    parts = [p.strip() for p in spec.split("|")]
    iid = parts[0]
    cap = parts[1] if len(parts) > 1 else ""
    cls = parts[2] if len(parts) > 2 and parts[2] else None
    w, h = img_size(iid)
    if not cls:
        r = w / h
        cls = "wide" if r > 1.75 else ("land" if r >= 0.95 else "port")
    alt = cap or ctx.get("alt", "Ilustración del manual Aquella vez")
    capt = f"<figcaption>{inline(cap)}</figcaption>" if cap else ""
    return (
        f'<figure class="fig {cls}"><img src="img/{iid}.jpg" width="{w}" height="{h}" '
        f'loading="lazy" decoding="async" alt="{html.escape(alt)}" data-zoom>{capt}</figure>'
    )


def para(lines):
    if all(re.match(r"^- ", l) for l in lines):
        return "<ul>" + "".join(f"<li>{inline(l[2:])}</li>" for l in lines) + "</ul>"
    return "<p>" + "<br>".join(inline(l) for l in lines) + "</p>"


def split_container(lines, i):
    """lines[i] starts a ':::kind'. Returns (kind, arg, inner_lines, next_index)."""
    head = lines[i].strip()[3:].strip()
    kind, _, arg = head.partition(" ")
    depth = 1
    j = i + 1
    inner = []
    while j < len(lines):
        s = lines[j].strip()
        if s.startswith(":::") and len(s) > 3:
            depth += 1
        elif s == ":::":
            depth -= 1
            if depth == 0:
                return kind, arg.strip(), inner, j + 1
        inner.append(lines[j])
        j += 1
    raise ValueError(f"Contenedor sin cerrar: {head}")


def nonblank(lines):
    return [l.strip() for l in lines if l.strip()]


SPEAKER = re.compile(r"^([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ .]{0,28}?):\s+(.*)$")


def container(kind, arg, inner, ctx):
    if kind == "dialog":
        out = []
        for l in nonblank(inner):
            m = SPEAKER.match(l)
            if m:
                out.append(f'<p class="line"><span class="who">{inline(m.group(1))}</span><span class="said">{inline(m.group(2))}</span></p>')
            else:
                out.append(f'<p class="line"><span class="said">{inline(l)}</span></p>')
        return '<div class="dialog">' + "".join(out) + "</div>"
    if kind == "q":
        items = "".join(
            f'<li><span class="qt">{inline(l)}</span><input class="blank answer" aria-label="Tu respuesta" autocomplete="off"></li>'
            for l in nonblank(inner)
        )
        return f'<ol class="questions">{items}</ol>'
    if kind == "vf":
        rows = "".join(
            f'<li><span>{inline(l)}</span><span class="toggle" role="group" aria-label="Verdadero o falso">'
            f'<button type="button" data-v="V" aria-pressed="false" title="Verdadero">V</button>'
            f'<button type="button" data-v="F" aria-pressed="false" title="Falso">F</button></span></li>'
            for l in nonblank(inner)
        )
        return f'<ol class="vf">{rows}</ol>'
    if kind == "choice":
        rows = []
        for l in nonblank(inner):
            cells = [c.strip() for c in l.split("|")]
            btns = "".join(
                f'<button type="button" data-v="{k}" aria-pressed="false">{inline(c)}</button>'
                for k, c in enumerate(cells[1:])
            )
            rows.append(f'<li><span class="lead">{inline(cells[0])}</span><span class="toggle multi" role="group">{btns}</span></li>')
        return '<ol class="vf choice">' + "".join(rows) + "</ol>"
    if kind == "words":
        return '<ul class="words">' + "".join(f"<li>{inline(l)}</li>" for l in nonblank(inner)) + "</ul>"
    if kind == "table":
        rows = [[c.strip() for c in l.split("|")] for l in nonblank(inner)]
        head = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
        body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
        return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'
    if kind == "glossary":
        out = []
        for l in nonblank(inner):
            term, _, rest = l.partition(":")
            definition, _, ex = rest.partition("|")
            exh = f'<span class="ex">Ejemplo: {inline(ex.strip())}</span>' if ex.strip() else ""
            out.append(f"<div><dt>{inline(term)}</dt><dd>{inline(definition.strip())}{exh}</dd></div>")
        return '<dl class="glossary">' + "".join(out) + "</dl>"
    if kind == "alphabet":
        letters = nonblank(inner)[0]
        return '<p class="alphabet" aria-label="El abecedario">' + "".join(f"<span>{c}</span>" for c in letters) + "</p>"
    body = blocks(inner, ctx)
    if kind == "cols":
        return f'<div class="cols">{body}</div>'
    if kind == "col":
        return f'<div class="col">{body}</div>'
    if kind == "gallery":
        return f'<div class="gallery">{body}</div>'
    if kind == "box":
        t = f'<h4>{inline(arg)}</h4>' if arg else ""
        return f'<div class="box">{t}{body}</div>'
    if kind == "exercise":
        t = f'<h4><span class="tag">Ejercicio</span>{inline(arg)}</h4>' if arg else ""
        return f'<div class="exercise">{t}{body}</div>'
    if kind == "tip":
        return f'<aside class="tip">{body}</aside>'
    if kind == "bubble":
        return f'<div class="bubble">{body}</div>'
    raise ValueError(f"Tipo de bloque desconocido: {kind}")


def blocks(lines, ctx):
    out, buf = [], []

    def flush():
        if buf:
            out.append(para(buf))
            buf.clear()

    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()
        if not s:
            flush()
            i += 1
            continue
        if s.startswith(":::") and len(s) > 3:
            flush()
            kind, arg, inner, i = split_container(lines, i)
            out.append(container(kind, arg, inner, ctx))
            continue
        if s.startswith("### "):
            flush()
            out.append(f'<h3>{inline(s[4:])}</h3>')
        elif s.startswith("img: "):
            flush()
            fig = figure(s[5:], ctx)
            # Una ilustración vertical al lado de un diálogo o un texto corrido flota a la derecha
            nxt = next((l.strip() for l in lines[i + 1:] if l.strip()), "")
            if ' port"' in fig and not ctx.get("inbox") and (
                nxt.startswith(":::dialog") or not (nxt.startswith(":::") or nxt.startswith("img:") or nxt.startswith("###"))
            ):
                fig = fig.replace(' port"', ' port float"', 1)
            out.append(fig)
        elif s.startswith("ref: "):
            flush()
            out.append(
                f'<a class="ref" href="#d"><span aria-hidden="true">§</span> '
                f'Gramática: {inline(s[5:])}</a>'
            )
        else:
            buf.append(s)
        i += 1
    flush()
    return "".join(out)


# ---------------------------------------------------------------- pages
def parse_unit(n):
    path = os.path.join(ROOT, "content", f"u{n:02d}.txt")
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    sections, cur = [], None
    for l in lines:
        m = re.match(r"^## (\w) \| (.+)$", l.strip())
        if m:
            cur = {"letter": m.group(1), "title": m.group(2).strip(), "lines": []}
            sections.append(cur)
        elif cur is not None:
            cur["lines"].append(l)
    return sections


def sec_id(letter):
    return "notas" if letter == "N" else letter.lower()


def sec_label(letter):
    return "Notas" if letter == "N" else letter


HEAD = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,500&family=PT+Sans:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">{extra_css}
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="img/651-12.jpg">
</head>
<body class="{bodycls}">
<a class="skip" href="#main">Saltar al contenido</a>
<header class="topbar">
  <a class="brand" href="index.html"><span class="brand-mark">Aquella vez</span><span class="brand-sub">Manual de español</span></a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu">Unidades</button>
  <nav id="menu" class="menu" aria-label="Unidades">
    <ol>{menu}</ol>
    <a class="menu-extra" href="entrevista.html">Entrevista con el autor</a>
    <a class="menu-extra test" href="test-final.html">Test final</a>
  </nav>
</header>
"""

FOOT_TPL = """<footer class="foot">
  <p class="foot-brand">Aquella vez</p>
  <p>Manual de español para extranjeros · <strong>Luis Fader</strong> · 2026</p>
  <p class="foot-small">Los textos, personajes e ilustraciones pertenecen al autor.</p>
</footer>
<div class="lightbox" hidden><button type="button" class="lb-close" aria-label="Cerrar">×</button><img alt=""></div>
<script src="assets/site.js"></script>
{scripts}</body>
</html>
"""


FOOT = FOOT_TPL.format(scripts="")


def menu(active=None):
    out = []
    for n, _, tema in UNITS:
        cur = ' aria-current="page"' if n == active else ""
        out.append(f'<li><a href="unidad-{n}.html"{cur}><b>{n}</b><span>{html.escape(tema)}</span></a></li>')
    return "".join(out)


def head(title, desc, bodycls="", active=None, extra_css=""):
    return HEAD.format(title=html.escape(title), desc=html.escape(desc), bodycls=bodycls, menu=menu(active), extra_css=extra_css)


def unit_page(n, cover, tema, sections):
    tabs = "".join(
        f'<li><a href="#{sec_id(s["letter"])}"><b>{sec_label(s["letter"])}</b> {inline(s["title"])}</a></li>'
        for s in sections
        if s["letter"] != "N"
    )
    if any(s["letter"] == "N" for s in sections):
        tabs += '<li><a href="#notas"><b>✦</b> Notas importantes</a></li>'
    body = []
    for s in sections:
        sid = sec_id(s["letter"])
        lab = sec_label(s["letter"]) if s["letter"] != "N" else "✦"
        kind = "comic" if s["title"].lower().startswith("historieta") else ""
        body.append(
            f'<section class="unit-sec {kind}" id="{sid}" data-letter="{s["letter"]}">'
            f'<header class="sec-head"><span class="sec-letter">{lab}</span>'
            f'<h2>{inline(s["title"])}</h2></header>'
            f'<div class="prose">{blocks(s["lines"], {"alt": s["title"]})}</div></section>'
        )
    prev_l = f'<a class="pn prev" href="unidad-{n-1}.html"><small>Anterior</small>Unidad {n-1}</a>' if n > 1 else '<a class="pn prev" href="index.html"><small>Volver</small>Portada</a>'
    next_l = f'<a class="pn next" href="unidad-{n+1}.html"><small>Siguiente</small>Unidad {n+1}</a>' if n < 10 else '<a class="pn next" href="test-final.html"><small>Para terminar</small>Test final</a>'
    w, h = img_size(cover)
    page = head(f"Unidad {n} · Aquella vez", f"Unidad {n} del manual de español Aquella vez, de Luis Fader: {tema}.", "unit", n)
    page += f"""<main id="main">
<section class="unit-hero">
  <div class="unit-hero-text">
    <p class="eyebrow">Aquella vez · Manual de español</p>
    <h1><span>Unidad</span> {n}</h1>
    <p class="tema">{html.escape(tema)}</p>
    <ol class="toc">{tabs}</ol>
  </div>
  <figure class="unit-cover"><img src="img/{cover}.jpg" width="{w}" height="{h}" alt="Portada de la unidad {n}" data-zoom></figure>
</section>
<nav class="sec-nav" aria-label="Secciones de la unidad"><ol>{tabs}</ol></nav>
<div class="unit-body">
{''.join(body)}
<div class="tools"><button type="button" class="clear-answers">Borrar mis respuestas de esta unidad</button></div>
<nav class="prevnext" aria-label="Otras unidades">{prev_l}{next_l}</nav>
</div>
</main>
"""
    page += FOOT
    return page


def index_page(all_sections):
    cards = []
    for (n, cover, tema), secs in zip(UNITS, all_sections):
        items = "".join(
            f"<li>{sec_label(s['letter'])}. {inline(s['title'])}</li>" for s in secs if s["letter"] != "N"
        )
        w, h = img_size(cover)
        cards.append(
            f'<li class="ucard"><a href="unidad-{n}.html">'
            f'<img src="img/{cover}.jpg" width="{w}" height="{h}" loading="lazy" alt="">'
            f'<span class="ucard-body"><span class="ucard-n">Unidad {n}</span>'
            f'<span class="ucard-t">{html.escape(tema)}</span><ol>{items}</ol></span></a></li>'
        )
    page = head("Aquella vez · Manual de español para extranjeros", "Aquella vez, manual de español para extranjeros de Luis Fader: diez unidades con diálogos, gramática, cultura e historietas.", "home")
    page += f"""<main id="main">
<section class="hero">
  <div class="hero-text">
    <p class="eyebrow">Manual de español para extranjeros · Nivel A1</p>
    <h1>Aquella vez</h1>
    <p class="author">Luis Fader</p>
    <p class="lede">Diez unidades para aprender español con personajes, diálogos, pequeñas historias y mucha imaginación.</p>
    <p class="cta"><a class="btn" href="unidad-1.html">Empezar la Unidad 1</a><a class="btn ghost" href="#unidades">Ver todas las unidades</a></p>
  </div>
  <figure class="hero-cover"><img src="img/651-12.jpg" width="{img_size('651-12')[0]}" height="{img_size('651-12')[1]}" alt="Portada del libro Aquella vez" data-zoom></figure>
</section>

<section class="prologo" id="prologo">
  <figure class="fig land"><img src="img/3129-2.jpg" width="{img_size('3129-2')[0]}" height="{img_size('3129-2')[1]}" loading="lazy" alt="Ilustración del prólogo" data-zoom></figure>
  <div>
    <h2>Prólogo</h2>
    <p>Decidí escribir este manual de español para ayudar a los estudiantes a aprender de una forma clara, práctica y agradable. Elegí usar un español neutro para que todas las personas que quieran estudiar el idioma puedan sentirse cómodas, sin importar su país o su variante preferida.</p>
    <p>También quise que el libro tuviera personajes, diálogos y pequeñas historias. Soy escritor, y para mí una lengua no vive solo en las reglas gramaticales, sino también en las personas, las emociones y las situaciones. Por eso, en estas páginas aparecen personajes de mis novelas y de mi mundo literario.</p>
    <p>Espero que este manual sea una puerta de entrada al español, pero también a la imaginación. Que cada texto, cada ejercicio y cada imagen ayuden al estudiante a aprender, recordar y disfrutar el camino.</p>
    <p class="firma">Luis Fader<br><span>Mayo de 2026</span></p>
  </div>
</section>

<section class="como" aria-labelledby="como-t">
  <h2 id="como-t">Cómo está organizada cada unidad</h2>
  <ol class="como-list">
    <li><b>A · B · C</b><span>Diálogos, lecturas y ejercicios con los personajes del libro.</span></li>
    <li><b>D</b><span>Gramática: las reglas con tablas y ejemplos claros.</span></li>
    <li><b>E</b><span>Cultura del mundo hispanohablante.</span></li>
    <li><b>F</b><span>Historieta para repasar todo lo aprendido.</span></li>
  </ol>
  <p class="como-note">Puedes escribir tus respuestas directamente en los ejercicios y marcar <b>V</b> o <b>F</b>. Tus respuestas se guardan en este navegador.</p>
</section>

<section class="unidades" id="unidades" aria-labelledby="u-t">
  <h2 id="u-t">Unidades</h2>
  <ol class="ucards">{''.join(cards)}</ol>
</section>

<section class="test-banner" aria-label="Test final">
  <a href="test-final.html">
    <img src="img/644-9.jpg" width="{img_size('644-9')[0]}" height="{img_size('644-9')[1]}" loading="lazy" alt="">
    <span><b>Test final</b><span>Veinticinco preguntas de gramática, vocabulario y traducción sobre todo el manual. ¿Apruebas?</span></span>
    <span class="qbtn">Hacer el test</span>
  </a>
</section>

<section class="personajes" aria-labelledby="p-t">
  <div>
    <h2 id="p-t">Los personajes</h2>
    <p>Luis, Nátasha, Natalia Rosa, Roberto, Alicia y Marcos —y muchos más— viajan por Sinea, Madrid, San Petersburgo y la fortaleza turquesa. Con ellos el español se aprende en situaciones divertidas, misteriosas y románticas.</p>
    <p><a class="btn ghost" href="unidad-8.html#c">Conocerlos en la Unidad 8</a></p>
  </div>
  <figure class="fig land"><img src="img/639-482.jpg" width="{img_size('639-482')[0]}" height="{img_size('639-482')[1]}" loading="lazy" alt="Los personajes: Luis, Nátasha, Natalia Rosa, Roberto, Alicia y Marcos" data-zoom></figure>
</section>

<section class="autor">
  <a class="autor-card" href="entrevista.html">
    <img src="img/639-800.jpg" width="{img_size('639-800')[0]}" height="{img_size('639-800')[1]}" loading="lazy" alt="Retrato de Luis Fader">
    <span><small>Entrevista</small><b>Conversación con Luis Fader</b><span>Por qué un manual con personajes, novelas y misterios.</span></span>
  </a>
  <a class="autor-card" href="unidad-10.html#g">
    <img src="img/2923-15.jpg" width="{img_size('2923-15')[0]}" height="{img_size('2923-15')[1]}" loading="lazy" alt="Historieta final">
    <span><small>Repaso final</small><b>¡Hasta la próxima!</b><span>La historieta que cierra el libro.</span></span>
  </a>
</section>
</main>
"""
    page += FOOT
    return page


def interview_page():
    lines = [
        ("Entrevistador", "Luis Fader, muchas gracias por hablar con nosotros. ¿Qué representa este libro?"),
        ("Luis Fader", "Este libro es un manual de español para estudiantes extranjeros. No es solo un libro de gramática. Es también un viaje con personajes, historias, diálogos, imágenes y pequeñas situaciones misteriosas."),
        ("Entrevistador", "¿Por qué decidió escribir un manual así?"),
        ("Luis Fader", "Porque aprender un idioma no debe ser aburrido. El estudiante necesita reglas, ejercicios y vocabulario, pero también necesita emoción. Por eso en este libro aparecen personajes como Marcos, Alicia, Robert, Nátasha, Luis, Natalia y otros. Ellos viven situaciones divertidas, misteriosas o románticas, y el estudiante aprende español con ellos."),
        ("Entrevistador", "En el libro hay muchos personajes. ¿Son importantes para aprender?"),
        ("Luis Fader", "Sí, mucho. Cuando un estudiante lee una frase como “Marcos está cansado” o “Alicia fue a la consulta”, no aprende solo una estructura gramatical. También recuerda una escena, una emoción y un personaje. Eso ayuda mucho a memorizar."),
        ("Entrevistador", "¿Qué temas gramaticales aparecen en el libro?"),
        ("Luis Fader", "Hay muchos temas básicos: el verbo ser, el verbo estar, el verbo gustar, el verbo doler, el pretérito indefinido, el pretérito imperfecto, los comparativos, el imperativo, las palabras como algo, nada, alguien y nadie, y también la construcción ir a + infinitivo."),
        ("Entrevistador", "¿El libro tiene relación con sus novelas?"),
        ("Luis Fader", "Sí. Algunas actividades están inspiradas en mis novelas. Por ejemplo, aparecen referencias a *El misterio de los Fader*, *Presentimiento*, *La hora salvaje*, *La chica del retrato* y otras historias. Me gusta que el estudiante sienta que el español abre la puerta a un mundo literario."),
        ("Entrevistador", "¿Qué puede decirnos sobre *El misterio de los Fader*?"),
        ("Luis Fader", "*El misterio de los Fader* es una novela de secretos familiares, aventuras y enigmas. Tiene una atmósfera especial, con personajes que buscan respuestas sobre el pasado. Es una historia más íntima y emocionante."),
        ("Entrevistador", "¿Y *Presentimiento*?"),
        ("Luis Fader", "*Presentimiento* es una novela más épica. Habla de una fortaleza, de un mundo difícil y de personajes que quieren construir algo nuevo. Tiene más acción, más peligro y una mirada más filosófica."),
        ("Entrevistador", "También aparece *La chica del retrato*. ¿Qué tipo de historia es?"),
        ("Luis Fader", "Es una novela policíaca con intrigas informáticas, hackers y misterio. La idea de un rostro que aparece en sitios web hackeados me parece muy potente. Es una historia ideal para crear ejercicios de español con vocabulario moderno."),
        ("Entrevistador", "¿Por qué mezcla literatura y enseñanza?"),
        ("Luis Fader", "Porque una lengua vive en las historias. Un estudiante puede aprender una regla, pero necesita usarla en una situación real o imaginaria. Si hay una historia, la gramática tiene sentido y el estudiante puede usarla con confianza."),
        ("Entrevistador", "¿Para quién es este libro?"),
        ("Luis Fader", "Para estudiantes de nivel inicial, especialmente A1, pero también para profesores que quieren materiales diferentes. El libro busca ser claro, visual y atractivo."),
        ("Entrevistador", "¿Qué espera que sientan los estudiantes?"),
        ("Luis Fader", "Espero que sientan curiosidad. Quiero que digan: “Entiendo esta frase”, “quiero saber qué pasa después”, “quiero hablar de estos personajes”. Si un estudiante siente eso, el aprendizaje empieza a funcionar mejor."),
        ("Entrevistador", "Para terminar, ¿qué significa para usted enseñar español?"),
        ("Luis Fader", "Enseñar español es abrir una puerta. Detrás de esa puerta hay palabras, culturas, música, viajes, libros y personas. Mi trabajo es ayudar al estudiante a cruzarla."),
    ]
    qa = "".join(
        f'<p class="{"q" if who == "Entrevistador" else "a"}"><span class="who">{who}</span>{inline(t)}</p>'
        for who, t in lines
    )
    w, h = img_size("639-800")
    w2, h2 = img_size("639-804")
    page = head("Entrevista con Luis Fader · Aquella vez", "Entrevista con Luis Fader, autor del manual de español Aquella vez.", "interview")
    page += f"""<main id="main" class="interview-main">
<header class="iv-head">
  <figure><img src="img/639-800.jpg" width="{w}" height="{h}" alt="Retrato de Luis Fader"></figure>
  <div><p class="eyebrow">Entrevista con el autor</p><h1>Luis Fader</h1><p class="lede">Sobre <em>Aquella vez</em>, sus personajes y el mundo literario que hay detrás del manual.</p></div>
</header>
<article class="iv">{qa}</article>
<figure class="fig wide iv-books"><img src="img/639-804.jpg" width="{w2}" height="{h2}" loading="lazy" alt="Novelas de Robert Fader" data-zoom></figure>
<nav class="prevnext"><a class="pn prev" href="unidad-10.html"><small>Volver</small>Unidad 10</a><a class="pn next" href="index.html"><small>Inicio</small>Portada</a></nav>
</main>
"""
    page += FOOT
    return page


def test_page():
    """Página del test final. Las preguntas están en assets/test-data.js."""
    with open(os.path.join(ROOT, "assets", "test-data.js"), encoding="utf-8") as f:
        ids = set(re.findall(r'"(\d+-\d+)"', f.read()))
    ids |= {"644-9", "639-663", "639-68", "651-12", "639-715", "639-209"}
    sizes = {i: list(img_size(i)) for i in sorted(ids) if os.path.exists(os.path.join(IMG_DIR, i + ".jpg"))}
    sizes_js = json.dumps(sizes, separators=(",", ":"))

    def pic(iid, alt, extra=""):
        w, h = img_size(iid)
        return f'<img src="img/{iid}.jpg" width="{w}" height="{h}" alt="{html.escape(alt)}"{extra}>'

    d = TEST_DRAW
    n_gram = d["gramatica"]
    n_lex = d["images"] + d["vocab"] + d["pairs"]
    n_tr = d["tiles"] + d["choice"]
    total = n_gram + n_lex + n_tr
    page = head(
        "Test final · Aquella vez",
        "Test final del manual de español Aquella vez: gramática, vocabulario y traducción del inglés, el ruso y el serbio.",
        "quiz",
        extra_css='\n<link rel="stylesheet" href="assets/test.css">',
    )
    page += f"""<main id="main" class="quiz-main">
<section class="quiz-intro" id="intro" aria-labelledby="qi-t">
  <div class="qi-text">
    <h1 id="qi-t">Test final</h1>
    <p class="qi-sub">Aquella vez, unidades 1 a 10</p>
    <p class="lede">Elige la opción correcta, une palabras y traduce frases con los personajes del libro. Para aprobar necesitas más del 70&nbsp;% de respuestas correctas.</p>
    <ul class="qi-mix">
      <li><b>{n_gram}</b> de gramática</li>
      <li><b>{n_lex}</b> de vocabulario</li>
      <li><b>{n_tr}</b> de traducción</li>
    </ul>
    <fieldset class="qi-lang">
      <legend>Traducciones con</legend>
      <div class="opts">
        <label><input type="radio" name="lang" value="mix" checked><span>Los tres idiomas</span></label>
        <label><input type="radio" name="lang" value="en"><span lang="en">English</span></label>
        <label><input type="radio" name="lang" value="ru"><span lang="ru">Русский</span></label>
        <label><input type="radio" name="lang" value="sr"><span lang="sr-Latn">Srpski</span></label>
      </div>
    </fieldset>
    <div class="qi-go">
      <button type="button" class="qbtn" id="start">Empezar el test</button>
      <p class="qi-best" aria-live="polite"></p>
    </div>
  </div>
  <div class="qi-art" aria-hidden="true">
    <figure class="p1">{pic("639-715", "")}</figure>
    <figure class="p2">{pic("651-12", "")}</figure>
    <figure class="p3">{pic("639-68", "")}<figcaption>Marcos</figcaption></figure>
    <span class="qi-fox">{pic("644-9", "")}</span>
    <p class="qi-note">¿Listo para el último misterio?</p>
  </div>
</section>

<section class="quiz-play" id="play" hidden aria-label="Preguntas">
  <div class="qp-top">
    <button type="button" class="qp-close" aria-label="Salir del test" title="Salir del test">×</button>
    <div class="qp-progress" role="progressbar" aria-label="Progreso" aria-valuemin="0" aria-valuemax="{total}" aria-valuenow="0"><span></span></div>
    <span class="qp-streak" hidden></span>
    <span class="qp-count"></span>
    <button type="button" class="qp-close qp-mute" aria-pressed="false" title="Silenciar sonidos"></button>
  </div>
  <div class="qp-stage" id="stage"></div>
</section>

<section class="quiz-result" id="result" hidden aria-label="Resultado"></section>
</main>
<div class="qp-bar" id="bar" hidden>
  <div class="qp-bar-in">
    <div class="qp-fb"><button type="button" class="qbtn quiet qp-skip">Saltar</button></div>
    <button type="button" class="qbtn" id="check" disabled>Comprobar</button>
  </div>
</div>
<noscript><p style="text-align:center;padding:2rem">El test necesita JavaScript activado en el navegador.</p></noscript>
"""
    page += FOOT_TPL.format(scripts=(
        f'<script>window.AV_IMG_SIZES={sizes_js};</script>\n'
        '<script src="assets/test-data.js"></script>\n'
        '<script src="assets/audio-map.js"></script>\n'
        '<script src="assets/test.js"></script>\n'
    ))
    return page


def main():
    all_sections = []
    for n, cover, tema in UNITS:
        secs = parse_unit(n)
        all_sections.append(secs)
        with open(os.path.join(ROOT, f"unidad-{n}.html"), "w", encoding="utf-8") as f:
            f.write(unit_page(n, cover, tema, secs))
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_page(all_sections))
    with open(os.path.join(ROOT, "entrevista.html"), "w", encoding="utf-8") as f:
        f.write(interview_page())
    with open(os.path.join(ROOT, "test-final.html"), "w", encoding="utf-8") as f:
        f.write(test_page())
    print("Sitio generado:", len(UNITS), "unidades + portada + entrevista + test final")


if __name__ == "__main__":
    main()
