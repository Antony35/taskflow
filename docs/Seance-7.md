## Séance 7 — Persistance de la base de données (jalon 2)

### Livrable du point de contrôle

```cmd
kubectl get statefulset,pods,pvc,pv -n taskflow
NAME                  READY   AGE
statefulset.apps/db   1/1     9h

NAME                                    READY   STATUS    RESTARTS      AGE
pod/api-deployment-5f665fcd55-4tz48     1/1     Running   1 (70s ago)   9h
pod/api-deployment-5f665fcd55-bgr5g     1/1     Running   1 (70s ago)   9h
pod/db-0                                1/1     Running   1 (70s ago)   9h
pod/front-deployment-69b9ccd8b7-2xqk8   1/1     Running   3 (29s ago)   10h
pod/front-deployment-69b9ccd8b7-v6wtp   1/1     Running   3 (35s ago)   10h

NAME                              STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS
persistentvolumeclaim/data-db-0   Bound    pvc-7e659c0c-ea90-4ab0-b544-459815f7cf0b   1Gi        RWO            local-path

NAME                                                        CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                STORAGECLASS
persistentvolume/pvc-7e659c0c-ea90-4ab0-b544-459815f7cf0b   1Gi        RWO            Delete           Bound    taskflow/data-db-0   local-path
```

Avant la suppression de db-0 :
```cmd
kubectl get pods -n taskflow
NAME                                READY   STATUS    RESTARTS      AGE
api-deployment-5f665fcd55-4tz48     1/1     Running   1 (71s ago)   9h
api-deployment-5f665fcd55-bgr5g     1/1     Running   1 (71s ago)   9h
db-0                                1/1     Running   1 (71s ago)   9h
front-deployment-69b9ccd8b7-2xqk8   1/1     Running   3 (30s ago)   10h
front-deployment-69b9ccd8b7-v6wtp   1/1     Running   3 (36s ago)   10h

curl -s localhost:9000/api/tasks
[{"id":4,"title":"PERSIST-3 rendre le jalon 2",...},{"id":3,"title":"PERSIST-2 réviser le StatefulSet",...},{"id":2,"title":"PERSIST-1 acheter du pain",...},{"id":1,"title":"Première tâche persistante",...}]
```

```cmd
kubectl delete pod db-0 -n taskflow
```

Après :
```cmd
kubectl get pods -n taskflow
NAME                                READY   STATUS    RESTARTS      AGE
api-deployment-5f665fcd55-4tz48     1/1     Running   1 (87s ago)   9h
api-deployment-5f665fcd55-bgr5g     1/1     Running   1 (87s ago)   9h
db-0                                1/1     Running   0             15s
front-deployment-69b9ccd8b7-2xqk8   1/1     Running   3 (46s ago)   10h
front-deployment-69b9ccd8b7-v6wtp   1/1     Running   3 (52s ago)   10h

curl -s localhost:9000/api/tasks
[{"id":4,"title":"PERSIST-3 rendre le jalon 2",...},{"id":3,"title":"PERSIST-2 réviser le StatefulSet",...},{"id":2,"title":"PERSIST-1 acheter du pain",...},{"id":1,"title":"Première tâche persistante",...}]
```
Les RESTARTS à 1 et 3 viennent de l'arrêt de Docker Desktop juste avant (tout le cluster a redémarré, et les tâches étaient déjà toujours là). Le front redémarre tant que le Service api ne répond pas (séance 5).

- Test de persistance : [test-persistance.md](test-persistance.md)
- Manifestes : [k8s/app/](../k8s/app/)
- Dépôt : https://github.com/Antony35/taskflow

### Résumé
Constat : avec le Deployment sans volume, supprimer le Pod db efface toutes les tâches.
Base passée en StatefulSet db avec un PVC data-db-0 monté sur /var/lib/postgresql (postgres 18) et un Service headless db-headless.
Le Service db et la config de l'API n'ont pas changé.
Test de persistance rejoué : les tâches survivent à la suppression de db-0, au rollout restart et à la suppression du StatefulSet.
README et notes complétés : ce qui survit à quoi, comment effacer la base, attention à la suppression du namespace.

### Questions de l'énoncé

#### Étape 1 — Constat de départ

3 tâches créées (Acheter du pain, Réviser Kubernetes, Rendre le TP), puis suppression du Pod de la base :
```cmd
kubectl delete pod -n taskflow db-deployment-8644ff7cd5-525v9
```

**Que se passe-t-il pour les tâches ?**
Elles sont perdues. Le Deployment recrée un Pod db neuf, avec une base vide.

