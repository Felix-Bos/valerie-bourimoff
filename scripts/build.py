#!/usr/bin/env python3
"""Construit le site publié dans _site/ à partir des contenus modifiables.

Les textes (content/*.json) et les photos (medias/) se modifient depuis
l'administration du site (admin/). Ce script :
  - redimensionne chaque photo en WebP : 2000 px (visionneuse) et 900 px (grilles) ;
  - génère assets/js/data.js, le catalogue lu par le JavaScript du site ;
  - remplit les zones <!--@nom-->…<!--/@nom--> des pages HTML. Une zone <!--@page.cle-->
    reçoit le texte content/textes.json[page][cle] et garde son contenu actuel s'il manque.

Usage : python3 scripts/build.py
        python3 -m http.server 8765 -d _site
"""
import base64
import hashlib
import html
import io
import json
import os
import re
import shutil
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

try:  # photos HEIC prises avec un iPhone
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'content'
OUT = ROOT / '_site'
CACHE = ROOT / '.cache' / 'images'
PAGES = ['index.html', 'oeuvres.html', 'biographie.html', 'contact.html']
LARGE, MEDIUM = 2000, 900
IMG_VERSION = '1'  # à changer si le traitement des images change, pour tout régénérer
CATS = ('peinture', 'aquarelle', 'dessin')
NBSP = ' '
STAMP = re.compile(r'^(.*?)-?(\d{14})$')  # fiches créées dans Pages CMS : <titre>-AAAAMMJJhhmmss
MARKER = re.compile(r'<!--@([\w.-]+)-->(.*?)<!--/@\1-->', re.S)
SITE_IMAGES = {'atelier', 'portrait'}  # content/images.json → assets/img/site/<nom>.webp

Image.MAX_IMAGE_PIXELS = 400_000_000
SRGB = ImageCms.createProfile('sRGB')


# ---------------------------------------------------------------- utilitaires

def warn(msg):
    """Signale un contenu à corriger sans bloquer la publication du reste du site."""
    print(f'Attention : {msg}', file=sys.stderr)


def read_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as err:
        warn(f'{path.relative_to(ROOT)} est illisible ({err}) : fichier ignoré')
        return default


def clean(value):
    """Texte sur une ligne, sans espaces superflus ('' si vide)."""
    return '' if value is None else re.sub(r'\s+', ' ', str(value)).strip()


def paragraphs(value):
    """Paragraphes d'un texte long, séparés par une ligne vide."""
    return [clean(p) for p in re.split(r'\n\s*\n', str(value or '')) if clean(p)]


def to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def stem_of(ref):
    """'content/oeuvres/samba.json' → 'samba' (référence d'une fiche vers une autre)."""
    ref = clean(ref)
    return Path(ref).stem if ref else ''


def typo(s):
    """Espaces insécables de la typographie française (avant ? ! : ; », après «)."""
    s = re.sub(r'\s+([?!:;»])', NBSP + r'\1', s or '')
    return re.sub(r'«\s*', '«' + NBSP, s)


def e(s):
    return html.escape(s or '', quote=False).replace('"', '&quot;')


def inline(s):
    """Texte d'une ligne saisi dans l'administration : *mot* s'écrit en italique."""
    return re.sub(r'\*([^*]+)\*', r'<em>\1</em>', e(typo(clean(s))))


def plural(n, word):
    return f'{n} {word}{"s" if n > 1 else ""}'


# ---------------------------------------------------------------- images

def to_rgb(im):
    icc = im.info.get('icc_profile')
    if icc:
        try:
            im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), SRGB, outputMode='RGB')
        except Exception:
            pass
    if im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        flat = Image.new('RGB', im.size, (255, 255, 255))
        flat.paste(im, mask=im.getchannel('A'))
        return flat
    return im.convert('RGB')


