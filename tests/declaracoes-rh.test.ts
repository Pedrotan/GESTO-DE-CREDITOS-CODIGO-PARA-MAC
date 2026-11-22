import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataPorExtenso, inteiroPorExtenso, kwanzasPorExtenso, textoDeclaracaoInstituicao, textoDeclaracaoServico, valorKz } from '../src/bibliotecas/rh/declaracoes.ts';

test('valores por extenso como no modelo da declaração', () => {
    assert.equal(kwanzasPorExtenso(1_119_686_00), 'um milhão, cento e dezanove mil, seiscentos e oitenta e seis kwanzas');
    assert.equal(kwanzasPorExtenso(100_00), 'cem kwanzas');
    assert.equal(kwanzasPorExtenso(1_00), 'um kwanza');
    assert.equal(kwanzasPorExtenso(2_000_000_00), 'dois milhões de kwanzas');
    assert.equal(kwanzasPorExtenso(250_000_50), 'duzentos e cinquenta mil kwanzas e cinquenta cêntimos');
    assert.equal(inteiroPorExtenso(2_100), 'dois mil e cem');
    assert.equal(inteiroPorExtenso(1_000_050), 'um milhão e cinquenta');
    assert.equal(inteiroPorExtenso(16), 'dezasseis');
    assert.equal(valorKz(1_119_686_00), '1.119.686,00');
});

test('data por extenso e textos dos dois modelos', () => {
    assert.equal(dataPorExtenso('2022-09-01'), '1 de setembro de 2022');
    const servico = textoDeclaracaoServico({ empresa: 'EMPRESA, LDA', sexo: 'M', nome: 'Osvaldo Alves', bi: '002658949BA031', admissao: '2022-09-01',
        numero: '4821-BRV-0937', cargo: 'Director Geral', departamento: 'Direcção Geral', tipoContrato: 'indeterminado', salarioBaseMinor: 1_119_686_00 });
    assert.match(servico, /o Senhor Osvaldo Alves, titular do Bilhete de Identidade n\.º 002658949BA031 e inscrito no NIF sob o n\.º _+/u);
    assert.match(servico, /desde 1 de setembro de 2022, com o número mecanográfico 4821-BRV-0937\./u);
    assert.match(servico, /salário base mensal de Kz 1\.119\.686,00 \(um milhão, cento e dezanove mil, seiscentos e oitenta e seis kwanzas\)\./u);
    assert.equal(servico.split('\n\n').length, 3);
    const feminino = textoDeclaracaoServico({ empresa: 'E', sexo: 'F', nome: 'Maria', numero: '1' });
    assert.match(feminino, /a Senhora Maria/u);
    assert.match(feminino, /A trabalhadora exerce/u);
    const inst = textoDeclaracaoInstituicao({ empresa: 'EMPRESA, LDA', instituicao: 'Banco BAI', finalidade: 'abertura de conta', factos: 'Factos.' });
    assert.match(inst, /junto de Banco BAI, para efeitos de abertura de conta\./u);
    assert.equal(inst.split('\n\n').length, 4);
});
