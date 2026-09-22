import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Textarea } from '@/componentes/ui/textarea';
import { Label } from '@/componentes/ui/label';
import { AlertTriangle } from 'lucide-react';

interface JustificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (justification: string) => Promise<void>;
    title: string;
    description?: string;
    confirmText?: string;
    actionType?: 'destructive' | 'warning' | 'info';
}

export function JustificationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirmar',
    actionType = 'destructive'
}: JustificationModalProps) {
    const [justification, setJustification] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        if (!justification.trim()) return;

        setIsLoading(true);
        try {
            await onConfirm(justification);
            setJustification('');
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-amber-600 mb-2">
                        {actionType === 'destructive' || actionType === 'warning' ? (
                            <AlertTriangle className="h-5 w-5" />
                        ) : null}
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    {description && (
                        <DialogDescription>
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="justification">Justificativa da Ação</Label>
                        <Textarea
                            id="justification"
                            placeholder="Descreva o motivo desta alteração crítica..."
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            className="min-h-[100px]"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Esta ação será registrada na auditoria contábil com a justificativa fornecida.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        variant={actionType === 'destructive' ? 'destructive' : 'default'}
                        disabled={!justification.trim() || isLoading}
                    >
                        {isLoading ? 'Processando...' : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