def render_image(data, dest):
    im = Image.open(io.BytesIO(data))
    # Une photo déjà au bon format est reprise telle quelle, sans perte.
    as_is = (im.format == 'WEBP' and im.mode == 'RGB' and max(im.size) <= LARGE
             and not im.info.get('icc_profile') and im.getexif().get(0x0112, 1) == 1)
    im = to_rgb(ImageOps.exif_transpose(im))

    large = im.copy()
    large.thumbnail((LARGE, LARGE), Image.LANCZOS)
    if as_is:
        (dest / 'l.webp').write_bytes(data)
    else:
        large.save(dest / 'l.webp', 'WEBP', quality=82, method=6)

    medium = im.copy()
    medium.thumbnail((MEDIUM, MEDIUM), Image.LANCZOS)
    medium.save(dest / 'm.webp', 'WEBP', quality=78, method=6)

    r, g, b = medium.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return dict(w=large.width, h=large.height, mw=medium.width, mh=medium.height, color=f'#{r:02x}{g:02x}{b:02x}')


def convert(src):
    """Dossier contenant les deux tailles de l'image (cache par contenu de fichier)."""
    data = src.read_bytes()
    cached = CACHE / hashlib.sha1(IMG_VERSION.encode() + data).hexdigest()
    if not (cached / 'meta.json').is_file():
        tmp = cached.with_name(cached.name + '.tmp')
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        meta = render_image(data, tmp)
        (tmp / 'meta.json').write_text(json.dumps(meta))
        shutil.rmtree(cached, ignore_errors=True)
        tmp.rename(cached)
    return cached


def process_image(src, wid):
    """Écrit les deux tailles de l'image dans _site."""
    cached = convert(src)
    shutil.copyfile(cached / 'l.webp', OUT / 'assets/img/oeuvres' / f'{wid}.webp')
    shutil.copyfile(cached / 'm.webp', OUT / 'assets/img/oeuvres/m' / f'{wid}.webp')
    return json.loads((cached / 'meta.json').read_text())


def site_images():
    """Photos fixes du site (atelier, portrait), écrites dans assets/img/site/ : [(nom, photo, meta)]."""
    out = []
    for name, image in (read_json(CONTENT / 'images.json', {}) or {}).items():
        image = clean(image).lstrip('/')
        if name not in SITE_IMAGES or not image:
            continue
        try:
            cached = convert(ROOT / image)
        except Exception as err:
            warn(f'la photo {image} ({name}) ne peut pas être lue ({err})')
            continue
        shutil.copyfile(cached / 'l.webp', OUT / 'assets/img/site' / f'{name}.webp')
        out.append((name, image, json.loads((cached / 'meta.json').read_text())))
    return out


def image_tag(name, meta):
    """Met à jour la balise <img> d'une zone <!--@image.nom--> (adresse et dimensions)."""
    def tag(default):
        default = re.sub(r'src="[^"]*"', f'src="assets/img/site/{name}.webp"', default)
        default = re.sub(r'width="\d+"', f'width="{meta["w"]}"', default)
        return re.sub(r'height="\d+"', f'height="{meta["h"]}"', default)
    return tag


# ---------------------------------------------------------------- contenus

def load_chapters():
    chapters = {}
    for path in sorted((CONTENT / 'chapitres').glob('*.json')):
        d = read_json(path, {})
        nom = clean(d.get('nom')) or path.stem
        chapters[path.stem] = dict(
            id=path.stem, year=nom if re.fullmatch(r'\d{4}', nom) else None, label=nom,
            title=typo(clean(d.get('titre'))), intro=typo(clean(d.get('intro'))) or None,
            illustration=stem_of(d.get('illustration')), works=[])
    return chapters


def resolve_chapter(ref, chapters):
    key = stem_of(ref)
    if key in chapters:
        return key
    for ch in chapters.values():  # valeur saisie à la main : le nom du chapitre
        if ref and ch['label'].lower() == clean(ref).lower():
            return ch['id']
    return None


