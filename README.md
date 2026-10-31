# Valérie Bourimoff — site de peintre

Site statique (HTML / CSS / JavaScript), publié sur Cloudflare Pages : https://valerie-bourimoff.pages.dev/

Les contenus (œuvres, chapitres, accueil, biographie, adresse de contact) se modifient sans toucher au code, depuis [Pages CMS](https://app.pagescms.org).

## Modifier le site (Pages CMS)

1. Se connecter sur https://app.pagescms.org et ouvrir le dépôt `valerie-bourimoff` : avec GitHub pour le propriétaire du dépôt, avec son adresse e-mail pour une personne invitée (un code à 6 chiffres arrive par e-mail).
2. Menus disponibles :
   - **Œuvres** : une fiche par œuvre (photo, titre, technique, dimensions, année, catégorie, chapitre, position).
   - **Chapitres** : les périodes et séries de la page Œuvres. Pour une nouvelle année, créer le chapitre avant d'y ajouter des œuvres.
   - **Page d'accueil** : les 4 œuvres de l'ouverture, les « Œuvres choisies » et les lieux qui défilent.
   - **Biographie** : démarche (FR / EN), citation, formations et expositions.
   - **Contact** : l'adresse e-mail qui reçoit les messages du formulaire de contact.
3. Chaque enregistrement crée un commit sur `main`. Le site est republié automatiquement en 1 à 2 minutes (tableau de bord Cloudflare, *Workers & Pages → valerie-bourimoff*).

Les photos peuvent être envoyées telles quelles (JPG, PNG, WebP ou HEIC) : elles sont redimensionnées à la publication.

La configuration de l'interface est dans `.pages.yml`.

## Organisation

| Chemin                          | Contenu                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `content/oeuvres/*.json`        | Une fiche par œuvre. Le nom du fichier sert d'adresse (`#oeuvre-<nom>`)    |
| `content/chapitres/*.json`      | Un fichier par chapitre (`#chapitre-<nom>`)                                |
| `content/*.json`                | Accueil, biographie, adresse de contact (`reglages.json`)                  |
| `medias/oeuvres/`               | Photos d'origine des œuvres                                                |
| `index.html`, `oeuvres.html`, … | Pages. Les zones `<!--@nom-->…<!--/@nom-->` sont remplies à la publication |
| `assets/`                       | Styles, scripts, images fixes du site                                      |
| `scripts/build.py`              | Construit le site publié dans `_site/`                                     |
| `.python-version`               | Version de Python utilisée par Cloudflare pour la construction            |

`scripts/build.py` convertit les photos en WebP (2000 px pour la visionneuse, 900 px pour les grilles), génère `assets/js/data.js` et remplit les pages. Un contenu incomplet (œuvre sans photo, chapitre introuvable…) ne bloque pas la publication : il est signalé par une ligne « Attention : … » dans le journal de construction Cloudflare.

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

## Accès

Le dépôt GitHub est privé : le code et les photos d'origine ne sont visibles que par son propriétaire. Dans Pages CMS, seuls le propriétaire et les personnes invitées par e-mail (menu *Collaborators*) peuvent ouvrir et modifier les contenus ; une personne invitée n'a besoin ni de compte GitHub ni de mot de passe, et ne peut toucher ni à la configuration ni aux accès.
