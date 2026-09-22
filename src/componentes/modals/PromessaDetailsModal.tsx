import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Credit } from '@/tipos/credito';
import { generatePromessaContractPDF } from '@/bibliotecas/pdf';
import { CompanySettings } from '@/tipos/base-dados';
import { Eye, Download, Loader2 } from 'lucide-react';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';

interface PromessaDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    credit: Credit | null;
    client: any | null; // Pass the client object to pre-fill address etc.
    companySettings: CompanySettings;
    userName?: string;
}

const angolaData: Record<string, string[]> = {
    "Bengo": ["Ambriz", "Bula Atumba", "Dande", "Dembos", "Nambuangongo", "Pango Aluquém"],
    "Benguela": ["Baía Farta", "Benguela", "Bocoio", "Caimbambo", "Catumbela", "Chongorói", "Ganda", "Lobito", "Quisange", "Balombo"],
    "Bié": ["Andulo", "Camacupa", "Catabola", "Chitembo", "Chinguar", "Cuemba", "Cunhinga", "Cuíto", "Nharea"],
    "Cabinda": ["Belize", "Buco-Zau", "Cabinda", "Cacongo"],
    "Cuando": ["Menongue", "Cuchi", "Cuangar", "Calai"],
    "Cubango": ["Mavinga", "Dirico", "Rivungo", "Cuito Cuanavale"],
    "Cuanza Norte": ["Ambaca", "Banga", "Bolongongo", "Cambambe", "Cazengo", "Golungo Alto", "Gonguembo", "Lucala", "Quiculungo", "Samba Caju", "Aldeia Nova", "Caculo Cabaça", "Cerca", "Massangano", "Tango", "Luinga", "Terreiro"],
    "Cuanza Sul": ["Amboim", "Cassongue", "Cela", "Conda", "Ebo", "Libolo", "Mussende", "Porto Amboim", "Quibala", "Quilenda", "Seles", "Sumbe"],
    "Cunene": ["Cahama", "Cuanhama", "Curoca", "Cuvelai", "Namacunde", "Ombadja"],
    "Huambo": ["Bailundo", "Caála", "Catchiungo", "Chicala-Cholohanga", "Chinjenje", "Ecunha", "Huambo", "Londuimbali", "Longonjo", "Mungo", "Ucuma"],
    "Huíla": ["Caconda", "Cacula", "Caluquembe", "Chibia", "Chicomba", "Chipindo", "Cuvango", "Humpata", "Jamba", "Lubango", "Matala", "Quilengues", "Quipungo", "Gambos"],
    "Icolo e Bengo": ["Icolo e Bengo", "Quiçama"],
    "Luanda": ["Luanda", "Belas", "Cacuaco", "Cazenga", "Kilamba Kiaxi", "Talatona", "Viana"],
    "Lunda Norte": ["Capenda-Camulemba", "Caungula", "Chitato", "Cuilo", "Cuango", "Lubalo", "Lucapa", "Lóvua", "Xá-Muteba", "Cambulo"],
    "Lunda Sul": ["Cacolo", "Dala", "Muconda", "Saurimo"],
    "Malanje": ["Cacuso", "Calandula", "Cambundi-Catemba", "Cangandala", "Caombo", "Cuaba Nzoji", "Cunda-dia-Baze", "Luquembo", "Malanje", "Marimba", "Massango", "Mucari", "Quela", "Quirima"],
    "Moxico": ["Luena", "Camanongue", "Léua", "Lucusse", "Luchazes", "Cameia"],
    "Moxico Leste": ["Cazombo", "Alto Zambeze", "Bundas", "Lumeje"],
    "Namibe": ["Bibala", "Camucuio", "Moçâmedes", "Virei", "Tômbwa"],
    "Uíge": ["Alto Cauale", "Ambuila", "Bembe", "Buengas", "Bungo", "Damba", "Milunga", "Mucaba", "Negage", "Puri", "Quimbabele", "Quitexe", "Sanza Pombo", "Songo", "Uíge", "Maquela do Zombo"],
    "Zaire": ["Cuimba", "M'banza Kongo", "Noqui", "N'zeto", "Soyo", "Sumbula"]
};

