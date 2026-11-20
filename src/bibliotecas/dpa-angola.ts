// Divisão Político-Administrativa de Angola (Lei n.º 14/24, de 5 de Setembro): 21 províncias e 326 municípios, pela ordem
// da lei. Serve as listas de escolha de província e município do cadastro de clientes.

export const MUNICIPIOS_POR_PROVINCIA: Readonly<Record<string, readonly string[]>> = {
    Bengo: ['Dande', 'Quibaxe', 'Muxaluando', 'Bula Atumba', 'Ambriz', 'Pango Aluquém', 'Barra do Dande', 'Piri', 'Quicunzo', 'Nambuangongo',
        'Úcua', 'Panguila'],
    Benguela: ['Benguela', 'Ganda', 'Lobito', 'Catumbela', 'Bocoio', 'Balombo', 'Cubal', 'Baía Farta', 'Caimbambo', 'Chongorói', 'Egito Praia',
        'Chindumbo', 'Dombe Grande', 'Capupa', 'Biópio', 'Chila', 'Chicuma', 'Babaera', 'Iambala', 'Catengue', 'Bolonguera', 'Canhamela', 'Navegantes'],
    'Bié': ['Andulo', 'Chitembo', 'Cuito', 'Camacupa', 'Chinguar', 'Catabola', 'Cunhinga', 'Cuemba', 'Nharêa', 'Luando', 'Ringoma', 'Mumbué',
        'Calucinga', 'Chicala', 'Chipeta', 'Umpulo', 'Lúbia', 'Cambândua', 'Belo Horizonte'],
    Cabinda: ['Cabinda', 'Cacongo', 'Buco Zau', 'Belize', 'Miconje', 'Massabi', 'Necuto', 'Tando Zinze', 'Liambo', 'Ngoio'],
    Cuando: ['Cuito Cuanavale', 'Dirico', 'Mavinga', 'Rivungo', 'Xipundo', 'Dima', 'Luiana', 'Mucusso', 'Luengue'],
    Cubango: ['Menongue', 'Cuchi', 'Calai', 'Nancova', 'Cuangar', 'Savate', 'Caiundo', 'Longa', 'Cutato', 'Chinguanja', 'Mavengue'],
    'Cuanza Norte': ['Cazengo', 'Golungo Alto', 'Cambambe', 'Samba Caju', 'Ambaca', 'Lucala', 'Banga', 'Bolongongo', 'Quiculungo', 'Ngonguembo',
        'Massangano', 'Cêrca', 'Tango', 'Terreiro', 'Aldeia Nova', 'Caculo Cabaça', 'Luinga'],
    'Cuanza Sul': ['Sumbe', 'Calulo', 'Gabela', 'Cassongue', 'Porto Amboim', 'Quibala', 'Seles', 'Waku Kungo', 'Mussende', 'Quilenda', 'Ebo',
        'Conda', 'Quirimbo', 'Munenga', 'Quissongo', 'Gungo', 'Sanga', 'Gangula', 'Pambangala', 'Condé', 'Amboiva', 'Lonhe', 'Quenha', 'Boa Entrada'],
    Cunene: ['Ombadja', 'Cuanhama', 'Curoca', 'Cahama', 'Cuvelai', 'Namacunde', 'Chiéde', 'Nehone', 'Humbe', 'Mupa', 'Naulila', 'Chitado',
        'Cafima', 'Chissuata'],
    Huambo: ['Bailundo', 'Huambo', 'Londuimbali', 'Caála', 'Chicala Choloanga', 'Cachiungo', 'Mungo', 'Longonjo', 'Ucuma', 'Ecunha', 'Chinjenje',
        'Bimbe', 'Sambo', 'Galanga', 'Alto Hama', 'Chilata', 'Cuima'],
    'Huíla': ['Caconda', 'Gambos', 'Humpata', 'Lubango', 'Cuvango', 'Quipungo', 'Chibia', 'Quilengues', 'Caluquembe', 'Matala', 'Jamba Mineira',
        'Chipindo', 'Chicomba', 'Cacula', 'Dongo', 'Hoque', 'Capelongo', 'Chituto', 'Capunda Cavilongo', 'Viti Vivali', 'Galangue', 'Palanca', 'Chicungo'],
    'Icolo e Bengo': ['Catete', 'Quiçama', 'Calumbo', 'Cabiri', 'Cabo Ledo', 'Bom Jesus', 'Sequele'],
    Luanda: ['Ingombota', 'Cacuaco', 'Cazenga', 'Viana', 'Belas', 'Kilamba Kiaxi', 'Talatona', 'Mussulo', 'Sambizanga', 'Rangel', 'Maianga',
        'Samba', 'Camama', 'Mulenvos', 'Kilamba', 'Hoji ya Henda'],
    'Lunda Norte': ['Cuilo', 'Dundo', 'Lubalo', 'Capenda Camulemba', 'Cuango', 'Lucapa', 'Cambulo', 'Xá Muteba', 'Caungula', 'Lóvua', 'Chitato',
        'Xá Cassau', 'Camaxilo', 'Luangue', 'Luremo', 'Canzar', 'Cassanje Calucala', 'Mussungue', 'Cafunfo'],
    'Lunda Sul': ['Saurimo', 'Muconda', 'Cacolo', 'Dala', 'Chiluage', 'Cassai Sul', 'Xassengue', 'Alto Chicapa', 'Sombo', 'Muriege', 'Luma Cassai',
        'Cazage', 'Muangueji', 'Cassengo'],
    Malanje: ['Calandula', 'Malanje', 'Cacuso', 'Massango', 'Marimba', 'Quela', 'Quirima', 'Cangandala', 'Cahombo', 'Kunda dya Baze',
        'Cambundi Catembo', 'Caculama', 'Kiwaba Nzoji', 'Luquembo', 'Cateco Cangola', 'Mbanji ya Ngola', 'Cuale', 'Pungu a Ndongo', 'Ngola Luiji',
        'Quihuhu', 'Xandel', 'Cambo Suinginge', 'Milando', 'Quitapa', 'Capunda', 'Muquixe', 'Quêssua'],
    Moxico: ['Luena', 'Cangamba', 'Lumbala Nguimbo', 'Camanongue', 'Léua', 'Lutembo', 'Lucusse', 'Cangumbe', 'Chiúme', 'Alto Cuito', 'Ninda', 'Lutuai'],
    'Moxico Leste': ['Cazombo', 'Luacano', 'Cameia', 'Luau', 'Nana Candundo', 'Macondo', 'Caianda', 'Lóvua do Zambeze', 'Lago Dilolo'],
    Namibe: ['Moçâmedes', 'Tômbwa', 'Bibala', 'Virei', 'Camucuio', 'Lucira', 'Iona', 'Sacomar', 'Cacimbas'],
    'Uíge': ['Dange Quitexe', 'Bungo', 'Ambuíla', 'Negage', 'Puri', 'Maquela do Zombo', 'Damba', 'Sanza Pombo', 'Bembe', 'Milunga', 'Songo',
        'Quimbele', 'Cangola', 'Uíge', 'Mucaba', 'Nova Esperança', 'Sacandica', 'Nsosso', 'Lucunga', 'Quipedro', 'Massau', 'Vista Alegre', 'Alto Zaza'],
    Zaire: ['Soyo', 'Mbanza Kongo', 'Nzeto', 'Tomboco', 'Cuimba', 'Nóqui', 'Luvo', 'Lufico', 'Quêlo', 'Serra de Canda', 'Quindeje'],
};

