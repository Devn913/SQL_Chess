// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    /* Serve index.html directly via file:// so no server is needed */
    baseURL: 'file://' + path.resolve(__dirname, 'index.html'),
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    /* Desktop sizes */
    {
      name: 'desktop-1920x1080',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'desktop-1440x900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-1280x800',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    /* Tablet sizes */
    {
      name: 'tablet-1024x768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'tablet-portrait-768x1024',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    /* Mobile sizes */
    {
      name: 'mobile-portrait-390x844',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'mobile-landscape-844x390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 } },
    },
    {
      name: 'mobile-small-360x640',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 } },
    },
    /* Ultrawide */
    {
      name: 'ultrawide-2560x1080',
      use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1080 } },
    },
  ],
});
