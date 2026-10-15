## Séance 6 — configuration, sondes et ressources

### Livrable du point de contrôle

```cmd
kubectl get pods -n taskflow
NAME                                READY   STATUS    RESTARTS   AGE
api-deployment-6c67fbfcdb-9xp9p     1/1     Running   0          25s
api-deployment-6c67fbfcdb-fqz27     1/1     Running   0          28s
db-deployment-8644ff7cd5-525v9      1/1     Running   0          12m
front-deployment-69b9ccd8b7-2xqk8   1/1     Running   0          12m
front-deployment-69b9ccd8b7-v6wtp   1/1     Running   0          12m
```

```cmd
git grep -n -i password -- k8s/app
k8s/app/api.yaml:28:            - name: DB_PASSWORD
k8s/app/api.yaml:32:                  key: password
k8s/app/db.yaml:25:            - name: POSTGRES_PASSWORD
k8s/app/db.yaml:29:                  key: password
```

```cmd
kubectl describe pod -n taskflow api-deployment-6c67fbfcdb-9xp9p
    Limits:
      cpu:     500m
      memory:  128Mi
    Requests:
      cpu:      100m
      memory:   64Mi
    Liveness:   http-get http://:3000/healthz delay=0s timeout=2s period=10s #success=1 #failure=3
    Readiness:  http-get http://:3000/readyz delay=0s timeout=2s period=5s #success=1 #failure=2
    Startup:    http-get http://:3000/healthz delay=0s timeout=1s period=2s #success=1 #failure=15
QoS Class:                   Burstable
```

- Manifestes : [k8s/app/](../k8s/app/)
- Dépôt : https://github.com/Antony35/taskflow

### Résumé
Création du tableau de variable.
ConfigMaps api-config et db-config, mot de passe dans le Secret db-credentials créé par commande (pas dans git).
Sondes startup, liveness et readiness sur l'api, le front et la db, testées avec une panne de la base.
Requêtes et limites sur les 3 conteneurs : db en Guaranteed, api et front en Burstable.
Mise à jour 2.0.0 sans aucune erreur grâce à readiness, preStop et maxUnavailable: 0, section Kubernetes ajoutée au README.

### Questions de l'énoncé

#### Étape 1 — Inventaire

|COMPOSANT | CONST | NON SENSIBLE | SENSIBLE | PARTAGÉ |
|---|---|---| ---| --- |
|api| DB_PASSWORD | | X | X |
|api| DB_USER | X |  | X |
|api| DB_NAME | X | | X |
|api| DB_PORT | X | | |
|api| DB_HOST | X | | |
|db| POSTGRES_PASSWORD | | X | X |
|db| POSTGRES_USER | X | | X |
|db| POSTGRES_DB | X | | X |

**Que se passe-t-il si elles sont dupliquées à deux endroits et que l'une est modifiée ?**
La connexion entre l'api et la base sera perdu.

**D'où devraient-elles provenir ?**
Les variables non sensibles dans un ConfigMaps
Le mot de passe dans un Secret 

#### Étape 2 — ConfigMaps et Secret

**Une référence clé par clé et une injection de toutes les clés. Quel effet cela a-t-il sur la variable DB_PORT de l'API et sur la raison pour
laquelle elle est explicite ?**
DB_PORT est déclarée clé par clé pour que son absence fasse échouer le Pod au lieu de laisser revenir la valeur injectée par le Service db.

Choix pour le mot de passe : variable d'environnement avec secretKeyRef.
C'est le plus simple, la même forme que le reste de la config. Le risque : la valeur se voit avec kubectl exec ... env et dans /proc du conteneur. Le fichier (*_FILE) est plus sûr, mais pas demandé ici.
```cmd
kubectl create secret generic db-credentials -n taskflow --from-literal=password=<mot de passe>
```

**Que montre kubectl get pods si le Secret n'existe pas encore au moment de l'apply ?**
Les nouveaux Pods api et db restent en CreateContainerConfigError, 0/1.

