<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell container-xxl py-3 py-md-4">
    <header class="app-header p-3 p-md-4 mb-3">
      <div class="d-flex flex-column gap-3">
        <div>
          <h1 class="h3 mb-1 fw-semibold">Unmatched UI</h1>
          <p class="subline mb-0">Draft, pool, and roster analysis</p>
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
  border-radius: 12px;
  border: 1px solid rgba(68, 72, 79, 0.35);
  background:
    radial-gradient(900px 220px at 0% 0%, rgba(0, 227, 253, 0.18), transparent 70%),
    radial-gradient(900px 180px at 100% 0%, rgba(47, 248, 1, 0.14), transparent 72%),
    rgba(21, 26, 33, 0.85);
  backdrop-filter: blur(12px);
}

.subline {
  color: #a8abb3;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  text-transform: uppercase;
}
</style>
