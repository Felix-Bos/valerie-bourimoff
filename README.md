# Valérie Bourimoff — site de peintre

Site statique (HTML / CSS / JavaScript), publié sur GitHub Pages : https://felix-bos.github.io/Peintre_portfolio/

Les contenus (œuvres, chapitres, accueil, biographie, adresse de contact) se modifient sans toucher au code, depuis [Pages CMS](https://app.pagescms.org).

## Modifier le site (Pages CMS)

1. Se connecter sur https://app.pagescms.org et ouvrir le dépôt `Peintre_portfolio`.
2. Menus disponibles :
   - **Œuvres** : une fiche par œuvre (photo, titre, technique, dimensions, année, catégorie, chapitre, position).
   - **Chapitres** : les périodes et séries de la page Œuvres. Pour une nouvelle année, créer le chapitre avant d'y ajouter des œuvres.
   - **Page d'accueil** : les 4 œuvres de l'ouverture, les « Œuvres choisies » et les lieux qui défilent.
   - **Biographie** : démarche (FR / EN), citation, formations et expositions.
   - **Réglages** : l'adresse e-mail qui reçoit les messages du formulaire de contact.
3. Chaque enregistrement crée un commit sur `main`. Le site est republié automatiquement en 1 à 2 minutes (onglet *Actions* du dépôt).

Les photos peuvent être envoyées telles quelles (JPG, PNG, WebP ou HEIC) : elles sont redimensionnées à la publication.

La configuration de l'interface est dans `.pages.yml`.

## Organisation

| Chemin                          | Contenu                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `content/oeuvres/*.json`        | Une fiche par œuvre. Le nom du fichier sert d'adresse (`#oeuvre-<nom>`)    |
| `content/chapitres/*.json`      | Un fichier par chapitre (`#chapitre-<nom>`)                                |
| `content/*.json`                | Accueil, biographie, réglages                                              |
| `medias/oeuvres/`               | Photos d'origine des œuvres                                                |
| `index.html`, `oeuvres.html`, … | Pages. Les zones `<!--@nom-->…<!--/@nom-->` sont remplies à la publication |
| `assets/`                       | Styles, scripts, images fixes du site                                      |
| `scripts/build.py`              | Construit le site publié dans `_site/`                                     |
| `.github/workflows/publier.yml` | Publication automatique sur GitHub Pages                                   |

`scripts/build.py` convertit les photos en WebP (2000 px pour la visionneuse, 900 px pour les grilles), génère `assets/js/data.js` et remplit les pages. Un contenu incomplet (œuvre sans photo, chapitre introuvable…) ne bloque pas la publication : il est signalé par un avertissement dans l'onglet *Actions*.

## Lancer le site en local

```bash
pip install -r scripts/requirements.txt   # une seule fois
python3 scripts/build.py
python3 -m http.server 8765 -d _site
```

Puis ouvrir http://127.0.0.1:8765/. Relancer `build.py` après chaque modification (les images déjà converties sont gardées dans `.cache/`).

## Pages

| Fichier           | Contenu                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `index.html`      | Accueil : hero, manifeste, sélection, chapitres, atelier, expositions     |
| `oeuvres.html`    | Catalogue complet par chapitre, filtres (peintures / aquarelles / dessins) |
| `biographie.html` | Démarche (FR / EN), formations, expositions                               |
| `contact.html`    | Formulaire, pré-rempli quand on vient d'une œuvre (`?oeuvre=<id>`)        |

Liens directs : `oeuvres.html#chapitre-2015` ouvre un chapitre, `oeuvres.html#oeuvre-samba` ouvre une œuvre dans la visionneuse.

## Formulaire de contact

Avec l'adresse renseignée dans **Réglages**, le formulaire ouvre la messagerie du visiteur avec un message pré-rempli. Pour un envoi direct depuis la page, renseigner un service d'envoi (ex. https://formspree.io/f/xxxx) dans `CONFIG.contactEndpoint`, en haut de `assets/js/main.js`.

## GitHub Pages

Dans *Settings → Pages* du dépôt, la source doit être **GitHub Actions**.
