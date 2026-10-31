/* ==========================================================================
   Administration du site de Valérie Bourimoff
   Lit les contenus (content/*.json) par /api/contenu, les modifie en mémoire,
   puis publie toutes les modifications d'un coup par /api/publier : un commit
   sur GitHub, que Cloudflare Pages reconstruit et met en ligne.
   ========================================================================== */

// ---------------------------------------------------------------- textes modifiables
// Clés de content/textes.json, rangées comme dans les pages du site.
// « long » : zone de texte sur plusieurs lignes ; « aide » : précision sous le champ.

const TEXTS = {
  accueil: [
    { titre: 'Présentation', champs: [
      { cle: 'manifeste_surtitre', label: 'Petit titre' },
      { cle: 'manifeste', label: 'Texte de présentation', long: true },
      { cle: 'manifeste_lien', label: 'Lien vers la biographie' },
    ] },
    { titre: 'Titres des sections', champs: [
      { cle: 'selection_titre', label: 'Titre des « Œuvres choisies »' },
      { cle: 'chapitres_titre', label: 'Titre des chapitres' },
      { cle: 'chapitres_texte', label: 'Texte des chapitres', long: true, aide: 'Précédé automatiquement de « De 2003 à 2020, » (années de la première et de la dernière œuvre).' },
      { cle: 'lieux_titre', label: 'Titre des lieux qui défilent' },
    ] },
    { titre: 'L\'atelier', image: 'atelier', champs: [
      { cle: 'atelier_surtitre', label: 'Petit titre' },
      { cle: 'atelier_titre', label: 'Titre' },
      { cle: 'atelier_texte1', label: 'Premier paragraphe', long: true },
      { cle: 'atelier_texte2', label: 'Second paragraphe', long: true },
      { cle: 'atelier_citation', label: 'Citation', long: true },
      { cle: 'atelier_lien', label: 'Lien vers la biographie' },
    ] },
    { titre: 'Encadré « Contact »', champs: [
      { cle: 'contact_titre', label: 'Titre' },
      { cle: 'contact_texte', label: 'Texte', long: true },
    ] },
  ],
  biographie: [
    { titre: 'En-tête', image: 'portrait', champs: [
      { cle: 'intro', label: 'Présentation sous le nom', long: true },
    ] },
    { titre: 'En chiffres', champs: [
      { cle: 'chiffre_nombre', label: 'Premier chiffre', aide: 'Les deux autres (expositions, œuvres en ligne) sont comptés automatiquement.' },
      { cle: 'chiffre_texte', label: 'Sa légende' },
    ] },
  ],
  biographieFin: [
    { titre: 'Bas de page', champs: [
      { cle: 'expositions_surtitre', label: 'Petit titre au-dessus des expositions' },
      { cle: 'oeuvres_titre', label: 'Titre de l\'encadré vers les œuvres' },
    ] },
  ],
  contact: [
    { titre: 'Page Contact', champs: [
      { cle: 'titre', label: 'Titre' },
      { cle: 'intro', label: 'Texte d\'introduction', long: true },
      { cle: 'texte', label: 'Second texte', long: true },
    ] },
    { titre: 'Les trois raisons d\'écrire', champs: [
      { cle: 'sujet1_titre', label: 'Première : titre' }, { cle: 'sujet1_texte', label: 'Première : texte' },
      { cle: 'sujet2_titre', label: 'Deuxième : titre' }, { cle: 'sujet2_texte', label: 'Deuxième : texte' },
      { cle: 'sujet3_titre', label: 'Troisième : titre' }, { cle: 'sujet3_texte', label: 'Troisième : texte' },
    ] },
  ],
  oeuvres: [
    { titre: 'Page Œuvres', champs: [
      { cle: 'titre', label: 'Titre' },
      { cle: 'intro', label: 'Texte d\'introduction', long: true },
      { cle: 'contact_titre', label: 'Titre de l\'encadré « Contact »' },
      { cle: 'contact_texte', label: 'Texte de l\'encadré « Contact »', long: true },
    ] },
  ],
  site: [
    { titre: 'Partout sur le site', champs: [
      { cle: 'devise', label: 'Devise', aide: 'En haut de l\'accueil, dans le menu et en bas de chaque page.' },
      { cle: 'devise_en', label: 'Devise en anglais' },
      { cle: 'disciplines', label: 'Disciplines', aide: 'Par exemple : Peinture · Aquarelle · Dessin.' },
      { cle: 'droits', label: 'Mention des droits', long: true, aide: 'En bas de chaque page et de la biographie.' },
    ] },
  ],
};

const IMAGES = {
  atelier: 'Photo de l\'atelier',
  portrait: 'Portrait',
};

const CATEGORIES = [['peinture', 'Peinture'], ['aquarelle', 'Aquarelle'], ['dessin', 'Dessin']];

const VIEWS = [
  ['oeuvres', 'Œuvres', 'image'],
  ['chapitres', 'Chapitres', 'layers'],
  ['accueil', 'Page d\'accueil', 'home'],
  ['biographie', 'Biographie', 'user'],
  ['contact', 'Contact', 'mail'],
  ['textes', 'Autres textes', 'text'],
];

const FILES = {
  accueil: 'content/accueil.json',
  bio: 'content/biographie.json',
  reglages: 'content/reglages.json',
  textes: 'content/textes.json',
  images: 'content/images.json',
};

const STAMP = /^(.*?)-?(\d{14})$/; // anciennes fiches Pages CMS : <titre>-AAAAMMJJhhmmss
const NEW = '~nouveau-';           // fiches pas encore nommées (nom choisi à la publication)

// ---------------------------------------------------------------- état

const S = {
  version: null,  // commit des contenus chargés
  original: {},   // chemin → objet tel que publié
  files: {},      // chemin → objet modifié
  photos: {},     // chemin d'une photo pas encore publiée → { blob (fichier), url, ext, sha }
  thumbs: {},     // chemin d'une photo publiée → vignette
  view: 'oeuvres',
  filter: { q: '', chapitre: '', cat: '' },
  seq: 0,
  busy: false,
};

// ---------------------------------------------------------------- DOM

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
};

function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('i');
  svg.innerHTML = ICONS[name];
  return svg;
}

// h('button.btn.btn--primary', { onclick }, 'Texte', enfant…)
function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.classList.add(...String(value).split(' ').filter(Boolean));
    else if (key in el && !key.includes('-') && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const $ = (selector, root = document) => root.querySelector(selector);

// ---------------------------------------------------------------- outils

const clone = (value) => JSON.parse(JSON.stringify(value));
const serialize = (value) => JSON.stringify(value, null, 2) + '\n';
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const stem = (path) => path.split('/').pop().replace(/\.[^.]+$/, '');
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

function slugify(text) {
  return clean(text).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ---------------------------------------------------------------- API

async function api(route, { method = 'GET', body, raw } = {}) {
  const headers = { 'X-Admin': '1' };
  if (raw !== undefined) headers['Content-Type'] = 'text/plain';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api/' + route, {
    method, headers, credentials: 'same-origin',
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.erreur || `Le serveur ne répond pas (erreur ${res.status}).`), { status: res.status });
  }
  return data;
}

