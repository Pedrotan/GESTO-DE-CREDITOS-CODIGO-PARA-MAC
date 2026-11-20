import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cadeiaChefia, chefeDirecto, cicloChefia, organograma, subordinados, type EstruturaH } from '../src/bibliotecas/rh/hierarquia-rh.ts';

// Finanças (director Ana) com as secções Contabilidade (chefe Bruno) e Tesouraria (sem chefe).
const base = (): EstruturaH => ({
    departamentos: [{ id: 'fin', nome: 'Finanças', responsavel_id: 'ana' }, { id: 'rh', nome: 'RH', responsavel_id: null }],
    seccoes: [{ id: 'cont', nome: 'Contabilidade', departamento_id: 'fin', responsavel_id: 'bruno' }, { id: 'tes', nome: 'Tesouraria', departamento_id: 'fin', responsavel_id: null }],
    cargos: [{ id: 'dir', nome: 'Director', nivel: 1 }, { id: 'chefe', nome: 'Chefe de secção', nivel: 2 }, { id: 'tec', nome: 'Técnico', nivel: 4 }],
    funcionarios: [
        { id: 'ana', nome: 'Ana', departamento_id: 'fin', seccao_id: null, cargo_id: 'dir' },
        { id: 'bruno', nome: 'Bruno', departamento_id: 'fin', seccao_id: 'cont', cargo_id: 'chefe' },
        { id: 'carla', nome: 'Carla', departamento_id: 'fin', seccao_id: 'cont', cargo_id: 'tec' },
        { id: 'dino', nome: 'Dino', departamento_id: 'fin', seccao_id: 'tes', cargo_id: 'tec' },
        { id: 'eva', nome: 'Eva', departamento_id: 'rh', seccao_id: null, cargo_id: 'tec' },
        { id: 'saiu', nome: 'Saiu', departamento_id: 'fin', seccao_id: 'cont', cargo_id: 'tec', estado: 'cessado' },
    ],
});
const f = (e: EstruturaH, id: string) => e.funcionarios.find(x => x.id === id)!;

test('hierarquia: chefe directo pela secção, depois pelo departamento, e o da ficha prevalece', () => {
    const e = base();
    assert.deepEqual(chefeDirecto(f(e, 'carla'), e), { id: 'bruno', origem: 'seccao' });
    assert.deepEqual(chefeDirecto(f(e, 'bruno'), e), { id: 'ana', origem: 'departamento' }, 'o chefe da secção responde ao director');
    assert.deepEqual(chefeDirecto(f(e, 'dino'), e), { id: 'ana', origem: 'departamento' }, 'secção sem chefe sobe ao departamento');
    assert.deepEqual(chefeDirecto(f(e, 'ana'), e), { id: null, origem: null }, 'o director não responde a si próprio');
    assert.deepEqual(chefeDirecto(f(e, 'eva'), e), { id: null, origem: null });
    f(e, 'dino').chefe_id = 'bruno';
    assert.deepEqual(chefeDirecto(f(e, 'dino'), e), { id: 'bruno', origem: 'ficha' });
});

test('hierarquia: equipa directa (sem cessados) e linha de chefia', () => {
    const e = base();
    assert.deepEqual(subordinados('bruno', e).map(x => x.id), ['carla']);
    assert.deepEqual(subordinados('ana', e).map(x => x.id).sort(), ['bruno', 'dino']);
    assert.deepEqual(cadeiaChefia('carla', e).map(x => x.id), ['bruno', 'ana']);
});

test('hierarquia: escolher um chefe que responde ao funcionário é recusado (ciclo)', () => {
    const e = base();
    assert.match(cicloChefia('ana', 'carla', e) || '', /ciclo/u, 'Carla → Bruno → Ana: Ana não pode responder a Carla');
    assert.match(cicloChefia('bruno', 'carla', e) || '', /ciclo/u);
    assert.match(cicloChefia('ana', 'ana', e) || '', /próprio/u);
    assert.equal(cicloChefia('carla', 'ana', e), null, 'saltar um nível é permitido');
    assert.equal(cicloChefia('eva', 'ana', e), null);
    assert.equal(cicloChefia('eva', null, e), null);
});

test('hierarquia: organograma por departamento e secção, ordenado pelo nível do cargo', () => {
    const arvore = organograma(base());
    assert.deepEqual(arvore.map(d => d.departamento?.nome), ['Finanças', 'RH']);
    const fin = arvore[0];
    assert.equal(fin.responsavel?.id, 'ana');
    assert.equal(fin.total, 4, 'os cessados não contam');
    assert.deepEqual(fin.seccoes.map(s => [s.seccao?.nome, s.responsavel?.id ?? null, s.membros.map(m => m.id)]),
        [['Contabilidade', 'bruno', ['carla']], ['Tesouraria', null, ['dino']]]);
    assert.deepEqual(arvore[1].seccoes[0].membros.map(m => m.id), ['eva']);
});
