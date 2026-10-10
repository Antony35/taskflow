## Étape 5 — Limites de l'approche par Pods

États des pods avant test :
```cmd
kubectl get pod -n taskflow -o wide
NAME   READY   STATUS    RESTARTS   AGE   IP           NODE                    NOMINATED NODE   READINESS GATES
api    1/1     Running   0          47m   10.42.0.13   k3d-taskflow-server-0   <none>           <none>
db     1/1     Running   0          70m   10.42.0.10   k3d-taskflow-server-0   <none>           <none>
```

**Supprimer le Pod de base, puis le recréer à partir du même manifeste. L'adresse IP est-elle la même ?**
Non l'adresse IP a changé. Avec un orchestrateur l'IP aurait changé aussi, mais l'orchestrateur définir un nom stable qui suit le pods ou qu'il soit. L'env de l'API serait DB_HOST: db.
```cmd
db     1/1     Running   0          3s    10.42.0.14   k3d-taskflow-server-0   <none>           <none>
```

**Les tâches créées existent-elles toujours ?**
Non, elles ont été supprimé, le container est supprimé, nous n'avons pas de volume. Elles disparaissent avec le container.
Un orchestrateur n'aurait rien changé.

**Comment se comporte l'API, et que faudrait-il modifier pour qu'elle retrouve la base ?**
L'api est propre 
```cmd
 curl -k http://127.0.0.1:3000/healthz/
{"status":"ok","version":"1.0.0","hostname":"api"}
```
Elle ne peut évidemment pas contacter la DB vu que son ip à changer, il faut mettre à jour la variable DB_HOST avec la nouvelle IP de db.
Comme pour la rep 1 vu que l'orchestrateur résoudrait l'IP avec coreDNS, on aurait le nom de la db est non son IP donc pas de problème 

**Supprimer le Pod API. Est-il recréé ?**
Non, je dois le faire manuellement un orchestrateur aurais recréé le pod automatiquement s'il y a un ReplicaSet. 

**Rapprocher ce constat de la boucle de réconciliation présentée en séance 1 : qu'est-ce qui manque ?**
Tout, nous n'avons rien qui n'observe rien pour comparer et nous devons agir manuellement

**Exécuter kill 1 dans le conteneur de l'API (kubectl exec). Observer la colonne RESTARTS et le nom du Pod. 
Comparer avec la politique restart de Docker utilisée en séance 1.**
La column RESTARTS est passé à 1 lle nom n'a pas changé l'IP non plus c'est toujours le meme pod grace a kubelet qui a restartPolicy : Always par default 
C'est comme avec restart : always de docker ça relance un container arête n'est pas supprimé.  

## Séance 5 — Ce que Deployment et Service apportent

| Constat de la séance 4 | Avec Deployment et Service |
|---|---|
| Un Pod supprimé n'est pas recréé. | Le ReplicaSet du Deployment compare l'état voulu (`replicas`) à l'état réel et recrée le Pod manquant, sous un nouveau nom. |
| L'IP d'un Pod change. | Elle change toujours, mais le Service donne un nom DNS et une IP stables (`db`, `api`) et met ses endpoints à jour tout seul. Plus aucune IP dans les manifestes. |
| Un conteneur qui s'arrête est redémarré sur place. | Inchangé : c'est toujours kubelet (`restartPolicy: Always`). Le Deployment ajoute la mise à jour progressive et le retour arrière (`rollout undo`). |

### Limites qui subsistent

- **Mot de passe en clair** dans `db.yaml` et `api.yaml` (valeur de test). À externaliser dans un Secret (séance 6).
- **Aucune sonde** : un Pod reçoit du trafic dès que son conteneur démarre. Pendant la mise à jour 1.0.0 → 2.0.0, une requête a échoué en `502 Bad Gateway`.
- **Base sans persistance** : après suppression du Pod `db`, les tâches ont disparu et l'API répondait `relation "tasks" does not exist` jusqu'à son redémarrage (séance 7).

### Piège d'environnement (étape 3)

Les Pods de l'API plantaient avec `La variable DB_PORT doit être un entier positif (valeur reçue : "tcp://10.43.24.10:5432")`.
Cause : kubelet injecte dans chaque nouveau Pod des variables pour tous les Services déjà présents dans le namespace (`<NOM>_SERVICE_HOST`, `<NOM>_PORT=tcp://...`, ancien format des liens Docker). Le Service `db` crée donc `DB_PORT`, le nom que lit l'API.
Correction retenue : déclarer `DB_PORT: "5432"` dans `api.yaml` (une variable déclarée l'emporte sur une variable injectée). Autre possibilité : `enableServiceLinks: false`.
