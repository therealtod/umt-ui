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
  border: 1px solid #38bdf8;
  border-radius: 12px;
  padding: 1rem;
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(56, 189, 248, 0.35), rgba(14, 116, 144, 0.18) 45%, rgba(15, 23, 42, 0.92) 100%),
    #0f172a;
  color: #e5f3ff;
  box-shadow: 0 10px 26px rgba(2, 132, 199, 0.28);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.card:hover {
  transform: translateY(-2px);
  border-color: #7dd3fc;
  box-shadow: 0 14px 32px rgba(56, 189, 248, 0.38);
}

.card h2 {
  margin-bottom: 0.4rem;
  color: #f8fdff;
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
