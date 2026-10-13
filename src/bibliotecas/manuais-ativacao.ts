import jsPDF from '@/bibliotecas/pdf-documento';

// Manuais em PDF da activação das licenças (Tango Master):
//  - gerarManualProcesso: para o administrador, todo o processo (empresa, chave, activação, gestão, problemas);
//  - gerarManualCliente: para enviar ao cliente, passo a passo com capturas de ecrã reais do Tango ERP.

const NAVY: [number, number, number] = [15, 28, 71];
const ORANGE: [number, number, number] = [243, 112, 33];
const TEXT: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const SUPPORT = 'Suporte Tango: +244 941 537 486 · suporte@tangogestao.ao';
const COMPANY = 'DIGITAL NORTE - Comércio e Prestação de Serviços, (SU), Lda · N’dalatando, Cuanza Norte';

type Box = { fill: [number, number, number]; border: [number, number, number]; text: [number, number, number] };
const BOXES: Record<'info' | 'warn' | 'ok', Box> = {
    info: { fill: [239, 246, 255], border: [191, 219, 254], text: [30, 58, 138] },
    warn: { fill: [255, 251, 235], border: [253, 230, 138], text: [120, 53, 15] },
    ok: { fill: [236, 253, 245], border: [167, 243, 208], text: [6, 78, 59] },
};