// ---------------------------------------------------------------- contenus

const isWork = (path) => path.startsWith('content/oeuvres/');
const isChapter = (path) => path.startsWith('content/chapitres/');
const doc = (path) => S.files[path] || (S.files[path] = {});
const texts = (page) => { const all = doc(FILES.textes); return all[page] || (all[page] = {}); };

function works() {
  return Object.keys(S.files).filter(isWork).map((path) => ({ path, d: S.files[path] }));
}

function chapters() {
  const key = (nom) => /^\d{4}$/.test(nom) ? [0, -Number(nom), ''] : [1, 0, slugify(nom)];
  return Object.keys(S.files).filter(isChapter)
    .map((path) => ({ path, d: S.files[path], nom: clean(S.files[path].nom) || stem(path) }))
    .sort((a, b) => compare(key(a.nom), key(b.nom)));
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// Même ordre que scripts/build.py : position, puis date de création, puis nom de fichier.
function workKey(w) {
  const order = toInt(w.d.ordre);
  const m = STAMP.exec(stem(w.path));
  return [order === null ? 1 : 0, order ?? 0, m ? m[2] : '', stem(w.path)];
}

function chapterOf(w) {
  const ref = clean(w.d.chapitre);
  if (S.files[ref] && isChapter(ref)) return ref;
  const byName = chapters().find((c) => c.nom.toLowerCase() === ref.toLowerCase());
  return byName ? byName.path : '';
}

function worksOf(chapterPath) {
  return works().filter((w) => chapterOf(w) === chapterPath).sort((a, b) => compare(workKey(a), workKey(b)));
}

function chapterLabel(c) {
  return clean(c.d.titre) ? `${c.nom} — ${clean(c.d.titre)}` : c.nom;
}

function workTitle(d) {
  return clean(d.titre) || 'Sans titre';
}

function workMeta(d) {
  return [clean(d.technique), clean(d.annee)].filter(Boolean).join(' · ');
}

function thumbOf(media) {
  if (!media) return null;
  if (S.photos[media]) return S.photos[media].url;
  return S.thumbs[media] ? '/' + S.thumbs[media] : null;
}

// Renumérote les œuvres d'un chapitre dans l'ordre donné (1, 2, 3…).
function renumber(list) {
  list.forEach((w, i) => { if (toInt(w.d.ordre) !== i + 1) w.d.ordre = i + 1; });
}

function nextOrder(chapterPath, except) {
  return worksOf(chapterPath).filter((w) => w.path !== except)
    .reduce((max, w) => Math.max(max, toInt(w.d.ordre) ?? 0), 0) + 1;
}

// Remplace (ou retire, si `to` est vide) une référence à une fiche partout où elle apparaît.
function replaceRef(from, to) {
  const home = doc(FILES.accueil);
  for (const key of ['ouverture', 'selection']) {
    if (!Array.isArray(home[key])) continue;
    home[key] = to ? home[key].map((r) => r === from ? to : r) : home[key].filter((r) => r !== from);
  }
  for (const c of chapters()) {
    if (c.d.illustration === from) c.d.illustration = to || '';
  }
  for (const w of works()) {
    if (w.d.chapitre === from) w.d.chapitre = to || '';
  }
}

function referencedMedia(files) {
  const media = new Set();
  for (const [path, d] of Object.entries(files)) {
    if (isWork(path) && d.image) media.add(clean(d.image).replace(/^\//, ''));
  }
  for (const image of Object.values(files[FILES.images] || {})) {
    if (image) media.add(clean(image).replace(/^\//, ''));
  }
  return media;
}

// ---------------------------------------------------------------- modifications

function changedPaths() {
  const out = [];
  for (const path of Object.keys(S.files)) {
    if (!(path in S.original)) out.push({ path, kind: 'new' });
    else if (serialize(S.files[path]) !== serialize(S.original[path])) out.push({ path, kind: 'edit' });
  }
  for (const path of Object.keys(S.original)) {
    if (!(path in S.files)) out.push({ path, kind: 'delete' });
  }
  return out;
}

function describe({ path, kind }) {
  const d = S.files[path] || S.original[path] || {};
  if (isWork(path)) {
    const name = clean(d.titre) ? `« ${clean(d.titre)} »` : 'sans titre';
    return { new: `Nouvelle œuvre ${name}`, edit: `Œuvre ${name}`, delete: `Œuvre ${name} supprimée` }[kind];
  }
  if (isChapter(path)) {
    const name = clean(d.nom) || stem(path);
    return { new: `Nouveau chapitre ${name}`, edit: `Chapitre ${name}`, delete: `Chapitre ${name} supprimé` }[kind];
  }
  return {
    [FILES.accueil]: 'Page d\'accueil : œuvres et lieux',
    [FILES.bio]: 'Biographie',
    [FILES.reglages]: 'Adresse e-mail de contact',
    [FILES.textes]: 'Textes du site',
    [FILES.images]: 'Photos du site',
  }[path] || path;
}

// À appeler après chaque modification : met à jour le bouton « Publier ».
function touch() {
  const n = changedPaths().length;
  const btn = $('[data-publish]');
  if (!btn) return;
  btn.disabled = !n || S.busy;
  $('[data-count]', btn).textContent = n ? String(n) : '';
  btn.classList.toggle('is-ready', n > 0);
  $('[data-undo]').hidden = !n || S.busy;
}

// Redessine la vue courante (après un ajout, une suppression, un déplacement…).
function rerender() {
  touch();
  const main = $('#main');
  if (!main) return;
  const scroll = main.scrollTop;
  main.replaceChildren(VIEW_RENDER[S.view]());
  main.scrollTop = scroll;
}
const rerenderSoon = debounce(rerender, 200);

// ---------------------------------------------------------------- photos

async function preparePhoto(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('conversion impossible');
    return { blob, ext: 'jpg', url: URL.createObjectURL(blob) };
  } catch {
    // Format que ce navigateur ne sait pas afficher (HEIC hors Safari) : envoyé tel quel,
    // il sera converti à la publication.
    if (!['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      throw new Error(`« ${file.name} » n'est pas une photo reconnue (JPG, PNG, WebP ou HEIC).`);
    }
    if (file.size > 18 * 1024 * 1024) throw new Error(`« ${file.name} » est trop lourde (18 Mo au maximum).`);
    return { blob: file, ext, url: null };
  }
}

function pickFiles({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*,.heic,.heif', multiple });
    input.addEventListener('change', () => resolve([...input.files]));
    input.click();
  });
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function photoBox(media, { big = false } = {}) {
  const url = thumbOf(media);
  if (url) return h('img', { src: url, alt: '', loading: big ? 'eager' : 'lazy', decoding: 'async' });
  return h('div.ph', {}, icon('image'),
    h('span', {}, S.photos[media] ? 'Aperçu indisponible, la photo sera convertie à la publication' : 'Photo en cours de publication'));
}

// ---------------------------------------------------------------- champs

function field(label, input, aide) {
  return h('label.field', {}, h('span.field__label', {}, label), input, aide && h('span.field__help', {}, aide));
}

function textInput(obj, key, { long = false, placeholder = '', onchange, ...rest } = {}) {
  const props = {
    value: obj[key] ?? '', placeholder,
    oninput: (ev) => { obj[key] = ev.target.value; onchange?.(); touch(); },
    ...rest,
  };
  if (!long) return h('input.input', { type: 'text', ...props });
  const area = h('textarea.input', { rows: 3, ...props });
  const fit = () => { area.style.height = 'auto'; area.style.height = area.scrollHeight + 2 + 'px'; };
  area.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return area;
}

function textGroups(page, groups) {
  const values = texts(page);
  return groups.map((g) => h('section.card', {},
    h('h2.card__title', {}, g.titre),
    g.image && imageField(g.image),
    h('div.fields', {}, g.champs.map((c) =>
      field(c.label, textInput(values, c.cle, { long: c.long }), c.aide)))));
}

function imageField(name) {
  const images = doc(FILES.images);
  const box = h('div.site-image__photo', {}, photoBox(images[name], { big: true }));
  return h('div.site-image', {},
    box,
    h('div', {},
      h('span.field__label', {}, IMAGES[name]),
      h('button.btn', { type: 'button', onclick: async () => {
        const [file] = await pickFiles();
        if (!file) return;
        try {
          const photo = await preparePhoto(file);
          const media = `medias/site/${name}-${Date.now().toString(36)}.${photo.ext}`;
          S.photos[media] = photo;
          images[name] = media;
          box.replaceChildren(photoBox(media, { big: true }));
          touch();
        } catch (err) { toast(err.message, 'error'); }
      } }, icon('upload'), 'Remplacer la photo')));
}

function italicHint() {
  return h('p.hint', {}, 'Astuce : entourez des mots d\'astérisques pour les écrire en italique. ',
    h('code', {}, 'Une vie *intérieure*'), ' s\'affiche « Une vie ', h('em', {}, 'intérieure'), ' ».');
}

// Liste modifiable (lieux, formations, expositions) : une ligne par élément.
function listEditor({ items, columns, addLabel, make, addFirst = false }) {
  const rows = items.map((item, i) => h('div.list__row', {},
    columns.map((col) => col.key === null
      ? h('input.input', { type: 'text', value: item, placeholder: col.placeholder || '', 'aria-label': col.label,
        oninput: (ev) => { items[i] = ev.target.value; touch(); } })
      : textInput(item, col.key, { placeholder: col.placeholder || '', 'aria-label': col.label, class: col.class })),
    h('div.list__tools', {},
      h('button.icon-btn', { type: 'button', title: 'Monter', disabled: i === 0, onclick: () => { move(items, i, i - 1); rerender(); } }, icon('up')),
      h('button.icon-btn', { type: 'button', title: 'Descendre', disabled: i === items.length - 1, onclick: () => { move(items, i, i + 1); rerender(); } }, icon('down')),
      h('button.icon-btn.icon-btn--danger', { type: 'button', title: 'Retirer', onclick: () => { items.splice(i, 1); rerender(); } }, icon('trash')))));
  const add = h('button.btn.btn--ghost', { type: 'button', onclick: () => {
    if (addFirst) items.unshift(make()); else items.push(make());
    rerender();
    const inputs = document.querySelectorAll(`[data-list="${addLabel}"] .list__row input`);
    (addFirst ? inputs[0] : inputs[inputs.length - columns.length])?.focus();
  } }, icon('plus'), addLabel);
  return h('div.list', { class: `list--${columns.length}`, 'data-list': addLabel },
    columns.some((c) => c.label) && h('div.list__head', {}, columns.map((c) => h('span', { class: c.class }, c.label)), h('span')),
    addFirst && add, rows, !addFirst && add);
}

function move(array, from, to) {
  if (to < 0 || to >= array.length) return;
  array.splice(to, 0, array.splice(from, 1)[0]);
}

// ---------------------------------------------------------------- vue : œuvres

function viewWorks() {
  const all = works();
  const q = slugify(S.filter.q);
  const filtered = Boolean(q || S.filter.chapitre || S.filter.cat);
  const match = (w) => (!q || slugify(`${w.d.titre} ${w.d.technique} ${w.d.annee}`).includes(q))
    && (!S.filter.cat || clean(w.d.categorie) === S.filter.cat);

  const groups = chapters().map((c) => ({ chapter: c, list: worksOf(c.path) }));
  const orphans = all.filter((w) => !chapterOf(w));
  if (orphans.length) groups.push({ chapter: null, list: orphans });

  const toolbar = h('div.toolbar', {},
    h('label.search', {}, icon('search'),
      h('input', { type: 'search', placeholder: 'Rechercher un titre, une technique, une année', value: S.filter.q,
        oninput: debounce((ev) => { S.filter.q = ev.target.value; rerender(); $('.search input')?.focus(); }, 250) })),
    h('select.input.input--select', { 'aria-label': 'Chapitre', onchange: (ev) => { S.filter.chapitre = ev.target.value; rerender(); } },
      h('option', { value: '' }, 'Tous les chapitres'),
      chapters().map((c) => h('option', { value: c.path, selected: S.filter.chapitre === c.path }, chapterLabel(c)))),
    h('div.segmented', { role: 'group', 'aria-label': 'Catégorie' },
      [['', 'Tout'], ...CATEGORIES].map(([value, label]) => h('button', {
        type: 'button', 'aria-pressed': String(S.filter.cat === value),
        onclick: () => { S.filter.cat = value; rerender(); },
      }, label))));

  const sections = groups
    .filter((g) => !S.filter.chapitre || g.chapter?.path === S.filter.chapitre)
    .map(({ chapter, list }) => {
      const shown = list.filter(match);
      if (filtered && !shown.length) return null;
      return h('section.group', {},
        h('header.group__head', {},
          h('h2.group__title', {}, chapter ? h('span.group__year', {}, chapter.nom) : h('span.group__year', {}, 'Sans chapitre'),
            chapter && clean(chapter.d.titre) && h('span.group__name', {}, clean(chapter.d.titre))),
          h('span.group__count', {}, plural(list.length, 'œuvre')),
          chapter && h('button.btn.btn--small', { type: 'button', onclick: () => addWorks(chapter.path) }, icon('plus'), 'Ajouter ici')),
        h('div.grid', { 'data-chapter': chapter?.path || '' },
          shown.map((w) => workCard(w, chapter && !filtered ? list : null))));
    });

  return h('div.view', {},
    h('header.view__head', {},
      h('div', {},
        h('h1.view__title', {}, 'Œuvres'),
        h('p.view__sub', {}, `${plural(all.length, 'œuvre')} · ${plural(chapters().length, 'chapitre')}`)),
      h('button.btn.btn--primary', { type: 'button', onclick: () => addWorks() }, icon('plus'), 'Ajouter des œuvres')),
    h('p.hint', {}, filtered
      ? 'Effacez la recherche et les filtres pour changer l\'ordre des œuvres.'
      : 'Cliquez sur une œuvre pour la modifier. Faites glisser les œuvres pour changer leur ordre dans un chapitre. Vous pouvez aussi déposer des photos n\'importe où sur cette page.'),
    toolbar,
    sections.some(Boolean) ? sections : h('p.empty', {}, 'Aucune œuvre ne correspond à la recherche.'));
}

function workCard(w, sortableList) {
  const changed = !(w.path in S.original) ? 'Nouvelle' : serialize(w.d) !== serialize(S.original[w.path]) ? 'Modifiée' : '';
  const selected = (doc(FILES.accueil).selection || []).includes(w.path);
  const card = h('button.work', { type: 'button', onclick: () => openWork(w.path), draggable: Boolean(sortableList) },
    h('span.work__photo', {}, photoBox(w.d.image)),
    changed && h('span.badge', {}, changed),
    selected && h('span.work__star', { title: 'Dans les « Œuvres choisies »' }, icon('star')),
    h('span.work__title', {}, workTitle(w.d)),
    h('span.work__meta', {}, workMeta(w.d) || '—'));
  if (sortableList) makeSortable(card, w, sortableList);
  return card;
}

// Glisser-déposer des œuvres à l'intérieur d'un chapitre.
let dragged = null;
function makeSortable(card, w, list) {
  card.addEventListener('dragstart', (ev) => {
    dragged = { w, list };
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', w.path);
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });
  card.addEventListener('dragend', () => {
    dragged = null;
    card.classList.remove('is-dragging');
    document.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  });
  card.addEventListener('dragover', (ev) => {
    if (!dragged || dragged.list !== list || dragged.w === w) return;
    ev.preventDefault();
    const box = card.getBoundingClientRect();
    const after = ev.clientX > box.left + box.width / 2;
    card.classList.toggle('drop-after', after);
    card.classList.toggle('drop-before', !after);
  });
  card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
  card.addEventListener('drop', (ev) => {
    if (!dragged || dragged.list !== list) return;
    ev.preventDefault();
    const after = card.classList.contains('drop-after');
    const from = list.indexOf(dragged.w);
    let to = list.indexOf(w) + (after ? 1 : 0);
    if (from < to) to -= 1;
    move(list, from, to);
    renumber(list);
    rerender();
  });
}

async function addWorks(chapterPath, files) {
  files = files || await pickFiles({ multiple: true });
  if (!files.length) return;
  const target = chapterPath || S.filter.chapitre || chapters()[0]?.path || '';
  const chapter = chapters().find((c) => c.path === target);
  const note = toast(`Préparation de ${plural(files.length, 'photo')}…`, 'info', 0);
  const created = [];
  for (const file of files) {
    try {
      const photo = await preparePhoto(file);
      const n = ++S.seq;
      const media = `medias/oeuvres/${NEW}${n}.${photo.ext}`;
      const path = `content/oeuvres/${NEW}${n}.json`;
      S.photos[media] = photo;
      S.files[path] = {
        image: media,
        titre: '',
        technique: '',
        dimensions: '',
        annee: chapter && /^\d{4}$/.test(chapter.nom) ? chapter.nom : '',
        categorie: chapter && slugify(chapter.nom).startsWith('dessin') ? 'dessin' : 'peinture',
        chapitre: target,
        ordre: nextOrder(target),
      };
      created.push(path);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  note.remove();
  rerender();
  if (created.length === 1) openWork(created[0]);
  else if (created.length) toast(`${plural(created.length, 'œuvre')} ajoutée${created.length > 1 ? 's' : ''}. Cliquez sur chacune pour lui donner un titre.`, 'success');
}

// ---------------------------------------------------------------- éditeur d'œuvre

function openWork(path) {
  const d = S.files[path];
  if (!d) return;
  const home = doc(FILES.accueil);
  const photo = h('div.editor__photo', {}, photoBox(d.image, { big: true }));

  const position = h('div.position');
  function renderPosition() {
    const list = worksOf(chapterOf({ path, d }));
    const i = list.findIndex((w) => w.path === path);
    const go = (to) => { move(list, i, to); renumber(list); renderPosition(); touch(); rerenderSoon(); };
    position.replaceChildren(
      h('button.btn.btn--small', { type: 'button', disabled: i <= 0, onclick: () => go(i - 1) }, icon('left'), 'Avant'),
      h('span.position__text', {}, i < 0 ? '—' : `${i + 1}${i ? 'e' : 're'} sur ${list.length}`),
      h('button.btn.btn--small', { type: 'button', disabled: i < 0 || i >= list.length - 1, onclick: () => go(i + 1) }, 'Après', icon('right')));
  }
  renderPosition();

  const categories = h('div.segmented', { role: 'group', 'aria-label': 'Catégorie' },
    CATEGORIES.map(([value, label]) => h('button', {
      type: 'button', 'aria-pressed': String(clean(d.categorie) === value),
      onclick: (ev) => {
        d.categorie = value;
        [...categories.children].forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
        touch();
      },
    }, label)));

  const chapterSelect = h('select.input.input--select', {
    onchange: (ev) => {
      d.chapitre = ev.target.value;
      d.ordre = nextOrder(d.chapitre, path);
      renderPosition();
      touch();
    },
  }, !chapterOf({ path, d }) && h('option', { value: '' }, 'Choisir un chapitre'),
  chapters().map((c) => h('option', { value: c.path, selected: chapterOf({ path, d }) === c.path }, chapterLabel(c))));

  const techniques = [...new Set(works().map((w) => clean(w.d.technique)).filter(Boolean))].sort();
  const year = textInput(d, 'annee', { placeholder: 'Par exemple 2025', inputmode: 'numeric', maxlength: 4 });

  const body = h('div.editor', {},
    photo,
    h('button.btn', { type: 'button', onclick: async () => {
      const [file] = await pickFiles();
      if (!file) return;
      try {
        const prepared = await preparePhoto(file);
        const base = path.includes(NEW) ? stem(path) : `${stem(path)}-${Date.now().toString(36)}`;
        const media = `medias/oeuvres/${base}.${prepared.ext}`;
        S.photos[media] = prepared;
        d.image = media;
        photo.replaceChildren(photoBox(media, { big: true }));
        touch();
        rerenderSoon();
      } catch (err) { toast(err.message, 'error'); }
    } }, icon('upload'), 'Changer la photo'),
    h('div.fields', {},
      field('Titre', textInput(d, 'titre', { placeholder: 'Sans titre', onchange: () => setDrawerTitle(workTitle(d)) }),
        'Laisser vide si l\'œuvre est sans titre.'),
      field('Technique', textInput(d, 'technique', { placeholder: 'Acrylique, Aquarelle, Huile…', list: 'techniques' })),
      h('datalist', { id: 'techniques' }, techniques.map((t) => h('option', { value: t }))),
      h('div.fields__row', {},
        field('Dimensions', textInput(d, 'dimensions', { placeholder: '50 × 70 cm' }), 'Facultatif.'),
        field('Année', year)),
      h('div.field', {}, h('span.field__label', {}, 'Catégorie'), categories, h('span.field__help', {}, 'Sert aux filtres de la page Œuvres.')),
      field('Chapitre', chapterSelect),
      h('div.field', {}, h('span.field__label', {}, 'Position dans le chapitre'), position),
      h('label.check', {},
        h('input', { type: 'checkbox', checked: (home.selection || []).includes(path), onchange: (ev) => {
          const list = home.selection || (home.selection = []);
          if (ev.target.checked) list.push(path);
          else home.selection = list.filter((r) => r !== path);
          touch();
          rerenderSoon();
        } }),
        h('span', {}, 'Montrer dans les « Œuvres choisies » de la page d\'accueil'))),
    h('div.editor__danger', {},
      h('button.btn.btn--danger', { type: 'button', onclick: async () => {
        if (!(await confirmBox(`Supprimer « ${workTitle(d)} » du site ?`, 'La suppression sera définitive après la publication.', 'Supprimer'))) return;
        delete S.files[path];
        replaceRef(path, '');
        closeDrawer();
        toast('Œuvre supprimée. Publiez pour la retirer du site.', 'info');
      } }, icon('trash'), 'Supprimer cette œuvre')));

  openDrawer(workTitle(d), body);
}

// ---------------------------------------------------------------- vue : chapitres

function viewChapters() {
  return h('div.view', {},
    h('header.view__head', {},
      h('div', {},
        h('h1.view__title', {}, 'Chapitres'),
        h('p.view__sub', {}, 'Les périodes et séries de la page Œuvres. Les années sont classées de la plus récente à la plus ancienne, les autres noms (Dessins…) viennent après.')),
      h('button.btn.btn--primary', { type: 'button', onclick: newChapter }, icon('plus'), 'Nouveau chapitre')),
    h('div.chapters', {}, chapters().map((c) => {
      const list = worksOf(c.path);
      const cover = S.files[c.d.illustration] && isWork(c.d.illustration) ? S.files[c.d.illustration] : list[0]?.d;
      return h('button.chapter', { type: 'button', onclick: () => openChapter(c.path) },
        h('span.chapter__photo', {}, cover ? photoBox(cover.image) : h('div.ph', {}, icon('layers'))),
        h('span.chapter__body', {},
          h('span.chapter__year', {}, c.nom),
          h('span.chapter__title', {}, clean(c.d.titre) || 'Sans titre'),
          h('span.chapter__count', {}, list.length ? plural(list.length, 'œuvre') : 'Vide : il n\'apparaît pas sur le site')));
    })));
}

async function newChapter() {
  const nom = await promptBox('Nouveau chapitre', 'Une année (par exemple 2025) ou un mot (par exemple Dessins).', 'Créer');
  if (!clean(nom)) return;
  const base = slugify(nom) || 'chapitre';
  let path = `content/chapitres/${base}.json`;
  for (let n = 2; path in S.files || path in S.original; n++) path = `content/chapitres/${base}-${n}.json`;
  S.files[path] = { nom: clean(nom), titre: '', intro: '', illustration: '' };
  rerender();
  openChapter(path);
}

function openChapter(path) {
  const d = S.files[path];
  const list = worksOf(path);
  const pick = h('div.picker-grid.picker-grid--small');
  function renderPick() {
    pick.replaceChildren(
      h('button.pick', { type: 'button', 'aria-pressed': String(!d.illustration), onclick: () => { d.illustration = ''; renderPick(); touch(); } },
        h('span.pick__auto', {}, 'Automatique'), h('span.pick__label', {}, 'La première œuvre')),
      list.map((w) => h('button.pick', {
        type: 'button', 'aria-pressed': String(d.illustration === w.path),
        onclick: () => { d.illustration = w.path; renderPick(); touch(); },
      }, photoBox(w.d.image), h('span.pick__label', {}, workTitle(w.d)))));
  }
  renderPick();

  const body = h('div.editor', {},
    h('div.fields', {},
      field('Nom', textInput(d, 'nom', { onchange: () => setDrawerTitle(clean(d.nom) || 'Chapitre') }),
        'Une année (par exemple 2025) ou un mot (par exemple Dessins).'),
      field('Titre', textInput(d, 'titre')),
      field('Texte d\'introduction', textInput(d, 'intro', { long: true }), 'Facultatif.'),
      h('div.field', {}, h('span.field__label', {}, 'Image sur la page d\'accueil'), list.length ? pick : h('p.hint', {}, 'Ajoutez d\'abord des œuvres à ce chapitre.'))),
    h('div.editor__danger', {},
      list.length
        ? h('p.hint', {}, `Pour supprimer ce chapitre, déplacez d'abord ses ${plural(list.length, 'œuvre')} dans un autre chapitre.`)
        : h('button.btn.btn--danger', { type: 'button', onclick: async () => {
          if (!(await confirmBox(`Supprimer le chapitre « ${clean(d.nom)} » ?`, '', 'Supprimer'))) return;
          delete S.files[path];
          replaceRef(path, '');
          closeDrawer();
        } }, icon('trash'), 'Supprimer ce chapitre')));
  openDrawer(clean(d.nom) || 'Chapitre', body);
}

// ---------------------------------------------------------------- vue : accueil

function viewHome() {
  const home = doc(FILES.accueil);
  const opening = home.ouverture || (home.ouverture = []);
  const selection = home.selection || (home.selection = []);
  const lieux = home.lieux || (home.lieux = []);
  const valid = (ref) => S.files[ref] && isWork(ref);

  const slots = [0, 1, 2, 3].map((i) => {
    const ref = valid(opening[i]) ? opening[i] : null;
    return h('button.slot', { type: 'button', onclick: () => pickWorks({ title: `Œuvre n° ${i + 1} de l'ouverture`, onPick: ([path]) => {
      while (opening.length < 4) opening.push('');
      opening[i] = path;
      rerender();
    } }) },
    h('span.slot__num', {}, String(i + 1)),
    h('span.slot__photo', {}, ref ? photoBox(S.files[ref].image) : h('div.ph', {}, icon('plus'), h('span', {}, 'Automatique'))),
    h('span.slot__label', {}, ref ? workTitle(S.files[ref]) : 'Choisir'));
  });

  const chosen = selection.filter(valid);
  const strip = h('div.strip', {},
    chosen.map((ref, i) => h('div.strip__item', {},
      h('span.strip__photo', {}, photoBox(S.files[ref].image)),
      h('span.strip__label', {}, workTitle(S.files[ref])),
      h('div.strip__tools', {},
        h('button.icon-btn', { type: 'button', title: 'Avancer', disabled: i === 0, onclick: () => { home.selection = chosen; move(chosen, i, i - 1); rerender(); } }, icon('left')),
        h('button.icon-btn', { type: 'button', title: 'Reculer', disabled: i === chosen.length - 1, onclick: () => { home.selection = chosen; move(chosen, i, i + 1); rerender(); } }, icon('right')),
        h('button.icon-btn.icon-btn--danger', { type: 'button', title: 'Retirer', onclick: () => { home.selection = chosen.filter((r) => r !== ref); rerender(); } }, icon('close'))))),
    h('button.strip__add', { type: 'button', onclick: () => pickWorks({
      title: 'Ajouter aux « Œuvres choisies »', multiple: true, exclude: chosen,
      onPick: (paths) => { home.selection = [...chosen, ...paths]; rerender(); },
    }) }, icon('plus'), 'Ajouter'));

  return h('div.view', {},
    h('header.view__head', {}, h('div', {},
      h('h1.view__title', {}, 'Page d\'accueil'),
      h('p.view__sub', {}, 'Les œuvres mises en avant et les textes de la page d\'accueil.'))),
    h('section.card', {},
      h('h2.card__title', {}, 'Les 4 œuvres de l\'ouverture'),
      h('p.hint', {}, 'Les tableaux qui entourent le nom en haut de la page. Les deux premiers affichent leur titre. Une place laissée en « Automatique » reçoit une œuvre choisie.'),
      h('div.slots', {}, slots)),
    h('section.card', {},
      h('h2.card__title', {}, 'Œuvres choisies'),
      h('p.hint', {}, 'Le défilé « Œuvres choisies », dans cet ordre.'),
      strip),
    h('section.card', {},
      h('h2.card__title', {}, 'Lieux d\'exposition qui défilent'),
      listEditor({ items: lieux, columns: [{ key: null, placeholder: 'Galerie, ville…' }], addLabel: 'Ajouter un lieu', make: () => '' })),
    italicHint(),
    textGroups('accueil', TEXTS.accueil));
}

// Fenêtre de choix d'œuvres (une seule, ou plusieurs avec « multiple »).
function pickWorks({ title, multiple = false, exclude = [], onPick }) {
  const chosen = new Set();
  let q = '';
  const grid = h('div.picker-grid');
  const confirm = multiple && h('button.btn.btn--primary', { type: 'button', disabled: true, onclick: () => { close(); onPick([...chosen]); } }, 'Ajouter');
  function render() {
    const query = slugify(q);
    const list = chapters().flatMap((c) => worksOf(c.path))
      .filter((w) => !exclude.includes(w.path))
      .filter((w) => !query || slugify(`${w.d.titre} ${w.d.technique} ${w.d.annee}`).includes(query));
    grid.replaceChildren(...list.map((w) => h('button.pick', {
      type: 'button', 'aria-pressed': String(chosen.has(w.path)),
      onclick: () => {
        if (!multiple) { close(); onPick([w.path]); return; }
        if (chosen.has(w.path)) chosen.delete(w.path); else chosen.add(w.path);
        render();
      },
    }, photoBox(w.d.image), h('span.pick__label', {}, workTitle(w.d)), h('span.pick__meta', {}, workMeta(w.d)))));
    if (confirm) {
      confirm.disabled = !chosen.size;
      confirm.textContent = chosen.size ? `Ajouter ${plural(chosen.size, 'œuvre')}` : 'Ajouter';
    }
  }
  render();
  const close = modal(h('div.picker', {},
    h('header.modal__head', {}, h('h2.modal__title', {}, title),
      h('label.search', {}, icon('search'), h('input', { type: 'search', placeholder: 'Rechercher', oninput: (ev) => { q = ev.target.value; render(); } }))),
    grid,
    multiple && h('footer.modal__foot', {}, h('button.btn', { type: 'button', onclick: () => close() }, 'Annuler'), confirm)), { wide: true });
}

// ---------------------------------------------------------------- vue : biographie

function viewBio() {
  const bio = doc(FILES.bio);
  const formations = bio.formations || (bio.formations = []);
  const expositions = bio.expositions || (bio.expositions = []);
  return h('div.view', {},
    h('header.view__head', {}, h('div', {},
      h('h1.view__title', {}, 'Biographie'),
      h('p.view__sub', {}, 'La démarche, les formations et les expositions.'))),
    italicHint(),
    textGroups('biographie', TEXTS.biographie),
    h('section.card', {},
      h('h2.card__title', {}, 'Démarche'),
      h('div.fields', {},
        field('En français', textInput(bio, 'demarche', { long: true }), 'Laissez une ligne vide entre deux paragraphes. Le premier paragraphe est mis en avant.'),
        field('En anglais', textInput(bio, 'demarche_en', { long: true })),
        field('Citation en grand', textInput(bio, 'citation')))),
    h('section.card', {},
      h('h2.card__title', {}, 'Formations'),
      listEditor({
        items: formations, addLabel: 'Ajouter une formation', make: () => ({ nom: '', detail: '' }),
        columns: [{ key: 'nom', label: 'Atelier ou école' }, { key: 'detail', label: 'Lieu ou professeurs' }],
      })),
    h('section.card', {},
      h('h2.card__title', {}, 'Expositions'),
      h('p.hint', {}, 'Elles sont classées automatiquement sur le site, de la plus récente à la plus ancienne. Pour une période, écrivez par exemple « 2019 — 2025 ».'),
      listEditor({
        items: expositions, addLabel: 'Ajouter une exposition', addFirst: true,
        make: () => ({ annee: String(new Date().getFullYear()), titre: '', lieu: '' }),
        columns: [{ key: 'annee', label: 'Année', class: 'col-year' }, { key: 'titre', label: 'Exposition ou salon' }, { key: 'lieu', label: 'Lieu' }],
      })),
    textGroups('biographie', TEXTS.biographieFin));
}

// ---------------------------------------------------------------- vue : contact

function viewContact() {
  const settings = doc(FILES.reglages);
  const status = h('span.field__help');
  const check = () => {
    const ok = !settings.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(settings.email.trim());
    status.textContent = ok ? 'Le formulaire de contact ouvre la messagerie du visiteur avec un message adressé à cette adresse.' : 'Cette adresse e-mail semble incomplète.';
    status.classList.toggle('is-error', !ok);
  };
  check();
  return h('div.view', {},
    h('header.view__head', {}, h('div', {},
      h('h1.view__title', {}, 'Contact'),
      h('p.view__sub', {}, 'L\'adresse qui reçoit les messages et les textes de la page Contact.'))),
    h('section.card', {},
      h('h2.card__title', {}, 'Adresse e-mail de contact'),
      h('label.field', {}, h('span.field__label', {}, 'Adresse e-mail'),
        textInput(settings, 'email', { type: 'email', placeholder: 'prenom.nom@exemple.fr', onchange: check }), status)),
    italicHint(),
    textGroups('contact', TEXTS.contact));
}

function viewTexts() {
  return h('div.view', {},
    h('header.view__head', {}, h('div', {},
      h('h1.view__title', {}, 'Autres textes'),
      h('p.view__sub', {}, 'Les textes de la page Œuvres et ceux qui apparaissent sur toutes les pages.'))),
    italicHint(),
    textGroups('oeuvres', TEXTS.oeuvres),
    textGroups('site', TEXTS.site));
}

const VIEW_RENDER = {
  oeuvres: viewWorks,
  chapitres: viewChapters,
  accueil: viewHome,
  biographie: viewBio,
  contact: viewContact,
  textes: viewTexts,
};

// ---------------------------------------------------------------- tiroir, fenêtres, messages

function openDrawer(title, body) {
  closeDrawer({ silent: true });
  const drawer = h('div.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.drawer__backdrop', { onclick: () => closeDrawer() }),
    h('aside.drawer__panel', {},
      h('header.drawer__head', {},
        h('h2.drawer__title', {}, title),
        h('button.btn.btn--primary.btn--small', { type: 'button', onclick: () => closeDrawer() }, icon('check'), 'Terminé')),
      h('div.drawer__body', {}, body)));
  document.body.append(drawer);
  document.body.classList.add('has-drawer');
  requestAnimationFrame(() => drawer.classList.add('is-open'));
  $('.drawer__body input, .drawer__body textarea', drawer)?.focus({ preventScroll: true });
}

function setDrawerTitle(title) {
  const el = $('.drawer__title');
  if (el) el.textContent = title;
}

function closeDrawer({ silent = false } = {}) {
  const drawer = $('.drawer');
  if (!drawer) return;
  drawer.remove();
  document.body.classList.remove('has-drawer');
  if (!silent) rerender();
}

function modal(content, { wide = false } = {}) {
  const root = h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
    h('div.modal__backdrop', { onclick: () => close() }),
    h('div.modal__panel', { class: wide ? 'modal__panel--wide' : '' }, content));
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  function close() {
    root.remove();
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  $('input, button.btn--primary', root)?.focus();
  return close;
}

function confirmBox(title, text, ok, { danger = true } = {}) {
  return new Promise((resolve) => {
    const done = (value) => { close(); resolve(value); };
    const close = modal(h('div.dialog', {},
      h('h2.modal__title', {}, title),
      text && h('div.dialog__text', {}, text),
      h('footer.modal__foot', {},
        h('button.btn', { type: 'button', onclick: () => done(false) }, 'Annuler'),
        h('button.btn.btn--primary', { type: 'button', class: danger ? 'btn--danger-solid' : '', onclick: () => done(true) }, ok))));
  });
}

function promptBox(title, text, ok) {
  return new Promise((resolve) => {
    const input = h('input.input', { type: 'text' });
    const done = (value) => { close(); resolve(value); };
    const close = modal(h('form.dialog', { onsubmit: (ev) => { ev.preventDefault(); done(input.value); } },
      h('h2.modal__title', {}, title),
      h('label.field', {}, h('span.field__help', {}, text), input),
      h('footer.modal__foot', {},
        h('button.btn', { type: 'button', onclick: () => done('') }, 'Annuler'),
        h('button.btn.btn--primary', { type: 'submit' }, ok))));
    input.focus();
  });
}

function toast(message, type = 'info', duration = 5000) {
  const root = $('.toasts') || document.body.appendChild(h('div.toasts', { 'aria-live': 'polite' }));
  const el = h('div.toast', { class: `toast--${type}` }, h('span', {}, message),
    h('button.icon-btn', { type: 'button', title: 'Fermer', onclick: () => el.remove() }, icon('close')));
  root.append(el);
  if (duration) setTimeout(() => el.remove(), duration);
  return el;
}

// ---------------------------------------------------------------- publication

// Donne un vrai nom aux nouvelles œuvres (d'après leur titre) avant de les publier.
function nameNewWorks() {
  const taken = new Set([...Object.keys(S.files), ...Object.keys(S.original)]);
  const media = new Set([...referencedMedia(S.original), ...Object.keys(S.photos)]);
  for (const { path, d } of works()) {
    if (!stem(path).startsWith(NEW)) continue;
    const base = slugify(d.titre) || slugify(`${d.technique || 'oeuvre'} ${d.annee}`) || 'oeuvre';
    let name = base;
    for (let n = 2; taken.has(`content/oeuvres/${name}.json`); n++) name = `${base}-${n}`;
    const finalPath = `content/oeuvres/${name}.json`;
    taken.add(finalPath);
    if (S.photos[d.image] && stem(d.image).startsWith(NEW)) {
      let file = `medias/oeuvres/${name}.${S.photos[d.image].ext}`;
      for (let n = 2; media.has(file); n++) file = `medias/oeuvres/${name}-${n}.${S.photos[d.image].ext}`;
      media.add(file);
      S.photos[file] = S.photos[d.image];
      delete S.photos[d.image];
      d.image = file;
    }
    S.files[finalPath] = d;
    delete S.files[path];
    replaceRef(path, finalPath);
  }
}

async function publish() {
  const changes = changedPaths();
  if (!changes.length || S.busy) return;
  const ok = await confirmBox('Publier les modifications ?',
    h('ul.summary', {}, changes.slice(0, 12).map((c) => h('li', {}, describe(c))),
      changes.length > 12 && h('li', {}, `… et ${changes.length - 12} autres`)),
    'Publier', { danger: false });
  if (!ok) return;

  S.busy = true;
  touch();
  const progress = toast('Publication en cours…', 'info', 0);
  try {
    nameNewWorks();
    const used = referencedMedia(S.files);
    const photos = Object.keys(S.photos).filter((m) => used.has(m));
    for (const [i, media] of photos.entries()) {
      const photo = S.photos[media];
      if (photo.sha) continue;
      progress.firstChild.textContent = `Envoi des photos (${i + 1} sur ${photos.length})…`;
      photo.sha = (await api('photo', { method: 'POST', raw: await toBase64(photo.blob) })).blob;
    }
    progress.firstChild.textContent = 'Enregistrement des modifications…';

    const final = changedPaths();
    const files = final.map(({ path, kind }) => kind === 'delete'
      ? { chemin: path, supprimer: true }
      : { chemin: path, texte: serialize(S.files[path]) });
    for (const media of photos) files.push({ chemin: media, blob: S.photos[media].sha });
    for (const media of referencedMedia(S.original)) {
      if (!used.has(media)) files.push({ chemin: media, supprimer: true }); // photo remplacée ou œuvre supprimée
    }
    const message = final.map(describe).join(' ; ');
    const { version } = await api('publier', { method: 'POST', body: { version: S.version, message, fichiers: files } });

    // Les nouvelles photos restent affichées depuis l'ordinateur jusqu'à la prochaine visite.
    for (const media of photos) if (S.photos[media].url) S.thumbs[media] = S.photos[media].url.replace(/^\//, '');
    S.photos = {};
    S.version = version;
    S.original = clone(S.files);
    progress.remove();
    toast('C\'est publié ! Le site sera à jour dans 1 à 2 minutes.', 'success', 8000);
    watchDeploy(version);
  } catch (err) {
    progress.remove();
    if (err.status === 401) loginModal();
    else toast(err.message, 'error', 0);
  } finally {
    S.busy = false;
    rerender();
  }
}

// Suit la mise en ligne : Cloudflare écrit le commit publié dans /version.txt.
async function watchDeploy(version) {
  const status = $('[data-status]');
  status.className = 'status status--busy';
  status.textContent = 'Mise en ligne en cours…';
  const started = Date.now();
  while (Date.now() - started < 8 * 60e3) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    if (S.version !== version) return; // une autre publication a pris le relais
    const online = await fetch('/version.txt?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.text() : '').catch(() => '');
    if (online.trim() === version) {
      status.className = 'status status--ok';
      status.replaceChildren(icon('check'), 'Le site est à jour');
      setTimeout(() => { if (S.version === version) status.textContent = ''; }, 15000);
      return;
    }
  }
  status.className = 'status status--warn';
  status.textContent = 'La mise en ligne prend plus de temps que prévu.';
}

async function undoAll() {
  if (!(await confirmBox('Annuler toutes les modifications ?', 'Le site reviendra à la dernière version publiée.', 'Tout annuler'))) return;
  S.files = clone(S.original);
  S.photos = {};
  closeDrawer({ silent: true });
  rerender();
}

// ---------------------------------------------------------------- connexion

function renderLogin(message) {
  const input = h('input.input', { type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Mot de passe' });
  const error = h('p.login__error', { role: 'alert' }, message || '');
  const button = h('button.btn.btn--primary.btn--block', { type: 'submit' }, 'Entrer');
  $('#app').className = 'login';
  $('#app').replaceChildren(h('form.login__card', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      button.disabled = true;
      error.textContent = '';
      try {
        await api('connexion', { method: 'POST', body: { motDePasse: input.value } });
        await start();
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
        input.select();
      }
    },
  },
  h('p.login__name', {}, 'Valérie ', h('em', {}, 'Bourimoff')),
  h('p.login__sub', {}, 'Administration du site'),
  h('label.field', {}, h('span.field__label', {}, 'Mot de passe'), input),
  error, button));
  input.focus();
}

// Session expirée pendant le travail : on se reconnecte sans perdre les modifications.
function loginModal() {
  const input = h('input.input', { type: 'password', autocomplete: 'current-password' });
  const error = h('p.login__error', { role: 'alert' });
  const close = modal(h('form.dialog', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      try {
        await api('connexion', { method: 'POST', body: { motDePasse: input.value } });
        close();
        toast('Vous êtes reconnecté·e. Cliquez à nouveau sur « Publier ».', 'success');
      } catch (err) { error.textContent = err.message; }
    },
  },
  h('h2.modal__title', {}, 'Session expirée'),
  h('p', {}, 'Entrez à nouveau le mot de passe : vos modifications sont conservées.'),
  input, error,
  h('footer.modal__foot', {}, h('button.btn.btn--primary', { type: 'submit' }, 'Se reconnecter'))));
  input.focus();
}

// ---------------------------------------------------------------- interface

function renderShell() {
  const nav = h('nav.nav', { 'aria-label': 'Sections' }, VIEWS.map(([id, label, ico]) =>
    h('a.nav__link', { href: '#' + id, 'aria-current': S.view === id ? 'page' : null }, icon(ico), h('span', {}, label))));
  $('#app').className = 'app';
  $('#app').replaceChildren(
    h('aside.side', {},
      h('a.brand', { href: '#oeuvres' }, h('span.brand__name', {}, 'Valérie ', h('em', {}, 'Bourimoff')), h('span.brand__sub', {}, 'Administration')),
      nav,
      h('div.side__foot', {},
        h('a.side__link', { href: '/', target: '_blank', rel: 'noopener' }, icon('external'), 'Voir le site'),
        h('button.side__link', { type: 'button', onclick: async () => {
          if (changedPaths().length && !(await confirmBox('Se déconnecter ?', 'Les modifications non publiées seront perdues.', 'Se déconnecter'))) return;
          await api('deconnexion', { method: 'POST' }).catch(() => {});
          S.original = {}; S.files = {};
          renderLogin();
        } }, icon('logout'), 'Se déconnecter'))),
    h('div.content', {},
      h('header.bar', {},
        h('p.status', { 'data-status': true, 'aria-live': 'polite' }),
        h('button.btn.btn--ghost', { type: 'button', 'data-undo': true, hidden: true, onclick: undoAll }, icon('undo'), 'Tout annuler'),
        h('button.btn.btn--primary.publish', { type: 'button', 'data-publish': true, disabled: true, onclick: publish },
          'Publier', h('span.publish__count', { 'data-count': true }))),
      h('main.main', { id: 'main' })));
  show(S.view);
}

function show(view) {
  S.view = VIEW_RENDER[view] ? view : 'oeuvres';
  document.querySelectorAll('.nav__link').forEach((a) => {
    if (a.getAttribute('href') === '#' + S.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  closeDrawer({ silent: true });
  rerender();
  $('#main').scrollTop = 0;
}

async function load() {
  const [content, thumbs] = await Promise.all([
    api('contenu'),
    fetch('/admin/vignettes.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
  ]);
  S.version = content.version;
  S.original = {};
  for (const [path, text] of Object.entries(content.fichiers)) {
    try { S.original[path] = JSON.parse(text); } catch { console.warn('Fichier illisible :', path); }
  }
  S.files = clone(S.original);
  S.thumbs = thumbs;
}

async function start() {
  $('#app').className = 'boot';
  $('#app').replaceChildren(h('p.boot__text', {}, 'Chargement des contenus…'));
  try {
    await load();
  } catch (err) {
    if (err.status === 401) return renderLogin();
    $('#app').replaceChildren(h('div.boot__error', {},
      h('p', {}, 'Impossible de charger les contenus.'), h('p.hint', {}, err.message),
      h('button.btn', { type: 'button', onclick: start }, 'Réessayer')));
    return;
  }
  S.view = location.hash.slice(1) || 'oeuvres';
  renderShell();
}

window.addEventListener('hashchange', () => { if ($('#main')) show(location.hash.slice(1)); });

window.addEventListener('beforeunload', (ev) => {
  if (Object.keys(S.original).length && changedPaths().length) { ev.preventDefault(); ev.returnValue = ''; }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && $('.drawer') && !$('.modal')) closeDrawer();
});

// Photos déposées sur la page Œuvres : nouvelles œuvres.
document.addEventListener('dragover', (ev) => {
  if (S.view !== 'oeuvres' || !$('#main') || !ev.dataTransfer.types.includes('Files')) return;
  ev.preventDefault();
  document.body.classList.add('is-dropping');
});
document.addEventListener('dragleave', (ev) => { if (!ev.relatedTarget) document.body.classList.remove('is-dropping'); });
document.addEventListener('drop', (ev) => {
  document.body.classList.remove('is-dropping');
  if (S.view !== 'oeuvres' || !$('#main') || !ev.dataTransfer.files.length) return;
  ev.preventDefault();
  const grid = ev.target.closest?.('[data-chapter]');
  addWorks(grid?.dataset.chapter || undefined, [...ev.dataTransfer.files]);
});

(async function boot() {
  try {
    const { connecte } = await api('session');
    if (connecte) await start(); else renderLogin();
  } catch (err) {
    renderLogin(err.message);
  }
})();
