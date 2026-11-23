import test from 'node:test';
import assert from 'node:assert/strict';
import { dataOfac, lerListaSancoes, lerXml } from '../src/bibliotecas/compliance/listas-xml.ts';
import {
    chaveCorrespondencia, estadoScreening, executarScreening, indexarLista, jaroWinkler, palavrasNome, pesquisarNome, pessoasDoCliente,
    resultadoGlobal, semelhancaNomes, type EntradaIndexada, type PessoaPesquisa,
} from '../src/bibliotecas/compliance/screening.ts';
import { calcularRisco, CONFIGURACAO_RISCO_INICIAL, type EntradaRisco } from '../src/bibliotecas/compliance/motor-risco.ts';
import * as P from '../src/bibliotecas/compliance/permissoes-compliance.ts';

// Listas FICTÍCIAS no formato das oficiais (nomes inventados).
const XML_ONU = `<?xml version="1.0" encoding="UTF-8"?>
<CONSOLIDATED_LIST xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" dateGenerated="2026-11-20T10:00:00.000Z">
  <INDIVIDUALS>
    <INDIVIDUAL>
      <DATAID>9001</DATAID><REFERENCE_NUMBER>QDi.900</REFERENCE_NUMBER>
      <FIRST_NAME>FICTICIO</FIRST_NAME><SECOND_NAME>NOME</SECOND_NAME><THIRD_NAME>SANCIONADO</THIRD_NAME>
      <UN_LIST_TYPE>Al-Qaida</UN_LIST_TYPE>
      <NATIONALITY><VALUE>Testland</VALUE></NATIONALITY>
      <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Fictício Sancionado</ALIAS_NAME></INDIVIDUAL_ALIAS>
      <INDIVIDUAL_DATE_OF_BIRTH><TYPE_OF_DATE>EXACT</TYPE_OF_DATE><DATE>1970-03-15</DATE></INDIVIDUAL_DATE_OF_BIRTH>
      <COMMENTS1>Entrada de teste &amp; demonstração.</COMMENTS1>
    </INDIVIDUAL>
  </INDIVIDUALS>
  <ENTITIES>
    <ENTITY><DATAID>9002</DATAID><REFERENCE_NUMBER>QDe.901</REFERENCE_NUMBER><FIRST_NAME>EMPRESA FANTASMA DE TESTE</FIRST_NAME><UN_LIST_TYPE>Al-Qaida</UN_LIST_TYPE>
      <ENTITY_ALIAS><ALIAS_NAME>Fantasma Teste Lda</ALIAS_NAME></ENTITY_ALIAS></ENTITY>
  </ENTITIES>
</CONSOLIDATED_LIST>`;

const XML_OFAC = `<?xml version="1.0" standalone="yes"?>
<sdnList xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML">
  <publshInformation><Publish_Date>11/21/2026</Publish_Date><Record_Count>3</Record_Count></publshInformation>
  <sdnEntry><uid>77001</uid><firstName>Joaquim Teste</firstName><lastName>EXEMPLAR</lastName><sdnType>Individual</sdnType>
    <programList><program>TEST</program></programList>
    <akaList><aka><uid>1</uid><type>a.k.a.</type><category>strong</category><firstName>Quim</firstName><lastName>EXEMPLAR</lastName></aka></akaList>
    <dateOfBirthList><dateOfBirthItem><uid>2</uid><dateOfBirth>05 Jun 1980</dateOfBirth><mainEntry>true</mainEntry></dateOfBirthItem></dateOfBirthList>
    <nationalityList><nationality><uid>3</uid><country>Testland</country></nationality></nationalityList>
  </sdnEntry>
  <sdnEntry><uid>77002</uid><lastName>NAVIO TESTE</lastName><sdnType>Vessel</sdnType></sdnEntry>
  <sdnEntry><uid>77003</uid><lastName>BANCO FICTICIO INTERNACIONAL</lastName><sdnType>Entity</sdnType></sdnEntry>
</sdnList>`;