**Pour l'API, et pour la route /api/tasks (cf. séance 5) ?**
Les Pods de l'API restent 1/1 avec RESTARTS à 0, mais /api/tasks renvoie 500 Erreur interne. Log : relation "tasks" does not exist. La table n'existe plus et l'API ne la crée qu'au démarrage, il faut la redémarrer. Même constat qu'en séance 5.

Classe de stockage par défaut :
```cmd
kubectl get storageclass
NAME                   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION
local-path (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false
```
- Politique de rétention : Delete
- Mode de liaison : WaitForFirstConsumer (le volume est créé seulement quand un Pod qui l'utilise est planifié)

**Quelle conséquence la politique de rétention a-t-elle sur la suppression du namespace taskflow ?**
Supprimer le namespace supprime les PVC qu'il contient, et avec Delete le PV et les fichiers sur le disque sont supprimés aussi. Toutes les tâches seraient perdues définitivement.

Le Secret db-credentials existe toujours (kubectl get secret db-credentials -n taskflow).

#### Étape 2 — Conception

**Quels objets faut-il créer, modifier, supprimer ?**
- Supprimer : le Deployment db-deployment.
- Créer : le StatefulSet db (avec un volumeClaimTemplates qui crée le PVC) et le Service headless db-headless.
- Garder sans changement : le Service db (ClusterIP), la ConfigMap db-config, le Secret db-credentials.

**Quel nom donner au StatefulSet pour que le Pod porte un nom prévisible ?**
db : le Pod s'appelle alors toujours db-0, et son PVC data-db-0.

**Les labels et le sélecteur du StatefulSet doivent-ils être identiques à ceux du Deployment actuel ?**
Oui, app.kubernetes.io/name: taskflow et app.kubernetes.io/component: db.

**Pourquoi est-ce important pour le Service db ?**
Le Service db choisit ses Pods par ces labels. Avec les mêmes labels il trouve db-0 tout seul, sans modifier le Service ni l'API.

**Où monter le volume ?**
Sur /var/lib/postgresql. Avec postgres 18 les données sont dans /var/lib/postgresql/18/docker, et l'image déclare son volume sur /var/lib/postgresql. Le cours montre /var/lib/postgresql/data, c'était le chemin avant la version 18.

**À quelle variable de l'image postgres ce chemin est-il lié ?**
PGDATA (ici PGDATA=/var/lib/postgresql/18/docker, vérifié avec kubectl exec).

**Que se passe-t-il, du point de vue de la persistance, si le chemin de montage est inexact ?**
Postgres écrit ses données à côté du volume, dans le système de fichiers du conteneur. Tout a l'air de marcher, mais les données disparaissent quand le Pod est recréé, et le volume reste vide.

**Et si PostgreSQL trouve des fichiers dans le point de montage au premier démarrage ?**
S'il trouve une base existante dans PGDATA, il ne refait pas l'initialisation (c'est ce qu'on veut pour la persistance). Si le dossier PGDATA n'est pas vide mais ne contient pas une base (lost+found par exemple), initdb refuse de démarrer. En montant le dossier parent, postgres crée son sous-dossier 18/docker vide, donc pas de problème.

**Quel mode d'accès et quelle taille demander ?**
ReadWriteOnce (un seul nœud monte le volume, une seule base) et 1Gi, largement assez pour des tâches.

**Faut-il préciser la classe de stockage ?**
Non, local-path est la classe par défaut du cluster. Sans storageClassName, le PVC l'utilise, et le manifeste reste valable sur un autre cluster.

**Qu'est-ce qui garantit désormais qu'il n'y a jamais deux Pods PostgreSQL ?**
Le StatefulSet donne une identité unique à chaque Pod : il ne crée jamais un nouveau db-0 tant que l'ancien n'est pas complètement terminé. Avec replicas: 1, il n'y a donc qu'un seul Pod. Le volume en ReadWriteOnce ajoute une protection.

**Que se passe-t-il pendant une mise à jour de la base, à un seul réplica ?**
Le StatefulSet supprime db-0, attend qu'il soit arrêté, puis recrée db-0 avec la nouvelle version sur le même PVC. La base est indisponible pendant ce temps (quelques secondes), les données sont gardées.

**Le Service headless est obligatoire : pourquoi ?**
Le StatefulSet le demande (serviceName) : c'est lui qui donne à chaque Pod un nom DNS stable, db-0.db-headless.taskflow.svc.cluster.local, qui pointe directement sur l'IP du Pod.

**Pourquoi garder aussi le Service db (ClusterIP) pour l'API plutôt que de faire du Service db un Service headless ?**
L'API utilise déjà db, avec une IP virtuelle stable qui suit le Pod prêt. Avec un headless le DNS donne l'IP du Pod directement, et l'API ne voit pas le changement d'IP si elle garde l'ancienne. Rien à changer côté API avec le ClusterIP.

**Qu'est-ce qui empêche de transformer le Service db existant en headless ?**
spec.clusterIP ne peut pas être modifié sur un Service existant (champ immuable). Il faudrait supprimer et recréer le Service.

**La configuration de l'API doit-elle changer ? Justifier.**
Non. L'API se connecte à DB_HOST=db, le Service db garde le même nom et les mêmes labels, il pointera sur db-0.

**Le mot de passe de la base est désormais enregistré dans le volume, à l'initialisation. Que se passerait-il si le Secret était modifié ensuite ?**
Postgres lit POSTGRES_PASSWORD seulement à la première initialisation. La base garde l'ancien mot de passe, mais l'API, après redémarrage, utilise le nouveau : connexion refusée (password authentication failed).

**Que faudrait-il faire ?**
Changer aussi le mot de passe dans postgres, puis redémarrer l'API :
```cmd
kubectl exec -n taskflow db-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ALTER USER taskflow PASSWORD '\''<nouveau>'\''"'
kubectl rollout restart deployment/api-deployment -n taskflow
```

#### Étape 3 — Migration

```cmd
kubectl delete deployment db-deployment -n taskflow
kubectl apply -f k8s/app/db.yaml
```

**Supprimer le Deployment db avant d'appliquer le StatefulSet. Quelle anomalie apparaîtrait si les deux coexistaient, étant donné les labels et les Services ?**
Il y aurait deux Pods postgres avec les mêmes labels, chacun avec sa propre base. Le Service db répartirait le trafic entre les deux : une tâche créée sur une base serait invisible quand la lecture passe par l'autre, et les tâches sembleraient apparaître et disparaître.

**Le PVC est-il Pending à un moment ? Pourquoi ?**
Oui, une dizaine de secondes (PVC créé 11 s avant le PV). La classe local-path est en WaitForFirstConsumer : le volume n'est créé qu'une fois db-0 planifié sur un nœud, pour être sur le même nœud que lui.
```cmd
kubectl get events -n taskflow --field-selector involvedObject.name=data-db-0
Normal   WaitForFirstConsumer    waiting for first consumer to be created before binding
Normal   Provisioning            External provisioner is provisioning volume for claim "taskflow/data-db-0"
Normal   ProvisioningSucceeded   Successfully provisioned volume pvc-7e659c0c-ea90-4ab0-b544-459815f7cf0b
```

**Vérifier dans la VM le répertoire du volume : contient-il les fichiers de PostgreSQL ?**
Oui. Avec k3d le nœud est le conteneur k3d-taskflow-server-0 :
```cmd
docker exec k3d-taskflow-server-0 ls /var/lib/rancher/k3s/storage/pvc-7e659c0c-ea90-4ab0-b544-459815f7cf0b_taskflow_data-db-0/18/docker
PG_VERSION  base  global  pg_wal  pg_xact  postgresql.conf  postmaster.pid ...
```

**La base est neuve et vide. Que faut-il faire pour que l'application fonctionne de nouveau ?**
Redémarrer l'API pour qu'elle recrée la table tasks :
```cmd
kubectl rollout restart deployment/api-deployment -n taskflow
```
Ensuite une tâche créée dans le navigateur s'affiche bien.

#### Étape 4 — Test de persistance

Détail des 4 scénarios (état initial, commande, attendu, observé) : [test-persistance.md](test-persistance.md)

**Scénario 1, l'API a-t-elle besoin d'être redémarrée ?**
Non. Base coupée environ 10 s, Pods api restés 1/1 avec RESTARTS à 0, et les tâches sont toujours là. À l'étape 1 tout était perdu et il fallait redémarrer l'API.

**Scénario 2, les tâches sont-elles conservées ?**
Oui.

**Combien de temps la base est-elle indisponible ?**
Environ 7 s pour postgres, 10 s d'erreurs côté application.

**L'arrêt précédent est-il signalé comme propre ?**
Oui : database system was shut down at 10:16:17 UTC (et pas « interrupted »), puis Skipping initialization.

**Scénario 3, que deviennent le PVC et les données ?**
Le PVC data-db-0 et le PV restent Bound après la suppression du StatefulSet. Au nouvel apply, db-0 reprend le même PVC et les tâches reviennent.

**Scénario 4, quel paramètre de la classe de stockage l'explique ?**
reclaimPolicy: Delete : supprimer le PVC (à la main ou avec le namespace) supprime le PV et les fichiers.

**Où se trouvent physiquement les données ?**
Dans /var/lib/rancher/k3s/storage/ du conteneur k3d-taskflow-server-0, qui est un volume Docker sur le disque de WSL2.

**Que se passerait-il si la VM était perdue ?**
Tout serait perdu, le volume n'existe que sur ce nœud.

**Y a-t-il une sauvegarde ?**
Non, aucune.
