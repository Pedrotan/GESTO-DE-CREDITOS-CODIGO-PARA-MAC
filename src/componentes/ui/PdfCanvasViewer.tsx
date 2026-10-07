import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfCanvasViewerProps = {
  source: string;
  className?: string;
};

const sourceToBytes = async (source: string) => {
  if (source.startsWith('data:')) {
    const payload = source.includes(',') ? source.split(',')[1] : source;
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  const response = await fetch(source);
  if (!response.ok) throw new Error(`Falha ao ler o PDF (${response.status}).`);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

export function PdfCanvasViewer({ source, className = '' }: PdfCanvasViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasPages, setHasPages] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    const renderPdf = async () => {
      if (!pagesRef.current) return;
      setStatus('loading');

      try {
        loadingTask = pdfjsLib.getDocument({
          data: await sourceToBytes(source),
          isEvalSupported: false,
        });

        const pdf = await loadingTask.promise;
        if (cancelled || !pagesRef.current) return;

        // As páginas são desenhadas fora do ecrã e trocadas no fim: a versão anterior continua visível
        // enquanto a nova é preparada (pré-visualização em tempo real sem piscar).
        const offscreen = document.createElement('div');
        const containerWidth = Math.min(Math.max(pagesRef.current.clientWidth - 32, 320), 1320);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.max(0.55, Math.min(containerWidth / baseViewport.width, 2));
          const viewport = page.getViewport({ scale });
          const pixelRatio = window.devicePixelRatio || 1;

          const pageWrapper = document.createElement('div');
          pageWrapper.className = 'mx-auto mb-4 w-fit rounded-md bg-white p-3 shadow-sm';

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = 'block max-w-full';

          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas indisponível para pré-visualização.');

          await page.render({
            canvasContext: context,
            viewport,
            transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
          }).promise;

          pageWrapper.appendChild(canvas);
          offscreen.appendChild(pageWrapper);
        }

        if (cancelled || !pagesRef.current) return;
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        pagesRef.current.replaceChildren(...Array.from(offscreen.childNodes));
        if (scrollRef.current) scrollRef.current.scrollTop = scrollTop;
        setHasPages(true);
        setStatus('ready');
      } catch (error) {
        console.error('Erro ao renderizar PDF:', error);
        if (!cancelled) setStatus('error');
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [source, attempt]);

  return (
    <div ref={scrollRef} className={`relative h-full w-full overflow-y-auto bg-slate-100 px-4 py-5 ${className}`}>
      {status === 'loading' && !hasPages && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar o PDF...
          </div>
        </div>
      )}
      {status === 'loading' && hasPages && (
        <div className="sticky top-0 z-10 mx-auto mb-2 flex w-fit items-center gap-2 rounded-full bg-slate-900/85 px-3 py-1 text-xs font-medium text-white shadow">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          A actualizar a pré-visualização...
        </div>
      )}
      {status === 'error' && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <p>Não foi possível renderizar este PDF para visualização.</p>
          <button
            type="button"
            onClick={() => setAttempt(value => value + 1)}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}
      <div ref={pagesRef} className={status === 'error' ? 'hidden' : 'min-h-full w-full'} />
    </div>
  );
}
