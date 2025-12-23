<script setup>
import { ArrowRightIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <div class="space-y-8">
    <div class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
      <h1 class="text-4xl font-bold mb-4">Welcome to Sample Manager</h1>
      <p class="text-indigo-100 text-lg max-w-2xl">
        Manage your laboratory samples efficiently with our modern dashboard. Track status, IDs, and workflows in one place.
      </p>
      <div class="mt-8">
        <router-link to="/samples" class="inline-flex items-center px-6 py-3 bg-white text-indigo-600 rounded-lg font-semibold hover:bg-indigo-50 transition-colors shadow-sm">
          View Samples
          <ArrowRightIcon class="w-5 h-5 ml-2" />
        </router-link>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div class="text-gray-500 text-sm font-medium mb-1">Total Samples</div>
        <div class="text-3xl font-bold text-gray-900">1,284</div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div class="text-gray-500 text-sm font-medium mb-1">Pending Review</div>
        <div class="text-3xl font-bold text-orange-600">12</div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div class="text-gray-500 text-sm font-medium mb-1">Completed Today</div>
        <div class="text-3xl font-bold text-green-600">45</div>
      </div>
    </div>
  </div>
</template>
