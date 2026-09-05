import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom, because the units under test read window.localStorage,
    // window.sessionStorage and Date/Intl formatting.
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
});
