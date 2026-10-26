import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',timeout:45000,retries:0,workers:1,
  use:{baseURL:process.env.BASE_URL||'http://127.0.0.1:3000',headless:true,viewport:{width:1440,height:1100},
    launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']},
    screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter:[['list'],['html',{open:'never'}]],
});
