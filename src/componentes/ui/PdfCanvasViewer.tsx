import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

export function PdfCanvasViewer({ source, className = '' }: PdfCanvasViewerProps) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    const renderPdf = async () => {
      if (!pagesRef.current) return;

      setStatus('loading');
      pagesRef.current.innerHTML = '';

      try {
        loadingTask = pdfjsLib.getDocument({
          data: await sourceToBytes(source),
          isEvalSupported: false,
        });

        const pdf = await loadingTask.promise;
        if (cancelled || !pagesRef.current) return;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled || !pagesRef.current) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const containerWidth = Math.min(Math.max(pagesRef.current.clientWidth - 32, 320), 1320);
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
          if (!context) throw new Error('Canvas indisponivel para pre-visualizacao.');

          await page.render({
            canvasContext: context,
            viewport,
            transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
          }).promise;

          pageWrapper.appendChild(canvas);
          pagesRef.current.appendChild(pageWrapper);
        }

        if (!cancelled) setStatus('ready');
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
  }, [source]);

  return (
    <div className={`relative h-full w-full overflow-y-auto bg-slate-100 px-4 py-5 ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando PDF...
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Nao foi possivel renderizar este PDF para visualizacao.
        </div>
      )}
      <div ref={pagesRef} className={status === 'error' ? 'hidden' : 'min-h-full w-full'} />
    </div>
  );
}
