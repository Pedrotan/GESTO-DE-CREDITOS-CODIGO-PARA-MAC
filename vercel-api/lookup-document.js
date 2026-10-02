import { applyCors, enforceDistributedRateLimit, requireSecret } from './_security.js';

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.json(body);
};

const NOMES_MASCULINOS = new Set([
  "jose", "joao", "pedro", "manuel", "antonio", "francisco", "domingos", "mario",
  "paulo", "carlos", "adao", "afonso", "agostinho", "alberto", "bernardo",
  "daniel", "david", "eduardo", "emanuel", "ernesto", "fernando", "gabriel",
  "garcia", "helder", "isaac", "jacinto", "joaquim", "jorge", "julio",
  "lourenco", "lucas", "luis", "marcos", "miguel", "moises", "nelson",
  "osvaldo", "rafael", "raul", "ricardo", "roberto", "rui", "salomao",
  "samuel", "sebastiao", "simao", "tomas", "vasco", "victor", "vitor", "abel",
  "adilson", "edson", "wilson", "gerson", "anderson", "kelson", "milton",
  "elton", "dionisio", "cristovao", "bento", "faustino", "feliciano", "filipe",
  "gaspar", "henrique", "andre", "armando", "augusto", "avelino", "baltazar",
  "casimiro", "celestino", "constantino", "diogo", "estevao", "eugenio",
  "evaristo", "ezequiel", "geraldo", "gil", "gregorio", "guilherme", "hugo",
  "isaias", "jaime", "jeremias", "job", "jonas", "leandro", "leonardo", "lino",
  "marcelino", "martinho", "mateus", "matias", "narciso", "nicolau", "noe",
  "octavio", "pascoal", "patricio", "paulino", "quintino", "romao", "rogerio",
  "rodrigo", "ruben", "salvador", "serafim", "silvino", "teodoro", "timoteo",
  "urbano", "valentim", "venancio", "vicente", "xavier", "zacarias", "luca",
  "jonata", "josue"
]);

const NOMES_FEMININOS = new Set([
  "maria", "ana", "josefa", "teresa", "isabel", "luisa", "catarina", "domingas",
  "madalena", "veronica", "cristina", "esperanca", "felismina", "rosa", "joana",
  "marta", "ruth", "rute", "ester", "raquel", "beatriz", "ines", "lurdes",
  "fatima", "conceicao", "encarnacao", "anunciacao", "assuncao", "graca",
  "adelaide", "agostinha", "albertina", "amelia", "angela", "antonia",
  "aurora", "balbina", "barbara", "benedita", "bernarda", "brigida", "carmen",
  "carolina", "cecilia", "celeste", "clara", "claudia", "constanca", "deolinda",
  "dorotea", "elisa", "elisabete", "emilia", "eugenia", "eulalia", "eva",
  "filomena", "firmina", "florinda", "francisca", "gertrudes", "gloria",
  "helena", "henriqueta", "hortencia", "ilda", "irene", "jacinta", "joaquina",
  "judite", "julia", "juliana", "justina", "laura", "leonor", "lidia", "lucia",
  "luzia", "manuela", "margarida", "mariana", "marcelina", "matilde",
  "mercedes", "natalia", "olga", "olivia", "palmira", "paula", "paulina",
  "perpetua", "piedade", "prazeres", "regina", "rosalina", "rosaria", "sara",
  "silvia", "sofia", "susana", "teodora", "vitoria", "zulmira", "solange",
  "ivone", "edite", "arlete", "nilza", "neusa", "elsa", "sandra", "vanda",
  "wilma", "zita", "luz"
]);

const PROVINCIAS_BI = {
  BO: "Bengo", BE: "Benguela", BI: "Bié", CA: "Cabinda", CC: "Quando Cubango",
  CN: "Cunene", HA: "Huambo", HL: "Huíla", KN: "Kwanza Norte", KS: "Kwanza Sul",
  LN: "Lunda Norte", LS: "Lunda Sul", LA: "Luanda", ML: "Malanje", MO: "Moxico",
  NE: "Namibe", UI: "Uíge", ZA: "Zaire"
};

function inferirProvinciaDoBI(biNumero) {
  const match = (biNumero || "").toUpperCase().match(/\d{9}([A-Z]{2})\d{3}/);
  if (!match) return "";
  const code = match[1];
  return PROVINCIAS_BI[code] ? `Província de ${PROVINCIAS_BI[code]}, Angola` : "";
}

