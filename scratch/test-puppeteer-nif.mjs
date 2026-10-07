import puppeteer from 'puppeteer';
import { getNifData } from '@djosekispy/nifvalidation';

class SystemChromeBrowserAdapter {
  async createPage() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--ignore-certificate-errors'],
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const blocked = ['image', 'stylesheet', 'font'];
      if (blocked.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    return { browser, page };
  }
}

console.log('Testing with SystemChromeBrowserAdapter...');
try {
  const result = await getNifData('5401140645', {
    browserAdapter: new SystemChromeBrowserAdapter(),
    timeoutMs: 25000,
    resultTimeoutMs: 10000,
    debug: true
  });
  console.log('SUCCESS! Result:', result);
} catch (e) {
  console.log('Catched message:', e.message);
}
