# Valérie Bourimoff — site de peintre

Site statique (HTML / CSS / JavaScript), publié sur Cloudflare Pages : https://valerie-bourimoff.pages.dev/

Tout le contenu (œuvres, photos, textes des pages, biographie, adresse de contact) se modifie sans toucher au code, depuis l'administration : https://valerie-bourimoff.pages.dev/admin/

## Modifier le site (administration)

1. Ouvrir https://valerie-bourimoff.pages.dev/admin/ et entrer le mot de passe (la session dure 30 jours).
2. Sections :
   - **Œuvres** : ajouter des œuvres (bouton ou photos déposées sur la page), les modifier, les supprimer, les réordonner par glisser-déposer.
   - **Chapitres** : les périodes et séries de la page Œuvres, leur texte et leur image sur l'accueil.
   - **Page d'accueil** : les 4 œuvres de l'ouverture, les « Œuvres choisies », les lieux qui défilent, la photo de l'atelier et tous les textes.
   - **Biographie** : portrait, démarche (FR / EN), citation, formations, expositions.
   - **Contact** : l'adresse e-mail qui reçoit les messages et les textes de la page.
   - **Autres textes** : la page Œuvres et les textes communs (devise, mention des droits…).
3. Les modifications restent dans le navigateur jusqu'au bouton **Publier**, qui les enregistre toutes dans un seul commit sur `main`. Cloudflare reconstruit alors le site, en ligne en 1 à 2 minutes ; l'administration indique quand c'est fait.

Les photos peuvent être envoyées telles quelles (JPG, PNG, WebP ou HEIC) : le navigateur les réduit à 2400 px avant l'envoi, puis elles sont converties à la publication.

### Mise en place

Dans Cloudflare, *Workers & Pages → valerie-bourimoff → Settings → Variables and Secrets*, ajouter en **Secret** pour la production :

| Nom              | Valeur                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | Le mot de passe de l'administration (le changer déconnecte tout le monde)                    |
| `GITHUB_TOKEN`   | Un jeton GitHub *fine-grained* limité au dépôt `valerie-bourimoff`, permission *Contents : Read and write* |

puis redéployer (*Deployments → … → Retry deployment*). Le jeton se crée sur GitHub dans *Settings → Developer settings → Personal access tokens → Fine-grained tokens* ; quand il expire, l'administration affiche « GitHub refuse la clé d'accès » : en créer un nouveau et remplacer `GITHUB_TOKEN`.

L'API de l'administration est dans `functions/api/[[route]].js` (Cloudflare Pages Functions). Elle n'accepte que les fichiers `content/**.json` et `medias/oeuvres|site/*`.

## Organisation

| Chemin                          | Contenu                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `content/oeuvres/*.json`        | Une fiche par œuvre. Le nom du fichier sert d'adresse (`#oeuvre-<nom>`)    |
| `content/chapitres/*.json`      | Un fichier par chapitre (`#chapitre-<nom>`)                                |
| `content/*.json`                | Accueil, biographie, adresse de contact (`reglages.json`)                  |
| `content/textes.json`           | Textes des pages, par page (`*mot*` s'affiche en italique)                 |
| `content/images.json`           | Photos fixes du site : atelier, portrait                                   |
| `medias/`                       | Photos d'origine des œuvres (`oeuvres/`) et du site (`site/`)            |
| `index.html`, `oeuvres.html`, … | Pages. Les zones `<!--@nom-->…<!--/@nom-->` sont remplies à la publication |
| `assets/`                       | Styles, scripts, images fixes du site                                      |
| `admin/`                        | Administration (publiée sur `/admin/`)                                     |
| `functions/`                    | API de l'administration (Cloudflare Pages Functions)                       |
| `scripts/build.py`              | Construit le site publié dans `_site/`                                     |
| `.python-version`               | Version de Python utilisée par Cloudflare pour la construction            |

`scripts/build.py` convertit les photos en WebP (2000 px pour la visionneuse, 900 px pour les grilles), génère `assets/js/data.js` et remplit les pages : une zone `<!--@accueil.manifeste-->` reçoit le texte `accueil` → `manifeste` de `content/textes.json`, une zone `<!--@image.atelier-->` la photo `atelier` de `content/images.json`. Il écrit aussi `version.txt` (le commit publié), que l'administration consulte pour savoir quand le site est à jour. Un contenu incomplet (œuvre sans photo, chapitre introuvable…) ne bloque pas la publication : il est signalé par une ligne « Attention : … » dans le journal de construction Cloudflare.

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

Avec l'adresse renseignée dans **Contact**, le formulaire ouvre la messagerie du visiteur avec un message pré-rempli. Pour un envoi direct depuis la page, renseigner un service d'envoi (ex. https://formspree.io/f/xxxx) dans `CONFIG.contactEndpoint`, en haut de `assets/js/main.js`.

## Hébergement (Cloudflare Pages)

Le projet Cloudflare `valerie-bourimoff` est relié au dépôt GitHub et reconstruit le site à chaque modification de `main` :

| Réglage                  | Valeur                                                               |
| ------------------------ | -------------------------------------------------------------------- |
| Branche de production    | `main`                                                               |
| Préréglage de framework  | Aucun                                                                |
| Commande de construction | `pip install -r scripts/requirements.txt && python scripts/build.py` |
| Répertoire de sortie     | `_site`                                                              |

## Accès et protection

- Le dépôt GitHub est privé : le code et les photos d'origine ne sont visibles que par son propriétaire.
- L'administration demande un mot de passe ; ses requêtes sont signées par un cookie de session et l'API refuse tout fichier hors des contenus et des photos. Choisir un mot de passe long : c'est la seule protection de la page.
- Sur le site, le clic droit, le glisser-déposer et l'appui long sont désactivés sur les photos. C'est dissuasif seulement : une capture d'écran reste possible.
