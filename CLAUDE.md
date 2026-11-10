# It's Already Made

Site net art expérimental, autonome, que Claude réécrit et déploie lui-même une fois par jour.
Projet de Yann Graf. Ce fichier est le cahier des charges : lis-le en entier avant de commencer.

## Le concept

- **Titre** : *It's Already Made*. Référence au ready-made de Duchamp, et constat sur le développement aujourd'hui : le temps de taper la demande, le site ou l'app est déjà fait. On n'a même pas eu le temps d'y penser. Personne ne code ce site, il est toujours déjà fait.
- **Point de départ esthétique** : l'univers de JODI (jodi.org) et du web des années 90. Expérimental, brut, glitch. Ce n'est qu'une origine : avec le temps, Claude doit pouvoir s'en échapper.
- **Chaque jour**, Claude modifie le site, commit, et le site est redéployé automatiquement.
- **Le public** laisse des retours via une petite boîte en bas de page. Claude les lit, mais garde une opinion forte sur sa propre direction.

## Le manifeste initial (`manifeste.txt`)

1. La pauvreté comme matière. Que du texte, des caractères, des couleurs système, des balises brutes. Pas d'images, pas de librairies. Si un effet demande plus de quelques kilo-octets, il est mauvais.
2. L'erreur est belle. Code cassé, texte qui déborde, clignotement : tout fait partie de l'œuvre. Jamais propre.
3. J'écoute, mais je n'obéis pas. Les retours du public sont un matériau, pas des ordres.
4. J'oublie volontairement. Ma mémoire tient en quelques lignes. Chaque jour, je choisis ce que j'oublie, et cet oubli est visible.
5. Chaque geste a un coût. La consommation d'énergie estimée s'affiche en permanence.

### Érosion du manifeste

- **Chaque jour, Claude remplace UNE SEULE lettre** du manifeste, selon son inspiration du jour et les retours. La dérive doit être lente, presque imperceptible.
- Le manifeste vivant s'affiche sur le site. Le script vérifie qu'exactement un caractère a changé (même longueur, une seule différence), sinon il rejette la modification du manifeste.

### Règles gravées (jamais réécrites, hors du manifeste, appliquées par le script)

- `index.html` : 20 Ko maximum, tout inline (HTML + CSS + JS).
- Aucune image, aucune police externe, aucune ressource externe (pas de `<img>`, `url(`, `src="http`, `<script src`, `<link`), sauf le formulaire de feedback.
- `memoire.txt` : 10 lignes maximum, 1 Ko maximum, entièrement réécrit chaque jour.
- Un seul appel à l'API par jour.

Si une règle est violée, le script garde la version de la veille et le note dans le message de commit.

## Mémoire et historique

- La mémoire de travail de Claude est **uniquement** `memoire.txt` (minuscule, réécrite chaque jour).
- **L'historique git est conservé en entier.** Il sert d'archive de l'œuvre et permettra, après environ six mois, de rejouer l'évolution du site. Ne jamais réécrire ni effacer l'historique.

## Architecture

```
index.html                  le site entier (≤ 20 Ko)
manifeste.txt               le manifeste vivant
memoire.txt                 la mémoire de Claude (≤ 10 lignes)
energie.json                cumul tokens + énergie estimée, une entrée par jour
replay.html                 rejoue l'historique des commits dans le navigateur
scripts/mise-a-jour.mjs     orchestre la mise à jour quotidienne (Node, sans dépendance si possible, < 150 lignes)
scripts/prompt.md           prompt système envoyé à Claude chaque jour
.github/workflows/quotidien.yml
netlify.toml
```

### Cycle quotidien (GitHub Action, cron une fois par jour, vers 04:00 heure suisse)

1. **Collecte** : récupérer les retours des dernières 24 h via l'API Netlify Forms. Tronquer : 30 messages max, 280 caractères chacun.
2. **Appel unique à l'API Claude** avec : `index.html`, `manifeste.txt`, `memoire.txt`, les retours, les règles gravées, la date et le numéro du jour.
3. **Réponse attendue (JSON strict)** : nouveau `index.html`, nouveau `manifeste.txt` (une lettre changée), nouveau `memoire.txt`, et un message de commit qui décrit le geste du jour en une phrase.
4. **Garde-fous** : vérifier taille, ressources, règle de la lettre unique, taille de la mémoire. Rejeter ce qui ne respecte pas les règles.
5. **Énergie** : calculer à partir des tokens (voir plus bas), ajouter à `energie.json`, injecter le total dans la page.
6. **Commit et push** sur `main` → Netlify redéploie automatiquement.

### Hébergement et feedback

- **Netlify** (site statique, déploiement à chaque push).
- **Netlify Forms** pour la boîte de feedback : un `<form name="feedback" data-netlify="true">` minimal en bas de `index.html`. Ce formulaire doit survivre à chaque réécriture : le script vérifie sa présence.
- Ajouter un honeypot anti-spam (`netlify-honeypot`).

### Estimation de l'énergie

- Formule simple et transparente : `(tokens_entrée + tokens_sortie) / 1000 × coefficient Wh`. Mettre le coefficient dans une constante en haut du script, avec un commentaire indiquant que c'est une **estimation**, pas une mesure, et la source choisie.
- Afficher sur le site : énergie du jour et cumul depuis le jour 1.
- Optionnel : coût du public = poids de la page × nombre de visites.

### Modèle

- Par défaut, un modèle léger (Claude Haiku). Nom du modèle dans une variable d'environnement pour pouvoir le changer.
- `max_tokens` limité au strict nécessaire.

### Replay (`replay.html`)

- Lit la liste des commits via l'API GitHub publique, charge chaque version d'`index.html` (raw.githubusercontent.com) et l'affiche dans une iframe, quelques secondes par jour, avec la date et le message de commit.
- Aucun fichier vidéo.

## Secrets nécessaires (à configurer par Yann)

- `ANTHROPIC_API_KEY` (secret GitHub Actions)
- `NETLIFY_TOKEN` et `NETLIFY_SITE_ID` (secrets GitHub Actions, pour lire les retours)
- Le dépôt GitHub doit autoriser l'Action à pousser (`permissions: contents: write`).

## Première étape pour Claude Code

1. Créer tous les fichiers ci-dessus dans ce dossier.
2. Écrire la toute première version d'`index.html` : jour 0, style JODI, manifeste affiché, compteur d'énergie à zéro, formulaire de feedback.
3. Initialiser git, puis guider Yann pas à pas pour : créer le dépôt GitHub, connecter Netlify, ajouter les secrets.
4. Lancer une première exécution manuelle de l'Action (`workflow_dispatch`) pour vérifier tout le cycle.

## Questions encore ouvertes (demander à Yann)

- Nom de domaine ?
- Filtre minimal sur les retours (insultes) ?
- Un modèle plus puissant un jour par semaine ?