def load_works(chapters):
    entries = []
    for path in (CONTENT / 'oeuvres').glob('*.json'):
        d = read_json(path)
        if isinstance(d, dict):
            m = STAMP.match(path.stem)
            entries.append((m.group(2) if m else '', path, d, m.group(1).strip('-') if m else path.stem))
    # Fiches d'origine d'abord, puis par date de création : l'adresse d'une œuvre ne change jamais.
    entries.sort(key=lambda x: (x[0], x[1].stem))

    works, by_file, used = [], {}, set()
    for stamp, path, d, base in entries:
        title, medium, year = clean(d.get('titre')), clean(d.get('technique')), clean(d.get('annee'))
        name = f'« {title} »' if title else f'L\'œuvre {path.name}'

        image = clean(d.get('image')).lstrip('/')
        src = ROOT / image
        if not image or not src.is_file():
            warn(f'{name} n\'a pas de photo : elle n\'est pas affichée')
            continue

        base = base or slugify(f'{medium or "oeuvre"} {year}')
        wid, n = base, 2
        while wid in used:
            wid, n = f'{base}-{n}', n + 1

        cat = clean(d.get('categorie')).lower()
        if cat not in CATS:
            warn(f'{name} : catégorie « {cat} » inconnue, classée en peinture')
            cat = 'peinture'

        chapter = resolve_chapter(d.get('chapitre'), chapters)
        if not chapter:
            warn(f'{name} n\'est rattachée à aucun chapitre : elle est rangée dans « Autres œuvres »')
            chapter = 'autres'
            chapters.setdefault(chapter, dict(id=chapter, year=None, label='Autres', title='Autres œuvres',
                                              intro=None, illustration='', works=[]))

        try:
            meta = process_image(src, wid)
        except Exception as err:
            warn(f'{name} : la photo {image} ne peut pas être lue ({err})')
            continue

        used.add(wid)
        by_file[path.stem] = wid
        order = to_int(d.get('ordre'))
        works.append(dict(
            id=wid, title=typo(title), medium=medium or None, size=clean(d.get('dimensions')) or None,
            year=year or None, chapter=chapter, cat=cat, w=meta['w'], h=meta['h'], color=meta['color'],
            m=(meta['mw'], meta['mh']), image=image, sort=(order is None, order or 0, stamp, wid)))
    return works, by_file


def chapter_key(ch):
    return (0, -int(ch['year'])) if ch['year'] else (1, slugify(ch['label']))


def year_span(works):
    years = sorted(int(y) for w in works for y in re.findall(r'\d{4}', w['year'] or ''))
    return (str(years[0]), str(years[-1])) if years else ('', '')


def total_text(n):
    if n >= 200:
        return f'Plus de {n // 100 * 100} œuvres'
    return 'Plus de cent œuvres' if n > 100 else f'{n} œuvres'


# ---------------------------------------------------------------- rendu HTML

HERO_SLOTS = [('a', '22', '-0.18'), ('b', '-16', '-0.08'), ('c', '30', '-0.3'), ('d', '-26', '-0.22')]


def alt_of(w):
    parts = [w['title'], w['medium'] and (w['medium'].lower() if w['title'] else w['medium']), w['year']]
    return ', '.join(p for p in parts if p) or 'Œuvre de Valérie Bourimoff'


def thumb(wid):
    return f'assets/img/oeuvres/m/{wid}.webp'


def render_hero(works):
    out = []
    for i, ((slot, depth, speed), w) in enumerate(zip(HERO_SLOTS, works)):
        priority = ' fetchpriority="high"' if i == 0 else ''
        lines = [
            f'<a class="hero__art hero__art--{slot}" href="oeuvres.html#oeuvre-{w["id"]}" data-work="{w["id"]}" '
            f'data-depth="{depth}" data-speed="{speed}" data-cursor="Voir">',
            f'  <span class="frame"><img src="{thumb(w["id"])}" width="{w["m"][0]}" height="{w["m"][1]}" '
            f'alt="{e(alt_of(w))}"{priority}></span>',
        ]
        if i == 0:
            lines.append('  <span class="sr-only">Voir l\'œuvre</span>')
        if slot in 'ab' and w['title']:
            year = f' — {e(w["year"])}' if w['year'] else ''
            lines.append(f'  <span class="hero__cap" aria-hidden="true"><em>{e(w["title"])}</em>{year}</span>')
        lines.append('</a>')
        out.append('\n'.join(lines))
    return '\n'.join(out).replace('\n', '\n        ')


