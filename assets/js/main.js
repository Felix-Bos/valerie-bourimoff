/* ==========================================================================
   Valérie Bourimoff — scripts du site
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Configuration ---------- */

  // L'adresse e-mail de l'artiste se règle dans Pages CMS (Réglages) : le formulaire
  // ouvre alors la messagerie du visiteur, pré-remplie.
  var CONFIG = {
    // Optionnel : URL d'un service d'envoi de formulaire (ex. https://formspree.io/f/xxxxxx).
    // Si elle est renseignée, le message est envoyé directement depuis la page.
    contactEndpoint: ''
  };

  /* ---------- Utilitaires ---------- */

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var page = document.body.getAttribute('data-page');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var DATA = window.VB_DATA || { chapters: [], works: [], selection: [] };
  var WORKS = {};
  DATA.works.forEach(function (w) { WORKS[w.id] = w; });
  // Encodée dans data.js pour ne pas être lue en clair par les robots.
  var contactEmail = (function () {
    try { return atob((DATA.settings || {}).contact || ''); } catch (e) { return ''; }
  })();

  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  var thumb = function (id) { return 'assets/img/oeuvres/m/' + id + '.webp'; };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var altOf = function (w) {
    var parts = [w.title, w.medium && (w.title ? w.medium.toLowerCase() : w.medium), w.year].filter(Boolean);
    return parts.join(', ') || 'Œuvre de Valérie Bourimoff';
  };
  var openLabel = function (w) { return w.title ? 'Voir « ' + w.title + ' » en grand' : 'Voir l\'œuvre en grand (' + altOf(w) + ')'; };

  // Boucle d'animation unique
  var loops = [];
  var scrollY = window.pageYOffset;
  window.addEventListener('scroll', function () { scrollY = window.pageYOffset; }, { passive: true });
  (function tick() {
    for (var i = 0; i < loops.length; i++) loops[i]();
    requestAnimationFrame(tick);
  })();

  /* ---------- Transitions de page ---------- */

  function initTransitions() {
    var curtain = $('.curtain');
    if (!curtain) return;

    if (html.classList.contains('is-entering')) {
      requestAnimationFrame(function () {
        curtain.classList.add('is-entered');
        html.classList.remove('is-entering');
      });
    }

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-work')) return;
      var url = new URL(a.href, location.href);
      if (url.protocol !== location.protocol || url.host !== location.host) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (reduce) return;
      e.preventDefault();
      store.set('vb-nav', '1');
      curtain.classList.remove('is-entered');
      curtain.offsetWidth;
      curtain.classList.add('is-leaving');
      setTimeout(function () { location.href = url.href; }, 650);
    });

    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        curtain.classList.remove('is-leaving');
        curtain.classList.add('is-entered');
      }
    });
  }

  /* ---------- En-tête & menu ---------- */

  function initHeader() {
    var header = $('[data-header]');
    if (!header) return;
    var last = scrollY;
    var current = location.pathname.split('/').pop() || 'index.html';
    $$('.nav a, .menu__links a').forEach(function (a) {
      var target = a.getAttribute('href');
      if (target === current && !a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
      if (target !== current && a.getAttribute('aria-current')) a.removeAttribute('aria-current');
    });

    loops.push(function () {
      if (scrollY === last) return;
      var down = scrollY > last;
      header.classList.toggle('is-scrolled', scrollY > 40);
      var hide = down && scrollY > 320 && !html.classList.contains('menu-open');
      header.classList.toggle('is-hidden', hide);
      html.classList.toggle('header-hidden', hide);
      last = scrollY;
    });
    header.classList.toggle('is-scrolled', scrollY > 40);

    var btn = $('.menu-btn'), menu = $('#menu');
    if (!btn || !menu) return;
    var label = $('.menu-btn__label', btn);
    function toggle(open) {
      html.classList.toggle('menu-open', open);
      menu.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open);
      label.textContent = open ? 'Fermer' : 'Menu';
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
      html.style.overflow = open ? 'hidden' : '';
    }
    btn.addEventListener('click', function () { toggle(!menu.classList.contains('is-open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('is-open')) toggle(false); });
    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () {
        var url = new URL(a.href, location.href);
        if (url.pathname === location.pathname) toggle(false);
      });
    });
  }

  /* ---------- Curseur ---------- */

  function initCursor() {
    if (!fine || reduce) return;
    var c = document.createElement('div');
    c.className = 'cursor is-hidden';
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<div class="cursor__ring"><span class="cursor__label"></span></div><div class="cursor__dot"></div>';
    document.body.appendChild(c);
    html.classList.add('has-cursor');
    var ring = $('.cursor__ring', c), dot = $('.cursor__dot', c), label = $('.cursor__label', c);
    var mx = -100, my = -100, rx = -100, ry = -100, text = '', last = null;

    function update(t) {
      if (!t || !t.closest) return;
      last = t;
      var lab = t.closest('[data-cursor]');
      var next = lab ? lab.getAttribute('data-cursor') : '';
      if (next !== text) { text = next; label.textContent = next; }
      c.classList.toggle('is-label', !!next);
      c.classList.toggle('is-link', !next && !!(t.closest && t.closest('a, button, [data-cursor-link], label, select')));
      c.classList.toggle('is-light', !!(t.closest && t.closest('[data-dark]')));
    }

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      c.classList.remove('is-hidden');
      update(e.target);
    }, { passive: true });
    // Un libellé peut changer sans que la souris bouge (zoom de la visionneuse).
    document.addEventListener('vb:cursor', function () { update(last); });
    document.addEventListener('mouseleave', function () { c.classList.add('is-hidden'); });

    loops.push(function () {
      rx = lerp(rx, mx, 0.18); ry = lerp(ry, my, 0.18);
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    });
  }

  /* ---------- Découpage du texte ---------- */

  function splitWords(el, wrap) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.textContent.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            frag.appendChild(wrap(p, i++));
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    })(el);
    return i;
  }

  function initSplit() {
    $$('[data-split]').forEach(function (el) {
      splitWords(el, function (word, i) {
        var w = document.createElement('span');
        w.className = 'w';
        var s = document.createElement('span');
        s.style.setProperty('--i', i);
        s.textContent = word;
        w.appendChild(s);
        return w;
      });
      el.setAttribute('data-reveal-split', '');
    });

    $$('[data-chars]').forEach(function (el, line) {
      var text = el.textContent.trim();
      el.textContent = '';
      Array.prototype.forEach.call(text, function (ch, k) {
        var o = document.createElement('span');
        o.className = 'ch';
        var s = document.createElement('span');
        s.style.setProperty('--i', k + line * 4);
        s.textContent = ch;
        o.appendChild(s);
        el.appendChild(o);
      });
    });
  }

  /* ---------- Révélations au défilement ---------- */

  // Un élément masqué par clip-path n'est jamais « visible » pour l'observer :
  // on observe alors son parent et on révèle l'élément à travers lui.
  var revealObserver, revealTargets = new Map();
  function observeReveal(el) {
    if (!('IntersectionObserver' in window)) { el.classList.add('is-in'); return; }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          (revealTargets.get(en.target) || []).forEach(function (t) { t.classList.add('is-in'); });
          revealTargets.delete(en.target);
          revealObserver.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    }
    var watched = el.getAttribute('data-reveal') === 'clip' ? el.parentElement : el;
    if (!revealTargets.has(watched)) revealTargets.set(watched, []);
    revealTargets.get(watched).push(el);
    revealObserver.observe(watched);
  }

  function initReveals() {
    $$('[data-reveal], [data-reveal-split]').forEach(observeReveal);
  }

  /* ---------- Mot à mot au défilement (manifeste) ---------- */

  function initScrub() {
    $$('[data-scrub]').forEach(function (el) {
      var words = [];
      splitWords(el, function (word) {
        var s = document.createElement('span');
        s.className = 'sw';
        s.textContent = word;
        words.push(s);
        return s;
      });
      if (reduce) { words.forEach(function (w) { w.classList.add('on'); }); return; }
      var lastN = -1;
      loops.push(function () {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        var p = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.3), 0, 1);
        var n = Math.round(p * words.length);
        if (n === lastN) return;
        words.forEach(function (w, i) { w.classList.toggle('on', i < n); });
        lastN = n;
      });
    });
  }

  /* ---------- Parallaxe ---------- */

  function initParallax() {
    if (reduce) return;
    $$('[data-parallax]').forEach(function (el) {
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      var host = el.parentElement;
      loops.push(function () {
        var r = host.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        var p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
        el.style.transform = 'translate3d(0,' + (-p * innerHeight * speed).toFixed(1) + 'px,0)';
      });
    });
  }

  /* ---------- Boutons magnétiques ---------- */

  function initMagnetic() {
    if (!fine || reduce) return;
    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        el.style.transform = 'translate3d(' + x * 0.3 + 'px,' + y * 0.3 + 'px,0)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- Ouverture d'œuvres dans la visionneuse ---------- */

  function bindWorks(container, getList) {
    container.addEventListener('click', function (e) {
      var el = e.target.closest('[data-work]');
      if (!el || !container.contains(el) || !window.VBLightbox) return;
      e.preventDefault();
      var items = getList();
      var id = el.getAttribute('data-work');
      var i = items.findIndex(function (w) { return w.id === id; });
      if (i < 0) return;
      window.VBLightbox.open(items, i, el);
    });
  }

  /* ==========================================================================
     Accueil
     ========================================================================== */

  function initHome() {
    var hero = $('[data-hero]');
    var heroArts = $$('.hero__art');

    // Loader (première visite de la session)
    var showLoader = html.classList.contains('show-loader');
    var ready = function () { html.classList.add('is-ready'); };
    if (showLoader) {
      var loader = $('.loader'), bar = $('.loader__bar', loader), count = $('.loader__count', loader);
      var imgs = heroArts.map(function (a) { return $('img', a); });
      var done = 0, total = imgs.length + 1, shown = 0, start = Date.now();
      var bump = function () { done++; };
      imgs.forEach(function (im) { if (im.complete) bump(); else { im.addEventListener('load', bump); im.addEventListener('error', bump); } });
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(bump);
      var step = function () {
        var target = Math.min(done / total, (Date.now() - start) / 1400);
        shown = lerp(shown, target, 0.12);
        if (target >= 1 && shown > 0.985) shown = 1;
        bar.style.setProperty('--p', shown.toFixed(3));
        count.textContent = Math.round(shown * 100) + '%';
        if (shown < 1) return requestAnimationFrame(step);
        setTimeout(function () {
          loader.classList.add('is-done');
          setTimeout(ready, 250);
          setTimeout(function () { html.classList.remove('show-loader'); }, 1300);
        }, 250);
      };
      requestAnimationFrame(step);
      store.set('vb-visited', '1');
    } else {
      setTimeout(ready, html.classList.contains('is-entering') ? 350 : 60);
    }

    // Hero : parallaxe souris + défilement
    if (hero && !reduce) {
      var tx = 0, ty = 0, cx = 0, cy = 0;
      if (fine) {
        hero.addEventListener('mousemove', function (e) {
          tx = (e.clientX / innerWidth - 0.5) * 2;
          ty = (e.clientY / innerHeight - 0.5) * 2;
        });
      }
      var conf = heroArts.map(function (a) {
        return { el: a, depth: parseFloat(a.getAttribute('data-depth')) || 0, speed: parseFloat(a.getAttribute('data-speed')) || 0 };
      });
      loops.push(function () {
        if (scrollY > innerHeight * 1.2) return;
        cx = lerp(cx, tx, 0.06); cy = lerp(cy, ty, 0.06);
        conf.forEach(function (c) {
          c.el.style.transform = 'translate3d(' + (cx * c.depth).toFixed(2) + 'px,' + (cy * c.depth + scrollY * c.speed).toFixed(2) + 'px,0)';
        });
      });
    }
    if (hero) {
      var heroList = heroArts.map(function (a) { return WORKS[a.getAttribute('data-work')]; }).filter(Boolean);
      bindWorks(hero, function () { return heroList; });
    }

    initSelection();
    initChapterPreview();
  }

  function initSelection() {
    var section = $('[data-hscroll]');
    var track = $('[data-selection]');
    if (!section || !track) return;
    var items = DATA.selection.map(function (id) { return WORKS[id]; }).filter(Boolean);
    var end = $('.card--end', track);

    items.forEach(function (w, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.setAttribute('data-work', w.id);
      b.setAttribute('data-cursor', 'Voir');
      b.setAttribute('aria-label', openLabel(w));
      b.style.setProperty('--ar', (w.w / w.h).toFixed(4));
      b.style.setProperty('--c', w.color);
      b.innerHTML =
        '<span class="card__frame"><img src="' + thumb(w.id) + '" alt="' + esc(altOf(w)) + '" width="' + w.w + '" height="' + w.h + '" loading="lazy" decoding="async"></span>' +
        '<span class="card__cap"><span class="card__num">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
        '<span>' + (w.title ? '<span class="card__title">' + esc(w.title) + '</span>' : '') + '<span class="card__meta">' + esc([w.medium, w.year].filter(Boolean).join(' · ')) + '</span></span></span>';
      track.insertBefore(b, end);
    });
    bindWorks(track, function () { return items; });

    var cards = $$('.card:not(.card--end)', track);
    var bar = $('.hs__progress', section);
    var pinned = false, dist = 0;

    function measure() {
      pinned = !reduce && innerWidth >= 900 && innerHeight >= 560;
      section.classList.toggle('is-static', !pinned);
      if (!pinned) {
        section.style.height = '';
        track.style.transform = '';
        return;
      }
      dist = Math.max(0, track.scrollWidth - innerWidth);
      section.style.height = (dist + innerHeight) + 'px';
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);

    var x = 0;
    loops.push(function () {
      if (!pinned) return;
      var top = section.getBoundingClientRect().top;
      var p = clamp(-top / Math.max(1, dist), 0, 1);
      if (top > innerHeight || top < -(dist + innerHeight)) return;
      x = lerp(x, p * dist, 0.14);
      track.style.transform = 'translate3d(' + (-x).toFixed(1) + 'px,0,0)';
      if (bar) bar.style.setProperty('--p', p.toFixed(3));
      cards.forEach(function (c) {
        var r = c.getBoundingClientRect();
        var off = (r.left + r.width / 2 - innerWidth / 2) / innerWidth;
        c.style.setProperty('--shift', (off * -40).toFixed(1) + 'px');
      });
    });
  }

  function initChapterPreview() {
    var list = $('[data-chapters]');
    if (!list || !fine || reduce) return;
    var prev = document.createElement('div');
    prev.className = 'preview';
    prev.setAttribute('aria-hidden', 'true');
    prev.innerHTML = '<div class="preview__inner"></div>';
    document.body.appendChild(prev);
    var inner = $('.preview__inner', prev);
    var imgs = {};
    var mx = 0, my = 0, x = 0, y = 0, rot = 0, active = false;

    $$('a[data-preview]', list).forEach(function (a) {
      var src = a.getAttribute('data-preview');
      var im = new Image();
      im.src = src;
      im.alt = '';
      inner.appendChild(im);
      imgs[src] = im;
      a.addEventListener('mouseenter', function () {
        Object.keys(imgs).forEach(function (k) { imgs[k].classList.toggle('is-current', k === src); });
        if (!active) { x = mx; y = my; }
        active = true;
        prev.classList.add('is-on');
      });
    });
    list.addEventListener('mouseleave', function () { active = false; prev.classList.remove('is-on'); });
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });

    loops.push(function () {
      if (!active && !prev.classList.contains('is-on')) return;
      var nx = lerp(x, mx, 0.12), ny = lerp(y, my, 0.12);
      rot = lerp(rot, clamp((nx - x) * 0.6, -14, 14), 0.1);
      x = nx; y = ny;
      prev.style.transform = 'translate3d(' + (x - prev.offsetWidth / 2) + 'px,' + (y - prev.offsetHeight / 2) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
    });
  }

  /* ==========================================================================
     Œuvres
     ========================================================================== */

  function initGallery() {
    var host = $('[data-gallery]');
    if (!host) return;
    var index = $('[data-year-index]');
    var yearsMobile = $('[data-years-mobile]');
    var countEl = $('[data-count]');
    var chips = $$('[data-filter]');
    var filter = 'all';
    var visible = [];
    var sections = [];
    var cols = 0;

    var counts = { all: DATA.works.length };
    DATA.works.forEach(function (w) { counts[w.cat] = (counts[w.cat] || 0) + 1; });
    chips.forEach(function (c) {
      var sup = $('sup', c);
      if (sup) sup.textContent = counts[c.getAttribute('data-filter')] || 0;
    });
    var total = $('[data-total]');
    if (total) total.textContent = DATA.works.length;

    function colCount() {
      var w = host.clientWidth;
      return w > 980 ? 3 : w > 340 ? 2 : 1;
    }

    function workNode(w) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'work';
      b.setAttribute('data-work', w.id);
      b.setAttribute('data-cursor', 'Voir');
      b.setAttribute('aria-label', openLabel(w));
      var metaLines = [w.medium, w.size].filter(Boolean).map(esc).join('<br>');
      b.innerHTML =
        '<span class="work__frame" style="--c:' + w.color + '"><img src="' + thumb(w.id) + '" alt="' + esc(altOf(w)) + '" width="' + w.w + '" height="' + w.h + '" loading="lazy" decoding="async"></span>' +
        '<span class="work__cap">' + (w.title ? '<span class="work__title">' + esc(w.title) + '</span>' : '') + (metaLines ? '<span class="work__meta">' + metaLines + '</span>' : '') + '</span>';
      var img = $('img', b);
      var loaded = function () { img.classList.add('is-loaded'); };
      if (img.complete && img.naturalWidth) loaded(); else img.addEventListener('load', loaded);
      img.addEventListener('error', loaded);
      b._ratio = w.h / w.w;
      return b;
    }

    function layout(sec) {
      var m = sec.masonry;
      m.innerHTML = '';
      var columns = [], heights = [];
      for (var i = 0; i < cols; i++) {
        var c = document.createElement('div');
        c.className = 'masonry__col';
        m.appendChild(c);
        columns.push(c);
        heights.push(0);
      }
      sec.nodes.forEach(function (n) {
        var k = heights.indexOf(Math.min.apply(null, heights));
        n.style.setProperty('--d', (k * 0.08) + 's');
        columns[k].appendChild(n);
        heights[k] += n._ratio + 0.16;
      });
    }

    function build() {
      host.innerHTML = '';
      sections = [];
      DATA.chapters.forEach(function (ch) {
        var s = document.createElement('section');
        s.className = 'chapter';
        s.id = 'chapitre-' + ch.id;
        s.setAttribute('aria-labelledby', 'titre-' + ch.id);
        var isWord = !ch.year;
        s.innerHTML =
          '<header class="chapter__head">' +
            '<p class="chapter__year' + (isWord ? ' is-word' : '') + '" data-reveal>' + esc(ch.label) + '</p>' +
            '<div data-reveal style="--d:.1s"><h2 class="chapter__title" id="titre-' + ch.id + '">' + esc(ch.title) + '</h2>' +
            '<p class="chapter__meta" data-chapter-count></p>' +
            (ch.intro ? '<p class="chapter__intro">' + esc(ch.intro) + '</p>' : '') + '</div>' +
          '</header>' +
          '<div class="masonry"></div>';
        host.appendChild(s);
        var works = ch.works.map(function (id) { return WORKS[id]; }).filter(Boolean);
        sections.push({ ch: ch, el: s, masonry: $('.masonry', s), works: works, all: works.map(workNode), nodes: [] });
      });
      $$('[data-reveal]', host).forEach(observeReveal);

      if (index) {
        index.innerHTML = DATA.chapters.map(function (ch) {
          return '<li><a href="#chapitre-' + ch.id + '" data-chapter-link="' + ch.id + '">' + esc(ch.label) + '</a></li>';
        }).join('');
      }
      if (yearsMobile) {
        yearsMobile.innerHTML = DATA.chapters.map(function (ch) {
          return '<a href="#chapitre-' + ch.id + '" data-chapter-link="' + ch.id + '">' + esc(ch.label) + '</a>';
        }).join('');
      }
    }

    function apply() {
      visible = [];
      cols = colCount();
      sections.forEach(function (sec) {
        sec.nodes = [];
        sec.works.forEach(function (w, i) {
          if (filter === 'all' || w.cat === filter) { sec.nodes.push(sec.all[i]); visible.push(w); }
        });
        var empty = !sec.nodes.length;
        sec.el.classList.toggle('is-hidden', empty);
        $$('[data-chapter-link="' + sec.ch.id + '"]').forEach(function (a) { a.classList.toggle('is-empty', empty); });
        $('[data-chapter-count]', sec.el).textContent = sec.nodes.length + (sec.nodes.length > 1 ? ' œuvres' : ' œuvre');
        layout(sec);
        sec.nodes.forEach(observeReveal);
      });
      if (countEl) countEl.textContent = visible.length;
    }

    build();
    apply();
    bindWorks(host, function () { return visible; });

    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var f = c.getAttribute('data-filter');
        if (f === filter) return;
        filter = f;
        chips.forEach(function (o) {
          o.classList.toggle('is-active', o === c);
          o.setAttribute('aria-pressed', o === c);
        });
        host.classList.add('is-fading');
        setTimeout(function () {
          apply();
          var bar = $('.toolbar');
          var top = host.getBoundingClientRect().top + scrollY - (bar ? bar.offsetHeight : 0) - $('[data-header]').offsetHeight - 24;
          if (scrollY > top) window.scrollTo({ top: top, behavior: 'auto' });
          host.classList.remove('is-fading');
        }, 420);
      });
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var n = colCount();
        if (n !== cols) { cols = n; sections.forEach(layout); }
      }, 150);
    });

    // Chapitre actif
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.id.replace('chapitre-', '');
          $$('[data-chapter-link]').forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('data-chapter-link') === id); });
          var m = yearsMobile && $('[data-chapter-link="' + id + '"]', yearsMobile);
          if (m && yearsMobile.scrollWidth > yearsMobile.clientWidth) {
            yearsMobile.scrollTo({ left: m.offsetLeft - yearsMobile.clientWidth / 2 + m.offsetWidth / 2, behavior: 'smooth' });
          }
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      sections.forEach(function (s) { io.observe(s.el); });
    }

    // Liens profonds : #chapitre-xxx ou #oeuvre-xxx
    function fromHash(initial) {
      var h = decodeURIComponent(location.hash.slice(1));
      if (!h) return;
      if (h.indexOf('oeuvre-') === 0) {
        var id = h.slice(7);
        var i = visible.findIndex(function (w) { return w.id === id; });
        if (i < 0 || !window.VBLightbox || window.VBLightbox.isOpen()) return;
        var node = $('[data-work="' + id + '"]', host);
        if (node) node.scrollIntoView({ block: 'center', behavior: 'instant' });
        setTimeout(function () { window.VBLightbox.open(visible, i, node); }, initial ? 450 : 60);
      } else if (initial) {
        var t = document.getElementById(h);
        if (t) setTimeout(function () { t.scrollIntoView({ behavior: 'instant' }); }, 30);
      }
    }
    fromHash(true);
    window.addEventListener('hashchange', function () { fromHash(false); });
  }

  /* ==========================================================================
     Biographie
     ========================================================================== */

  function initBio() {
    var buttons = $$('[data-lang]');
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var lang = b.getAttribute('data-lang');
        buttons.forEach(function (o) { o.setAttribute('aria-pressed', o === b); });
        $$('.bio-text__body [lang]').forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('lang') === lang); });
      });
    });
  }

  /* ==========================================================================
     Contact
     ========================================================================== */

  function initContact() {
    var form = $('[data-contact-form]');
    if (!form) return;
    var status = $('.form__status', form);
    var subject = form.elements.sujet;
    var workField = form.elements.oeuvre;

    var id = new URLSearchParams(location.search).get('oeuvre');
    var w = id && WORKS[id];
    if (w) {
      var card = $('.ask-card', form);
      $('img', card).src = thumb(w.id);
      $('strong', card).textContent = w.title;
      $('strong', card).hidden = !w.title;
      $('span', card).textContent = [w.medium, w.size, w.year].filter(Boolean).join(' · ');
      card.classList.add('is-visible');
      var page = new URL('oeuvres.html#oeuvre-' + w.id, location.href).href;
      workField.value = [w.title, w.medium, w.year].filter(Boolean).join(', ') + ' — ' + page;
      subject.value = 'Acquisition ou information sur une œuvre';
    }

    function say(msg, err) {
      status.textContent = msg;
      status.classList.toggle('is-error', !!err);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (form.elements._gotcha && form.elements._gotcha.value) return;
      var data = new FormData(form);
      var name = data.get('nom'), mail = data.get('email');
      var lines = [
        data.get('message'),
        '',
        '—',
        name + ' · ' + mail,
        data.get('oeuvre') ? 'Œuvre : ' + data.get('oeuvre') : ''
      ].filter(function (l, i) { return l !== '' || i === 1; });

      if (CONFIG.contactEndpoint) {
        var btn = $('button[type="submit"]', form);
        btn.disabled = true;
        say('Envoi en cours…');
        fetch(CONFIG.contactEndpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
          .then(function (r) {
            if (!r.ok) throw new Error(r.status);
            form.reset();
            say('Merci, votre message a bien été envoyé. Valérie Bourimoff vous répondra très vite.');
          })
          .catch(function () { say('L\'envoi a échoué. Merci de réessayer dans un instant.', true); })
          .then(function () { btn.disabled = false; });
      } else if (contactEmail) {
        location.href = 'mailto:' + contactEmail +
          '?subject=' + encodeURIComponent(data.get('sujet') + ' — ' + name) +
          '&body=' + encodeURIComponent(lines.join('\n'));
        say('Votre messagerie va s\'ouvrir avec le message pré-rempli.');
      } else {
        say('Le formulaire n\'est pas encore relié à une adresse e-mail.', true);
      }
    });
  }

  /* ---------- Démarrage ---------- */

  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  initTransitions();
  initHeader();
  initCursor();
  initSplit();
  initScrub();
  initReveals();
  initParallax();
  initMagnetic();

  if (page === 'home') initHome();
  else html.classList.add('is-ready');
  if (page === 'oeuvres') initGallery();
  if (page === 'bio') initBio();
  if (page === 'contact') initContact();
})();
