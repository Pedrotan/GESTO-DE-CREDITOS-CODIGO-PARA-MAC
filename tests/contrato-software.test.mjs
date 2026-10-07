import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('contrato mantém 30 cláusulas e cinco anexos, cópia editável e substituição literal dos dados',async()=>{
    const dir=mkdtempSync(path.join(tmpdir(),'tango-contract-'));
    try {
        const outfile=path.join(dir,'contract.mjs');
        await build({entryPoints:['src/bibliotecas/contrato-software.ts'],bundle:true,format:'esm',platform:'node',outfile,logLevel:'silent'});
        const {newSoftwareContract,contractText,validateSoftwareContract,contractDesign}=await import(pathToFileURL(outfile).href);
        const contract=newSoftwareContract();
        assert.equal(contract.sections.filter(s=>s.title.startsWith('Cláusula ')).length,30);
        assert.equal(contract.sections.filter(s=>s.title.startsWith('Anexo ')).length,5);
        assert.ok(contract.sections.some(s=>s.title==='Assinaturas'));
        assert.ok(contract.sections.at(-1).body.includes('Declaração de Aceitação'));
        assert.ok(validateSoftwareContract(JSON.parse(JSON.stringify(contract))));
        const other=newSoftwareContract();other.sections[0].body='Alterado';assert.notEqual(contract.sections[0].body,other.sections[0].body);
        assert.equal(contractText('{{cliente}} / {{nif}}',{...contract,client:'Cliente $& {{software}}',nif:'5000000000'}),'Cliente $& {{software}} / 5000000000');
        assert.equal(validateSoftwareContract({...contract,sections:[]}),false);
        assert.equal(validateSoftwareContract({...contract,sections:[contract.sections[0],contract.sections[0]]}),false);
        const design={...contractDesign(contract),primary:'#0f213d',accent:'#b58a35'};
        const personalized={...contract,design};
        assert.ok(validateSoftwareContract(JSON.parse(JSON.stringify(personalized))));
        assert.equal(contractDesign(personalized).primary,'#0f213d');
        assert.ok(validateSoftwareContract({...contract,design:undefined}));
        assert.equal(validateSoftwareContract({...contract,design:{...design,primary:'invalid'}}),false);
        assert.equal(validateSoftwareContract({...contract,design:{...design,logo:'javascript:invalid'}}),false);
        assert.ok(validateSoftwareContract({...contract,design:{...design,logo:''}}));
        assert.equal(contractDesign({...contract,design:{...design,style:undefined,primary:'#262626',accent:'#666666'}}).primary,'#13384b');
        assert.equal(contractDesign({...contract,design:{...design,style:'ribbon',primary:'#262626',accent:'#666666'}}).primary,'#262626');
    }finally{rmSync(dir,{recursive:true,force:true});}
});