/** Pequeno motor de paginação: cabeçalho e rodapé em todas as páginas, quebras automáticas. */
class Manual {
    doc = new jsPDF({ unit: 'mm', format: 'a4' });
    width = this.doc.internal.pageSize.getWidth();
    height = this.doc.internal.pageSize.getHeight();
    left = 18;
    right = this.width - 18;
    y = 0;
    constructor(private title: string) {
        this.decorate();
    }
    get contentWidth() { return this.right - this.left; }
    private decorate() {
        const { doc } = this;
        doc.setFillColor(...NAVY);
        doc.rect(0, 0, this.width, 20, 'F');
        doc.setFillColor(...ORANGE);
        doc.rect(0, 20, this.width, 1.2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
        doc.text('Tango Gestão de Créditos', this.left, 12.5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(203, 213, 225);
        doc.text(this.title, this.right, 12.5, { align: 'right' });
        doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
        doc.line(this.left, this.height - 14, this.right, this.height - 14);
        doc.setFontSize(7.5); doc.setTextColor(...MUTED);
        doc.text(SUPPORT, this.left, this.height - 9);
        doc.text(COMPANY, this.left, this.height - 5.5);
        doc.text(`Página ${doc.getNumberOfPages()}`, this.right, this.height - 9, { align: 'right' });
        this.y = 30;
    }
    ensure(space: number) {
        if (this.y + space <= this.height - 18) return;
        this.doc.addPage();
        this.decorate();
    }
    cover(title: string, subtitle: string, lines: string[] = []) {
        const { doc } = this;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...NAVY);
        const wrapped = doc.splitTextToSize(title, this.contentWidth) as string[];
        doc.text(wrapped, this.left, this.y + 6);
        this.y += 6 + wrapped.length * 9;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...MUTED);
        const sub = doc.splitTextToSize(subtitle, this.contentWidth) as string[];
        doc.text(sub, this.left, this.y);
        this.y += sub.length * 5.5 + 3;
        for (const line of lines) {
            doc.setFontSize(10); doc.setTextColor(...TEXT);
            doc.text(line, this.left, this.y);
            this.y += 5.5;
        }
        doc.setFillColor(...ORANGE);
        doc.rect(this.left, this.y + 1, 30, 1.2, 'F');
        this.y += 9;
    }
    heading(text: string) {
        this.ensure(16);
        this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(13); this.doc.setTextColor(...NAVY);
        this.doc.text(text, this.left, this.y + 4);
        this.y += 9;
    }
    paragraph(text: string, size = 10) {
        const { doc } = this;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...TEXT);
        const lines = doc.splitTextToSize(text, this.contentWidth) as string[];
        const lineHeight = size * 0.45;
        for (const line of lines) {
            this.ensure(lineHeight + 1);
            doc.text(line, this.left, this.y + 3);
            this.y += lineHeight;
        }
        this.y += 2.5;
    }
    bullets(items: string[]) {
        const { doc } = this;
        for (const item of items) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXT);
            const lines = doc.splitTextToSize(item, this.contentWidth - 6) as string[];
            this.ensure(lines.length * 4.6 + 1);
            doc.setFillColor(...ORANGE);
            doc.circle(this.left + 1.5, this.y + 2, 0.8, 'F');
            doc.text(lines, this.left + 5, this.y + 3);
            this.y += lines.length * 4.6 + 1.2;
        }
        this.y += 2;
    }
    box(text: string, kind: keyof typeof BOXES = 'info', title?: string) {
        const { doc } = this;
        const style = BOXES[kind];
        doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(text, this.contentWidth - 10) as string[];
        const height = lines.length * 4.4 + (title ? 6 : 0) + 7;
        this.ensure(height + 3);
        doc.setFillColor(...style.fill); doc.setDrawColor(...style.border); doc.setLineWidth(0.3);
        doc.roundedRect(this.left, this.y, this.contentWidth, height, 2, 2, 'FD');
        let y = this.y + 6;
        doc.setTextColor(...style.text);
        if (title) { doc.setFont('helvetica', 'bold'); doc.text(title, this.left + 5, y); y += 5.5; }
        doc.setFont('helvetica', 'normal');
        doc.text(lines, this.left + 5, y);
        this.y += height + 4;
    }
    keyBox(label: string, value: string) {
        const { doc } = this;
        this.ensure(24);
        doc.setFillColor(...NAVY);
        doc.roundedRect(this.left, this.y, this.contentWidth, 20, 2.5, 2.5, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(203, 213, 225);
        doc.text(label, this.left + 6, this.y + 7);
        doc.setFont('courier', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
        doc.text(value, this.left + 6, this.y + 15);
        this.y += 25;
    }
    /** Altura que uma imagem vai ocupar (para manter um passo junto da sua captura). */
    imageHeight(dataUrl: string, maxWidth = this.contentWidth, caption?: string) {
        const props = this.doc.getImageProperties(dataUrl);
        const width = Math.min(maxWidth, this.contentWidth);
        return Math.min((props.height / props.width) * width, this.height - 48) + (caption ? 11 : 5);
    }
    step(number: number, title: string, text: string, keepWith = 0) {
        const { doc } = this;
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(text, this.contentWidth - 14) as string[];
        this.ensure(12 + lines.length * 4.6 + keepWith);
        doc.setFillColor(...ORANGE);
        doc.circle(this.left + 4.5, this.y + 4, 4.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(255, 255, 255);
        doc.text(String(number), this.left + 4.5, this.y + 5.6, { align: 'center' });
        doc.setTextColor(...NAVY); doc.setFontSize(11.5);
        doc.text(title, this.left + 13, this.y + 5.4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXT);
        doc.text(lines, this.left + 13, this.y + 11);
        this.y += 11 + lines.length * 4.6 + 1;
    }
    image(dataUrl: string, maxWidth = this.contentWidth, caption?: string) {
        const { doc } = this;
        const props = doc.getImageProperties(dataUrl);
        let width = Math.min(maxWidth, this.contentWidth);
        let height = (props.height / props.width) * width;
        const maxHeight = this.height - 48;
        if (height > maxHeight) { height = maxHeight; width = (props.width / props.height) * height; }
        this.ensure(height + (caption ? 8 : 4));
        const x = this.left + (this.contentWidth - width) / 2;
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
        doc.addImage(dataUrl, 'JPEG', x, this.y, width, height, undefined, 'FAST');
        doc.roundedRect(x, this.y, width, height, 1, 1, 'S');
        this.y += height + 2;
        if (caption) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MUTED);
            doc.text(caption, this.left + this.contentWidth / 2, this.y + 3, { align: 'center' });
            this.y += 6;
        }
        this.y += 3;
    }
    table(rows: [string, string][], firstWidth = 58) {
        const { doc } = this;
        for (const [first, second] of rows) {
            doc.setFontSize(9.5);
            const a = doc.splitTextToSize(first, firstWidth - 4) as string[];
            const b = doc.splitTextToSize(second, this.contentWidth - firstWidth - 4) as string[];
            const height = Math.max(a.length, b.length) * 4.4 + 4;
            this.ensure(height);
            doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
            doc.line(this.left, this.y + height, this.right, this.y + height);
            doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
            doc.text(a, this.left + 1, this.y + 4.5);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT);
            doc.text(b, this.left + firstWidth, this.y + 4.5);
            this.y += height;
        }
        this.y += 4;
    }
    save(fileName: string) { this.doc.save(fileName); }
}