/** As 21 províncias, por ordem alfabética. */
export const PROVINCIAS_DPA = Object.keys(MUNICIPIOS_POR_PROVINCIA).sort((a, b) => a.localeCompare(b, 'pt'));

/** Texto sem acentos, em minúsculas e com hífenes como espaços (para comparar nomes escritos de formas diferentes). */
export const semAcentos = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const chaveProvincia = (texto: string) => semAcentos(texto)
    .replace(/^provincia\s+d[aoe]\s+/, '')
    .replace(/,?\s*angola$/, '')
    .replace(/^kwanza\b/, 'cuanza')
    .replace(/^kuando\b/, 'cuando')
    .replace(/^kubango\b/, 'cubango');

/**
 * Nome oficial da província (nova DPA) que o texto indica — «LUANDA», «Kwanza-Norte» ou «Província de Luanda, Angola» —, ou
 * '' quando não corresponde a nenhuma (por exemplo «Cuando Cubango», que passou a ser duas províncias).
 */
export const provinciaDPA = (texto: string | null | undefined) => {
    const chave = chaveProvincia(String(texto ?? ''));
    return chave ? PROVINCIAS_DPA.find(nome => semAcentos(nome) === chave) ?? '' : '';
};

/** Municípios da província (por ordem alfabética); lista vazia quando a província não é da nova DPA. */
export const municipiosDaProvincia = (provincia: string | null | undefined) => {
    const nome = provinciaDPA(provincia);
    return nome ? [...MUNICIPIOS_POR_PROVINCIA[nome]].sort((a, b) => a.localeCompare(b, 'pt')) : [];
};

/** Nome oficial do município dentro da província, ou '' quando não pertence a ela. */
export const municipioDPA = (provincia: string | null | undefined, texto: string | null | undefined) => {
    const chave = semAcentos(String(texto ?? ''));
    return chave ? municipiosDaProvincia(provincia).find(nome => semAcentos(nome) === chave) ?? '' : '';
};