test('leitor XML: árvore, entidades, CDATA e erros', () => {
    const r = lerXml('<a x="1 &amp; 2"><b>texto &lt;ok&gt;</b><c/><d><![CDATA[<cru>]]></d></a>');
    assert.equal(r.filhos[0].attrs.x, '1 & 2');
    assert.equal(r.filhos[0].filhos[0].texto, 'texto <ok>');
    assert.equal(r.filhos[0].filhos[2].texto, '<cru>');
    assert.throws(() => lerXml('<a><b></a>'), /mal formado/u);
    assert.throws(() => lerXml('<a><b>'), /incompleto/u);
    assert.throws(() => lerListaSancoes('<outra/>'), /não é a Lista Consolidada/u);
});

test('lista da ONU: pessoas, entidades, aliases, nascimento e data da lista', () => {
    const l = lerListaSancoes(XML_ONU);
    assert.deepEqual([l.fonte, l.dataLista, l.entradas.length], ['ONU', '2026-11-20', 2]);
    const p = l.entradas[0];
    assert.deepEqual([p.ref, p.tipo, p.nome, p.aliases, p.nascimentos, p.nacionalidades], ['QDi.900', 'pessoa', 'FICTICIO NOME SANCIONADO', ['Fictício Sancionado'], ['1970-03-15'], ['Testland']]);
    assert.equal(p.notas, 'Entrada de teste & demonstração.');
    assert.deepEqual([l.entradas[1].tipo, l.entradas[1].nome], ['entidade', 'EMPRESA FANTASMA DE TESTE']);
});

test('lista da OFAC (com namespace): ignora navios e lê datas', () => {
    const l = lerListaSancoes(XML_OFAC);
    assert.deepEqual([l.fonte, l.dataLista, l.entradas.length, l.ignoradas], ['OFAC', '2026-11-21', 2, 1]);
    assert.deepEqual([l.entradas[0].nome, l.entradas[0].aliases, l.entradas[0].nascimentos, l.entradas[0].programa], ['Joaquim Teste EXEMPLAR', ['Quim EXEMPLAR'], ['1980-06-05'], 'TEST']);
    assert.deepEqual(dataOfac('circa 1962'), ['1962']);
    assert.deepEqual(dataOfac('Feb 1962'), ['1962-02']);
    assert.deepEqual(dataOfac('1955 to 1958'), ['1955', '1958']);
});

test('nomes: normalização e semelhança independentes da ordem e de acentos', () => {
    assert.deepEqual(palavrasNome('José  da Silva-Neto'), ['jose', 'silva', 'neto']);
    assert.ok(jaroWinkler('martha', 'marhta') > 0.95);
    assert.equal(semelhancaNomes(palavrasNome('João Silva'), palavrasNome('SILVA JOAO')), 1 * 0.7 + 0.3);
    assert.ok(semelhancaNomes(palavrasNome('Joao Manuel Silva'), palavrasNome('Joao Silva')) >= 0.85, 'nome do meio omitido');
    assert.ok(semelhancaNomes(palavrasNome('Maria Teste Exemplo'), palavrasNome('Maria Lopes')) < 0.7);
});

const indice = indexarLista([...lerListaSancoes(XML_ONU).entradas, ...lerListaSancoes(XML_OFAC).entradas]);
const pessoa = (nome: string, extra: Partial<PessoaPesquisa> = {}): PessoaPesquisa => ({ papel: 'cliente', nome, nascimento: null, tipo: 'pessoa', ...extra });

test('pesquisa: correspondências possíveis com motivos, alias e data de nascimento', () => {
    const r = pesquisarNome(pessoa('Ficticio Sancionado Nome'), indice);
    assert.equal(r[0].ref, 'QDi.900');
    assert.ok(r[0].motivos[0].startsWith('Nome'));
    const alias = pesquisarNome(pessoa('Quim Exemplar'), indice);
    assert.equal(alias[0].ref, '77001');
    assert.ok(alias[0].motivos.some(m => m.includes('alias')));
    const dataIgual = pesquisarNome(pessoa('Joaquim Exemplar', { nascimento: '1980-06-05' }), indice)[0];
    const dataDif = pesquisarNome(pessoa('Joaquim Teste Exemplar', { nascimento: '1995-01-01' }), indice)[0];
    assert.ok(dataIgual.motivos.includes('Data de nascimento igual'));
    assert.ok(dataDif.motivos.some(m => m.startsWith('Data de nascimento diferente')));
    assert.deepEqual(pesquisarNome(pessoa('Maria Teste Exemplo'), indice), []);
    assert.deepEqual(pesquisarNome(pessoa('Empresa Fantasma de Teste'), indice), [], 'pessoa não é comparada com entidades');
    assert.equal(pesquisarNome(pessoa('Empresa Fantasma Teste', { tipo: 'entidade' }), indice)[0].ref, 'QDe.901');
});

