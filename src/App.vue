<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell container-xxl py-3 py-md-4">
    <header class="app-header p-3 p-md-4 mb-3">
      <div class="d-flex flex-column gap-3">
        <div>
          <h1 class="h3 mb-1 fw-semibold">Unmatched UI</h1>
          <p class="text-secondary mb-0">Draft, pool, and roster analysis</p>
        </div>
        <nav class="d-flex flex-wrap gap-2">
          <RouterLink to="/" class="btn btn-outline-light btn-sm" active-class="btn-primary text-white border-0">
            Main
          </RouterLink>
          <RouterLink
            to="/hero-pool"
            class="btn btn-outline-light btn-sm"
            active-class="btn-primary text-white border-0"
          >
            Hero Pool
          </RouterLink>
          <RouterLink
            to="/roster-analysis"
            class="btn btn-outline-light btn-sm"
            active-class="btn-primary text-white border-0"
          >
            Roster Analysis
          </RouterLink>
          <RouterLink
            to="/roster-vs-roster"
            class="btn btn-outline-light btn-sm"
            active-class="btn-primary text-white border-0"
          >
            Roster vs Roster
          </RouterLink>
          <RouterLink
            to="/draft-assistant"
            class="btn btn-outline-light btn-sm"
            active-class="btn-primary text-white border-0"
          >
            Draft Assistant
          </RouterLink>
        </nav>
      </div>
    </header>

    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-header {
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background:
    radial-gradient(1200px 220px at 10% -40%, rgba(56, 189, 248, 0.2), transparent 70%),
    radial-gradient(900px 180px at 100% 0%, rgba(99, 102, 241, 0.22), transparent 72%),
    rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
}
</style>
