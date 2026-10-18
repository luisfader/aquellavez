#!/usr/bin/env python3
"""Graba con voz neuronal todas las frases y palabras en español que suenan en el test final.

Uso:   python3 tools/audio.py
Necesita: pip install sherpa-onnx numpy · ffmpeg · node (para leer assets/test-data.js)

La voz es «Daniela» (español de Argentina, Piper, licencia abierta). El modelo se descarga
una sola vez de GitHub en ~/.cache/aquellavez-tts. Solo se graban los textos nuevos; los
audios que ya no se usan se borran. Al final se escribe assets/audio-map.js.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tarfile
import urllib.request
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "audio")
MAP = os.path.join(ROOT, "assets", "audio-map.js")
VOICE = "vits-piper-es_AR-daniela-high"
URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{VOICE}.tar.bz2"
CACHE = os.environ.get("AV_TTS_CACHE", os.path.expanduser("~/.cache/aquellavez-tts"))
SPEED = 0.95  # un poco más lento que lo normal, para estudiantes de nivel A1


def key(text):
    """La misma normalización que usa test.js para buscar el audio."""
    return re.sub(r"\s+", " ", text).strip()


def spoken(text):
    """Lo que se lee en voz alta: sin pistas entre paréntesis ni flechas."""
    t = text.split(" :: ")[-1]  # «frase :: palabra» → solo la palabra
    t = re.sub(r"\s*\([^)]*\)", "", t).replace("→", " ").replace("…", " ")
    return re.sub(r"\s+", " ", t).strip()


def words(text):
    """Igual que words() en test.js: las fichas de una frase."""
    t = re.sub(r'[¿?¡!.,;:"«»]', " ", text).replace(" — ", " ")
    return [w for w in t.split() if w]


def fill_sentence(q):
    parts = q["text"].split("___")
    correct = q["options"][q["answer"]]
    bits = [b.strip() for b in correct.split("…")] if len(parts) > 2 else [correct]
    return "".join(p + (bits[i] if i < len(parts) - 1 else "") for i, p in enumerate(parts))


def texts():
    js = os.path.join(ROOT, "assets", "test-data.js")
    data = json.loads(subprocess.check_output(
        ["node", "-e", f"global.window={{}};require({json.dumps(js)});process.stdout.write(JSON.stringify(window.AV_TEST))"]))
    out = []
    for q in data["gramatica"] + data["vocab"]:
        out.append(fill_sentence(q))
    for q in data["images"]:
        out.append(q["word"])
    for q in data["pairs"]:
        out += [p[0] for p in q["items"]]
    for q in data["tiles"]:
        out.append(q["es"])
        toks = words(q["es"]) + q.get("x", {}).get("es", [])
        # con voz propia, las fichas de esta frase tienen sus propios audios
        out += [q["es"] + " :: " + w for w in toks] if q.get("voz") else toks
    for q in data["choice"]:
        out += q["es"]
    seen, uniq = set(), []
    for t in out:
        k = key(t)
        if k and k not in seen:
            seen.add(k)
            uniq.append(k)
    return uniq


def model_dir():
    d = os.path.join(CACHE, VOICE)
    if not os.path.isdir(d):
        os.makedirs(CACHE, exist_ok=True)
        tgz = d + ".tar.bz2"
        print("Descargando la voz", VOICE, "…")
        urllib.request.urlretrieve(URL, tgz)
        with tarfile.open(tgz) as t:
            t.extractall(CACHE)
        os.remove(tgz)
    return d


def engine():
    import sherpa_onnx as so
    d = model_dir()
    onnx = next(f for f in os.listdir(d) if f.endswith(".onnx"))
    cfg = so.OfflineTtsConfig(model=so.OfflineTtsModelConfig(
        vits=so.OfflineTtsVitsModelConfig(model=os.path.join(d, onnx), tokens=os.path.join(d, "tokens.txt"),
                                         data_dir=os.path.join(d, "espeak-ng-data")),
        num_threads=4))
    return so.OfflineTts(cfg)


def synth(tts, text, mp3):
    import numpy as np
    a = tts.generate(spoken(text), sid=0, speed=SPEED)
    x = np.clip(np.array(a.samples, dtype=np.float32), -1, 1)
    sr = a.sample_rate
    # Recorta el silencio de los extremos dejando margen para no comerse ninguna consonante
    peak = float(np.max(np.abs(x))) or 1.0
    loud = np.where(np.abs(x) > peak * 0.006)[0]
    if len(loud):
        x = x[max(0, loud[0] - int(.06 * sr)): loud[-1] + int(.15 * sr)]
    x = x / peak * 0.89  # mismo volumen máximo en todos los audios (-1 dBFS)
    pcm = (x * 32767).astype(np.int16)
    wav = mp3[:-4] + ".wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "24000",
                    "-b:a", "56k", mp3], check=True)
    os.remove(wav)


def file_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def main():
    os.makedirs(OUT, exist_ok=True)
    items = texts()
    mapping = {t: hashlib.sha1(t.encode("utf-8")).hexdigest()[:12] + ".mp3" for t in items}
    todo = [t for t in items if not os.path.exists(os.path.join(OUT, mapping[t]))]
    if todo:
        tts = engine()
        for i, t in enumerate(todo, 1):
            synth(tts, t, os.path.join(OUT, mapping[t]))
            sys.stdout.write(f"\r{i}/{len(todo)} grabados")
            sys.stdout.flush()
        print()
    used = set(mapping.values())
    removed = [f for f in os.listdir(OUT) if f.endswith(".mp3") and f not in used]
    for f in removed:
        os.remove(os.path.join(OUT, f))
    with open(MAP, "w", encoding="utf-8") as f:
        f.write("/* Generado por tools/audio.py: texto → archivo de audio/ (con ?v= según el contenido). No editar a mano. */\n")
        # ?v= cambia cuando cambia el audio, así el navegador no reproduce una versión vieja guardada
        versioned = {t: f"{a}?v={file_hash(os.path.join(OUT, a))}" for t, a in mapping.items()}
        f.write("window.AV_AUDIO = " + json.dumps(versioned, ensure_ascii=False, indent=0, sort_keys=True) + ";\n")
    print(f"{len(items)} audios en audio/ ({len(todo)} nuevos, {len(removed)} borrados)")


if __name__ == "__main__":
    main()
