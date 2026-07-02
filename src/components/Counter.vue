<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <div class="counter">
    <button type="button" @click="count++">Count is {{ count }}</button>
  </div>
</template>

<style scoped>
.counter {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  display: inline-block;
}
.counter button {
  font: inherit;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
</style>
