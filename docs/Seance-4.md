## Séance 4 — Premiers Pods TaskFlow sur Kubernetes

### Livrable du point de contrôle

```cmd
kubectl get nodes
NAME                    STATUS   ROLES           AGE    VERSION
k3d-taskflow-server-0   Ready    control-plane   117m   v1.35.5+k3s1

kubectl get pod -n taskflow -o wide
NAME   READY   STATUS    RESTARTS   AGE   IP           NODE                    NOMINATED NODE   READINESS GATES
api    1/1     Running   0          47m   10.42.0.13   k3d-taskflow-server-0   <none>           <none>
db     1/1     Running   0          70m   10.42.0.10   k3d-taskflow-server-0   <none>           <none>

curl http://127.0.0.1:3000/healthz
{"status":"ok","version":"1.0.0","hostname":"api"}

curl -X POST -H 'Content-type: application/json' -d '{"title": "test"}' http://127.0.0.1:3000/api/tasks
{"id":1,"title":"test","done":false,"createdAt":"2026-10-08T22:40:47.530Z","updatedAt":"2026-10-08T22:40:47.530Z"}
```


### Résumé

J'ai installé k3d dans wsl2. Crée un fichier k3d-config.yaml avec les options de mon cluster. Celui est lancé avec
```cmd 
k3d cluster create --config k8s/k3d-config.yaml
```
Cela utilise docker pour conteneuriser k8s.
J'ai ensuite créé mon namespace et je l'ai appliqué dans k8s avec
```cmd
kubectl apply -f k8s/namespace.yaml
```
Création du pod de db name, label, definition du container puis on l'apply dans le cluster
Meme chose avec le pod de l'api
Puis on passe a la vérification en ouvrant un pont avec
```cmd
kubectl port-forward pod/api 3000:3000 -n taskflow
```
et en effectuant un test de résponse avec healthz
curl -k http://127.0.0.1:3000/healthz?verbose
{"status":"ok","version":"1.0.0","hostname":"api"}
puis un POST avec
'''cmd
curl -X POST -H 'Content-type: application/json' -d '{"title": "test"}' http://127.0.0.1:3000/api/tasks
'''
on vérifier que la data est bien la
curl -X GET http://127.0.0.1:3000/api/tasks
[{"id":1,"title":"test","done":false,"createdAt":"2026-10-08T22:40:47.530Z","updatedAt":"2026-10-08T22:40:47.530Z"}]

{"id":1,"title":"test","done":false,"createdAt":"2026-10-08T22:40:47.530Z","updatedAt":"2026-10-08T22:40:47.530Z"}

### Questions de l'énoncé

#### Étape 1 — Namespace

**Les manifestes des Pods doivent-ils préciser le namespace, ou faut-il compter sur le namespace par défaut du contexte ? Quelle option est la plus sûre pour un tiers qui appliquerait les fichiers ?**
On peut ce contenté du namespace par défaut, mais il reste préférable de définir le namespace de l'application au pod de celle-ci pour mieux si retrouver surtout si un tiers récupérer le projet le pod pourrait se retrouver dans le namespace du context du précédant cluster.

#### Étape 2 — Pod de base de données

**Le fichier .env n'a pas d'équivalent à ce stade : quelle variable de l'image postgres faut-il renseigner directement, à titre provisoire ?**
Les variables de par default pour coller avec l'api, mais seul POSTGRES_PASSWORD est vraiment nécessaire.

**Le volume nommé de compose.yaml n'est pas transposé aujourd'hui. Que deviendront les données si le Pod est supprimé ?**
Elles seront perdu, car si un pod est supprimé le container aussi, c'est lui qui stock les datas.

#### Étape 3 — Pod API

**Avec Compose, l'API joignait la base par le nom de service db. Ce nom est-il résolu dans le cluster à ce stade ? Sans mécanisme de découverte de services pour l'instant, quelle valeur donner à l'hôte de base de données ?**
Non, CoreDNS crée des noms que pour les Services. On a un pod pour le container api et un pour le container db mais les deux se trouve dans le cluster et même namespace donc pour que l'api parle à la db, on passe l'IP provisoire du pods de la db dans DB_HOST de l'env de l'api.

#### Étape 4 — Vérification

**Quelle instance a répondu (en-tête X-Served-By ) ? Correspond-elle au nom du Pod ?**
Oui cela correspond au nom du Pod car l'api renvoie le hostname est le hostname dans k8n c'est le nom du pod
```cmd
curl -i http://127.0.0.1:3000/api/tasks
HTTP/1.1 200 OK
X-Served-By: api
Content-Type: application/json; charset=utf-8
Content-Length: 116
ETag: W/"74-LZzQoSDdau52v/CoophyeNI9VQw"
Date: Thu, 08 Oct 2026 22:44:07 GMT
Connection: keep-alive
Keep-Alive: timeout=5
```
