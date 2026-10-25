// Prepara a pasta de uma versão para o centro de actualizações: copia o latest.yml e os ficheiros que ele indica
// (gerados pelo `npm run build:erp` em release/) para release/actualizacao/<versão>/ e confere o SHA-512.
// Não envia nada para a VPS: no fim mostra os comandos para copiar e o que fazer no Tango Master.
//
// Uso: node scripts/preparar-actualizacao.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFeedYaml } from '../vercel-api/_actualizacoes.js';

const root = path.resolve(import.meta.dirname, '..');
const release = path.join(root, 'release');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const outDir = path.join(release, 'actualizacao', version);

const feeds = ['latest.yml', 'latest-mac.yml'].filter(name => fs.existsSync(path.join(release, name)));
if (!feeds.length) throw new Error('Não há release/latest.yml: corra primeiro `npm run build:erp`.');

fs.mkdirSync(outDir, { recursive: true });
for (const feedName of feeds) {
    const feed = parseFeedYaml(fs.readFileSync(path.join(release, feedName), 'utf8'));
    if (feed.version !== version) throw new Error(`${feedName} é da versão ${feed.version}, mas o package.json diz ${version}. Volte a gerar o instalador.`);
    for (const file of feed.files) {
        const source = path.join(release, file.url);
        const sha512 = crypto.createHash('sha512').update(fs.readFileSync(source)).digest('base64');
        if (sha512 !== file.sha512) throw new Error(`${file.url} não confere com o ${feedName} (SHA-512 diferente).`);
        fs.copyFileSync(source, path.join(outDir, file.url));
        console.log(`✔ ${file.url} (${(file.size / 1_048_576).toFixed(1)} MB)`);
    }
    fs.copyFileSync(path.join(release, feedName), path.join(outDir, feedName));
    console.log(`✔ ${feedName}`);
}

console.log(`\nPasta pronta: ${outDir}\n`);
console.log('1. Copiar para a VPS (não é feito por este script):');
console.log(`   scp -r "${outDir}" root@191.215.45.104:/var/www/tango-erp/dados-actualizacoes/`);
console.log(`2. Tango Master › Actualizações › Registar versão ${version} (fica só para a equipa).`);
console.log('3. Testar num computador da equipa; depois ligar «Disponibilizar actualizações para todos».');
