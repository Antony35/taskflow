<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';

const info = ref(null);
const error = ref('');

async function load() {
  error.value = '';
  try {
    info.value = await api.info();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>

<template>
  <section>
    <h2>À propos</h2>
    <p>TaskFlow est l'application fil rouge du module « Clusterisation de conteneurs ».</p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <dl v-else-if="info" class="info">
      <dt>API</dt><dd>{{ info.name }} {{ info.version }}</dd>
      <dt>Environnement</dt><dd>{{ info.env }}</dd>
      <dt>Instance</dt><dd><code>{{ info.hostname }}</code></dd>
      <dt>Démarrée depuis</dt><dd>{{ info.uptimeSeconds }} s</dd>
    </dl>

    <button type="button" class="secondary" @click="load">Actualiser</button>
  </section>
</template>