const today = () => new Date().toLocaleDateString('pt-AO');
const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** Manual para o cliente: como activar o Tango ERP com a chave recebida (capturas de ecrã reais). */
export const gerarManualCliente = async (options: { companyName?: string; licenseKey?: string } = {}) => {
    const { MANUAL_IMAGES: img } = await import('./manuais-imagens');
    const m = new Manual('Manual de activação');
    m.cover('Como activar o Tango Gestão de Créditos', 'Siga estes passos no computador onde o Tango ERP está instalado. Demora menos de 2 minutos.', [
        ...(options.companyName ? [`Empresa: ${options.companyName}`] : []),
        `Data: ${today()}`,
    ]);
    if (options.licenseKey) m.keyBox('A SUA CHAVE DE LICENÇA', options.licenseKey);
    else m.box('A chave de licença tem o formato TANGO-XXXX-XXXX-XXXX-XXXX e foi-lhe enviada pela equipa Tango (por WhatsApp ou e-mail).', 'info', 'A sua chave de licença');

    m.heading('Antes de começar');
    m.bullets([
        'Tenha a chave de licença à mão (TANGO-XXXX-XXXX-XXXX-XXXX).',
        'O computador tem de estar ligado à Internet durante a activação.',
        'Entre com um utilizador Administrador do sistema.',
    ]);

    m.step(1, 'Abra o Tango ERP e inicie sessão', 'Abra o Tango Gestão de Créditos e entre com o seu utilizador e palavra-passe de administrador.', m.imageHeight(img.iniciarSessao, 150, 'Ecrã «Iniciar Sessão»'));
    m.image(img.iniciarSessao, 150, 'Ecrã «Iniciar Sessão»');

    m.step(2, 'Abra Configurações > Licença', 'No menu do lado esquerdo, desça até «Configurações», clique para abrir e escolha «Licença».', m.imageHeight(img.menuLicenca, 55, 'Menu lateral: Configurações > Licença'));
    m.image(img.menuLicenca, 55, 'Menu lateral: Configurações > Licença');

    m.step(3, 'Veja a página «Detalhes da Licença»', 'Antes da activação, o estado aparece como «Inválida / Expirada» ou «Período de Demonstração». É normal.', m.imageHeight(img.paginaLicenca, 160, 'Página da licença antes da activação'));
    m.image(img.paginaLicenca, 160, 'Página da licença antes da activação');

    m.step(4, 'Cole a chave no campo «Chave de Licença Atual»', 'Clique no campo, apague o que lá estiver e cole a sua chave (Ctrl+V). Pode clicar no olho para ver o que escreveu. A chave aceita maiúsculas ou minúsculas, com ou sem traços.', m.imageHeight(img.colarChave, 120, 'Campo da chave preenchido (exemplo)'));
    m.image(img.colarChave, 120, 'Campo da chave preenchido (exemplo)');

    m.step(5, 'Clique em «Validar e Salvar Licença»', 'O botão está no fundo da página, à direita. O sistema confirma a chave com o servidor Tango e regista este computador.', m.imageHeight(img.botaoValidar, 60, 'Botão «Validar e Salvar Licença»'));
    m.image(img.botaoValidar, 60, 'Botão «Validar e Salvar Licença»');

    m.step(6, 'Confirme que a licença ficou «Ativa»', 'O estado passa a «Ativa», com o plano e a data de validade. Está pronto: o sistema já pode ser usado normalmente.', m.imageHeight(img.licencaAtiva, 120, 'Licença activa'));
    m.image(img.licencaAtiva, 120, 'Licença activa');

    m.heading('Bom saber');
    m.bullets([
        'A licença é da empresa: active cada computador com a mesma chave (até ao número de computadores do seu plano).',
        'A versão web (no navegador) não pede chave: usa automaticamente a licença da empresa.',
        'O computador confirma a licença com o servidor ao abrir e uma vez por dia. Sem Internet, continua a funcionar até 7 dias.',
        'Se ficar mais de 7 dias sem Internet, o sistema passa a «só de leitura» até voltar a ligar-se. Os dados não se perdem.',
        'Não altere a data e a hora do computador: um relógio atrasado faz o sistema pedir nova validação.',
        'Trocou de computador? Peça ao suporte Tango para libertar o computador antigo e active o novo com a mesma chave.',
    ]);

    m.heading('Se aparecer uma mensagem');
    m.table([
        ['«Chave mal escrita»', 'Confira os caracteres. A chave tem 16 letras/números depois de «TANGO-». Copie-a de novo da mensagem recebida.'],
        ['«Esta chave não existe ou foi substituída»', 'Peça a chave actual ao suporte Tango.'],
        ['«Limite de computadores»', 'A licença já está activa no número máximo de computadores. Contacte o suporte para libertar um computador ou aumentar o plano.'],
        ['«Licença suspensa» ou «expirada»', 'Contacte o suporte Tango para regularizar ou renovar a licença.'],
        ['«Não foi possível contactar o servidor»', 'Verifique a ligação à Internet e tente de novo.'],
        ['«O relógio deste computador está atrasado»', 'Acerte a data e a hora do Windows e clique em «Validar agora».'],
    ]);

    m.heading('Primeira instalação');
    m.paragraph('Se o Tango ERP acabou de ser instalado, aparece primeiro o assistente de configuração. Escolha «Instalação principal», preencha os dados da empresa e crie o utilizador administrador. Depois siga os passos acima.');
    m.image(img.assistente, 150, 'Assistente de configuração (primeira instalação)');

    m.box('Precisa de ajuda? Ligue ou envie WhatsApp para +244 941 537 486 (suporte@tangogestao.ao). Tenha consigo o NIF da empresa.', 'ok', 'Suporte Tango');
    m.save(`Manual_Activacao_Tango${options.companyName ? `_${slug(options.companyName)}` : ''}.pdf`);
};

