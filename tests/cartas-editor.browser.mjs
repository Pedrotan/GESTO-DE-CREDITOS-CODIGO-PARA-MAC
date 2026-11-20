// Ensaio real de montagem/desmontagem dos separadores Radix e de edição dos dois campos.
// Executar: node --test tests/cartas-editor.browser.mjs (requer o Chromium do Puppeteer).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = resolve(import.meta.dirname, '..');
const mocks = {
    '@/componentes/layout/MainLayout': 'export const MainLayout = ({children}) => children;',
    '@/contextos/ContextoDados': `export const useData = () => ({clients: [], credits: [], companySettings: {name: 'Empresa de teste', currency: 'AOA', bankingInfo: []}});`,
    '@/contextos/ContextoAutenticacao': `export const useAuth = () => ({user: {id: 'teste', name: 'Operador', role: 'super_admin'}});`,
    '@/ganchos/usar-toast': 'export const useToast = () => ({toast: () => {}});',
    '@/bibliotecas/pdf': `export const companyBankAccount = () => ({iban: 'AO06000000000000000000000', bankName: 'Banco de teste'}); export const generatePermanentTransferLetterPDF = async () => {};`,
};
let browser, server, origin;

before(async () => {
    const bundle = await build({
        stdin: {
            contents: `import {createRoot} from 'react-dom/client'; import {CartasTransferencia} from './src/paginas/CartasTransferencia'; import {SplashScreen} from './src/componentes/layout/SplashScreen'; createRoot(document.getElementById('root')).render(location.hash === '#loading' ? <SplashScreen /> : <CartasTransferencia />);`,
            resolveDir: root, loader: 'tsx',
        },
        bundle: true, write: false, outdir: 'out', platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.BASE_URL': '"/"' },
        plugins: [{ name: 'contextos-isolados', setup(b) {
            b.onResolve({ filter: /^@\// }, args => args.path in mocks ? { path: args.path, namespace: 'mock' } : undefined);
            b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }));
        } }],
    });
    const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents;
    const css = readFileSync(resolve(root, 'src/componentes/layout/carregamento.css'));
    server = createServer((req, res) => {
        if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(javascript); }
        if (req.url.endsWith('.css')) { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (req.url === '/bootstrap') return res.end(readFileSync(resolve(root, 'index.html'), 'utf8').replace(/<script type="module"[^>]+><\/script>/u, ''));
        res.end('<!doctype html><html><head><link rel="stylesheet" href="/loading.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

after(async () => {
    await browser?.close();
    await new Promise(resolve => server ? server.close(resolve) : resolve());
});

test('carta inicial, rascunho formatado e edição A4 sobrevivem a repetidas trocas de separador', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(origin);
        const editor = '[aria-label="Texto da carta"]';
        const preview = '[aria-label="Pré-visualização editável da carta"]';
        await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('ORDEM DE TRANSFERÊNCIA'), {}, editor);
        const trocar = async () => {
            await page.click('[role="tab"][aria-controls$="-content-history"]');
            await page.waitForFunction(selector => !document.querySelector(selector), {}, editor);
            await page.click('[role="tab"][aria-controls$="-content-editor"]');
            await page.waitForSelector(editor);
        };
        const inicial = await page.$eval(editor, element => element.innerHTML);
        await trocar();
        assert.equal(await page.$eval(editor, element => element.innerHTML), inicial);

        const rascunho = '<p>Carta <strong>editada</strong> sem guardar.</p><p>Segunda linha com acentuação.</p>';
        await page.$eval(editor, (element, html) => { element.innerHTML = html; element.dispatchEvent(new InputEvent('input', { bubbles: true })); }, rascunho);
        await page.waitForFunction((selector, html) => document.querySelector(selector)?.innerHTML === html, {}, preview, rascunho);
        for (let index = 0; index < 3; index++) {
            await trocar();
            assert.equal(await page.$eval(editor, element => element.innerHTML), rascunho);
            assert.equal(await page.$eval(preview, element => element.innerHTML), rascunho);
        }

        // A digitação não deve substituir o nó de texto nem fazer saltar o cursor.
        await page.focus(editor);
        await page.evaluate(selector => {
            const node = document.querySelector(selector).firstChild.firstChild;
            const range = document.createRange(); range.setStart(node, 3); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }, editor);
        await page.keyboard.type('XYZ');
        assert.match(await page.$eval(editor, element => element.textContent), /^CarXYZta/u);

        const editadoNaFolha = '<p>Alterado na <em>folha A4</em>.</p>';
        await page.$eval(preview, (element, html) => { element.innerHTML = html; element.dispatchEvent(new InputEvent('input', { bubbles: true })); }, editadoNaFolha);
        await page.waitForFunction((selector, html) => document.querySelector(selector)?.innerHTML === html, {}, editor, editadoNaFolha);
        await trocar();
        assert.equal(await page.$eval(editor, element => element.innerHTML), editadoNaFolha);
        assert.equal(await page.$eval(preview, element => element.innerHTML), editadoNaFolha);

        // Abrir uma carta guardada também deve repor o texto quando o editor ainda não existe.
        await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Guardar no Histórico')).click());
        await page.$eval(editor, element => { element.innerHTML = '<p>Outro rascunho</p>'; element.dispatchEvent(new InputEvent('input', { bubbles: true })); });
        await page.click('[role="tab"][aria-controls$="-content-history"]');
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Ver histórico')));
        await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Ver histórico')).click());
        await page.waitForSelector('[role="dialog"]');
        await page.evaluate(() => [...document.querySelector('[role="dialog"]').querySelectorAll('button')].find(button => button.textContent.trim() === 'Editar').click());
        await page.waitForSelector(editor);
        assert.equal(await page.$eval(editor, element => element.innerHTML), editadoNaFolha);
    } finally { await page.close(); }
});

test('skeleton aparece antes do JavaScript e durante esperas longas, adaptado ao telemóvel e movimento reduzido', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${origin}/bootstrap`);
        await page.waitForSelector('.tango-skeleton', { visible: true });
        assert.equal(await page.$eval('.tango-skeleton', element => element.getAttribute('aria-busy')), 'true');
        await page.goto(`${origin}/#loading`);
        await page.waitForSelector('img[alt="Tango Logo"]');
        await page.waitForSelector('.tango-skeleton', { visible: true });
        await page.setViewport({ width: 390, height: 844 });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.$eval('.tango-skeleton-sidebar', element => getComputedStyle(element).display), 'none');
        assert.equal(await page.$eval('.tango-skeleton-block', element => getComputedStyle(element).animationName), 'none');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        mkdirSync(resolve(root, 'tmp/editor-skeleton'), { recursive: true });
        await page.screenshot({ path: resolve(root, 'tmp/editor-skeleton/skeleton-mobile.png') });
        await page.setViewport({ width: 1366, height: 900 });
        await page.screenshot({ path: resolve(root, 'tmp/editor-skeleton/skeleton-desktop.png') });
    } finally { await page.close(); }
});
