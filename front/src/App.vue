<script setup>
import { RouterLink, RouterView } from 'vue-router';
import { lastServedBy } from './api.js';
</script>

<template>
  <header class="header">
    <h1 class="brand">TaskFlow</h1>
    <nav class="nav">
      <RouterLink to="/">Tâches</RouterLink>
      <RouterLink to="/a-propos">À propos</RouterLink>
    </nav>
  </header>

  <main class="main">
    <RouterView />
  </main>

  <footer class="footer">
    <span v-if="lastServedBy">Dernière réponse de l'API servie par <code>{{ lastServedBy }}</code></span>
    <span v-else>Aucune réponse de l'API pour l'instant</span>
  </footer>
</template>
