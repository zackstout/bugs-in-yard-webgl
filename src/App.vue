<script setup lang="ts">
import { ref } from 'vue'
import BugScene from './components/BugScene.vue'
import TaxonomyTree from './components/TaxonomyTree.vue'

const view = ref<'scene' | 'tree'>('scene')
</script>

<template>
  <div class="app">
    <nav class="view-nav">
      <button
        class="nav-btn"
        :class="{ active: view === 'scene' }"
        @click="view = 'scene'"
      >3D View</button>
      <button
        class="nav-btn"
        :class="{ active: view === 'tree' }"
        @click="view = 'tree'"
      >Tree View</button>
    </nav>

    <BugScene v-if="view === 'scene'" />
    <TaxonomyTree v-else />
  </div>
</template>

<style>
.app {
  position: relative;
}

.view-nav {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 100;
  display: flex;
  gap: 0.5rem;
}

.nav-btn {
  background: rgba(13, 12, 10, 0.85);
  border: 1px solid #3a3028;
  color: #7a6a4a;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  font-family: 'Georgia', serif;
  transition: color 0.15s, border-color 0.15s;
}

.nav-btn:hover {
  color: #c4aa78;
  border-color: #6a5a3a;
}

.nav-btn.active {
  color: #e0c990;
  border-color: #c4aa78;
}
</style>