test('screening: lista não importada = NOT_CHECKED, indisponível = ERROR, nunca NO_MATCH', () => {
    const versao = { id: 'v1', dataLista: '2026-11-20', hash: 'abc', total: 2, importadaEm: '2026-11-22T10:00:00Z' };
    const r = executarScreening([pessoa('Maria Teste Exemplo')], [
        { fonte: 'ONU', versao, indice },
        { fonte: 'OFAC', versao: null, indice: null },
        { fonte: 'INTERNA', versao: { ...versao, id: 'interna' }, indice: null },
    ]);
    assert.deepEqual(r[0].fontes.map(f => f.resultado), ['NO_MATCH', 'NOT_CHECKED', 'ERROR']);
    assert.equal(resultadoGlobal(r), 'ERROR');
    assert.equal(resultadoGlobal(executarScreening([pessoa('Ficticio Nome Sancionado')], [{ fonte: 'ONU', versao, indice }])), 'POTENTIAL_MATCH');
});

test('empresa: pesquisa também o representante e os beneficiários efectivos', () => {
    const p = pessoasDoCliente({ name: 'Empresa Teste, Lda', legalRepresentative: 'Rui Teste' }, true, 'Ana Beneficiária (60%); Carlos Sócio 40%');
    assert.deepEqual(p.map(x => [x.papel, x.nome, x.tipo]), [
        ['cliente', 'Empresa Teste, Lda', 'entidade'], ['representante', 'Rui Teste', 'pessoa'], ['beneficiario', 'Ana Beneficiária', 'pessoa'], ['beneficiario', 'Carlos Sócio', 'pessoa'],
    ]);
});

test('estado do cliente: possível, falso positivo, confirmada, erro e desactualizado', () => {
    const versao = { id: 'v1', dataLista: '2026-11-20', hash: 'abc', total: 2, importadaEm: '2026-11-22T10:00:00Z' };
    const resultados = executarScreening([pessoa('Ficticio Nome Sancionado')], [{ fonte: 'ONU', versao, indice }]);
    const ultimo = { criadoEm: '2026-11-23T10:00:00Z', resultados };
    const activas = [{ fonte: 'ONU' as const, id: 'v1', importadaEm: versao.importadaEm }];
    assert.equal(estadoScreening({ ultimo: null, decisoes: [], versoesActivas: activas }).estado, 'nao_verificado');
    const possivel = estadoScreening({ ultimo, decisoes: [], versoesActivas: activas });
    assert.deepEqual([possivel.estado, possivel.pendentes.length], ['possivel', 1]);
    const descartada = [{ fonte: 'ONU', ref: 'QDi.900', nome_pesquisado: 'FICTÍCIO nome sancionado', decisao: 'falso_positivo' as const, categoria: null }];
    assert.equal(estadoScreening({ ultimo, decisoes: descartada, versoesActivas: activas }).estado, 'sem_correspondencia', 'o falso positivo não volta a ser pedido');
    assert.equal(estadoScreening({ ultimo, decisoes: descartada, versoesActivas: [{ ...activas[0], id: 'v2' }] }).estado, 'desactualizado');
    const confirmada = estadoScreening({ ultimo, decisoes: [{ ...descartada[0], decisao: 'confirmada' }], versoesActivas: activas });
    assert.deepEqual([confirmada.estado, confirmada.sancaoConfirmada], ['confirmada', true]);
    const pep = estadoScreening({ ultimo, decisoes: [{ ...descartada[0], fonte: 'INTERNA', decisao: 'confirmada', categoria: 'pep' }], versoesActivas: activas });
    assert.deepEqual([pep.pepConfirmado, pep.sancaoConfirmada], [true, false]);
    assert.equal(chaveCorrespondencia('ONU', 'X', 'Joao da Silva'), 'ONU:X:joao silva');
});

