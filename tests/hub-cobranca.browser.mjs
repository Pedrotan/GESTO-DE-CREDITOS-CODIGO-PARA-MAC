// Fluxos visuais com o Hub real e dados fictícios; nenhum fornecedor externo é chamado.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import puppeteer from 'puppeteer';
const root = resolve(import.meta.dirname, '..');
const mocks = {
  '@/componentes/layout/MainLayout': 'export const MainLayout=({children,title,subtitle})=><main className="p-5 space-y-5"><h1 className="text-2xl font-bold">{title}</h1><p>{subtitle}</p>{children}</main>;',
  '@/contextos/ContextoAutenticacao': `const user={id:'u',name:'Operador de teste',role:'super_admin',permissions:['manage_payments','manage_clients','manage_credits']};const users=[user];export const useAuth=()=>({user,users});`,
  '@/contextos/ContextoDados': `const key=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10); const clients=['Ana','Bruno','Carlos'].map((name,i)=>({id:'c'+i,name,nif:'500000000'+i,phone:'92345678'+i,createdAt:'2026-01-01',availableCredit:100000,creditLimit:100000,bankCoordinates:[]}));const credits=[{id:'cr0',clientId:'c0',clientName:'Ana',status:'overdue',totalDue:12000,currentBalance:12000,principalAmount:10000,interestRate:10,lateInterest:0,dueDate:key(-5),createdAt:'2026-01-01',usuario_id:'u'},{id:'cr1',clientId:'c1',clientName:'Bruno',status:'active',totalDue:5000,principalAmount:4500,currentBalance:5000,interestRate:10,lateInterest:0,dueDate:key(3),createdAt:'2026-01-01',usuario_id:'u'}];const data={clients,credits,payments:[],companySettings:{name:'Empresa de teste',currency:'AOA',bankingInfo:[]},legalCases:[],addLegalCase:async()=>{}};export const useData=()=>data;`,
  '@/servicos/ServicoAuditoria': 'export class ServicoAuditoria {static async addLog(){}}',
  '@/servicos/ServicoControloAcesso': 'export class ServicoControloAcesso {static temPermissao(){return true}}',
  '@/bibliotecas/pdf': `export const companyBankAccount=()=>({iban:'AO06000000000000000000000',holder:'Empresa de teste'});export const generateDebtCollectionNoticePDF=()=>{};`,
  '@/bibliotecas/bd': `const profiles=new Map([['c1',{clientId:'c1',provincia:'Luanda',balcao:'Sede',consentimento:true,aceiteEm:'2026-01-01T00:00:00Z',aceitePor:'Operador',evidencia:'Aceite assinado no cadastro'}]]),campaigns=new Map(),events=[],collections=[];let setting=null;const key=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);const installments=[{id:'i0',creditId:'cr0',installmentNumber:1,dueDate:key(-5),principalMinor:1000000,interestMinor:200000,lateInterestMinor:0,paidPrincipalMinor:0,paidInterestMinor:0,status:'pending'},{id:'i1',creditId:'cr1',installmentNumber:1,dueDate:key(3),principalMinor:450000,interestMinor:50000,lateInterestMinor:0,paidPrincipalMinor:0,paidInterestMinor:0,status:'pending'}];export const db={all:async(q)=>q.includes('hub_collection_clients')?[...profiles.values()].map(data=>({data:JSON.stringify(data)})):q.includes('hub_collection_campaigns')?[...campaigns.values()].map(data=>({data:JSON.stringify(data)})):q.includes('hub_collection_events')?events.slice().reverse():q.includes('credit_installments')?installments:q.includes('collection_events')?collections.slice().reverse():[],get:async(q,p)=>q.includes('hub_collection_settings')?setting:q.includes('hub_collection_clients')?profiles.has(p[0])?{data:JSON.stringify(profiles.get(p[0]))}:undefined:q.includes('hub_collection_events')?events.find(e=>e.id===p[0]):q.includes('FROM credits')?{id:p[0],totalDueMinor:1200000,totalDue:12000}:undefined,run:async(q,p)=>{if(q.includes('INSERT INTO hub_collection_settings'))setting={data:p[1]};if(q.includes('INSERT INTO hub_collection_campaigns'))campaigns.set(p[0],JSON.parse(p[1]));if(q.includes('INSERT INTO hub_collection_clients'))profiles.set(p[0],JSON.parse(p[1]));if(q.includes('INSERT OR IGNORE INTO hub_collection_events'))events.push(Object.fromEntries(['id','clientId','creditId','kind','channel','status','message','metadata','actorId','actorName','createdAt'].map((k,i)=>[k,p[i]])));if(q.includes('INSERT INTO collection_events'))collections.push(Object.fromEntries(['id','creditId','kind','agentId','agentName','monthKey','amountMinor','promisedDate','relatedId','notes','actorId','actorName','createdAt'].map((k,i)=>[k,p[i]])));return {changes:1};},transaction:async ss=>{for(const s of ss)await db.run(s.sql,s.params)}};`,
};
test('Hub: cobrança preventiva, dívidas, ficha, promessa, campanha e canal desligado', async () => {
  const result = await build({ stdin: { contents: `import {createRoot} from 'react-dom/client';import Hub from './src/paginas/HubCobranca';createRoot(document.getElementById('root')).render(<Hub/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outdir: 'out', platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.BASE_URL': '"/"' }, plugins: [{ name: 'fixture', setup(b) { b.onResolve({ filter: /^@\// }, args => args.path in mocks ? { path: args.path, namespace: 'mock' } : undefined); b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root })); } }] });
  const javascript = result.outputFiles.find(f => f.path.endsWith('.js')).contents;
  const css = (await postcss([tailwindcss()]).process(readFileSync(resolve(root, 'src/index.css'), 'utf8'), { from: resolve(root, 'src/index.css') })).css;
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(javascript); }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    if (req.url.startsWith('/fonts/')) { const file = resolve(root, 'public', req.url.slice(1)); if (existsSync(file)) return res.end(readFileSync(file)); res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/facebook\.com|whatsapp\.com/.test(r.url())) external.push(r.url()); });
    await page.setViewport({ width: 1440, height: 1100 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('[role="tab"]');
    mkdirSync(resolve(root, 'tmp/hub-cobranca'), { recursive: true });
    await page.screenshot({ path: resolve(root, 'tmp/hub-cobranca/painel.png') });
    await page.click('[role="tab"][aria-controls$="-content-vencer"]');
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('Bruno'));
    assert.ok(!(await page.$eval('tbody', e => e.textContent)).includes('Ana'));
    await page.click('[role="tab"][aria-controls$="-content-atrasos"]');
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('Ana'));
    assert.ok(!(await page.$eval('tbody', e => e.textContent)).includes('Bruno'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Abrir ficha').click());
    await page.waitForSelector('[role="dialog"]');
    assert.ok((await page.$eval('[role="dialog"]', e => e.textContent)).includes('Ficha de contacto'));
    await page.screenshot({ path: resolve(root, 'tmp/hub-cobranca/ficha.png') });
    await page.evaluate(() => { const select = [...document.querySelectorAll('[role="dialog"] label')].find(l => l.querySelector('span')?.textContent === 'Tipo').querySelector('select'); select.value = 'promise'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('[role="dialog"]').textContent.includes('Valor prometido'));
    await field('Valor prometido (Kz)', '50'); await field('Descrição / justificação', 'Cliente promete pagar no dia acordado.');
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Guardar registo').click());
    await page.waitForFunction(() => document.querySelector('[role="dialog"]').textContent.includes('Promessa em aberto'));
    await page.keyboard.press('Escape');
    await page.click('[role="tab"][aria-controls$="-content-promessas"]');
    await page.waitForFunction(() => document.body.textContent.includes('Cliente promete pagar no dia acordado.'));
    await page.click('[role="tab"][aria-controls$="-content-campanhas"]');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Criar campanha').click());
    await page.waitForSelector('[role="dialog"]');
    async function field(label, value) {
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('[role="dialog"] label')].find(l => l.querySelector('span')?.textContent === label)?.querySelector('input,textarea'), label);
      const element = handle.asElement(); assert.ok(element, `Campo ${label}`); await element.click({ clickCount: 3 }); await element.type(value); await handle.dispose();
    }
    await field('Nome', 'Campanha de teste'); await field('Limite da oferta (Kz)', '50000');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] p')].find(p => p.textContent === 'Destinatários elegíveis')?.parentElement.querySelector('p:nth-child(2)').textContent), '1');
    assert.ok((await page.$eval('[role="dialog"]', e => e.textContent)).includes('Bruno'));
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Guardar rascunho').click());
    await page.waitForFunction(() => document.body.textContent.includes('Campanha guardada'));
    await page.screenshot({ path: resolve(root, 'tmp/hub-cobranca/campanha.png') });
    await page.keyboard.press('Escape');
    await page.click('[role="tab"][aria-controls$="-content-canal"]');
    assert.ok((await page.$eval('body', e => e.textContent)).includes('Envios desligados'));
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(root, 'tmp/hub-cobranca/mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