/** Manual para o administrador do Tango Master: o processo completo, da empresa à gestão das licenças. */
export const gerarManualProcesso = async () => {
    const m = new Manual('Processo de activação');
    m.cover('Licenças Tango: como funciona a activação', 'Guia do administrador do Tango Master: registar a empresa, emitir a chave, activar os computadores e gerir a licença.', [`Data: ${today()}`]);

    m.heading('Como funciona');
    m.bullets([
        'Cada empresa tem UMA licença, guardada no servidor Tango (a fonte única de verdade). O servidor decide se a licença está activa.',
        'A licença é identificada pela chave TANGO-XXXX-XXXX-XXXX-XXXX. A chave não contém datas nem plano: tudo vive no servidor, por isso pode renovar ou mudar o plano sem trocar a chave.',
        'Cada computador activado fica registado na licença (até ao máximo de computadores do plano).',
        'A versão web não pede chave: herda a licença da empresa. Se a licença estiver suspensa ou expirada, a web e a sincronização ficam bloqueadas.',
        'O Tango ERP confirma a licença ao abrir e uma vez por dia, e trabalha até 7 dias sem Internet. Depois disso fica só de leitura.',
    ]);

    m.heading('Passo a passo no Tango Master');
    m.step(1, 'Ligar o Master ao servidor', 'Em Empresas, confirme o URL do servidor (https://tangogestaoecreditos.tech) e a Chave Mestra. Use «Sincronizar Lista».');
    m.step(2, 'Registar a empresa', 'Em «Registar Empresa & Emitir Credencial de Acesso»: NIF (consulta automática do nome), validade do acesso e valor pago. O valor vem da Tabela de Preços do Master (escalão Empresarial) e pode ser ajustado.');
    m.step(3, 'Guardar a chave de licença', 'Ao cadastrar, o Master mostra a chave TANGO-… uma única vez (o servidor guarda só uma impressão digital). Copie-a. Se a perder, use «Nova chave» em «Licenças no servidor»: a antiga deixa de servir para novos computadores.');
    m.step(4, 'Enviar ao cliente', 'Envie a chave e o «Manual do cliente» (PDF com as capturas de ecrã). Para a versão web envie também o Código de Acesso (TG-…), o NIF e o link (botão WhatsApp ou Ficha PDF).');
    m.step(5, 'O cliente activa', 'No Tango ERP: Configurações > Licença > cola a chave > «Validar e Salvar Licença». O estado passa a «Ativa».');
    m.step(6, 'Confirmar no Master', 'Em «Licenças no servidor» > «Actualizar»: a empresa mostra os computadores em uso e o último contacto. O cartão «Máquinas Ativas» do painel conta só computadores activados e validados.');

    m.heading('Gerir uma licença («Gerir»)');
    m.table([
        ['Renovar', 'Escolha o período e o valor (da Tabela de Preços). A data de fim da licença e da empresa ficam iguais; o pagamento vai para a Contabilidade.'],
        ['Suspender / Reactivar', 'Bloqueia ou volta a abrir de imediato a sincronização e a versão web. O ERP avisa o utilizador.'],
        ['Mudar plano', 'Plano, escalão (Empresarial/Pessoal) e número de computadores. Os computadores já activados mantêm-se.'],
        ['Libertar computador', 'Quando o cliente troca de computador. O antigo deixa de renovar (funciona até 7 dias) e o lugar fica livre.'],
        ['Histórico', 'Tudo o que aconteceu: chaves emitidas, activações, recusas com o motivo, renovações, suspensões e computadores libertados, com data e IP.'],
    ], 42);

    m.heading('Dias restantes e cores');
    m.bullets(['Verde: mais de 30 dias.', 'Amarelo: 8 a 30 dias (prepare a renovação).', 'Vermelho: 7 dias ou menos.', 'Cinzento: expirada ou suspensa.']);

    m.heading('Chaves antigas (eyJ…)');
    m.paragraph('A «Emissão de Licença» do painel gera as chaves antigas, presas a uma máquina (começam por «eyJ»). Colam-se no mesmo sítio (Configurações > Licença). O «Histórico de Emissões» mostra o estado de cada uma: Activada, Por activar, Expirada, Revogada ou Migrada. Para empresas registadas em Empresas, prefira sempre a chave TANGO-…; use «Juntar chaves antigas» para fundir as antigas na licença da empresa.');
    m.box('Não gere um novo par de chaves RSA nas Configurações do Master: as chaves eyJ… emitidas antes deixariam de ser aceites. As chaves TANGO-… não dependem disso.', 'warn', 'Importante');

    m.heading('Problemas comuns');
    m.table([
        ['Limite de computadores', 'Gerir > Libertar o computador antigo, ou aumentar o número de computadores no plano.'],
        ['Licença expirada', 'Gerir > Renovar. O cliente fica activo de imediato (ao abrir o ERP ou em «Validar agora»).'],
        ['Chave perdida', 'Licenças no servidor > «Nova chave». Os computadores já activados continuam a funcionar.'],
        ['Cliente mais de 7 dias offline', 'O ERP fica só de leitura até ligar à Internet. Nada é apagado.'],
        ['Relógio atrasado', 'O cliente acerta a data/hora do Windows e clica «Validar agora».'],
        ['Web bloqueada', 'Verifique em «Gerir» se a licença está suspensa ou expirada.'],
    ], 50);

    m.heading('Tabela de Preços');
    m.paragraph('Os preços definidos em «Preços» são usados em todo o Master: emissão de licenças, cadastro e renovação de empresas e gestão das licenças. Preço = preço do plano × multiplicador Empresarial (se aplicável) × número de computadores.');
    m.save('Manual_Processo_Activacao_Tango.pdf');
};