export function PromessaDetailsModal({
    isOpen,
    onClose,
    credit,
    client,
    companySettings,
    userName
}: PromessaDetailsModalProps) {
    const [details, setDetails] = useState({
        fatherName: '',
        motherName: '',
        birthPlace: '',
        province: 'Luanda',
        municipality: 'Luanda',
        street: '',
        biIssueDate: '',
        isForeigner: false,
        nationality: '',
        documentType: 'Passaporte',
        documentNumber: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && client) {
            setDetails({
                fatherName: '',
                motherName: '',
                birthPlace: '',
                province: 'Luanda',
                municipality: 'Luanda',
                street: client.address || '',
                biIssueDate: '',
                isForeigner: false,
                nationality: '',
                documentType: 'Passaporte',
                documentNumber: client.nif || ''
            });
            setPreviewUrl(null);
        }
    }, [isOpen, client]);

    const handleProvinceChange = (province: string) => {
        const firstMuni = angolaData[province]?.[0] || '';
        setDetails({ ...details, province, municipality: firstMuni });
    };

    const handleGenerate = (action: 'preview' | 'download') => {
        if (!credit || !client) return;

        setIsLoading(true);
        try {
            const dataToUse = {
                ...credit,
                clientName: client.name,
                clientAddress: details.street || client.address,
                clientNif: details.isForeigner ? details.documentNumber : (client.nif || details.documentNumber),
                clientPhone: client.phone
            };

            const returnType = action === 'preview' ? 'blob' : 'save';

            const result = generatePromessaContractPDF(
                dataToUse,
                companySettings,
                userName,
                details,
                returnType
            );

            if (action === 'preview' && result) {
                console.log("[PromessaDetailsModal] PDF Preview URL generated successfully:", result);

                // Revoke old URL if it exists
                if (previewUrl) {
                    try { URL.revokeObjectURL(previewUrl); } catch (e) { }
                }

                setPreviewUrl(result as string);
            }

            if (action === 'download') {
                onClose();
            }
        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Cleanup on unmount or URL change
    useEffect(() => {
        return () => {
            if (previewUrl) {
                try { URL.revokeObjectURL(previewUrl); } catch (e) { }
            }
        };
    }, [previewUrl]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className={previewUrl ? "w-[98vw] max-w-[98vw] h-[96vh] flex flex-col p-0 overflow-hidden" : "max-w-xl"}>
                <DialogHeader className={previewUrl ? "px-6 py-4 border-b m-0" : "px-6 pt-6"}>
                    <div className="flex items-center justify-between mr-8">
                        <div>
                            <DialogTitle>Dados do Contrato Promessa</DialogTitle>
                            <DialogDescription>
                                Preencha os dados adicionais para completar o contrato.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <Label htmlFor="foreigner-mode" className="text-xs font-bold text-slate-600">Cidadão Estrangeiro?</Label>
                            <Switch
                                id="foreigner-mode"
                                checked={details.isForeigner}
                                onCheckedChange={(val) => {
                                    setDetails(prev => ({
                                        ...prev,
                                        isForeigner: val,
                                        documentNumber: (val && !prev.documentNumber) ? (client?.nif || prev.documentNumber) : prev.documentNumber
                                    }));
                                }}
                            />
                        </div>
                    </div>
                </DialogHeader>

                {previewUrl ? (
                    <div className="min-h-0 flex-1 w-full relative bg-slate-100">
                        <PdfCanvasViewer source={previewUrl} />
                    </div>
                ) : (
                    <div className="grid gap-4 py-4 px-6 overflow-y-auto max-h-[70vh]">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nome do Pai</Label>
                                <Input
                                    value={details.fatherName}
                                    onChange={(e) => setDetails({ ...details, fatherName: e.target.value })}
                                    placeholder="Nome completo do pai"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Nome da Mãe</Label>
                                <Input
                                    value={details.motherName}
                                    onChange={(e) => setDetails({ ...details, motherName: e.target.value })}
                                    placeholder="Nome completo da mãe"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Naturalidade</Label>
                                <Input
                                    value={details.birthPlace}
                                    onChange={(e) => setDetails({ ...details, birthPlace: e.target.value })}
                                    placeholder="Ex: Luanda"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{details.isForeigner ? 'Identificação / Validade' : 'Data Emissão BI'}</Label>
                                <Input
                                    type={details.isForeigner ? 'text' : 'date'}
                                    value={details.biIssueDate}
                                    onChange={(e) => setDetails({ ...details, biIssueDate: e.target.value })}
                                    placeholder={details.isForeigner ? "Ex: Válido até 12/2030" : ""}
                                />
                            </div>
                        </div>

                        {!details.isForeigner && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <Label>Número do BI (Cidadão Nacional)</Label>
                                <Input
                                    value={details.documentNumber}
                                    onChange={(e) => {
                                        let val = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
                                        if (val.length > 14) val = val.substring(0, 14);

                                        // Auto-mask: 9 numbers + 2 letters + 3 numbers
                                        let formatted = '';
                                        for (let i = 0; i < val.length; i++) {
                                            if (i < 9) {
                                                if (/[0-9]/.test(val[i])) formatted += val[i];
                                            } else if (i < 11) {
                                                if (/[A-Z]/.test(val[i])) formatted += val[i];
                                            } else {
                                                if (/[0-9]/.test(val[i])) formatted += val[i];
                                            }
                                        }
                                        setDetails({ ...details, documentNumber: formatted });
                                    }}
                                    placeholder="000000000XX000"
                                    maxLength={14}
                                    className="font-mono"
                                />
                                <p className="text-[10px] text-muted-foreground italic">Formato: 9 números, 2 letras, 3 números</p>
                            </div>
                        )}

                        {details.isForeigner && (
                            <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <Label>Tipo de Doc.</Label>
                                    <Select value={details.documentType} onValueChange={(v) => setDetails({ ...details, documentType: v })}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Passaporte">Passaporte</SelectItem>
                                            <SelectItem value="Cartão de Residente">Cartão Residente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Nº Documento</Label>
                                    <Input
                                        value={details.documentNumber}
                                        onChange={(e) => setDetails({ ...details, documentNumber: e.target.value })}
                                        placeholder="Número do doc."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Nacionalidade</Label>
                                    <Input
                                        value={details.nationality}
                                        onChange={(e) => setDetails({ ...details, nationality: e.target.value })}
                                        placeholder="Ex: Portuguesa"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Endereço Completo (Rua/Bairro)</Label>
                            <Input
                                value={details.street}
                                onChange={(e) => setDetails({ ...details, street: e.target.value })}
                                placeholder="Rua, Casa nº, Bairro..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Província</Label>
                                <Select value={details.province} onValueChange={handleProvinceChange}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.keys(angolaData).map(p => (
                                            <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Município</Label>
                                <Select value={details.municipality} onValueChange={(v) => setDetails({ ...details, municipality: v })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(angolaData[details.province] || []).map(m => (
                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="flex gap-2">
                    {previewUrl ? (
                        <Button variant="outline" onClick={() => setPreviewUrl(null)}>
                            Voltar para Edição
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => handleGenerate('preview')} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                            Visualizar
                        </Button>
                    )}
                    <Button onClick={() => handleGenerate('download')} disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        Baixar PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

