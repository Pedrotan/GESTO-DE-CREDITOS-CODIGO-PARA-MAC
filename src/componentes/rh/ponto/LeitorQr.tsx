// Leitura do cartão QR no quiosque: câmara do tablet (jsQR, funciona também no Windows) e leitores USB que
// escrevem o código como um teclado seguido de Enter.
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { Button } from '@/componentes/ui/button';

const PREFIXO = 'TANGO-PONTO:';

/** Leitor USB/Bluetooth em modo teclado: junta as teclas rápidas e entrega o código ao Enter. */
export function useLeitorTeclado(onCodigo: (codigo: string) => void, activo: boolean) {
    const ref = useRef(onCodigo);
    ref.current = onCodigo;
    useEffect(() => {
        if (!activo) return;
        let buffer = '';
        let ultima = 0;
        const tecla = (e: KeyboardEvent) => {
            const agora = Date.now();
            if (agora - ultima > 120) buffer = '';
            ultima = agora;
            if (e.key === 'Enter') {
                if (buffer.toUpperCase().startsWith(PREFIXO)) { e.preventDefault(); ref.current(buffer.trim()); }
                buffer = '';
            } else if (e.key.length === 1) buffer += e.key;
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [activo]);
}

export function CameraQr({ onCodigo }: { onCodigo: (codigo: string) => void }) {
    const video = useRef<HTMLVideoElement>(null);
    const [ligada, setLigada] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const ref = useRef(onCodigo);
    ref.current = onCodigo;

    useEffect(() => {
        if (!ligada) return;
        let parar = false;
        let fluxo: MediaStream | null = null;
        let ultimo = '';
        (async () => {
            try {
                const jsQR = (await import('jsqr')).default;
                fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
                if (!video.current || parar) return;
                video.current.srcObject = fluxo;
                await video.current.play();
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const ler = () => {
                    if (parar || !video.current || !ctx) return;
                    const v = video.current;
                    if (v.videoWidth) {
                        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                        ctx.drawImage(v, 0, 0);
                        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                        if (r?.data && r.data.toUpperCase().startsWith(PREFIXO) && r.data !== ultimo) {
                            ultimo = r.data;
                            ref.current(r.data);
                            window.setTimeout(() => { ultimo = ''; }, 4000);
                        }
                    }
                    window.setTimeout(ler, 250);
                };
                ler();
            } catch (e) {
                setErro((e as Error).name === 'NotAllowedError' ? 'Sem autorização para usar a câmara.' : 'Câmara indisponível neste dispositivo.');
                setLigada(false);
            }
        })();
        return () => { parar = true; fluxo?.getTracks().forEach(t => t.stop()); };
    }, [ligada]);

    return (
        <div className="flex flex-col items-center gap-2">
            {ligada && <video ref={video} muted playsInline className="h-48 w-64 rounded-2xl bg-black object-cover" />}
            <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800" onClick={() => { setErro(null); setLigada(!ligada); }}>
                {ligada ? <><CameraOff className="mr-2 h-4 w-4" /> Fechar a câmara</> : <><Camera className="mr-2 h-4 w-4" /> Ler cartão QR</>}
            </Button>
            {erro && <p className="text-sm text-red-400">{erro}</p>}
        </div>
    );
}
