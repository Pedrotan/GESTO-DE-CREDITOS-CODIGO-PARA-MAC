
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Loader2, Printer, Scan, Trash2, Plus, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/componentes/ui/scroll-area';
import { toast } from '@/componentes/ui/use-toast';
import { cn } from '@/bibliotecas/utils';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';

interface Scanner {
    deviceId: string;
    name: string;
    type: string;
    description: string;
}

interface ScannedImage {
    id: string;
    data: string; // base64
}

interface ScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (images: string[]) => void;
}

export function ScannerModal({ isOpen, onClose, onSave }: ScannerModalProps) {
    const [scanners, setScanners] = useState<Scanner[]>([]);
    const [selectedScannerId, setSelectedScannerId] = useState<string>('');
    const [isScanning, setIsScanning] = useState(false);
    const [isLoadingDevices, setIsLoadingDevices] = useState(false);
    const [scannedImages, setScannedImages] = useState<ScannedImage[]>([]);
    const [scanError, setScanError] = useState<string | null>(null);

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: AlertModalType;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success'
    });

    // Carregar scanners ao abrir
    useEffect(() => {
        if (isOpen) {
            loadScanners();
            setScannedImages([]);
            setScanError(null);
        }
    }, [isOpen]);

    const loadScanners = async () => {
        setIsLoadingDevices(true);
        try {
            if (window.electronAPI?.listDevices) {
                const devices = await window.electronAPI.listDevices();
                setScanners(devices);
                if (devices.length > 0) {
                    setSelectedScannerId(devices[0].deviceId);
                }
            }
        } catch (error) {
            console.error("Erro ao listar scanners:", error);
            toast({ title: "Erro", description: "Não foi possível listar os dispositivos.", variant: "destructive" });
        } finally {
            setIsLoadingDevices(false);
        }
    };

    const handleScan = async () => {
        if (!selectedScannerId) {
            toast({ title: "Selecione um scanner", variant: "default" });
            return;
        }

        setIsScanning(true);
        setScanError(null);

        try {
            if (window.electronAPI?.scanDocument) {
                const result = await window.electronAPI.scanDocument(selectedScannerId);

                if (result.success && result.image) {
                    setScannedImages(prev => [...prev, {
                        id: crypto.randomUUID(),
                        data: result.image!
                    }]);
                    setAlertConfig({
                        isOpen: true,
                        title: "Sucesso!",
                        description: "Página digitalizada com sucesso!",
                        type: "success"
                    });
                } else {
                    if (result.message?.includes("CANCELLED")) {
                        // Usuário cancelou, não faz nada
                    } else {
                        setScanError(result.message || "Erro desconhecido ao digitalizar.");
                    }
                }
            } else {
                setScanError("API de digitalização indisponível.");
            }
        } catch (error) {
            console.error(error);
            setScanError("Erro crítico ao comunicar com o scanner.");
        } finally {
            setIsScanning(false);
        }
    };

    const handleRemoveImage = (id: string) => {
        setScannedImages(prev => prev.filter(img => img.id !== id));
    };

    const handleSaveAll = () => {
        onSave(scannedImages.map(img => img.data));
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isScanning && !open && onClose()}>
            <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 dark:bg-slate-950 border-none shadow-2xl">
                {/* Header */}
                <div className="bg-white dark:bg-slate-900 border-b p-6 flex items-start gap-4 sticky top-0 z-10">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                        <Printer className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="space-y-1">
                        <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                            Digitalizar Documentos
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Selecione o dispositivo e digitalize múltiplas páginas.
                        </DialogDescription>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Sidebar de Configuração */}
                    <div className="w-full md:w-[300px] bg-white dark:bg-slate-900 border-r p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Dispositivo Selecionado
                            </label>
                            {isLoadingDevices ? (
                                <div className="h-10 bg-slate-100 rounded animate-pulse" />
                            ) : scanners.length > 0 ? (
                                <div className="space-y-2">
                                    {scanners.map((scanner) => (
                                        <div
                                            key={scanner.deviceId}
                                            onClick={() => setSelectedScannerId(scanner.deviceId)}
                                            className={cn(
                                                "p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-slate-50 relative",
                                                selectedScannerId === scanner.deviceId
                                                    ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/10"
                                                    : "border-slate-100 dark:border-slate-800"
                                            )}
                                        >
                                            <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                                                {scanner.name}
                                            </p>
                                            <p className="text-xs text-slate-400 truncate mt-1">
                                                {scanner.type}
                                            </p>
                                            {selectedScannerId === scanner.deviceId && (
                                                <div className="absolute top-3 right-3 text-blue-600">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 border border-dashed rounded-xl text-center bg-slate-50 text-slate-500 text-sm">
                                    Nenhum scanner ou impressora WIA encontrado.
                                    <Button variant="link" size="sm" onClick={loadScanners} className="mt-2 text-blue-600">
                                        Tentar Novamente
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="mt-auto">
                            {scanError && (
                                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-xs flex gap-2 items-start border border-red-100">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{scanError}</span>
                                </div>
                            )}

                            <Button
                                size="lg"
                                onClick={handleScan}
                                disabled={isScanning || !selectedScannerId}
                                className={cn(
                                    "w-full h-12 text-sm font-bold shadow-xl transition-all",
                                    isScanning ? "bg-slate-100 text-slate-400" : "bg-blue-600 hover:bg-blue-700 text-white"
                                )}
                            >
                                {isScanning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        A Digitalizar...
                                    </>
                                ) : (
                                    <>
                                        <Scan className="w-4 h-4 mr-2" />
                                        Digitalizar Página
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 bg-slate-100/50 dark:bg-slate-950/50 flex flex-col overflow-hidden">
                        <div className="p-4 border-b bg-white/50 backdrop-blur text-xs font-semibold text-slate-500 uppercase flex justify-between items-center">
                            <span>Pré-visualização ({scannedImages.length} páginas)</span>
                            {scannedImages.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setScannedImages([])}
                                    className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7"
                                >
                                    Limpar Tudo
                                </Button>
                            )}
                        </div>

                        <ScrollArea className="flex-1 p-6">
                            {scannedImages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 opacity-50 min-h-[300px]">
                                    <Scan className="w-16 h-16" />
                                    <p className="font-medium">Nenhuma página digitalizada ainda.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                                    {scannedImages.map((img, idx) => (
                                        <div key={img.id} className="group relative aspect-[3/4] bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md">
                                            <img
                                                src={img.data}
                                                alt={`Scan ${idx + 1}`}
                                                className="w-full h-full object-contain bg-slate-50"
                                            />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                                <Button
                                                    variant="destructive"
                                                    size="icon"
                                                    className="rounded-full w-10 h-10 shadow-lg"
                                                    onClick={() => handleRemoveImage(img.id)}
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </Button>
                                            </div>
                                            <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full font-bold backdrop-blur">
                                                Pág. {idx + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-white dark:bg-slate-900 border-t flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <p className="text-xs text-slate-400 hidden sm:block">
                        * Certifique-se que o scanner está ligado e os drivers instalados.
                    </p>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            disabled={isScanning}
                            className="flex-1 sm:flex-none"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveAll}
                            disabled={scannedImages.length === 0 || isScanning}
                            className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200 flex-1 sm:flex-none gap-2 font-bold px-6"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Guardar {scannedImages.length > 0 && `(${scannedImages.length})`}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
            />
        </Dialog>
    );
}