function detetarGeneroPorNome(nomeCompleto) {
  const primeiro = String(nomeCompleto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)[0] ?? "";
  if (primeiro.length < 3) return null;

  if (NOMES_MASCULINOS.has(primeiro)) return "M";
  if (NOMES_FEMININOS.has(primeiro)) return "F";

  if (primeiro.endsWith("cao")) return "F";
  if (primeiro.endsWith("son") || primeiro.endsWith("ton")) return "M";
  if (primeiro.endsWith("a") || primeiro.endsWith("as")) return "F";
  if (primeiro.endsWith("o") || primeiro.endsWith("os") || primeiro.endsWith("u") || primeiro.endsWith("or") || primeiro.endsWith("el")) return "M";

  return null;
}

function normalizarChaveConsulta(chave) {
  return String(chave || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function extrairValorConsulta(origem, nomes) {
  const nomesNormalizados = new Set(nomes.map(normalizarChaveConsulta));
  const visitados = new Set();
  const pendentes = [origem];

  while (pendentes.length > 0) {
    const atual = pendentes.shift();
    if (!atual || typeof atual !== "object") continue;
    if (visitados.has(atual)) continue;
    visitados.add(atual);

    if (Array.isArray(atual)) {
      pendentes.push(...atual);
      continue;
    }

    const rotulo = atual.campo ?? atual.label ?? atual.nome ?? atual.name ?? atual.chave ?? atual.key;
    if (
      typeof rotulo === "string" &&
      nomesNormalizados.has(normalizarChaveConsulta(rotulo))
    ) {
      const valorRotulado = atual.valor ?? atual.value ?? atual.conteudo ?? atual.content ?? atual.data;
      if (valorRotulado !== undefined && valorRotulado !== null && valorRotulado !== "") {
        return valorRotulado;
      }
    }

    for (const [chave, valor] of Object.entries(atual)) {
      if (
        nomesNormalizados.has(normalizarChaveConsulta(chave)) &&
        valor !== undefined &&
        valor !== null &&
        valor !== ""
      ) {
        return valor;
      }
      if (valor && typeof valor === "object") {
        pendentes.push(valor);
      }
    }
  }

  return null;
}

function normalizarDataConsulta(valor) {
  if (valor === undefined || valor === null || valor === "") return null;

  if (typeof valor === "object") {
    const valorInterno = extrairValorConsulta(valor, ["date", "data", "value", "valor", "formatted", "formatado"]);
    return valorInterno === valor ? null : normalizarDataConsulta(valorInterno);
  }

  if (typeof valor === "number" && Number.isFinite(valor)) {
    const ms = valor < 10_000_000_000 ? valor * 1000 : valor;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  const validarPartes = (ano, mes, dia) => {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (
      data.getUTCFullYear() !== ano ||
      data.getUTCMonth() !== mes - 1 ||
      data.getUTCDate() !== dia
    ) {
      return null;
    }
    return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  };

  const ymd = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (ymd) {
    return validarPartes(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  const dmy = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D|$)/);
  if (dmy) {
    return validarPartes(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const monthMap = {
    jan: "01", janeiro: "01", fev: "02", fevereiro: "02",
    mar: "03", marco: "03", março: "03", abr: "04", abril: "04",
    mai: "05", maio: "05", jun: "06", junho: "06",
    jul: "07", julho: "07", ago: "08", agosto: "08",
    set: "09", setembro: "09", out: "10", outubro: "10",
    nov: "11", novembro: "11", dez: "12", dezembro: "12"
  };
  const textMatch = texto.match(/(\d{1,2})\s*(?:de|-|\/)?\s*([a-zA-ZçÇáéíóúÁÉÍÓÚ]+)\s*(?:de|-|\/)?\s*(\d{4})/i);
  if (textMatch) {
    const d = textMatch[1].padStart(2, "0");
    const mStr = textMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3);
    const m = monthMap[mStr] || "01";
    return `${textMatch[3]}-${m}-${d}`;
  }

  const parsed = new Date(texto);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function calcularIdade(dataNascimento) {
  if (!dataNascimento) return null;
  const iso = String(dataNascimento).slice(0, 10);
  const nascimento = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aniversarioJaPassou =
    hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
  if (!aniversarioJaPassou) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

function normalizeGender(raw) {
  if (!raw) return "";
  const g = String(raw).trim().toUpperCase();
  if (g.startsWith("M") || g.includes("MASC") || g === "HOMEM" || g === "H") return "M";
  if (g.startsWith("F") || g.includes("FEM") || g === "MULHER") return "F";
  if (g === "OUTRO" || g === "OTHER") return "Outro";
  return g;
}

function normalizeMarital(raw) {
  if (!raw) return "";
  const s = String(raw).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.includes("SOLTEIR")) return "SOLTEIRO";
  if (s.includes("CASAD")) return "CASADO";
  if (s.includes("DIVORC")) return "DIVORCIADO";
  if (s.includes("VIUV")) return "VIUVO";
  if (s.includes("UNIAO") || s.includes("FACTO")) return "UNIAO_DE_FACTO";
  return s;
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'GET') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!process.env.DATABASE_URL) return send(res, 503, { success: false, message: 'Consulta de documentos ainda não configurada.' });
  try {
    const { neon } = await import('@neondatabase/serverless');
    const client = neon(process.env.DATABASE_URL);
    const sql = (text, params) => client.query(text, params);
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 30, windowMs: 60_000, scope: 'lookup' })) return;
  } catch (error) {
    console.error('[lookup][rate-limit]', error);
    return send(res, 503, { success: false, message: 'O controlo de acesso está indisponível.' });
  }
  // Aceita a chave dedicada de consulta ou a chave mestra usada pelo painel Tango Master.
  const authorized = requireSecret(req, process.env.TANGO_LOOKUP_API_KEY) ||
    requireSecret(req, process.env.TANGO_MASTER_SECRET, 'x-master-secret');
  if (!authorized) return send(res, 401, { success: false, message: 'Autenticação obrigatória.' });

  const document = String(req.query?.document || '').trim().toUpperCase().replace(/\s+/g, '');
  const type = String(req.query?.type || 'SINGULAR').toUpperCase();
  const isCompany = type === 'COLECTIVO';
  if (!/^[0-9A-Z]{9,20}$/.test(document)) {
    return send(res, 400, { success: false, message: 'Número de documento inválido.' });
  }

  const encoded = encodeURIComponent(document);
  const endpoints = isCompany
    ? [
        { url: `https://joaotomas.elprimesolution.com/api/gateway/consulta-bi/consultar/${encoded}`, source: 'João Tomás API' },
        { url: `https://consulta.edgarsingui.ao/consultar/${encoded}/nif`, source: 'Consulta NIF Angola' },
        { url: `https://angolaapi.onrender.com/api/v1/validate/nif/${encoded}`, source: 'Angola API' },
        { url: `https://angolaapi.herokuapp.com/api/v1/validate/nif/${encoded}`, source: 'Angola API' }
      ]
    : [
        { url: `https://joaotomas.elprimesolution.com/api/gateway/consulta-bi/consultar/${encoded}`, source: 'João Tomás API' },
        { url: `https://joaotomas.elprimesolution.com/api/consulta-bi/${encoded}`, source: 'João Tomás API' },
        { url: `https://consulta.edgarsingui.ao/consultar/${encoded}/bilhete`, source: 'Consulta BI Angola' },
        { url: `https://consulta.edgarsingui.ao/consultar/${encoded}`, source: 'Consulta BI Angola' },
        { url: `https://angolaapi.onrender.com/api/v1/validate/bi/${encoded}`, source: 'Angola API' },
        { url: `https://angolaapi.herokuapp.com/api/v1/validate/bi/${encoded}`, source: 'Angola API' }
      ];

  const merged = {
    name: '',
    address: '',
    birthDate: '',
    age: undefined,
    issueDate: '',
    expiryDate: '',
    gender: '',
    maritalStatus: '',
    fatherName: '',
    motherName: '',
    source: ''
  };

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Tango-Gestao-Creditos/3.0' },
        signal: AbortSignal.timeout(8_000),
        redirect: 'follow'
      });
      if (!response.ok) continue;
      const rawJson = await response.json().catch(() => null);
      if (!rawJson || rawJson?.error === true || rawJson?.success === false) continue;

      const conteudo = rawJson.data && typeof rawJson.data === "object" && !Array.isArray(rawJson.data)
        ? rawJson.data
        : {};
      const data = { ...rawJson, ...conteudo };

      const name = extrairValorConsulta(data, [
        'name', 'nome', 'full_name', 'fullname', 'nome_completo', 'nomeCompleto', 
        'razao_social', 'razaoSocial', 'designacao', 'titular'
      ]);
      if (name && !merged.name) {
        merged.name = String(name).trim().toUpperCase();
        merged.source = endpoint.source;
      }

      const rawBirth = extrairValorConsulta(data, [
        'birth_date', 'data_de_nascimento', 'data_nascimento', 'nascimento', 
        'data_nasc', 'dt_nascimento', 'dt_nasc', 'birthdate', 'birthDate', 'born', 'dataNasc'
      ]);
      const birthDate = normalizarDataConsulta(rawBirth);
      if (birthDate && !merged.birthDate) {
        merged.birthDate = birthDate;
        const calcAge = calcularIdade(birthDate);
        if (calcAge !== null) merged.age = calcAge;
      }

      const rawAge = extrairValorConsulta(data, ['idade', 'age', 'anos']);
      if (rawAge !== undefined && rawAge !== null && Number(rawAge) > 0 && !merged.age) {
        merged.age = Number(rawAge);
      }

      const rawIssue = extrairValorConsulta(data, [
        'issue_date', 'issued_at', 'issued_on', 'issuance_date', 'date_of_issue', 
        'data_emissao', 'emissao_data', 'emissao', 'data_de_emissao', 'data_emissao_bi', 
        'emissao_bi', 'data_expedicao', 'expedicao_data', 'expedicao', 'data_registo'
      ]);
      const issueDate = normalizarDataConsulta(rawIssue);
      if (issueDate && !merged.issueDate) {
        merged.issueDate = issueDate;
      }

      const rawExpiry = extrairValorConsulta(data, [
        'expiry_date', 'expiration_date', 'expires_at', 'expire_date', 'valid_until', 
        'validity_date', 'date_of_expiry', 'data_caducidade', 'caducidade_data', 
        'caducidade', 'data_validade', 'validade_data', 'validade', 'data_de_validade', 
        'data_fim_validade', 'data_validade_bi', 'validade_bi', 'fim_validade', 
        'data_expiracao', 'expiracao', 'data_vencimento', 'vencimento', 'data_exp'
      ]);
      const expiryDate = normalizarDataConsulta(rawExpiry);
      if (expiryDate && !merged.expiryDate) {
        merged.expiryDate = expiryDate;
      }

      const rawAddress = extrairValorConsulta(data, [
        'morada', 'residencia', 'endereco', 'address', 'localidade', 'domicilio'
      ]) || [
        extrairValorConsulta(data, ['bairro', 'neighborhood']),
        extrairValorConsulta(data, ['municipio', 'municipality']),
        extrairValorConsulta(data, ['provincia', 'province']),
        extrairValorConsulta(data, ['naturalidade'])
      ].filter(Boolean).join(', ');

      if (rawAddress && !merged.address) {
        merged.address = typeof rawAddress === 'string'
          ? rawAddress.trim()
          : typeof rawAddress === 'object'
            ? Object.values(rawAddress).filter(v => typeof v === 'string' && v.trim()).join(', ')
            : '';
      }

      const rawGender = extrairValorConsulta(data, ['gender', 'genero', 'sexo', 'sex', 'genero_descricao', 'sexo_descricao']);
      const gender = normalizeGender(rawGender);
      if (gender && !merged.gender) {
        merged.gender = gender;
      }

      const rawMarital = extrairValorConsulta(data, ['marital_status', 'maritalStatus', 'estado_civil', 'estadoCivil', 'estado_civil_descricao']);
      const maritalStatus = normalizeMarital(rawMarital);
      if (maritalStatus && !merged.maritalStatus) {
        merged.maritalStatus = maritalStatus;
      }

      const rawFather = extrairValorConsulta(data, ['father', 'father_name', 'pai', 'nome_pai', 'pai_nome_completo']);
      if (rawFather && !merged.fatherName) {
        merged.fatherName = String(rawFather).trim();
      }

      const rawMother = extrairValorConsulta(data, ['mother', 'mother_name', 'mae', 'nome_mae', 'mae_nome_completo']);
      if (rawMother && !merged.motherName) {
        merged.motherName = String(rawMother).trim();
      }

      if (merged.name && merged.birthDate && merged.gender && merged.address && merged.expiryDate) {
        break;
      }
    } catch (error) {
      console.warn('[lookup-document]', endpoint.url, error?.message || error);
    }
  }

  if (merged.name) {
    if (!merged.gender) {
      const detectedGender = detetarGeneroPorNome(merged.name);
      if (detectedGender) merged.gender = detectedGender;
    }
    if (!merged.address && !isCompany) {
      merged.address = inferirProvinciaDoBI(document);
    }
    if (merged.birthDate && (!merged.age || merged.age === 0)) {
      const calcAge = calcularIdade(merged.birthDate);
      if (calcAge !== null) merged.age = calcAge;
    }

    return send(res, 200, { success: true, ...merged, source: merged.source || 'Consulta Angola' });
  }

  return send(res, 404, {
    success: false,
    message: 'Dados não encontrados ou serviço oficial temporariamente indisponível.'
  });
}
