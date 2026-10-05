<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

const tasks = ref([]);
const newTitle = ref('');
const loading = ref(true);
const error = ref('');

const remaining = computed(() => tasks.value.filter((t) => !t.done).length);

async function run(action) {
  error.value = '';
  try {
    await action();
  } catch (err) {
    error.value = err.message;
  }
}

async function load() {
  loading.value = true;
  await run(async () => {
    tasks.value = await api.listTasks();
  });
  loading.value = false;
}

async function add() {
  const title = newTitle.value.trim();
  if (!title) return;
  await run(async () => {
    const task = await api.createTask(title);
    tasks.value.unshift(task);
    newTitle.value = '';
  });
}

async function toggle(task) {
  await run(async () => {
    const updated = await api.updateTask(task.id, { done: !task.done });
    Object.assign(task, updated);
  });
}

async function remove(task) {
  await run(async () => {
    await api.deleteTask(task.id);
    tasks.value = tasks.value.filter((t) => t.id !== task.id);
  });
}

onMounted(load);
</script>

<template>
  <section>
    <form class="new-task" @submit.prevent="add">
      <input v-model="newTitle" type="text" maxlength="200" placeholder="Nouvelle tâche" aria-label="Titre de la nouvelle tâche" />
      <button type="submit" :disabled="!newTitle.trim()">Ajouter</button>
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <p v-if="loading" class="muted">Chargement…</p>
    <template v-else>
      <p class="muted">{{ tasks.length }} tâche(s), dont {{ remaining }} à faire</p>
      <ul class="task-list">
        <li v-for="task in tasks" :key="task.id" :class="{ done: task.done }">
          <label>
            <input type="checkbox" :checked="task.done" @change="toggle(task)" />
            <span class="title">{{ task.title }}</span>
          </label>
          <button type="button" class="link" :aria-label="`Supprimer ${task.title}`" @click="remove(task)">Supprimer</button>
        </li>
      </ul>
      <button type="button" class="secondary" @click="load">Actualiser</button>
    </template>
  </section>
</template>