def render_chapters(chapters, works):
    items = []
    for ch in chapters:
        pic = thumb(ch['illustration'] if ch['illustration'] in works else ch['works'][0])
        label = e(ch['label']) if ch['year'] else f'<em>{e(ch["label"])}</em>'
        items.append(
            f'<li><a href="oeuvres.html#chapitre-{ch["id"]}" data-dark data-preview="{pic}">'
            f'<img class="chapters__thumb" src="{pic}" alt="" loading="lazy">'
            f'<span class="chapters__year">{label}</span><span class="chapters__title">{e(ch["title"])}</span>'
            f'<span class="chapters__count">{plural(len(ch["works"]), "œuvre")}</span>'
            f'<span class="chapters__arrow" aria-hidden="true">→</span></a></li>')
    return '\n        '.join(items)


def render_recent(chapters):
    dated = [ch for ch in chapters if ch['year']][:4]
    return '\n          '.join(
        f'<li><a href="oeuvres.html#chapitre-{ch["id"]}">{e(ch["label"])} — {e(ch["title"])}</a></li>' for ch in dated)


def render_places(places, title):
    if not places:
        return ''
    once = ''.join(f'<span>{e(p)}</span><b>✦</b>' for p in places)
    twice = ''.join(f'<span aria-hidden="true">{e(p)}</span><b aria-hidden="true">✦</b>' for p in places)
    return ('<section aria-label="Lieux d\'exposition">\n'
            f'      <div class="wrap" style="margin-bottom:22px"><span class="eyebrow">{title}</span></div>\n'
            '      <div class="marquee">\n'
            '        <div class="marquee__track">\n'
            f'          {once}\n'
            f'          {twice}\n'
            '        </div>\n'
            '      </div>\n'
            '    </section>')


def render_text(text):
    paras = [e(typo(p)) for p in paragraphs(text)]
    return '\n            '.join(
        f'<p class="lead">{p}</p>' if i == 0 else f'<p>{p}</p>' for i, p in enumerate(paras))


def render_trainings(items):
    out = []
    for t in items:
        nom, detail = e(typo(clean(t.get('nom')))), e(typo(clean(t.get('detail'))))
        if nom:
            out.append(f'<li data-reveal>{nom}{f" <small>{detail}</small>" if detail else ""}</li>')
    return '\n          '.join(out)


def ordinals(s):
    return re.sub(r'\b(\d+)(e|er|re|ème)(?=[\s ]|$)', r'\1<sup>\2</sup>', s)


def render_exhibitions(items):
    groups = {}
    for x in items:
        title = clean(x.get('titre'))
        if title:
            groups.setdefault(clean(x.get('annee')), []).append(x)

    def key(label):
        years = [int(y) for y in re.findall(r'\d{4}', label)]
        return (0, -max(years), -min(years)) if years else (1, 0, 0)

    out = []
    for label in sorted(groups, key=key):
        m = re.fullmatch(r'(\d{4})\s*[—–-]\s*(\d{4})', label)
        heading = f'{m.group(1)} <em>— {m.group(2)}</em>' if m else e(label)
        rows = ''.join(
            f'\n            <li><strong>{ordinals(e(typo(clean(x.get("titre")))))}</strong>'
            f'<span>{e(typo(clean(x.get("lieu"))))}</span></li>' for x in groups[label])
        out.append(f'<div class="expo-year" data-reveal><h3>{heading}</h3><ul>{rows}\n          </ul></div>')
    return '\n          '.join(out)


def fill(page, values):
    def sub(m):
        name, default = m.groups()
        if name in values:
            value = values[name]
            return value(default) if callable(value) else value
        if '.' in name:  # texte ou photo absent de content/ : la page garde son contenu actuel
            return default
        raise KeyError(f'{page} : zone <!--@{name}--> inconnue de scripts/build.py')
    return MARKER.sub(sub, (ROOT / page).read_text(encoding='utf-8'))


# ---------------------------------------------------------------- construction

