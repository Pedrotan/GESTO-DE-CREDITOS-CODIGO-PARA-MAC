import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/componentes/ui/dialog";
import { Button } from "@/componentes/ui/button";
import { Download, PartyPopper, Share2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/bibliotecas/formatters";
import { CompanySettings } from "@/tipos/base-dados";
import jsPDF from '@/bibliotecas/pdf-documento';
import { drawContactFooter, getCompanySettings } from '@/bibliotecas/pdf';

interface DebtSettlementModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientName: string;
    creditId: string;
    amountPaid: number;
    companySettings: CompanySettings;
}

export function DebtSettlementModal({
    isOpen,
    onClose,
    clientName,
    creditId,
    amountPaid,
    companySettings
}: DebtSettlementModalProps) {

    const handleDownloadPdf = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // --- Colors do Modelo de Referência ---
        const primaryColor = [243, 112, 33]; // #F37021 (Laranja Corporativo de Referência)
        const secondaryColor = [43, 45, 47]; // #2B2D2F (Carvão Escuro de Referência)
        const darkText = [43, 45, 47];
        const lightText = [100, 116, 139];
        const white = [255, 255, 255];

        // --- Header Background ---
        doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.rect(0, 0, pageWidth, 55, "F");

        // Accent stripe Laranja Corporativo
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 52, pageWidth, 3, "F");

        // --- Header Content ---
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(28);
        doc.setFont("helvetica", "bold");
        doc.text("PARABÉNS!", 20, 24);

        doc.setTextColor(white[0], white[1], white[2]);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text("CRÉDITO TOTALMENTE", 20, 34);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("LIQUIDADO COM SUCESSO", 20, 44);

        // Badge Icon
        const badgeX = pageWidth - 35;
        const badgeY = 27;
        doc.setFillColor(255, 255, 255);
        doc.circle(badgeX, badgeY, 15, "F");
        doc.setLineWidth(1);
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.circle(badgeX, badgeY, 13.5, "S");

        doc.setFontSize(16);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("helvetica", "bold");
        doc.text("OK", badgeX, badgeY + 2, { align: "center" });

        // --- Body Content ---
        let currentY = 75;

        // Greeting
        doc.setFontSize(20);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.setFont("helvetica", "bold");
        doc.text(`Estimado(a) ${clientName}`, pageWidth / 2, currentY, { align: "center" });

        currentY += 15;

        // Main Message
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        const msg = "Temos o prazer de confirmar que o seu crédito foi totalmente liquidado. A sua pontualidade é a nossa maior satisfação.";
        const splitMsg = doc.splitTextToSize(msg, 160);
        doc.text(splitMsg, pageWidth / 2, currentY, { align: "center" });

        currentY += 25;

        // Info Box (New Credit Opportunity)
        doc.setFillColor(255, 247, 237); // Orange-50
        doc.setDrawColor(253, 186, 116); // Orange-300
        doc.setLineWidth(0.5);
        doc.roundedRect(25, currentY, pageWidth - 50, 35, 3, 3, "FD");

        const boxTextY = currentY + 12;
        doc.setFontSize(11);
        doc.setTextColor(154, 52, 18); // Orange-900
        doc.setFont("helvetica", "bold");
        doc.text("Novas Oportunidades Esperam por Si!", pageWidth / 2, boxTextY, { align: "center" });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Durante os próximos 7 dias, poderá solicitar um novo crédito com condições exclusivas.", pageWidth / 2, boxTextY + 10, { align: "center" });

        currentY += 50;

        // --- Credit Details (The "Receipt" look) ---
        doc.setFontSize(12);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.setFont("helvetica", "bold");
        doc.text("Detalhes da Liquidação", 25, currentY);

        currentY += 8;
        doc.setDrawColor(229, 231, 235); // Gray-200
        doc.line(25, currentY, pageWidth - 25, currentY);
        currentY += 10;

        // Grid for details
        const col1Ex = 25;
        const col2Ex = 100;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.text("Referência do Crédito:", col1Ex, currentY);
        doc.text("Valor Liquidado:", col2Ex, currentY);

        currentY += 7;

        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        // A referência (ex.: CR-<uuid>) é quebrada dentro da coluna para não tocar no valor ao lado.
        const referenceLines = doc.splitTextToSize(creditId, col2Ex - col1Ex - 6) as string[];
        doc.text(referenceLines, col1Ex, currentY);
        doc.setFontSize(12);

        doc.setTextColor(22, 163, 74); // Green-600
        doc.text(formatCurrency(amountPaid), col2Ex, currentY);

        currentY += 21 + (referenceLines.length - 1) * 4;

        // --- Benefits List ---
        doc.setFontSize(12);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.setFont("helvetica", "bold");
        doc.text("Benefícios de Cliente Exemplar:", 25, currentY);

        currentY += 10;

        const benefits = [
            "Acesso prioritário a novos créditos",
            "Taxas de juro preferenciais",
            "Atendimento personalizado e suporte dedicado",
            "Histórico de crédito positivo garantido"
        ];

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);

        benefits.forEach(benefit => {
            // Draw a small bullet circle
            doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
            doc.circle(27, currentY - 1, 1, "F");
            doc.text(benefit, 32, currentY);
            currentY += 8;
        });

        // --- Footer ---
        // Acima da linha de contactos (telefone, web, email e localização) desenhada no fundo da página.
        const footerY = Math.max(currentY + 8, pageHeight - 30);
        doc.setDrawColor(229, 231, 235);
        doc.line(20, footerY - 6, pageWidth - 20, footerY - 6);

        doc.setFontSize(8);
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.text(`${companySettings.name}`, pageWidth / 2, footerY, { align: "center" });
        doc.text(`Certificado emitido em ${formatDate(new Date())}`, pageWidth / 2, footerY + 5, { align: "center" });

        drawContactFooter(doc, getCompanySettings(companySettings));
        doc.save(`Certificado-Liquidacao-${creditId}.pdf`);
    };


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md text-center">
                <div className="flex justify-center mb-4">
                    <div className="bg-green-100 p-4 rounded-full animate-bounce">
                        <PartyPopper className="h-10 w-10 text-green-600" />
                    </div>
                </div>

                <DialogHeader>
                    <DialogTitle className="text-2xl text-center text-green-700">Parabéns!</DialogTitle>
                    <DialogDescription className="text-center text-lg pt-2">
                        Crédito Totalmente Liquidado com Sucesso
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <p className="text-muted-foreground">
                        O crédito <strong>{creditId}</strong> de <strong>{clientName}</strong> foi totalmente pago.
                    </p>
                    <p className="text-sm text-green-600 font-medium bg-green-50 p-3 rounded-lg">
                        Baixe o certificado abaixo para enviar ao cliente via WhatsApp ou E-mail.
                    </p>
                </div>

                <DialogFooter className="flex-col sm:flex-col gap-2">
                    <Button className="w-full gap-2 bg-green-600 hover:bg-green-700" onClick={handleDownloadPdf}>
                        <Download className="h-4 w-4" />
                        Baixar Certificado para o Cliente
                    </Button>
                    <Button variant="outline" className="w-full" onClick={onClose}>
                        Fechar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

