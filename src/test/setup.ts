// Test setup file
import { vi } from 'vitest'

// Mock global fetch if needed
global.fetch = global.fetch || vi.fn()

// Suppress console errors in tests (optional)
// console.error = vi.fn()