test('processo principal: permissão e autor de cada comando de Compliance', () => {
    const conta = (sql: string) => (sql.match(/\?/gu) || []).length;
    // O autor tem de ser um parâmetro existente e o nome da coluna nessa posição tem de identificar o utilizador.
    const casos: Array<[string, string, number | null, string | null]> = [
        [P.SQL_SCREENING_REGISTAR, 'compliance_manage', 7, 'criado_por'],
        [P.SQL_SCREENING_DECIDIR, 'compliance_approve', 11, 'decidido_por'],
        [P.SQL_LISTA_VERSAO_CRIAR, 'compliance_settings', 8, 'importada_por'],
        [P.SQL_INTERNA_CRIAR, 'compliance_manage', 11, 'criado_por'],
        [P.SQL_INTERNA_ALTERAR, 'compliance_manage', 10, 'actualizado_por'],
        [P.SQL_LISTA_BLOCO_GRAVAR, 'compliance_manage', null, null],
        [P.SQL_KYC_DECIDIR, 'compliance_approve', 1, 'decidido_por'],
        [P.SQL_AVALIACAO_REGISTAR, 'compliance_manage', 15, 'criado_por'],
    ];
    for (const [sql, permissao, autor, coluna] of casos) {
        assert.deepEqual(P.regraEscritaCompliance(`  ${sql.replace(/ /gu, '\n ')} `), { permissao, autor }, sql.slice(0, 50));
        if (autor !== null) {
            assert.ok(autor < conta(sql), `${sql.slice(0, 40)}: autor fora dos parâmetros`);
            // Colunas pela ordem dos «?» (os valores literais, como «activa = 1», não contam).
            const insert = sql.match(/\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/u);
            const colunas = insert
                ? insert[1].split(',').map(c => c.trim()).filter((_, i) => insert[2].split(',')[i].trim() === '?')
                : sql.match(/SET (.*) WHERE/u)![1].split(',').filter(c => c.includes('?')).map(c => c.split('=')[0].trim());
            assert.equal(colunas[autor], coluna, sql.slice(0, 50));
        }
    }
    assert.equal(P.regraEscritaCompliance('DELETE FROM compliance_screening'), null, 'comandos desconhecidos são recusados');
});

const base = (extra: Partial<EntradaRisco> = {}): EntradaRisco => ({
    particular: true, documento: 'valido', kycEmFalta: [], kycEstado: 'verificado', duplicadosPorRever: [], estrangeiro: false, pais: 'AO',
    rendimentoMensal: 300_000, origemFundos: 'Salário', profissao: 'Professora', sector: null, pep: false, exposicao: 0, creditosActivos: 0,
    maiorCredito: 0, maiorAtrasoDias: 0, creditoIncumprido: false, clienteBloqueado: false, antiguidadeMeses: 34, screening: 'sem_correspondencia', pepLista: false, ...extra,
});

test('risco: sanção confirmada, possível correspondência, PEP da lista e screening em falta', () => {
    const C = CONFIGURACAO_RISCO_INICIAL;
    const conf = calcularRisco(base({ screening: 'confirmada' }), C);
    assert.deepEqual([conf.nivel, conf.requerRevisao], ['elevado', true]);
    assert.ok(conf.regras.some(r => r.id === 'sancao_confirmada' && r.descricao.includes('bloquear')));
    const pos = calcularRisco(base({ screening: 'possivel' }), C);
    assert.deepEqual([pos.nivel, pos.requerRevisao], ['medio', true]);
    assert.equal(calcularRisco(base({ pepLista: true }), C).nivel, 'elevado');
    const falta = calcularRisco(base({ screening: 'nao_verificado' }), C);
    assert.equal(falta.factores.find(f => f.id === 'pep_sancoes')!.valor, 20);
    assert.equal(falta.nivel, 'baixo', 'screening por fazer pesa, mas sozinho não sobe o nível');
    assert.equal(calcularRisco(base({ screening: 'erro' }), C).requerRevisao, true);
    assert.equal(calcularRisco(base(), C).pontuacao, 0);
});
