# Valérie Bourimoff — site de peintre

Site statique (HTML / CSS / JavaScript, sans dépendance ni étape de build).

## Lancer le site en local

```bash
python3 -m http.server 8765
```

Puis ouvrir http://127.0.0.1:8765/

Le site fonctionne aussi en ouvrant `index.html` directement, mais un petit serveur reproduit mieux les conditions réelles.

## Pages

| Fichier           | Contenu                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `index.html`      | Accueil : hero, manifeste, sélection, chapitres, atelier, expositions     |
| `oeuvres.html`    | Catalogue complet par chapitre, filtres (peintures / aquarelles / dessins) |
| `biographie.html` | Démarche (FR / EN), formations, expositions                               |
| `contact.html`    | Formulaire, pré-rempli quand on vient d'une œuvre (`?oeuvre=<id>`)        |

Liens directs : `oeuvres.html#chapitre-2015` ouvre un chapitre, `oeuvres.html#oeuvre-samba` ouvre une œuvre dans la visionneuse.

## Formulaire de contact

À renseigner en haut de `assets/js/main.js` :

```js
var CONFIG = {
  contactEmail: 'adresse@exemple.fr',   // ouvre la messagerie du visiteur, message pré-rempli
  contactEndpoint: ''                   // ou un service d'envoi direct (ex. https://formspree.io/f/xxxx)
};
```

Tant que les deux sont vides, le formulaire affiche « pas encore relié à une adresse e-mail ».

## Ajouter une œuvre

1. Exporter l'image en WebP, en deux tailles :
   - `assets/img/oeuvres/<id>.webp` : 2000 px max (visionneuse)
   - `assets/img/oeuvres/m/<id>.webp` : 900 px max (grilles)
2. Ajouter une entrée dans `works` de `assets/js/data.js` :
   ```js
   { "id": "mon-oeuvre", "title": "Mon œuvre", "medium": "Acrylique", "size": "50 × 50 cm",
     "year": "2024", "chapter": "2024", "cat": "peinture", "w": 2000, "h": 1600,
     "color": "#8892a0", "featured": false }
   ```
   `cat` vaut `peinture`, `aquarelle` ou `dessin`, et `w` / `h` sont les dimensions en pixels de l'image.
3. Ajouter l'`id` dans la liste `works` du chapitre voulu (ou créer un nouveau chapitre dans `chapters`).
4. Pour la mettre en avant sur l'accueil, ajouter son `id` dans `selection`.
