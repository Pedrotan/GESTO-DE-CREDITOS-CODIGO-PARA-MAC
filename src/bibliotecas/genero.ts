// Deteção automática do género a partir do primeiro nome (nomes angolanos e
// portugueses). Devolve null quando não há confiança suficiente — nesse caso o
// utilizador escolhe manualmente e a escolha nunca é sobrescrita.

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

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Etiqueta do estado civil no género correto.
const ESTADO_CIVIL_POR_GENERO: Record<string, { masculino: string; feminino: string }> = {
  solteiro: { masculino: "Solteiro", feminino: "Solteira" },
  casado: { masculino: "Casado", feminino: "Casada" },
  divorciado: { masculino: "Divorciado", feminino: "Divorciada" },
  viuvo: { masculino: "Viúvo", feminino: "Viúva" },
  uniao_de_facto: { masculino: "União de Facto", feminino: "União de Facto" },
};

export function estadoCivilPorGenero(estadoCivil?: string | null, genero?: string | null): string {
  const chave = normalizar(String(estadoCivil ?? ""));
  const entrada = ESTADO_CIVIL_POR_GENERO[chave];
  if (!entrada) return estadoCivil ? String(estadoCivil) : "—";
  return normalizar(String(genero ?? "")).startsWith("f") ? entrada.feminino : entrada.masculino;
}

export function detetarGeneroPorNome(nomeCompleto: string): "M" | "F" | null {
  const primeiro = normalizar(nomeCompleto).split(/\s+/)[0] ?? "";
  if (primeiro.length < 3) return null;

  if (NOMES_MASCULINOS.has(primeiro)) return "M";
  if (NOMES_FEMININOS.has(primeiro)) return "F";

  // Regras por sufixo (aplicadas apenas quando o nome não está nas listas).
  if (primeiro.endsWith("cao")) return "F"; // Conceição, Assunção…
  if (primeiro.endsWith("son") || primeiro.endsWith("ton")) return "M"; // Adilson, Milton…
  if (primeiro.endsWith("a") || primeiro.endsWith("as")) return "F";
  if (primeiro.endsWith("o") || primeiro.endsWith("os") || primeiro.endsWith("u") || primeiro.endsWith("or") || primeiro.endsWith("el")) return "M";

  return null;
}
