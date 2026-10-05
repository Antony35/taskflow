## Séance 1 — Conteneurisation

### Livrables

- [api/Dockerfile](../api/Dockerfile) et [api/.dockerignore](../api/.dockerignore)
- [front/Dockerfile](../front/Dockerfile), [front/.dockerignore](../front/.dockerignore) et [front/nginx.conf](../front/nginx.conf)
- [compose.yaml](../compose.yaml) et [.env.example](../.env.example)
- Images publiques : `antony35/taskflow-api:1.0.0`, `antony35/taskflow-front:1.1.0`


### Résumé

- Dépôt cloné dans WSL2, poussé sur `git@github.com:Antony35/taskflow.git`.
- `../api/Dockerfile` : Node 24, épinglé par digest, dépendances de production seulement, lancement direct par `node`.
- `../front/Dockerfile` multi-étapes : Node compile, Nginx sert `dist/` et relaie `/api/` vers l'API (`front/nginx.conf`).
- `../compose.yaml` : db (postgres 18 + volume), api, front. Seul le front est publié (`8080:80`). Mots de passe dans `.env` non versionné, documentés par `.env.example`.
- Images publiques sur Docker Hub (`antony35/taskflow-api`, `antony35/taskflow-front`), stack lançable sans construction locale, données conservées après redémarrage.

### Questions de l'énoncé

#### Étape 3 — Conteneurisation de l'API

**Quelle étiquette garantit qu'une reconstruction dans six mois produira la même image ?**
Le digest (`@sha256:...`), car il identifie un contenu unique. Une étiquette comme `24.21.0-alpine` peut être republiée.

**L'image finale a-t-elle besoin des dépendances de développement ?**
Non, seulement de celles d'exécution (`npm ci --omit=dev`). L'image est plus légère et contient moins de failles possibles.

#### Étape 4 — Conteneurisation du front

**Quel composant doit transmettre les requêtes `/api/...` à l'API, et comment connaît-il son adresse ?**
Nginx, le serveur qui sert le front (`proxy_pass` dans `nginx.conf`). Il joint l'API par le nom du service compose, `api`, résolu par le DNS de Docker.

**Une variable lue à la compilation est figée dans l'image : quelle conséquence pour une image déployée dans plusieurs environnements ?**
Il faudrait reconstruire une image par environnement. TaskFlow évite le problème : le front ne lit aucune variable et appelle l'API par un chemin relatif.

#### Étape 5 — Écriture de compose.yaml et lancement de la stack

**Quel mécanisme de Compose garantit que l'API attend que PostgreSQL accepte les connexions ?**
Un `healthcheck` sur la base (`pg_isready`) associé à `depends_on: condition: service_healthy` sur l'API.

#### Étape 6 — Publication des images sur Docker Hub

**Avec la seule étiquette `latest`, comment déterminer quelle version est réellement déployée ?**
On ne peut pas : `latest` change à chaque publication. D'où des versions explicites (`1.0.0`).
