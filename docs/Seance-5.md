## Séance 5 — TaskFlow de bout en bout sur Kubernetes

Update de la version de l'image api 1.0.0 -> 2.0.0 et push sur docker hub
Création k8s/app avec le namespace taskflow et suppression du dossier pods et son suivi dans git.

**Pourquoi supprimer les Pods avant de créer les Services ? Que feraient les Services api et db de Pods qui portent déjà les mêmes labels ?**
Pour éviter l'utilisation des vieux pods, le service irait résoudre les vieux pod car il porte le même label, ils seraient ajoutés aux endpoints du Service, et le trafic serait réparti entre eux et les nouveaux Pods.

**kubectl apply -f sur un dossier suit l'ordre alphabétique. Comment nommer le fichier du namespace pour que tout fonctionne sur un cluster vierge ?**
On le renomme en ajoutant un chiffre au début pour le faire passer en premier (table ASCII).

**Combien de réplicas ? Quelle stratégie convient à un composant qui ne supporte pas deux instances simultanées, et pourquoi ?**
1, la stratégie Recreate car aucune cohabitation de deux versions différentes (évite les conflits de schéma de base de données).

**Le Service doit porter le nom que l'API utilisera pour joindre la base. Quel nom fallait-il utiliser avec Compose en séance 1 ? (Il doit être le même ici.)**
Le nom qu'il fallait utiliser avec compose est celui définit dans le service "db".

**Quel type de Service pour un composant qui ne doit pas être joignable depuis le poste ?**
ClusterIP, l'IP n'existe qu'à l'intérieur du cluster

**Que devient la valeur de l'hôte de la base ?**
Ce n'est plus l'IP, mais son nom "db" résolu grace a CoreDNS dans le service

**Quel nom et quel port pour le Service ?**
Le nom doit être api pour correspondre au nom dans le fichier de config nginx et le port 3000 celui de l'api.

**Les questions sur le piège, si tu le rencontres : la cause, deux façons de corriger, et le type YAML d'un nombre dans env.**
La variable DB_PORT doit être un entier positif (valeur reçue : "tcp://10.43.24.10:5432")
il faut déclarer DB_PORT dans le env du container api.
error when creating "k8s/app/api.yaml": Deployment in version "v1" cannot be handled as a Deployment: json: cannot unmarshal number into Go struct field EnvVar.spec.template.spec.containers.env.value of type string
Le port doit être déclaré comme une string.
C'est le kubelet de DB qui injecte les variables d'env avec EnableServiceLinks qui prend la syntaxe de docker.
Désactiver l'injection avec enableServiceLinks: false dans la spec du Pod 
J'ai choisi de déclarer le port dans le container pour eviter d'avoir une option en plus et savoir directement sur quel port et la db dans la conf de l'api

** Comment constater que les deux réplicas reçoivent du trafic ?**
Crée un pod temporaire avec curl pour rentrer dans le cluster
```cmd
k run boucle -n taskflow --rm -it --restart=Never --image=curlimages/curl:8.11.1 -- sh
```
Puis faire une boucle d'appel cur dans le shell pour voir les deux pods s'alterner.
```cmd
for i in $(seq 1 10); do curl http://api:3000/healthz -sI | grep X-Served-By ; done
```
X-Served-By: api-deployment-6d78d6d66c-5kbvl
X-Served-By: api-deployment-6d78d6d66c-5kbvl
X-Served-By: api-deployment-6d78d6d66c-5kbvl
X-Served-By: api-deployment-6d78d6d66c-5kbvl
X-Served-By: api-deployment-6d78d6d66c-w8ldl
X-Served-By: api-deployment-6d78d6d66c-w8ldl
X-Served-By: api-deployment-6d78d6d66c-5kbvl
X-Served-By: api-deployment-6d78d6d66c-w8ldl
X-Served-By: api-deployment-6d78d6d66c-w8ldl
X-Served-By: api-deployment-6d78d6d66c-5kbvl