def main():
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(ROOT / 'assets', OUT / 'assets', ignore=shutil.ignore_patterns('.DS_Store'))
    (OUT / 'assets/img/oeuvres/m').mkdir(parents=True, exist_ok=True)

    chapters = load_chapters()
    works, by_file = load_works(chapters)
    by_id = {w['id']: w for w in works}
    ref = lambda r: by_id.get(by_file.get(stem_of(r)))

    for w in sorted(works, key=lambda w: w['sort']):
        chapters[w['chapter']]['works'].append(w['id'])
    chapters = sorted((ch for ch in chapters.values() if ch['works']), key=chapter_key)
    works = [by_id[wid] for ch in chapters for wid in ch['works']]

    home = read_json(CONTENT / 'accueil.json', {})
    selection = list(dict.fromkeys(w['id'] for w in map(ref, home.get('selection') or []) if w))
    hero = list(dict.fromkeys(w['id'] for w in map(ref, home.get('ouverture') or []) if w))
    for wid in selection + [w['id'] for w in works]:  # toujours 4 œuvres dans l'ouverture
        if len(hero) < 4 and wid not in hero:
            hero.append(wid)

    bio = read_json(CONTENT / 'biographie.json', {})
    exhibitions = [x for x in bio.get('expositions') or [] if clean(x.get('titre'))]
    email = clean(read_json(CONTENT / 'reglages.json', {}).get('email'))

    data = dict(
        chapters=[{k: ch[k] for k in ('id', 'year', 'label', 'title', 'intro', 'works')} for ch in chapters],
        works=[{k: w[k] for k in ('id', 'title', 'medium', 'size', 'year', 'chapter', 'cat', 'w', 'h', 'color')}
               for w in works],
        selection=selection,
        settings=dict(contact=base64.b64encode(email.encode()).decode()))
    (OUT / 'assets/js/data.js').write_text(
        '/* Généré par scripts/build.py à partir de content/ : ne pas modifier à la main. */\n'
        f'window.VB_DATA = {json.dumps(data, ensure_ascii=False, separators=(",", ":"))};\n', encoding='utf-8')

    texts = {f'{page}.{key}': inline(value)
             for page, group in (read_json(CONTENT / 'textes.json', {}) or {}).items() if isinstance(group, dict)
             for key, value in group.items()}
    images = site_images()

    first, last = year_span(works)
    values = {
        **texts,
        **{f'image.{name}': image_tag(name, meta) for name, _, meta in images},
        'total': str(len(works)),
        'total-texte': total_text(len(works)),
        'annee-debut': first,
        'annee-fin': last,
        'ouverture': render_hero([by_id[wid] for wid in hero]),
        'chapitres': render_chapters(chapters, by_id),
        'chapitres-recents': render_recent(chapters),
        'lieux': render_places([clean(p) for p in home.get('lieux') or [] if clean(p)],
                               texts.get('accueil.lieux_titre', 'Expositions &amp; salons')),
        'demarche-fr': render_text(bio.get('demarche')),
        'demarche-en': render_text(bio.get('demarche_en')),
        'citation': e(typo(clean(bio.get('citation')))),
        'formations': render_trainings(bio.get('formations') or []),
        'expositions': render_exhibitions(exhibitions),
        'nb-expositions': str(len(exhibitions)),
    }
    for page in PAGES:
        (OUT / page).write_text(fill(page, values), encoding='utf-8')

    # Administration : ses fichiers, les vignettes des photos déjà publiées et la version en ligne.
    shutil.copytree(ROOT / 'admin', OUT / 'admin', ignore=shutil.ignore_patterns('.DS_Store'))
    version = lambda image: hashlib.sha1(image.encode()).hexdigest()[:8]
    thumbs = {w['image']: f'{thumb(w["id"])}?v={version(w["image"])}' for w in works}
    thumbs.update({image: f'assets/img/site/{name}.webp?v={version(image)}' for name, image, _ in images})
    (OUT / 'admin/vignettes.json').write_text(json.dumps(thumbs, ensure_ascii=False), encoding='utf-8')
    (OUT / 'version.txt').write_text(os.environ.get('CF_PAGES_COMMIT_SHA', ''), encoding='utf-8')

    print(f'{len(works)} œuvres, {len(chapters)} chapitres → {OUT.relative_to(ROOT)}/')


if __name__ == '__main__':
    main()
