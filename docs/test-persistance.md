# Test de persistance de la base TaskFlow

Ce test vérifie que les tâches survivent à la perte du Pod PostgreSQL.
Déroulé réellement le 16/10/2026 sur le cluster k3d taskflow (k3s v1.35.5, postgres 18.6).

## Prérequis

- TaskFlow déployé comme décrit dans le README (section Déploiement sur Kubernetes), avec le StatefulSet db.
- Front accessible sur http://localhost:9000.
- Tous les Pods 1/1 Ready :
```cmd
kubectl get statefulset,pods,pvc,pv -n taskflow
```

Point de comparaison (séance 7, étape 1, quand la base était un Deployment sans volume) : après suppression du Pod db, les tâches étaient perdues et /api/tasks renvoyait 500 (relation "tasks" does not exist) jusqu'au redémarrage de l'API.

Pour suivre ce qui se passe pendant un scénario, lancer dans un second terminal :
```cmd
while true; do echo "$(date +%T) $(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:9000/api/tasks)"; sleep 0.5; done
```

---

## Scénario 1 — Suppression du Pod de la base

**État initial** : db-0 Running 1/1, au moins trois tâches au titre identifiable.
```cmd
for t in "PERSIST-1 acheter du pain" "PERSIST-2 réviser le StatefulSet" "PERSIST-3 rendre le jalon 2"; do
  curl -s -X POST localhost:9000/api/tasks -H 'Content-Type: application/json' -d "{\"title\":\"$t\"}"
done
curl -s localhost:9000/api/tasks
```

**Commande** :
```cmd
kubectl delete pod db-0 -n taskflow
```

**Résultat attendu** : le StatefulSet recrée db-0 avec le même nom et le même PVC data-db-0. Les tâches sont toujours là, sans redémarrer l'API.

**Résultat observé** :
```cmd
12:15:39 api[ready restarts]: true 0 true 0 | db-0: Running true  | /api/tasks: 200
         pod "db-0" deleted
12:15:40 api[ready restarts]: true 0 true 0 | db-0: Running true  | /api/tasks: 500
12:15:43 api[ready restarts]: true 0 true 0 | db-0: Pending false | /api/tasks: 000
12:15:49 api[ready restarts]: true 0 true 0 | db-0: Running true  | /api/tasks: 000
12:15:50 api[ready restarts]: true 0 true 0 | db-0: Running true  | /api/tasks: 200
```
- Base indisponible environ 10 s. Pendant ce temps la page du front répond 200, /api/tasks renvoie 500 puis des timeouts.
- Les Pods de l'API restent 1/1 avec RESTARTS à 0 : la coupure est plus courte que la readiness (2 échecs x 5 s) et la liveness /healthz ne dépend pas de la base.
- Après le retour de db-0, les 4 tâches (PERSIST-1 à 3 et la première tâche) sont toujours là.
- L'API n'a pas besoin d'être redémarrée : la table tasks est dans le volume. Différence avec l'étape 1 : plus de perte de données, plus de 500 durable.

---

## Scénario 2 — Redémarrage du StatefulSet

**État initial** : identique à la fin du scénario 1.

**Commande** :
```cmd
kubectl rollout restart statefulset/db -n taskflow
kubectl rollout status statefulset/db -n taskflow
kubectl logs db-0 -n taskflow | head
```

**Résultat attendu** : db-0 est arrêté proprement puis recréé sur le même volume, les tâches sont conservées.

**Résultat observé** :
- Restart lancé à 12:16:17, erreurs sur /api/tasks de 12:16:21 à 12:16:27 (un timeout puis des 500), 200 ensuite. Base indisponible environ 7 s (arrêt 10:16:17 UTC, prête 10:16:24 UTC), application en erreur environ 10 s le temps que l'API refasse ses connexions.
- Tâches conservées.
- Journal PostgreSQL au redémarrage :
```cmd
PostgreSQL Database directory appears to contain a database; Skipping initialization
LOG:  database system was shut down at 2026-10-16 10:16:17 UTC
LOG:  database system is ready to accept connections
```
« was shut down » : l'arrêt précédent est signalé comme propre (après un arrêt brutal, postgres écrit « was interrupted » et rejoue son journal WAL). « Skipping initialization » : la base existante est réutilisée, pas réinitialisée.

---

## Scénario 3 — Suppression du StatefulSet seul, puis nouvelle application

**État initial** : identique à la fin du scénario 2.

**Commande** :
```cmd
kubectl delete statefulset db -n taskflow
kubectl get statefulset,pods,pvc,pv -n taskflow
kubectl apply -f k8s/app/db.yaml
```

**Résultat attendu** : le PVC n'est pas supprimé avec le StatefulSet. Le nouveau StatefulSet retrouve le PVC data-db-0 par son nom et les données reviennent.

**Résultat observé** :
- Après la suppression : plus de StatefulSet ni de db-0, mais le PVC data-db-0 et le PV pvc-7e659c0c-… restent Bound.
- Après le apply : db-0 recréé, même PVC, même PV (même âge, 10 min), journal « Skipping initialization ».
- Les 4 tâches sont toujours là.

---

## Scénario 4 — Ce qui efface les données (décrit, non exécuté)

Deux manipulations qui suppriment définitivement les tâches :
1. Supprimer le PVC (après le StatefulSet, sinon il reste bloqué par le Pod) :
```cmd
kubectl delete statefulset db -n taskflow
kubectl delete pvc data-db-0 -n taskflow
```
2. Supprimer le namespace, qui supprime tous les PVC qu'il contient :
```cmd
kubectl delete namespace taskflow
```
(Supprimer le cluster avec k3d cluster delete taskflow efface aussi tout, voir les limites.)

Paramètre de la classe de stockage qui l'explique : reclaimPolicy: Delete de local-path. Quand le PVC disparaît, le PV et le dossier sur le disque du nœud sont supprimés avec lui. Avec Retain, le PV et les fichiers resteraient.

Pour effacer volontairement la base (repartir de zéro), c'est la manipulation 1, puis kubectl apply -f k8s/app/ et un redémarrage de l'API.

---

## Limites

- **Où sont les données ?** Dans le dossier /var/lib/rancher/k3s/storage/pvc-…_taskflow_data-db-0 du nœud. Avec k3d le nœud est le conteneur k3d-taskflow-server-0, et ce dossier est dans un volume Docker anonyme, donc sur le disque de WSL2 (/var/lib/docker/volumes/…/_data/storage).
- **Si la VM est perdue ?** Les données sont perdues. Le volume local-path est lié à un seul nœud, il n'y a pas de copie ailleurs. Avec k3d, un k3d cluster delete supprime aussi le volume.
- **Sauvegarde ?** Aucune. Il faudrait un pg_dump régulier copié en dehors du cluster.
- **Une seule instance** : pas de réplication PostgreSQL, la base est indisponible pendant chaque redémarrage (environ 10 s mesurées).
