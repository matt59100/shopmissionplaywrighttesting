import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // Rapport avec historique des 5 dernières exécutions (publié sur GitHub Pages par la CI)
    ['./reporters/history-reporter.ts', { outputFolder: 'test-history', maxRuns: 5, title: 'TechHub — Tests E2E' }],
  ],
  use: {
    baseURL: 'https://shop.missionplaywright.fr',
    trace: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
