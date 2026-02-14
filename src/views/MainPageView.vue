<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="main-page">
    <h1>Unmatched Hero Toolkit</h1>
    <p>
      Review your hero pool, monitor key roster trends, and run single-roster or head-to-head analysis.
    </p>

    <section class="links">
      <RouterLink class="card" to="/hero-pool">
        <h2>Hero Pool Dashboard</h2>
        <span>Track win rate, pick rate, games played, and matchup crosstables.</span>
      </RouterLink>

      <RouterLink class="card" to="/roster-analysis">
        <h2>Hero Roster Analysis</h2>
        <span>Build a custom roster and inspect its performance profile.</span>
      </RouterLink>

      <RouterLink class="card" to="/roster-vs-roster">
        <h2>Roster 1 vs Roster 2</h2>
        <span>Create two custom rosters and compare win/pick trends.</span>
      </RouterLink>

      <RouterLink class="card" to="/draft-assistant">
        <h2>Draft Assistant</h2>
        <span>Run a guided banquest draft with live pick recommendations.</span>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.main-page {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
}

.links {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.card {
  border: 1px solid #d7d7d7;
  border-radius: 8px;
  padding: 1rem;
  background: #fff;
  color: #1f2937;
}

.card h2 {
  margin-bottom: 0.4rem;
}

@media (max-width: 768px) {
  .links {
    grid-template-columns: 1fr;
  }

  .card {
    padding: 0.85rem;
  }
}
</style>
