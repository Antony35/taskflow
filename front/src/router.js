import { createRouter, createWebHistory } from 'vue-router';
import TasksView from './views/TasksView.vue';
import AboutView from './views/AboutView.vue';

// Mode « history » : les URL n'ont pas de « # » (ex. /a-propos).
// Le serveur web doit donc renvoyer index.html pour toute route inconnue de lui,
// sinon un rechargement de la page /a-propos aboutit à une erreur 404.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'tasks', component: TasksView },
    { path: '/a-propos', name: 'about', component: AboutView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
