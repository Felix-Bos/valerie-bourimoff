/* ==========================================================================
   Visionneuse plein écran — ouverture animée depuis la miniature,
   navigation clavier / swipe, zoom avec déplacement.
   ========================================================================== */
window.VBLightbox = (function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(0.19, 1, 0.22, 1)';
  var root, stage, bg, titleEl, metaEl, countEl, askEl, zoomBtn, spinner;
  var list = [], index = 0, current = null, isOpen = false, busy = false;
  var zoomed = false, zoomLevel = 2.4, pan = { x: 0, y: 0 };
  var lastFocus = null, cache = {};

  var icons = {
    close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8"/></svg>',
    zoom: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8v6M8 11h6"/></svg>'
  };

  function full(w) { return 'assets/img/oeuvres/' + w.id + '.webp'; }
  function thumb(w) { return 'assets/img/oeuvres/m/' + w.id + '.webp'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function meta(w) {
    var when = w.year || 'Dessin';
    return [w.medium, w.size, when].filter(Boolean).join(' · ');
  }

  function build() {
    root = document.createElement('div');
    root.className = 'lb';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Visionneuse');
    root.setAttribute('data-dark', '');
    root.innerHTML =
      '<div class="lb__bg"></div>' +
      '<div class="lb__top">' +
        '<p class="lb__count" aria-live="polite"></p>' +
        '<span class="lb__hint">Cliquez sur l\'œuvre pour zoomer · ← → pour naviguer</span>' +
        '<div class="lb__tools">' +
          '<button class="lb__btn lb__zoom" type="button" aria-label="Zoomer" data-cursor-link>' + icons.zoom + '</button>' +
          '<button class="lb__btn lb__close" type="button" aria-label="Fermer la visionneuse" data-cursor-link>' + icons.close + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="lb__stage">' +
        '<span class="lb__spinner"></span>' +
      '</div>' +
      '<div class="lb__bottom">' +
        '<div class="lb__info"><h2 class="lb__title"></h2><p class="lb__meta"></p></div>' +
        '<a class="btn lb__ask" href="contact.html">Demander des informations <span aria-hidden="true">→</span></a>' +
      '</div>' +
      '<button class="lb__btn lb__nav lb__nav--prev" type="button" aria-label="Œuvre précédente" data-cursor-link>' + icons.prev + '</button>' +
      '<button class="lb__btn lb__nav lb__nav--next" type="button" aria-label="Œuvre suivante" data-cursor-link>' + icons.next + '</button>';
    document.body.appendChild(root);

    stage = root.querySelector('.lb__stage');
    bg = root.querySelector('.lb__bg');
    titleEl = root.querySelector('.lb__title');
    metaEl = root.querySelector('.lb__meta');
    countEl = root.querySelector('.lb__count');
    askEl = root.querySelector('.lb__ask');
    zoomBtn = root.querySelector('.lb__zoom');
    spinner = root.querySelector('.lb__spinner');

    root.querySelector('.lb__close').addEventListener('click', close);
    root.querySelector('.lb__nav--prev').addEventListener('click', function () { go(-1); });
    root.querySelector('.lb__nav--next').addEventListener('click', function () { go(1); });
    zoomBtn.addEventListener('click', function () { setZoom(!zoomed); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', function () { if (isOpen && current) place(current.el, current.work, true); });
    bindPointer();
  }

  /* ---------- Géométrie ---------- */

  function stageRect() { return stage.getBoundingClientRect(); }

  // La scène couvre tout l'écran ; l'œuvre se place entre les deux barres.
  function fit(w) {
    var r = stageRect();
    var top = root.querySelector('.lb__top').offsetHeight;
    var bottom = root.querySelector('.lb__bottom').offsetHeight;
    var side = innerWidth < 760 ? 12 : 110;
    var maxW = Math.max(120, r.width - side * 2);
    var maxH = Math.max(120, r.height - top - bottom - 8);
    var s = Math.min(maxW / w.w, maxH / w.h);
    var W = w.w * s, H = w.h * s;
    return { x: (r.width - W) / 2, y: top + (maxH - H) / 2 + 4, w: W, h: H };
  }

  function place(el, w, instant) {
    var f = fit(w);
    el.style.width = f.w + 'px';
    el.style.height = f.h + 'px';
    if (instant) el.style.transition = 'none';
    el._fit = f;
    el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0)';
    if (instant) { el.offsetWidth; el.style.transition = ''; }
    if (zoomed && el === (current && current.el)) applyPan(true);
    return f;
  }

  function makeImg(w) {
    var img = new Image();
    img.className = 'lb__img';
    img.alt = w.title + (w.medium ? ', ' + w.medium.toLowerCase() : '') + (w.year ? ', ' + w.year : '');
    img.draggable = false;
    img.setAttribute('data-cursor', 'Zoom');
    stage.appendChild(img);
    return img;
  }

  function preload(w) {
    if (cache[w.id]) return cache[w.id];
    cache[w.id] = new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { (im.decode ? im.decode() : Promise.resolve()).catch(function () {}).then(function () { resolve(im.src); }); };
      im.onerror = function () { resolve(thumb(w)); };
      im.src = full(w);
    });
    return cache[w.id];
  }

  function preloadNeighbours() {
    [1, -1, 2].forEach(function (d) {
      var w = list[(index + d + list.length) % list.length];
      if (w) preload(w);
    });
  }

  /* ---------- Infos ---------- */

  function updateInfo(w) {
    titleEl.textContent = w.title;
    metaEl.textContent = meta(w);
    countEl.innerHTML = '<b>' + pad(index + 1) + '</b> / ' + pad(list.length);
    askEl.href = 'contact.html?oeuvre=' + encodeURIComponent(w.id);
    root.style.setProperty('--tint', w.color || '#333');
    var single = list.length < 2;
    root.querySelectorAll('.lb__nav').forEach(function (b) { b.hidden = single; });
    try { history.replaceState(null, '', '#oeuvre-' + w.id); } catch (e) {}
  }

  /* ---------- Ouverture / fermeture ---------- */

  function originRect(el) {
    if (!el) return null;
    var img = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (!img) return null;
    var r = img.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) return null;
    return r;
  }

  function open(items, i, originEl) {
    if (!root) build();
    if (isOpen || !items.length) return;
    list = items;
    index = Math.max(0, Math.min(i, items.length - 1));
    isOpen = true;
    zoomed = false;
    root.classList.remove('is-zoomed');
    lastFocus = document.activeElement;
    lockScroll(true);
    root.classList.add('is-open');
    document.documentElement.classList.add('lb-open');

    var w = list[index];
    updateInfo(w);
    var el = makeImg(w);
    el.src = thumb(w);
    current = { el: el, work: w };
    var f = place(el, w, true);
    var o = originRect(originEl);

    if (o && !reduce) {
      var sr = stageRect();
      var s = o.width / f.w;
      el.style.transition = 'none';
      el.style.transform = 'translate3d(' + (o.left - sr.left) + 'px,' + (o.top - sr.top) + 'px,0) scale(' + s + ')';
      el.offsetWidth;
      el.style.transition = 'transform 1s ' + EASE;
      el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0)';
    } else {
      el.style.opacity = '0';
      el.style.transition = 'none';
      el.style.transform = 'translate3d(' + f.x + 'px,' + (f.y + 30) + 'px,0)';
      el.offsetWidth;
      el.style.transition = 'transform 1s ' + EASE + ', opacity .6s';
      el.style.opacity = '1';
      el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0)';
    }

    preload(w).then(function (src) { if (current && current.work === w) el.src = src; });
    preloadNeighbours();
    setTimeout(function () { root.querySelector('.lb__close').focus({ preventScroll: true }); }, 50);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    setZoom(false, true);
    var el = current && current.el;
    var w = current && current.work;
    var o = null;
    if (w) Array.prototype.some.call(document.querySelectorAll('[data-work="' + w.id + '"]'), function (n) { return (o = originRect(n)); });
    root.classList.remove('is-open');
    document.documentElement.classList.remove('lb-open');

    if (el) {
      if (o && !reduce) {
        var sr = stageRect();
        el.style.transition = 'transform .8s ' + EASE + ', opacity .5s .35s';
        el.style.transform = 'translate3d(' + (o.left - sr.left) + 'px,' + (o.top - sr.top) + 'px,0) scale(' + (o.width / el._fit.w) + ')';
        el.style.opacity = '0';
      } else {
        el.style.transition = 'opacity .4s, transform .6s ' + EASE;
        el.style.opacity = '0';
        el.style.transform = 'translate3d(' + el._fit.x + 'px,' + (el._fit.y + 30) + 'px,0)';
      }
      setTimeout(function () { el.remove(); }, 850);
    }
    current = null;
    lockScroll(false);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- Navigation ---------- */

  function go(dir) {
    if (!isOpen || busy || list.length < 2) return;
    if (zoomed) setZoom(false, true);
    busy = true;
    index = (index + dir + list.length) % list.length;
    var w = list[index];
    var old = current.el;
    updateInfo(w);

    var t = setTimeout(function () { root.classList.add('is-loading'); }, 160);
    preload(w).then(function (src) {
      clearTimeout(t);
      root.classList.remove('is-loading');
      if (!isOpen) { busy = false; return; }
      var shift = Math.min(90, innerWidth * 0.08) * dir;
      old.style.transition = 'transform .9s ' + EASE + ', opacity .5s';
      old.style.opacity = '0';
      old.style.transform = 'translate3d(' + (old._fit.x - shift) + 'px,' + old._fit.y + 'px,0)';
      setTimeout(function () { old.remove(); }, 900);

      var el = makeImg(w);
      el.src = src;
      var f = place(el, w, true);
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.transform = 'translate3d(' + (f.x + shift) + 'px,' + f.y + 'px,0)';
      el.offsetWidth;
      el.style.transition = 'transform 1s ' + EASE + ', opacity .7s';
      el.style.opacity = '1';
      el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0)';
      current = { el: el, work: w };
      preloadNeighbours();
      setTimeout(function () { busy = false; }, 280);
    });
  }

  /* ---------- Zoom ---------- */

  function clampPan() {
    var f = current.el._fit, r = stageRect();
    var W = f.w * zoomLevel, H = f.h * zoomLevel;
    var minX = Math.min(r.width - W, (r.width - W) / 2), maxX = Math.max(0, (r.width - W) / 2);
    var minY = Math.min(r.height - H, (r.height - H) / 2), maxY = Math.max(0, (r.height - H) / 2);
    pan.x = Math.max(minX, Math.min(maxX, pan.x));
    pan.y = Math.max(minY, Math.min(maxY, pan.y));
  }

  function applyPan(instant) {
    if (!current) return;
    clampPan();
    var el = current.el;
    el.style.transition = instant ? 'none' : 'transform .6s cubic-bezier(.2,.7,.3,1)';
    el.style.transform = 'translate3d(' + pan.x + 'px,' + pan.y + 'px,0) scale(' + zoomLevel + ')';
  }

  function setZoom(on, silent) {
    if (!current) { zoomed = false; return; }
    zoomed = on;
    root.classList.toggle('is-zoomed', on);
    zoomBtn.setAttribute('aria-label', on ? 'Réduire' : 'Zoomer');
    var el = current.el, f = el._fit;
    el.setAttribute('data-cursor', on ? 'Réduire' : 'Zoom');
    if (on) {
      var r = stageRect();
      pan.x = (r.width - f.w * zoomLevel) / 2;
      pan.y = (r.height - f.h * zoomLevel) / 2;
      applyPan(false);
    } else if (!silent) {
      el.style.transition = 'transform .7s ' + EASE;
      el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0)';
    }
  }

  function zoomTowards(clientX, clientY) {
    var r = stageRect(), f = current.el._fit;
    var fx = (clientX - r.left - f.x) / f.w, fy = (clientY - r.top - f.y) / f.h;
    setZoom(true);
    pan.x = clientX - r.left - fx * f.w * zoomLevel;
    pan.y = clientY - r.top - fy * f.h * zoomLevel;
    applyPan(false);
  }

  /* ---------- Pointeur : swipe, pan, clic ---------- */

  function bindPointer() {
    var down = null;

    stage.addEventListener('pointerdown', function (e) {
      if (!current || e.button > 0) return;
      down = { x: e.clientX, y: e.clientY, t: Date.now(), px: pan.x, py: pan.y, moved: false, type: e.pointerType, onImg: e.target === current.el };
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });

    stage.addEventListener('pointermove', function (e) {
      if (!current) return;
      if (zoomed && e.pointerType === 'mouse' && !down) {
        var r = stageRect(), f = current.el._fit;
        var W = f.w * zoomLevel, H = f.h * zoomLevel;
        var nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
        pan.x = (r.width - W) * nx;
        pan.y = (r.height - H) * ny;
        applyPan(false);
        return;
      }
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) down.moved = true;
      if (!down.moved) return;
      var el = current.el, f = el._fit;
      if (zoomed) {
        pan.x = down.px + dx;
        pan.y = down.py + dy;
        applyPan(true);
      } else if (down.type !== 'mouse') {
        el.style.transition = 'none';
        var o = Math.abs(dy) > Math.abs(dx) && dy > 0 ? Math.max(0.4, 1 - dy / 600) : 1;
        el.style.opacity = o;
        el.style.transform = 'translate3d(' + (f.x + dx) + 'px,' + (f.y + Math.max(0, dy) * (Math.abs(dy) > Math.abs(dx) ? 1 : 0)) + 'px,0)';
      }
    });

    function end(e) {
      if (!down || !current) { down = null; return; }
      var d = down; down = null;
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      var el = current.el, f = el._fit;

      if (!d.moved) {
        if (zoomed) { setZoom(false); return; }
        if (d.onImg) { zoomTowards(e.clientX, e.clientY); return; }
        close();
        return;
      }
      if (zoomed || d.type === 'mouse') return;

      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? 1 : -1); return; }
      if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
      el.style.transition = 'transform .6s ' + EASE + ', opacity .4s';
      el.style.opacity = '1';
      el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0)';
    }

    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', function () { down = null; });
    stage.addEventListener('wheel', function (e) {
      if (!current) return;
      e.preventDefault();
      if (!e.ctrlKey) return;
      if (!zoomed && e.deltaY < 0) zoomTowards(e.clientX, e.clientY);
      else if (zoomed && e.deltaY > 0) setZoom(false);
    }, { passive: false });
  }

  /* ---------- Clavier & focus ---------- */

  function onKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); zoomed ? setZoom(false) : close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(root.querySelectorAll('button, a[href]'), function (n) { return !n.hidden && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function lockScroll(on) {
    var de = document.documentElement;
    if (on) {
      var sw = innerWidth - de.clientWidth;
      de.style.overflow = 'hidden';
      if (sw > 0) document.body.style.paddingRight = sw + 'px';
    } else {
      de.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }

  return { open: open, close: close, isOpen: function () { return isOpen; } };
})();
