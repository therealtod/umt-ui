import { createRouter, createWebHistory } from 'vue-router'
import MainPageView from '@/views/MainPageView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'main',
      component: MainPageView,
    },
    {
      path: '/hero-pool',
      name: 'hero-pool',
      component: () => import('@/views/HeroPoolDashboardView.vue'),
    },
    {
      path: '/roster-analysis',
      name: 'roster-analysis',
      component: () => import('@/views/HeroRosterAnalysisView.vue'),
    },
    {
      path: '/roster-vs-roster',
      name: 'roster-vs-roster',
      component: () => import('@/views/RosterVsRosterAnalysisView.vue'),
    },
    {
      path: '/draft-assistant',
      name: 'draft-assistant',
      component: () => import('@/views/DraftAssistantView.vue'),
    },
  ],
})

export default router
