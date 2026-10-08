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
