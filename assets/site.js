(function () {
  "use strict";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // Menú de unidades
  var btn = document.querySelector(".menu-btn");
  var menu = document.getElementById("menu");
  if (btn && menu) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target)) { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    });
  }

  // Respuestas guardadas en este navegador
  var page = location.pathname.split("/").pop() || "index.html";
  var key = "aquellavez:" + page;
  var saved = {};
  try { saved = JSON.parse(store.get(key) || "{}") || {}; } catch (e) { saved = {}; }
  function save() { store.set(key, JSON.stringify(saved)); }

  document.querySelectorAll("input.blank").forEach(function (inp, i) {
    var id = "i" + i;
    if (saved[id]) inp.value = saved[id];
    inp.addEventListener("input", function () {
      if (inp.value) saved[id] = inp.value; else delete saved[id];
      save();
    });
  });

  document.querySelectorAll(".toggle").forEach(function (grp, i) {
    var id = "t" + i;
    var btns = grp.querySelectorAll("button");
    function paint(v) {
      btns.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); });
    }
    if (saved[id]) paint(saved[id]);
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var v = saved[id] === b.dataset.v ? null : b.dataset.v;
        if (v) saved[id] = v; else delete saved[id];
        paint(v); save();
      });
    });
  });

  var clear = document.querySelector(".clear-answers");
  if (clear) {
    clear.addEventListener("click", function () {
      if (!confirm("¿Borrar todas tus respuestas de esta unidad?")) return;
      saved = {}; store.del(key);
      document.querySelectorAll("input.blank").forEach(function (i) { i.value = ""; });
      document.querySelectorAll(".toggle button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    });
  }

  // Sección activa en la barra de secciones
  var links = document.querySelectorAll(".sec-nav a");
  if (links.length && "IntersectionObserver" in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("active"); });
          var a = map[en.target.id];
          a.classList.add("active");
          var nav = a.closest("ol");
          if (nav) nav.scrollTo({ left: a.offsetLeft - 24, behavior: "smooth" });
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".unit-sec").forEach(function (s) { obs.observe(s); });
  }

  // Visor de imágenes
  var lb = document.querySelector(".lightbox");
  if (lb) {
    var lbImg = lb.querySelector("img");
    function close() { lb.hidden = true; lbImg.removeAttribute("src"); document.body.style.overflow = ""; }
    document.addEventListener("click", function (e) {
      var img = e.target.closest("img[data-zoom]");
      if (img) {
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt;
        lb.hidden = false;
        document.body.style.overflow = "hidden";
        lb.querySelector(".lb-close").focus();
      }
    });
    lb.addEventListener("click", function (e) { if (e.target !== lbImg) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) close(); });
  }
})();
