import puppeteer from 'puppeteer';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null, protocolTimeout: 120000 });
const page = (await browser.pages()).find(p => p.url().includes('localhost:8081'));
const [action, a1, a2] = process.argv.slice(2);
const helpers = `window.__t = { click: (t) => { const el = [...document.querySelectorAll('button,[role=button]')].find(e => e.innerText && e.innerText.trim().includes(t) && !e.disabled); if (el) { el.click(); return 'ok ' + t; } return 'NOT FOUND ' + t; }, set: (el, v) => { if (typeof el === 'string') el = document.getElementById(el); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set'; } };`;
if (action === 'eval') { await page.evaluate(helpers); console.log(JSON.stringify(await page.evaluate(`(async () => { ${a1} })()`))); }
if (action === 'shot') await page.screenshot({ path: a1 });
browser.disconnect();
