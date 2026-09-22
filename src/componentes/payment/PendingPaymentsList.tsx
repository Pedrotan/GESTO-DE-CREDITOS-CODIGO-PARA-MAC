
import React, { useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/componentes/ui/card';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Badge } from '@/componentes/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/componentes/ui/dialog';
import { CheckCircle, XCircle, Upload, Clock, Eye, AlertCircle } from 'lucide-react';
import { PaymentReference } from '@/tipos/pagamento';
import { toast } from 'sonner';

export function PendingPaymentsList() {
    const { paymentReferences, validatePaymentReference, uploadPaymentProof, clients, credits } = useData();
    const [selectedRef, setSelectedRef] = useState<PaymentReference | null>(null);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Filter pending references
    const pendingRefs = paymentReferences.filter(
        ref => ref.status === 'pending' || ref.status === 'pending_validation'
    );

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; desc: string; onConfirm: () => void }>({
        isOpen: false, title: '', desc: '', onConfirm: () => { }
    });

    // Success modal state (using Dialog for custom success message as requested)
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleApprove = (id: string, ref: PaymentReference) => {
        setConfirmModal({
            isOpen: true,
            title: "Aprovar Pagamento",
            desc: "Tem certeza que deseja aprovar este pagamento? Esta ação é irreversível.",
            onConfirm: async () => {
                await validatePaymentReference(id, true);
                setSuccessMessage('Pagamento aprovado e registrado!');
                setSuccessModalOpen(true);
                setConfirmModal(current => ({ ...current, isOpen: false }));
            }
        });
    };

    const handleReject = (id: string) => {
        setConfirmModal({
            isOpen: true,
            title: "Rejeitar Pagamento",
            desc: "Tem certeza que deseja rejeitar este pagamento?",
            onConfirm: async () => {
                await validatePaymentReference(id, false);
                toast.error('Pagamento rejeitado.');
                setConfirmModal(current => ({ ...current, isOpen: false }));
            }
        });
    };

    const submitProof = async () => {
        if (selectedRef && previewImage) {
            await uploadPaymentProof(selectedRef.id, previewImage);
            setSuccessMessage('Comprovativo enviado com sucesso!');
            setSuccessModalOpen(true);
            setUploadModalOpen(false);
            setPreviewImage(null);
        }
    };

    const getClientName = (creditId: string) => {
        const credit = credits.find(c => c.id === creditId);
        if (credit) {
            return credit.clientName || 'Cliente Desconhecido';
        }
        return 'N/A';
    };

    if (pendingRefs.length === 0) {
        return (
            <div className="text-center py-10 bg-muted/20 rounded-lg border border-dashed">
                <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-lg font-medium">Tudo em dia!</h3>
                <p className="text-muted-foreground">Não há pagamentos pendentes de validação.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingRefs.map(ref => (
                <Card key={ref.id} className="overflow-hidden border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <CardTitle className="text-base font-bold flex items-center gap-2">
                                    {ref.reference}
                                    {ref.status === 'pending_validation' && (
                                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                            <Clock className="h-3 w-3 mr-1" /> Validar
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    {getClientName(ref.creditId)}
                                </CardDescription>
                            </div>
                            <div className="text-right">
                                <span className="block font-bold text-lg text-primary">
                                    {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(ref.amount)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(ref.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {ref.proofImage ? (
                            <div className="mb-4">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className="relative h-32 w-full bg-black/5 rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity group">
                                            <img
                                                src={ref.proofImage}
                                                alt="Comprovativo"
                                                className="h-full w-full object-cover"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Eye className="h-8 w-8 text-white drop-shadow-md" />
                                            </div>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl">
                                        <DialogHeader>
                                            <DialogTitle>Comprovativo de Pagamento</DialogTitle>
                                        </DialogHeader>
                                        <div className="mt-4">
                                            <img src={ref.proofImage} alt="Comprovativo Full" className="w-full rounded-lg" />
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        ) : (
                            <div className="mb-4 p-4 bg-muted/30 rounded-md text-center border border-dashed">
                                <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                                <p className="text-xs text-muted-foreground mb-2">Sem comprovativo</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSelectedRef(ref);
                                        setUploadModalOpen(true);
                                    }}
                                >
                                    <Upload className="h-3 w-3 mr-2" /> Anexar
                                </Button>
                            </div>
                        )}

                        <div className="flex gap-2 mt-2">
                            <Button
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                size="sm"
                                onClick={() => handleApprove(ref.id, ref)}
                                disabled={!ref.proofImage && ref.status !== 'pending_validation'}
                            >
                                <CheckCircle className="h-3 w-3 mr-2" /> Aprovar
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleReject(ref.id)}
                            >
                                <XCircle className="h-3 w-3" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}

            <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Anexar Comprovativo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                        />
                        {previewImage && (
                            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border">
                                <img src={previewImage} alt="Preview" className="w-full h-full object-contain" />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUploadModalOpen(false)}>Cancelar</Button>
                        <Button onClick={submitProof} disabled={!previewImage}>Enviar Comprovativo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmModal.isOpen} onOpenChange={(open) => setConfirmModal(prev => ({ ...prev, isOpen: open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmModal.title}</DialogTitle>
                        <DialogDescription>
                            {confirmModal.desc}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}>Cancelar</Button>
                        <Button onClick={confirmModal.onConfirm}>Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
                <DialogContent className="max-w-sm text-center">
                    <div className="flex flex-col items-center justify-center p-6 space-y-4">
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                            <CheckCircle className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-semibold">{successMessage}</h3>
                        <Button onClick={() => setSuccessModalOpen(false)} className="w-full">
                            OK
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