**Quel événement le confirme ?**
Warning Failed pod/db-deployment-... Error: secret "db-credentials" not found
Donc il faut créer le Secret avant le kubectl apply (le namespace d'abord, puis le Secret, puis le reste).

**git grep -n -i password -- k8s/app : que reste-t-il ?**
Seulement les noms : DB_PASSWORD, POSTGRES_PASSWORD et la clé password. Plus aucune valeur.

**kubectl describe pod : les valeurs sensibles apparaissent-elles ?**
Non, describe affiche DB_PASSWORD: \<set to the key 'password' in secret 'db-credentials'\>.

**L'API la prend-elle en compte immédiatement ?**
Non, après l'apply /api/info renvoie toujours "env":"development".

**Quelle opération faut-il lancer, et pourquoi ?**
kubectl rollout restart deployment/api-deployment -n taskflow. Les variables d'env sont lues une seule fois au démarrage du conteneur, il faut de nouveaux Pods. Après le restart : "env":"kubernetes".

#### Étape 3 — Sondes

**Quelle route convient à la sonde de vivacité, laquelle à la sonde de disponibilité ?**
/healthz pour la vivacité, elle ne regarde pas la base. /readyz pour la disponibilité, elle vérifie que la base répond.

**Que se passerait-il, pour tous les Pods de l'API, si la sonde de vivacité interrogeait la route qui consulte la base et que la base devenait indisponible ?**
Tous les Pods de l'API seraient tués et redémarrés en boucle (CrashLoopBackOff) alors que l'API n'a rien, c'est la base qui est en panne. Le redémarrage ne répare rien.

**Utiliser une sonde de démarrage, ou un délai initial ?**
Une sonde de démarrage. Un délai initial attend toujours le même temps, même si l'API est prête plus tôt. La startup s'arrête dès que /healthz répond, et bloque les deux autres sondes pendant ce temps.

**Quel délai maximal accorder au démarrage, et comment le calculer à partir de la période et du seuil d'échecs ?**
Délai max = periodSeconds x failureThreshold = 2 x 15 = 30 s. L'API attend la base 5 essais x 2 s = 10 s, donc 30 s laisse de la marge.

**Front, quelle route et quel port conviennent ?**
/ sur le port 80, nginx sert index.html.

**La disponibilité du front doit-elle dépendre de celle de l'API ?**
Non, sinon une panne de l'API ou de la base retire aussi le front et l'utilisateur n'a plus de page du tout. Le front reste prêt et c'est seulement /api/ qui renvoie une erreur.

**Base, quel mécanisme de test convient : requête HTTP, connexion TCP, commande ?**
Une commande : pg_isready. Postgres ne parle pas HTTP, et une connexion TCP dit seulement que le port est ouvert, pas que la base accepte les connexions.

**Quelles variables d'environnement lui fournir, et un shell est-il nécessaire pour les développer ?**
POSTGRES_USER et POSTGRES_DB (déjà dans le conteneur via db-config). Oui il faut un shell, une sonde exec ne développe pas $VAR, c'est sh qui le fait :
```cmd
sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Valeurs choisies :

| Sonde | période | délai de réponse | seuil | détection |
|---|---|---|---|---|
| api startup /healthz | 2 s | 1 s | 15 | 30 s max pour démarrer |
| api liveness /healthz | 10 s | 2 s | 3 | 30 s, pas de redémarrage sur un simple ralentissement |
| api readiness /readyz | 5 s | 2 s | 2 | 10 s, on retire vite le Pod du trafic |
| front liveness / | 10 s | 2 s | 3 | 30 s |
| front readiness / | 5 s | 2 s | 2 | 10 s |
| db startup pg_isready | 2 s | 2 s | 30 | 60 s, la première init de postgres est plus longue |
| db liveness pg_isready | 10 s | 3 s | 3 | 30 s |
| db readiness pg_isready | 5 s | 3 s | 2 | 10 s |

La liveness est lente et tolérante (un redémarrage coûte cher), la readiness est rapide (retirer du trafic ne casse rien).

Test de panne : db à 0 replica
```cmd
kubectl scale deployment/db-deployment -n taskflow --replicas=0
kubectl get pods -n taskflow
api-deployment-68dd9f7fcf-8nbpq    0/1     Running   0          2m13s
api-deployment-68dd9f7fcf-k8nmq    0/1     Running   0          2m10s
front-deployment-947754bb4-h8bf9   1/1     Running   0          95s
front-deployment-947754bb4-l9dwx   1/1     Running   0          92s
```
Le front répond 200 sur /, et 502 sur /api/tasks.

**L'API redevient-elle disponible sans intervention ?**
Oui, après le scale à 1, les Pods api repassent 1/1 tout seuls. Mais la base est neuve et vide, /api/tasks renvoie 500 tant que l'API n'a pas été redémarrée pour recréer la table.

**Que prouvent les compteurs RESTARTS sur le choix de la sonde de vivacité ?**
RESTARTS reste à 0 pendant toute la panne : la liveness sur /healthz ne tue pas l'API quand la base tombe, seule la readiness la retire du trafic. C'est le bon choix.

#### Étape 4 — Requêtes et limites de ressources

Mesure avec kubectl top pods après 3 min de charge (3 500 tours de requêtes + /api/stress) :
```cmd
NAME                                CPU(cores)   MEMORY(bytes)
api-deployment-d76b78dcf-4hhkq      301m         38Mi
db-deployment-8644ff7cd5-525v9      39m          43Mi
front-deployment-69b9ccd8b7-2xqk8   17m          19Mi
```
Avec k3d le nœud voit tout le PC (22 CPU, 16 Go), j'ai quand même dimensionné pour la VM du cours (2 vCPU, 4 Go).

| Composant | requests cpu / mémoire | limits cpu / mémoire | QoS |
|---|---|---|---|
| db | 250m / 256Mi | 250m / 256Mi | Guaranteed |
| api (x2) | 100m / 64Mi | 500m / 128Mi | Burstable |
| front (x2) | 50m / 32Mi | 200m / 64Mi | Burstable |

Somme des requêtes avec k3s : 750m CPU et 588Mi, ça tient dans 2 vCPU / 4 Go. Pas d'OOMKilled, RESTARTS à 0.

**Quelle classe de QoS viser pour la base ? Pour l'API ? Justifier.**
Base en Guaranteed (requests = limits) : c'est le dernier Pod tué si le nœud manque de mémoire, et c'est elle qui a les données.
API en Burstable : elle a une réserve garantie mais peut monter plus haut pendant un pic, et elle a 2 replicas donc en perdre un n'est pas grave.

**Faut-il une limite de CPU sur chaque conteneur ?**
Pas forcément. La limite mémoire est importante (sinon un conteneur peut prendre toute la RAM), la limite CPU protège les voisins mais peut ralentir. Je l'ai mise partout mais large, et égale à la requête seulement pour la base (pour le Guaranteed).

**Quel est l'effet d'une limite de CPU trop basse ?**
Le conteneur n'est pas tué, il est freiné (throttling) : les réponses deviennent lentes, et les sondes peuvent dépasser leur timeout, donc Pod retiré du trafic voire redémarré.

**L'autoscaling de la séance 9 sera calculé sur l'utilisation CPU de l'API : quelle valeur du manifeste est alors indispensable ?**
resources.requests.cpu de l'API : le HPA calcule le pourcentage d'utilisation par rapport à la requête. Sans requête, pas de calcul possible.

#### Étape 5 — Vérification finale et envoi

Boucle d'appels sur /api/info pendant la mise à jour 1.0.0 -> 2.0.0 :
```cmd
while true; do curl -s -m 3 -o /dev/null -w "%{http_code}\n" localhost:9000/api/info; sleep 0.1; done
```
Avec seulement les sondes : 468 x 200, 2 x 502, 2 x timeout.
Avec en plus preStop sleep 5 s et maxUnavailable: 0 / maxSurge: 1 : 637 x 200, aucune erreur.

**Les requêtes échouent-elles encore pendant le déploiement ?**
Non, plus aucune.

**Expliquer la différence avec la séance 5.**
En séance 5 un Pod recevait du trafic dès que son conteneur démarrait, avant que l'API soit prête. Maintenant la readiness /readyz le garde hors du Service tant qu'il n'est pas prêt, maxUnavailable: 0 garde toujours 2 Pods prêts, et le preStop de 5 s laisse le temps au Service de retirer l'ancien Pod avant qu'il s'arrête.

Retour en 1.0.0 dans le manifeste, kubectl diff -f k8s/app/ est vide.

