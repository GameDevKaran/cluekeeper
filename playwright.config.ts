import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',workers:1,fullyParallel:false,timeout:35000,use:{baseURL:'http://127.0.0.1:3231',trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1100}}},{name:'mobile',use:{...devices['Pixel 7']}}]});
