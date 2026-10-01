import { Client } from "@/tipos/credito";
import { CompanySettings } from "@/tipos/base-dados";
import { toast } from "@/ganchos/usar-toast";

export const ServicoEmail = {
    /**
     * Gera um template HTML premium inspirado no layout fornecido pelo utilizador
     */
    getPremiumTemplate: (client: Client, settings: CompanySettings, subtitle: string) => {
        // Converte primaryColor (que pode ser number[] do dashboard) para string Hex
        let primaryColor = "#F37021"; // Default Laranja Corporativo
        if (settings.primaryColor) {
            if (Array.isArray(settings.primaryColor) && settings.primaryColor.length >= 3) {
                const [r, g, b] = settings.primaryColor;
                primaryColor = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            } else if (typeof settings.primaryColor === 'string') {
                primaryColor = settings.primaryColor;
            }
        }

        const companyName = settings.name || "Tango Gestão de Créditos";
        const logo = settings.logo || "";
        const firstName = client.name.split(' ')[0];

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc; }
                    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
                    .header { padding: 30px; text-align: center; }
                    .hero { background: linear-gradient(135deg, ${primaryColor}, #c2410c); padding: 40px 30px; text-align: left; color: #ffffff; border-radius: 0 0 40px 0; margin-bottom: 30px; }
                    .hero h1 { font-size: 24px; margin: 0; line-height: 1.2; font-weight: 800; }
                    .content { padding: 0 30px 30px 30px; }
                    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 15px; }
                    .feature-list { list-style: none; padding: 0; margin: 25px 0; }
                    .feature-item { display: table; margin-bottom: 15px; }
                    .feature-icon { display: table-cell; vertical-align: top; width: 24px; padding-right: 15px; }
                    .feature-text { display: table-cell; vertical-align: top; font-size: 14px; }
                    .footer { background: #eff6ff; padding: 30px; text-align: left; position: relative; }
                    .agent-info { display: table; width: 100%; border-bottom: 1px solid #dbeafe; padding-bottom: 20px; margin-bottom: 20px; }
                    .agent-photo { display: table-cell; width: 60px; vertical-align: middle; }
                    .agent-photo img { width: 50px; height: 50px; border-radius: 25px; object-fit: cover; border: 2px solid white; }
                    .agent-details { display: table-cell; vertical-align: middle; padding-left: 15px; }
                    .agent-name { font-weight: 700; color: white; margin: 0; font-size: 16px; }
                    .agent-title { font-size: 12px; color: #bfdbfe; margin: 0; }
                    .social-links { text-align: center; margin-bottom: 20px; }
                    .social-link { display: inline-block; margin: 0 10px; text-decoration: none; color: white; background: ${primaryColor}; width: 32px; height: 32px; line-height: 32px; border-radius: 16px; font-size: 14px; }
                    .legal { font-size: 10px; color: #94a3b8; text-align: center; padding: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2 style="margin:0; color:${primaryColor}; font-weight: 800; letter-spacing: -0.5px;">${companyName.toLowerCase()} <span style="font-weight: 300; color: #64748b;">trial</span></h2>
                    </div>

                    <div class="hero">
                        <h1>Uma plataforma única para <span style="color: #fed7aa;">integrar e coordenar</span> todas as etapas da sua gestão de crédito.</h1>
                    </div>

                    <div class="content">
                        <p class="greeting">Olá, ${firstName}</p>
                        <p>Na <strong>${companyName}</strong>, entendemos os desafios da gestão financeira e trazemos soluções que simplificam e otimizam as suas operações diárias.</p>
                        <p>${subtitle}</p>

                        <h2 style="font-size: 20px; color: #2B2D2F; margin-top: 35px;">Com a ${companyName.toLowerCase()} você tem:</h2>
                        
                        <div class="feature-list">
                            <div class="feature-item">
                                <div class="feature-icon">🚀</div>
                                <div class="feature-text">Visão consolidada de contratos e fluxos de caixa em tempo real.</div>
                            </div>
                            <div class="feature-item">
                                <div class="feature-icon">🛡️</div>
                                <div class="feature-text">Auditoria Deep Scan com integridade garantida via Blockchain.</div>
                            </div>
                            <div class="feature-item">
                                <div class="feature-icon">📊</div>
                                <div class="feature-text">Análise de risco inteligente e rácio de endividamento automático.</div>
                            </div>
                            <div class="feature-item">
                                <div class="feature-icon">📝</div>
                                <div class="feature-text">Gestão centralizada de documentos e contratos digitais.</div>
                            </div>
                            <div class="feature-item">
                                <div class="feature-icon">⚙️</div>
                                <div class="feature-text">Processamento automático de faturas e conformidade fiscal (SAF-T).</div>
                            </div>
                            <div class="feature-item">
                                <div class="feature-icon">📱</div>
                                <div class="feature-text">Comunicação integrada via WhatsApp para lembretes e cobranças.</div>
                            </div>
                        </div>

                        <p>${firstName}, vamos agendar uma conversa curta para apresentar como a nossa tecnologia pode impulsionar o seu negócio.</p>
                        <p>Qual é a sua disponibilidade?</p>
                        <br>
                        <p>Aguardo o seu retorno.</p>
                        <p>Abraços,</p>
                    </div>

                    <div class="footer" style="background: ${primaryColor}; color: white;">
                        <div class="agent-info">
                            <div class="agent-photo">
                                <img src="https://ui-avatars.com/api/?name=Admin&background=ffffff&color=${primaryColor.replace('#', '')}" alt="Suporte">
                            </div>
                            <div class="agent-details">
                                <p class="agent-name">Gestão de Sucesso ao Cliente</p>
                                <p class="agent-title">Tango Gestão de Créditos Ecosystem</p>
                            </div>
                        </div>
                        
                        <div style="text-align: center;">
                             <div style="margin-bottom: 20px;">
                                <span style="display:inline-block; border: 1px solid rgba(255,255,255,0.3); padding: 5px 15px; border-radius: 4px; font-size: 14px;">🌐 ${settings.email || ''}</span>
                             </div>
                             <h3 style="margin: 10px 0; font-weight: 800;">${companyName.toLowerCase()}</h3>
                        </div>
                    </div>

                    <div class="legal">
                        Enviado por ${companyName}<br>
                        ${settings.address || (settings.location ? 'Angola, ' + settings.location : 'Angola, Luanda')}<br>
                        Se deseja não receber mais mensagens, responda a este email.
                    </div>
                </div>
            </body>
            </html>
        `;
    },

    /**
     * Prepara e abre o cliente de email padrão para enviar uma mensagem de boas-vindas
     */
    sendWelcomeEmail: async (client: Client, settings: CompanySettings, pdfBase64?: string) => {
        if (!client.email) {
            toast({
                title: "Email não disponível",
                description: "O cliente não possui um endereço de email registado.",
                variant: "destructive"
            });
            return;
        }

        // Verifica se SMTP está configurado
        if (settings.smtpHost && settings.smtpUser && settings.smtpPassword) {
            const subject = `Bem-vindo à ${settings.name} - Informações da Sua Conta`;
            const htmlBody = ServicoEmail.getPremiumTemplate(client, settings, "Em anexo, enviamos a sua ficha de cliente com todos os limites e detalhes aprovados.");

            const attachments = pdfBase64 ? [{
                filename: `Ficha_Cliente_${client.name.replace(/\s+/g, '_')}.pdf`,
                content: pdfBase64.split(',')[1], // Remove prefixo data:application/pdf;base64,
                encoding: 'base64'
            }] : [];

            toast({ title: "Enviando email...", description: "Por favor aguarde." });

            try {
                const result = await (window as any).electronAPI.sendEmail({
                    smtpSettings: {
                        host: settings.smtpHost,
                        port: settings.smtpPort,
                        user: settings.smtpUser,
                        pass: settings.smtpPassword,
                        secure: settings.smtpSecure,
                        fromName: settings.smtpFromName || settings.name
                    },
                    emailOptions: {
                        to: client.email,
                        subject: subject,
                        html: htmlBody,
                        attachments: attachments
                    }
                });

                if (result.success) {
                    toast({ title: "Sucesso", description: "Email enviado com sucesso!", variant: "default" });
                } else {
                    let errorMessage = result.error;

                    if (result.error?.includes('534-5.7.9') ||
                        result.error?.includes('535-5.7.8') ||
                        result.error?.toLowerCase().includes('application-specific password required')) {
                        errorMessage = "Gmail: É obrigatório usar uma 'Senha de App'. Aceda a myaccount.google.com/apppasswords para gerar uma.";
                    }

                    toast({
                        title: "Erro no envio",
                        description: errorMessage,
                        variant: "destructive",
                        duration: 8000
                    });
                }
            } catch (e) {
                toast({ title: "Erro", description: "Falha ao comunicar com o servidor de email.", variant: "destructive" });
            }
            return;
        }

        // Fallback para e-mail nativo com anexo via EML
        const subject = `Bem-vindo à ${settings.name} - Informações da Sua Conta`;
        const bodyText = `Prezado(a) ${client.name},

Seja muito bem-vindo(a) à ${settings.name}! É um prazer tê-lo(a) como nosso parceiro(a).

Temos o compromisso de oferecer as melhores soluções em crédito com transparência, agilidade e segurança.

Estamos à disposição para qualquer dúvida ou solicitação.

Atenciosamente,
Equipa ${settings.name}`;

        try {
            const attachment = pdfBase64 ? {
                filename: `Ficha_Cliente_${client.name.replace(/\s+/g, '_')}.pdf`,
                content: pdfBase64.split(',')[1] // Apenas o base64
            } : undefined;

            await (window as any).electronAPI.composeNativeEmail({
                to: client.email,
                subject,
                body: bodyText,
                attachment
            });
        } catch (e) {
            console.error("Erro ao abrir email nativo:", e);
            // Fallback total se o EML falhar
            window.location.href = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
        }
    },

    /**
     * Prepara e abre o cliente de email padrão para enviar uma notificação genérica
     */
    sendNotificationEmail: (client: Client, settings: CompanySettings, title: string, message: string) => {
        if (!client.email) return;

        const subject = encodeURIComponent(`${settings.name} - ${title}`);
        const bodyText = `Prezado(a) ${client.name},\n\n${message}\n\nAtenciosamente,\n\nEquipa ${settings.name}\n${settings.email || ''}`;
        const body = encodeURIComponent(bodyText);

        window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;
    }
};
