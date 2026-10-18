/* Aquella vez — test final: lógica del juego */
(function () {
  "use strict";
  var D = window.AV_TEST;
  var SIZES = window.AV_IMG_SIZES || {};
  if (!D) return;

  var LANGS = {
    en: { name: "English", to: "al inglés", tts: "en-GB" },
    ru: { name: "Русский", to: "al ruso", tts: "ru-RU" },
    sr: { name: "Srpski", to: "al serbio", tts: "sr-RS" }
  };
  var CATS = { gramatica: "Gramática", lexico: "Vocabulario", traduccion: "Traducción" };
  var PRAISE = ["¡Muy bien!", "¡Excelente!", "¡Perfecto!", "¡Genial!", "¡Así se hace!", "¡Correcto!"];
  var OOPS = ["Casi…", "No exactamente", "¡Uy! No es esa", "Respuesta incorrecta"];
  var KEY = "aquellavez:test";
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } },
    set: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  };

  // ---------------------------------------------------------------- utilidades
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a, n) { return shuffle(a).slice(0, n); }
  function img(id, alt, cls) {
    var s = SIZES[id] || [800, 800];
    return el("img", { src: "img/" + id + ".jpg", width: s[0], height: s[1], alt: alt || "", decoding: "async", class: cls });
  }
  function norm(s) {
    return String(s).toLowerCase().replace(/ё/g, "е").replace(/[¿?¡!.,;:—–\-"«»]/g, " ").replace(/\s+/g, " ").trim();
  }
  function words(s) { return String(s).replace(/[¿?¡!.,;:"«»]/g, " ").replace(/\s—\s/g, " ").split(/\s+/).filter(Boolean); }

  // ---------------------------------------------------------------- voz y sonido
  // Las frases en español suenan con grabaciones de audio/ (voz neuronal, ver tools/audio.py).
  var AUDIO = window.AV_AUDIO || {};
  var player = null;
  function clip(text) { return text ? AUDIO[String(text).replace(/\s+/g, " ").trim()] : null; }
  function stopAudio() { if (player) { try { player.pause(); } catch (e) {} } }
  // auto = suena solo al tocar una ficha o una palabra; se calla con el botón de silencio
  function speak(text, auto) {
    var f = clip(text);
    if (!f || (auto && state.mute)) return;
    stopAudio();
    try { player = new Audio("audio/" + f); var p = player.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function speakBtn(text) {
    if (!clip(text)) return null;
    var b = el("button", { type: "button", class: "speak", "aria-label": "Escuchar", title: "Escuchar",
      html: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' });
    b.addEventListener("click", function (e) { e.stopPropagation(); speak(text); });
    return b;
  }
  var actx = null;
  function tone(ok) {
    if (state.mute) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var notes = ok ? [659.25, 987.77] : [220, 196];
      notes.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * .11;
        o.type = ok ? "triangle" : "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ok ? .16 : .12, t + .015);
        g.gain.exponentialRampToValueAtTime(.001, t + (ok ? .32 : .28));
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + .35);
      });
    } catch (e) {}
  }

  // ---------------------------------------------------------------- estado
  var state = { lang: "mix", items: [], i: 0, results: [], streak: 0, best: 0, current: null, phase: "idle", mute: false };

  var intro = $("#intro"), play = $("#play"), result = $("#result"), bar = $("#bar");
  var stage = $("#stage"), prog = $(".qp-progress span"), progBox = $(".qp-progress"), count = $(".qp-count"), streakEl = $(".qp-streak");
  var fb = $(".qp-fb"), checkBtn = $("#check"), skipBtn = $(".qp-skip");

  function langFor(k) { return state.lang === "mix" ? k : state.lang; }

  function buildItems() {
    var n = D.draw, items = [];
    var langCycle = shuffle(["en", "ru", "sr"]), li = 0;
    function nextLang() { var l = state.lang === "mix" ? langCycle[li++ % 3] : state.lang; return l; }

    pick(D.gramatica, n.gramatica).forEach(function (q) { items.push(fillItem(q, "gramatica")); });
    var lex = [];
    pick(D.images, n.images).forEach(function (q) { lex.push({ type: "image", cat: "lexico", q: q, order: shuffle([0, 1, 2, 3]) }); });
    pick(D.vocab, n.vocab).forEach(function (q) { lex.push(fillItem(q, "lexico")); });
    pick(D.pairs, n.pairs).forEach(function (q) { lex.push({ type: "pairs", cat: "lexico", q: q, lang: nextLang() }); });

    var tr = [], dirs = shuffle([true, false, true, false, true, false, true, false]), di = 0;
    pick(D.tiles, n.tiles).forEach(function (q) {
      var toEs = q.dir === "to_es" ? true : dirs[di++ % dirs.length];
      tr.push({ type: "tiles", cat: "traduccion", q: q, lang: nextLang(), toEs: toEs });
    });
    pick(D.choice, n.choice).forEach(function (q) {
      tr.push({ type: "choice", cat: "traduccion", q: q, lang: nextLang(), toEs: dirs[di++ % dirs.length], order: shuffle([0, 1, 2]) });
    });

    // Mezcla las categorías sin dejar dos pares de unir seguidos
    var all = shuffle(items.concat(lex, tr));
    for (var i = 1; i < all.length; i++) {
      if (all[i].type === "pairs" && all[i - 1].type === "pairs") {
        var j = (i + 2) % all.length; var t = all[i]; all[i] = all[j]; all[j] = t;
      }
    }
    return all;
  }
  function fillItem(q, cat) {
    var order = shuffle(q.options.map(function (_, k) { return k; }));
    return { type: "fill", cat: cat, q: q, order: order };
  }

  // ---------------------------------------------------------------- pantallas
  function show(which) {
    intro.hidden = which !== "intro"; play.hidden = which !== "play"; result.hidden = which !== "result";
    bar.hidden = which !== "play";
    document.body.classList.toggle("in-quiz", which === "play");
    window.scrollTo(0, 0);
  }

  function start() {
    var checked = $('input[name="lang"]:checked');
    if (!checked) return;  // hay que elegir un idioma antes de empezar
    state.lang = checked.value;
    var saved = store.get(); saved.lang = state.lang; store.set(saved);
    state.items = buildItems(); state.i = 0; state.results = []; state.streak = 0; state.best = 0;
    show("play"); next();
  }

  function next() {
    if (state.i >= state.items.length) return finish();
    var item = state.items[state.i];
    state.phase = "answering";
    setBar("idle");
    var total = state.items.length;
    prog.style.width = (state.i / total * 100) + "%";
    progBox.setAttribute("aria-valuenow", state.i);
    count.textContent = (state.i + 1) + " / " + total;
    stage.innerHTML = "";
    var wrap = el("div", { class: reduceMotion ? "" : "qs-anim" });
    stage.appendChild(wrap);
    state.current = RENDER[item.type](item, wrap);
    preload(state.items[state.i + 1]);
    var h = wrap.querySelector(".qs-title"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }
  function preload(item) {
    if (!item) return;
    var ids = [item.q.img].concat(item.type === "image" ? item.q.options : []);
    ids.forEach(function (id) { if (id) { var i = new Image(); i.src = "img/" + id + ".jpg"; } });
  }

  function head(item, title, wrap) {
    var meta = el("div", { class: "qs-head" }, [el("span", { class: "qs-cat", text: CATS[item.cat] })]);
    if (item.q.u) meta.appendChild(el("span", { class: "qs-unit", text: "Unidad " + item.q.u }));
    wrap.appendChild(meta);
    wrap.appendChild(el("h2", { class: "qs-title", text: title }));
  }
  function scene(id, alt, bubble, wrap, contain) {
    var fig = el("figure", { class: "scene-pic" + (contain ? " contain" : "") }, [img(id, alt)]);
    var s = el("div", { class: "scene" }, [fig, bubble]);
    wrap.appendChild(s);
    return s;
  }
  function optionButton(label, k, onPick) {
    var b = el("button", { type: "button", class: "opt", role: "radio", "aria-checked": "false" }, [el("span", { class: "k", text: String(k + 1), "aria-hidden": "true" }), el("span", { class: "t", text: label })]);
    b.addEventListener("click", function () { onPick(k); });
    return b;
  }

  // ---------------------------------------------------------------- tipos de pregunta
  var RENDER = {
    fill: function (item, wrap) {
      var q = item.q;
      head(item, item.cat === "gramatica" ? "Completa la frase" : "Elige la palabra correcta", wrap);
      var parts = q.text.split("___");
      var say = el("p", { class: "say" });
      var slots = [];
      parts.forEach(function (p, i) {
        say.appendChild(document.createTextNode(p));
        if (i < parts.length - 1) { var s = el("span", { class: "slot", "aria-hidden": "true", html: "&nbsp;" }); slots.push(s); say.appendChild(s); }
      });
      var bubble = el("div", { class: "bubble-q" }, [el("span", { class: "who", text: q.who }), say]);
      scene(q.img, "Ilustración del manual: " + q.who, bubble, wrap);
      var grid = el("div", { class: "opts-grid" + (q.options.some(function (o) { return o.length > 14; }) ? " stack" : ""), role: "radiogroup", "aria-label": "Opciones" });
      var sel = null, btns = [];
      function choose(k) {
        sel = k;
        btns.forEach(function (b, j) { b.setAttribute("aria-checked", j === k ? "true" : "false"); });
        var val = q.options[item.order[k]];
        var bits = slots.length > 1 ? val.split("…").map(function (s) { return s.trim(); }) : [val];
        slots.forEach(function (s, j) { s.textContent = bits[j] || ""; s.classList.add("filled"); });
        setReady(true);
      }
      item.order.forEach(function (oi, k) { var b = optionButton(q.options[oi], k, choose); btns.push(b); grid.appendChild(b); });
      wrap.appendChild(grid);
      return {
        keys: function (n) { if (n < btns.length) choose(n); },
        check: function () {
          var ok = item.order[sel] === q.answer;
          grid.classList.add("locked");
          btns[sel].classList.add(ok ? "right" : "wrong");
          if (!ok) btns[item.order.indexOf(q.answer)].classList.add("right");
          var full = q.text.split("___");
          var correct = q.options[q.answer], bits = full.length > 2 ? correct.split("…").map(function (s) { return s.trim(); }) : [correct];
          var sentence = full.reduce(function (acc, p, i) { return acc + p + (i < full.length - 1 ? bits[i] : ""); }, "");
          return { ok: ok, correct: sentence.replace(/\s+/g, " ").trim(), mine: sel === null ? "—" : q.options[item.order[sel]], tip: q.tip, prompt: q.text, img: q.img, unit: q.u, speak: sentence };
        }
      };
    },

    image: function (item, wrap) {
      var q = item.q;
      head(item, "Elige la imagen correcta", wrap);
      var ask = el("p", { class: "word-ask" }, [speakBtn(q.word), el("span", { text: "«" + q.word + "»" })]);
      wrap.appendChild(ask);
      var grid = el("div", { class: "pics", role: "radiogroup", "aria-label": "Imágenes" });
      var sel = null, btns = [];
      function choose(k) { sel = k; btns.forEach(function (b, j) { b.setAttribute("aria-checked", j === k ? "true" : "false"); }); setReady(true); }
      item.order.forEach(function (oi, k) {
        var b = el("button", { type: "button", class: "pic", role: "radio", "aria-checked": "false", "aria-label": "Imagen " + (k + 1) }, [
          el("span", { class: "k", text: String(k + 1), "aria-hidden": "true" }), img(q.options[oi], ""), el("span", { class: "cap", html: "&nbsp;" })
        ]);
        b.addEventListener("click", function () { choose(k); });
        btns.push(b); grid.appendChild(b);
      });
      wrap.appendChild(grid);
      return {
        keys: function (n) { if (n < btns.length) choose(n); },
        check: function () {
          var ok = item.order[sel] === 0;
          grid.classList.add("locked");
          var right = btns[item.order.indexOf(0)];
          right.classList.add("right"); right.querySelector(".cap").textContent = q.word;
          if (!ok) btns[sel].classList.add("wrong");
          return { ok: ok, correct: "«" + q.word + "» es la imagen marcada.", mine: "otra imagen", prompt: "¿Cuál es «" + q.word + "»?", img: q.options[0], speak: q.word };
        }
      };
    },

    pairs: function (item, wrap) {
      var q = item.q, L = item.lang;
      head(item, "Une los pares", wrap);
      wrap.querySelector(".qs-head").appendChild(el("span", { class: "qs-unit", text: q.title + ", " + LANGS[L].to.replace("al ", "en ") }));
      var left = el("div", { class: "pairs-col" }), right = el("div", { class: "pairs-col" });
      var grid = el("div", { class: "pairs" }, [left, right]);
      var selL = null, selR = null, misses = 0, done = 0, all = [];
      var note = el("p", { class: "pairs-note", text: "Toca una palabra en español y después su traducción." });
      function make(text, side, idx, lang) {
        var b = el("button", { type: "button", class: "pair", "aria-pressed": "false", lang: lang, text: text });
        b.dataset.side = side; b.dataset.idx = idx;
        b.addEventListener("click", function () { tap(b); });
        all.push(b); return b;
      }
      shuffle(q.items.map(function (_, i) { return i; })).forEach(function (i) { left.appendChild(make(q.items[i][0], "l", i, "es")); });
      shuffle(q.items.map(function (_, i) { return i; })).forEach(function (i) { right.appendChild(make(q.items[i][1][L], "r", i, L)); });
      function clear(b) { if (b) b.setAttribute("aria-pressed", "false"); }
      function tap(b) {
        if (b.dataset.side === "l") { clear(selL); selL = selL === b ? null : b; if (selL) { selL.setAttribute("aria-pressed", "true"); speak(b.textContent, true); } }
        else { clear(selR); selR = selR === b ? null : b; if (selR) selR.setAttribute("aria-pressed", "true"); }
        if (selL && selR) {
          var a = selL, c = selR; selL = selR = null;
          if (a.dataset.idx === c.dataset.idx) {
            [a, c].forEach(function (x) { x.setAttribute("aria-pressed", "false"); x.classList.add("hit", "done"); x.disabled = true; });
            done++; tone(true);
            if (done === q.items.length) setTimeout(function () { submit(); }, 350);
          } else {
            misses++; tone(false);
            [a, c].forEach(function (x) { x.setAttribute("aria-pressed", "false"); x.classList.remove("miss"); void x.offsetWidth; x.classList.add("miss"); });
            note.textContent = misses === 1 ? "Un error. Sigue uniendo los pares." : misses + " errores. Sigue uniendo los pares.";
          }
        }
      }
      wrap.appendChild(grid); wrap.appendChild(note);
      setReady(false, true);
      return {
        auto: true,
        keys: function () {},
        check: function () {
          var list = q.items.map(function (p) { return p[0] + " = " + p[1][L]; }).join(", ");
          return { ok: misses === 0, correct: misses === 0 ? "Todos los pares, sin errores." : "Pares completados con " + misses + (misses === 1 ? " error" : " errores") + ".", mine: misses + (misses === 1 ? " error" : " errores"), tip: misses ? list : "", prompt: "Une los pares: " + q.title.toLowerCase() + " (" + LANGS[L].name + ")", img: q.img, silent: true };
        }
      };
    },

    tiles: function (item, wrap) {
      var q = item.q, L = item.lang, toEs = item.toEs;
      var src = toEs ? q[L] : q.es, srcLang = toEs ? L : "es", dst = toEs ? "es" : L;
      head(item, toEs ? "Traduce al español" : "Traduce " + LANGS[L].to, wrap);
      var say = el("p", { class: "say", lang: srcLang === "es" ? "es" : L }, [
        srcLang === "es" ? speakBtn(src) : null, document.createTextNode(src)
      ]);
      var bubble = el("div", { class: "bubble-q" }, [el("span", { class: "lang", text: srcLang === "es" ? "Español" : LANGS[L].name }), say]);
      scene(q.img, "", bubble, wrap);
      var target = toEs ? q.es : q[L];
      var accepted = [target].concat((q.alt && q.alt[dst]) || []).map(norm);
      var tokens = words(target).concat((q.x && q.x[dst]) || []);
      var line = el("div", { class: "answer-line", "aria-label": "Tu respuesta", lang: dst });
      var bank = el("div", { class: "bank", lang: dst });
      var chosen = [];
      shuffle(tokens).forEach(function (w) {
        var t = el("button", { type: "button", class: "tile", text: w });
        t.addEventListener("click", function () { add(t); });
        bank.appendChild(t);
      });
      function add(t) {
        if (t.classList.contains("ghost")) return;
        var c = el("button", { type: "button", class: "tile", text: t.textContent });
        c._from = t; t.classList.add("ghost"); t.setAttribute("aria-hidden", "true");
        c.addEventListener("click", function () { remove(c); });
        line.appendChild(c); chosen.push(c);
        if (dst === "es") speak(q.voz ? q.es + " :: " + t.textContent : t.textContent, true);
        setReady(chosen.length > 0);
      }
      function remove(c) {
        c._from.classList.remove("ghost"); c._from.removeAttribute("aria-hidden");
        line.removeChild(c); chosen.splice(chosen.indexOf(c), 1);
        setReady(chosen.length > 0);
      }
      wrap.appendChild(line); wrap.appendChild(bank);
      return {
        keys: function (n) { var free = Array.prototype.filter.call(bank.children, function (t) { return !t.classList.contains("ghost"); }); if (free[n]) add(free[n]); },
        back: function () { if (chosen.length) remove(chosen[chosen.length - 1]); },
        check: function () {
          var mine = chosen.map(function (c) { return c.textContent; }).join(" ");
          var ok = accepted.indexOf(norm(mine)) !== -1;
          wrap.classList.add("locked");
          return { ok: ok, correct: target, mine: mine || "—", prompt: src, img: q.img, speak: dst === "es" ? target : (srcLang === "es" ? src : null), lang: dst };
        }
      };
    },

    choice: function (item, wrap) {
      var q = item.q, L = item.lang, toEs = item.toEs;
      var src = toEs ? q[L][0] : q.es[0], opts = toEs ? q.es : q[L], dst = toEs ? "es" : L;
      head(item, toEs ? "¿Cómo se dice en español?" : "¿Cómo se dice " + LANGS[L].to.replace("al ", "en ") + "?", wrap);
      var say = el("p", { class: "say", lang: toEs ? L : "es" }, [toEs ? null : speakBtn(src), document.createTextNode(src)]);
      var bubble = el("div", { class: "bubble-q" }, [el("span", { class: "lang", text: toEs ? LANGS[L].name : "Español" }), say]);
      scene(q.img, "", bubble, wrap);
      var grid = el("div", { class: "opts-grid stack", role: "radiogroup", "aria-label": "Traducciones", lang: dst });
      var sel = null, btns = [];
      function choose(k) { sel = k; btns.forEach(function (b, j) { b.setAttribute("aria-checked", j === k ? "true" : "false"); }); if (toEs) speak(opts[item.order[k]], true); setReady(true); }
      item.order.forEach(function (oi, k) { var b = optionButton(opts[oi], k, choose); btns.push(b); grid.appendChild(b); });
      wrap.appendChild(grid);
      return {
        keys: function (n) { if (n < btns.length) choose(n); },
        check: function () {
          var ok = item.order[sel] === 0;
          grid.classList.add("locked");
          btns[sel].classList.add(ok ? "right" : "wrong");
          if (!ok) btns[item.order.indexOf(0)].classList.add("right");
          return { ok: ok, correct: opts[0], mine: opts[item.order[sel]], prompt: src, img: q.img, speak: q.es[0], lang: dst };
        }
      };
    }
  };

  // ---------------------------------------------------------------- barra inferior
  function setReady(on, hideCheck) {
    if (state.phase !== "answering") return;
    checkBtn.disabled = !on;
    checkBtn.hidden = !!hideCheck;
  }
  function setBar(mode, res) {
    bar.classList.remove("ok", "bad");
    fb.innerHTML = "";
    if (mode === "idle") {
      checkBtn.textContent = "Comprobar"; checkBtn.disabled = true; checkBtn.hidden = false;
      checkBtn.classList.remove("teal");
      skipBtn.hidden = false;
      fb.appendChild(skipBtn);
      return;
    }
    skipBtn.hidden = true;
    bar.classList.add(res.ok ? "ok" : "bad");
    var fox = el("span", { class: "fox", "aria-hidden": "true" }, [img("644-9", "")]);
    var txt = el("div", { role: "status" });
    txt.appendChild(el("h3", { text: res.ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : OOPS[Math.floor(Math.random() * OOPS.length)] }));
    if (!res.ok || res.showCorrect) {
      var p = el("p", {}, [el("span", { text: res.silent ? "" : "Respuesta correcta: " }), el("b", { text: res.correct, lang: res.lang || "es" })]);
      var sb = res.silent ? null : speakBtn(res.speak); if (sb) p.insertBefore(sb, p.firstChild);
      txt.appendChild(p);
    }
    if (res.tip && (!res.ok || res.cat === "gramatica")) txt.appendChild(el("p", { class: "fb-tip", text: res.tip }));
    fb.appendChild(fox); fb.appendChild(txt);
    checkBtn.hidden = false; checkBtn.disabled = false;
    checkBtn.textContent = state.i + 1 >= state.items.length ? "Ver mi resultado" : "Continuar";
    checkBtn.classList.toggle("teal", res.ok);
    checkBtn.focus({ preventScroll: true });
  }

  function submit(skipped) {
    if (state.phase !== "answering" || !state.current) return;
    var item = state.items[state.i];
    var res;
    if (skipped) {
      // Saltar cuenta como respuesta incorrecta y muestra la solución
      res = skipResult(item);
    } else {
      res = state.current.check();
    }
    res.cat = item.cat;
    state.phase = "feedback";
    state.results.push({ item: item, res: res });
    if (res.ok) { state.streak++; state.best = Math.max(state.best, state.streak); } else state.streak = 0;
    paintStreak();
    if (!res.silent || !res.ok) tone(res.ok);
    setBar("feedback", res);
    prog.style.width = ((state.i + 1) / state.items.length * 100) + "%";
  }
  function skipResult(item) {
    var q = item.q, r;
    if (item.type === "fill") {
      var full = q.text.split("___"), c = q.options[q.answer], bits = full.length > 2 ? c.split("…").map(function (s) { return s.trim(); }) : [c];
      var sent = full.reduce(function (a, p, i) { return a + p + (i < full.length - 1 ? bits[i] : ""); }, "");
      r = { correct: sent, tip: q.tip, prompt: q.text, img: q.img, unit: q.u, speak: sent };
    } else if (item.type === "image") r = { correct: "«" + q.word + "»", prompt: "¿Cuál es «" + q.word + "»?", img: q.options[0], speak: q.word };
    else if (item.type === "tiles") { var t = item.toEs ? q.es : q[item.lang]; r = { correct: t, prompt: item.toEs ? q[item.lang] : q.es, img: q.img, lang: item.toEs ? "es" : item.lang, speak: item.toEs ? t : q.es }; }
    else if (item.type === "choice") { r = { correct: item.toEs ? q.es[0] : q[item.lang][0], prompt: item.toEs ? q[item.lang][0] : q.es[0], img: q.img, lang: item.toEs ? "es" : item.lang, speak: q.es[0] }; }
    else r = { correct: "", prompt: q.title, img: q.img };
    r.ok = false; r.mine = "(saltada)";
    stage.querySelector(".qs-anim, div").classList.add("locked");
    return r;
  }
  function paintStreak() {
    if (state.streak >= 3) {
      streakEl.hidden = false;
      streakEl.textContent = "✦ " + state.streak + " seguidas";
      streakEl.classList.remove("pop"); void streakEl.offsetWidth; streakEl.classList.add("pop");
    } else streakEl.hidden = true;
  }

  checkBtn.addEventListener("click", function () {
    if (state.phase === "answering") { if (!checkBtn.disabled) submit(); }
    else if (state.phase === "feedback") { state.i++; next(); }
  });
  skipBtn.addEventListener("click", function () { submit(true); });

  document.addEventListener("keydown", function (e) {
    if (play.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "Enter") {
      if (tag === "button" && e.target !== checkBtn && state.phase === "answering") return; // deja que el botón enfocado actúe
      e.preventDefault(); checkBtn.click();
    } else if (state.phase === "answering" && /^[1-9]$/.test(e.key)) {
      state.current.keys(parseInt(e.key, 10) - 1);
    } else if (state.phase === "answering" && e.key === "Backspace" && state.current.back) {
      e.preventDefault(); state.current.back();
    }
  });

  $(".qp-close").addEventListener("click", function () {
    if (state.results.length && !confirm("¿Salir del test? Se perderán tus respuestas de este intento.")) return;
    stopAudio();
    show("intro"); paintBest();
  });

  // ---------------------------------------------------------------- resultado
  function finish() {
    var total = state.items.length;
    var score = state.results.filter(function (r) { return r.res.ok; }).length;
    var pct = Math.round(score / total * 100);
    var pass = score / total * 100 > D.pass;
    var saved = store.get();
    var prevBest = saved.best || 0;
    saved.best = Math.max(prevBest, pct); saved.last = pct; saved.attempts = (saved.attempts || 0) + 1;
    if (pass) saved.passed = true;
    store.set(saved);

    result.innerHTML = "";
    var C = 2 * Math.PI * 106;
    var ring = el("div", { class: "qr-ring" + (pass ? "" : " fail"), role: "img", "aria-label": pct + " por ciento de respuestas correctas" , html:
      '<svg viewBox="0 0 240 240"><circle class="track" cx="120" cy="120" r="106"/>' +
      '<circle class="val" cx="120" cy="120" r="106" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/>' +
      '<circle class="goal" cx="120" cy="120" r="106" stroke-dasharray="2.5 ' + C + '" stroke-dashoffset="' + (-C * D.pass / 100) + '"/></svg>' });
    ring.appendChild(el("div", { class: "qr-num" }, [el("b", { text: pct + " %" }), el("span", { text: score + " de " + total + " correctas" })]));

    var msg = pass
      ? (pct === 100 ? "Todas las respuestas correctas. Has terminado Aquella vez con nota perfecta." : "Has superado el test final de Aquella vez. Revisa abajo las preguntas que fallaste para dominar todo el manual.")
      : "Necesitas más del " + D.pass + " % para aprobar (" + (Math.floor(total * D.pass / 100) + 1) + " de " + total + "). Repasa las unidades marcadas abajo y vuelve a intentarlo: cada intento tiene preguntas distintas.";
    var info = el("div", {}, [
      el("p", { class: "qr-stamp" + (pass ? "" : " fail"), text: pass ? "¡Aprobado!" : "No aprobado" }),
      el("p", { class: "qr-msg", text: msg }),
      el("div", { class: "qr-actions" }, [
        el("button", { type: "button", class: "qbtn" + (pass ? " quiet" : ""), text: "Repetir el test", onclick: function () { show("intro"); start(); } }),
        el("a", { class: "qbtn" + (pass ? "" : " quiet"), href: "index.html#unidades", text: "Volver a las unidades" })
      ])
    ]);
    if (state.best >= 3) info.insertBefore(el("p", { class: "qi-best", html: "Tu mejor racha: <b>" + state.best + " seguidas</b>" + (pct > prevBest && saved.attempts > 1 ? ". ¡Nuevo récord personal!" : "") }), info.children[2]);
    result.appendChild(el("div", { class: "qr-top" }, [ring, info]));

    var cats = el("div", { class: "qr-cats" });
    Object.keys(CATS).forEach(function (c) {
      var rs = state.results.filter(function (r) { return r.item.cat === c; });
      if (!rs.length) return;
      var ok = rs.filter(function (r) { return r.res.ok; }).length;
      cats.appendChild(el("div", { class: "qr-cat" }, [
        el("h3", { text: CATS[c] }), el("p", { html: "<b>" + ok + "</b> de " + rs.length }),
        el("div", { class: "qr-bar" }, [el("span", { style: "width:" + (ok / rs.length * 100) + "%" })])
      ]));
    });
    result.appendChild(cats);

    result.appendChild(el("div", { class: "qr-pic" }, pass
      ? [img("639-663", "Luis y Nátasha en Madrid de noche"), el("p", { text: "Luis, Nátasha, Marcos, Alicia y Robert te esperan en la próxima aventura. ¡Hasta la próxima!" })]
      : [img("639-68", "Marcos, el detective, con su lupa"), el("p", { text: "Marcos dice: un buen detective nunca se rinde. Busca las pistas en las unidades y vuelve al test." })]));

    var wrong = state.results.filter(function (r) { return !r.res.ok; });
    var rev = el("section", { class: "qr-review", "aria-labelledby": "rev-t" }, [el("h2", { id: "rev-t", text: wrong.length ? "Para repasar" : "Sin errores" })]);
    if (!wrong.length) rev.appendChild(el("p", { class: "qr-perfect", text: "No fallaste ninguna pregunta." }));
    else {
      var ol = el("ol");
      wrong.forEach(function (r) {
        var x = r.res;
        var body = el("div", {}, [
          el("p", { class: "q", text: x.prompt }),
          x.mine && x.mine !== "otra imagen" ? el("p", { class: "mine", text: "Tu respuesta: " + x.mine }) : null,
          el("p", { class: "ok", text: x.correct, lang: x.lang || "es" }),
          x.tip ? el("p", { class: "rv-tip", text: x.tip }) : null,
          x.unit ? el("a", { href: "unidad-" + x.unit + ".html" + (r.item.cat === "gramatica" ? "#d" : ""), text: (r.item.cat === "gramatica" ? "Repasar la gramática de la Unidad " : "Repasar la Unidad ") + x.unit }) : null
        ]);
        ol.appendChild(el("li", {}, [img(x.img, ""), body]));
      });
      rev.appendChild(ol);
    }
    result.appendChild(rev);

    show("result");
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var v = result.querySelector(".qr-ring .val"); if (v) v.setAttribute("stroke-dashoffset", C * (1 - pct / 100));
    }); });
    if (pass) { confetti(); tone(true); }
  }

  function confetti() {
    if (reduceMotion) return;
    var cv = el("canvas", { class: "confetti", "aria-hidden": "true" }); document.body.appendChild(cv);
    var ctx = cv.getContext("2d"), W = cv.width = innerWidth, H = cv.height = innerHeight;
    var cs = getComputedStyle(document.documentElement);
    var colors = ["--wine", "--teal", "--gold", "--brown"].map(function (v) { return cs.getPropertyValue(v).trim() || "#89252e"; });
    var ps = []; for (var i = 0; i < 140; i++) ps.push({ x: Math.random() * W, y: -20 - Math.random() * H * .5, r: 4 + Math.random() * 6, c: colors[i % 4], vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3, a: Math.random() * 6, va: -.2 + Math.random() * .4 });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.y += p.vy; p.x += p.vx + Math.sin((t + p.r * 99) / 400); p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (t - t0 < 3200) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }

  // ---------------------------------------------------------------- portada
  function paintBest() {
    var s = store.get(), b = $(".qi-best");
    if (!b) return;
    if (s.best != null && s.attempts) b.innerHTML = "Tu mejor resultado: <b>" + s.best + " %</b>" + (s.passed ? ", aprobado." : ".");
    else b.textContent = "Puedes repetir el test todas las veces que quieras; cada intento tiene preguntas distintas.";
    if (s.lang) { var r = $('input[name="lang"][value="' + s.lang + '"]'); if (r) r.checked = true; }
    $("#start").disabled = !$('input[name="lang"]:checked');
  }
  $("#start").addEventListener("click", start);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="lang"]'), function (r) {
    r.addEventListener("change", function () { $("#start").disabled = false; });
  });
  var muteBtn = $(".qp-mute");
  if (muteBtn) {
    state.mute = !!store.get().mute;
    var paintMute = function () { muteBtn.setAttribute("aria-pressed", state.mute ? "true" : "false"); muteBtn.title = state.mute ? "Activar sonidos" : "Silenciar sonidos"; muteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/>' + (state.mute ? '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') + '</svg>'; muteBtn.setAttribute("aria-label", muteBtn.title); };
    paintMute();
    muteBtn.addEventListener("click", function () { state.mute = !state.mute; var s = store.get(); s.mute = state.mute; store.set(s); paintMute(); });
  }
  if (/[?&]debug\b/.test(location.search)) window.AV_STATE = state;
  paintBest();
  show("intro");
})();
