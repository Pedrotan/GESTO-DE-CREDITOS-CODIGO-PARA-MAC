import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/componentes/ui/dialog";
import { Button } from "@/componentes/ui/button";
import { MessageSquare, Mail, X, CheckCircle2 } from 'lucide-react';

interface ConfirmSharingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (method: 'whatsapp' | 'email' | 'both' | 'none') => void;
    title: string;
    description: string;
    clientName: string;
}

export function ConfirmSharingModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    clientName
}: ConfirmSharingModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <DialogTitle className="text-center text-xl">{title}</DialogTitle>
                    <DialogDescription className="text-center">
                        {description} para <strong>{clientName}</strong>.
                        Como deseja enviar o comprovativo?
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 py-4">
                    <Button
                        variant="outline"
                        className="flex flex-col items-center gap-2 h-24 border-2 hover:border-green-500 hover:bg-green-50 transition-all"
                        onClick={() => onConfirm('whatsapp')}
                    >
                        <MessageSquare className="h-8 w-8 text-green-600" />
                        <span>WhatsApp</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="flex flex-col items-center gap-2 h-24 border-2 hover:border-blue-500 hover:bg-blue-50 transition-all"
                        onClick={() => onConfirm('email')}
                    >
                        <Mail className="h-8 w-8 text-blue-600" />
                        <span>E-mail</span>
                    </Button>
                </div>

                <DialogFooter className="sm:justify-between items-center bg-muted/30 -mx-6 -mb-6 p-4 mt-2">
                    <p className="text-[10px] text-muted-foreground max-w-[200px]">
                        O documento será gerado automaticamente.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => onConfirm('none')} className="gap-2">
                        <X className="h-4 w-4" />
                        Agora não
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

