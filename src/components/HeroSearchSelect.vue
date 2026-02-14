<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface HeroOption {
  id: number
  name: string
}

const props = withDefaults(
  defineProps<{
    options: HeroOption[]
    buttonLabel?: string
    emptyText?: string
  }>(),
  {
    buttonLabel: 'Add',
    emptyText: 'No matching heroes',
  },
)

const emit = defineEmits<{
  (event: 'select', heroId: number): void
}>()

const query = ref('')
const selectedId = ref('')

const filteredOptions = computed(() => {
  const search = query.value.trim().toLowerCase()
  if (!search) {
    return props.options
  }

  return props.options.filter((option) => option.name.toLowerCase().includes(search))
})

watch(
  filteredOptions,
  (options) => {
    if (options.length === 0) {
      selectedId.value = ''
      return
    }

    const stillExists = options.some((option) => String(option.id) === selectedId.value)
    if (!stillExists) {
      const firstOption = options[0]
      selectedId.value = firstOption ? String(firstOption.id) : ''
    }
  },
  { immediate: true },
)

const addSelectedHero = () => {
  if (!selectedId.value) {
    return
  }

  emit('select', Number(selectedId.value))
  query.value = ''
  selectedId.value = ''
}
</script>

<template>
  <div class="selector">
    <input v-model="query" type="text" placeholder="Search hero..." />

    <select v-if="filteredOptions.length > 0" v-model="selectedId">
      <option v-for="option in filteredOptions" :key="option.id" :value="String(option.id)">
        {{ option.name }}
      </option>
    </select>

    <p v-else class="empty">{{ emptyText }}</p>

    <button type="button" :disabled="!selectedId" @click="addSelectedHero">{{ buttonLabel }}</button>
  </div>
</template>

<style scoped>
.selector {
  display: grid;
  gap: 0.5rem;
  max-width: 420px;
}

input,
select,
button {
  width: 100%;
}

.empty {
  margin: 0;
  color: #6b7280;
  font-size: 0.95rem;
}
</style>
