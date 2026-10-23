const printPdfWithIframe = (pdfUrl: string, onError?: () => void) => {
  const iframe = document.createElement('iframe');
  iframe.title = 'Impressão de Documento';
  iframe.src = pdfUrl;
  // Viewport com dimensões reais fora de ecrã para o Chromium conseguir calcular a paginação e pré-visualização
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '-9999px';
  iframe.style.width = '800px';
  iframe.style.height = '1000px';
  iframe.style.border = '0';
  iframe.style.opacity = '0.01';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-9999';

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => {
      try {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      } catch (error) {
        console.warn('Não foi possível remover iframe de impressão.', error);
      }
    }, 2000);
  };

  iframe.onload = () => {
    // Pequena pausa para o leitor de PDF interno do Chromium concluir a renderização do talão antes de abrir o diálogo
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        if (iframe.contentWindow) {
          iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        }
        window.addEventListener('focus', cleanup, { once: true });
        // Fallback longo para não destruir a janela de pré-visualização se o utilizador demorar a confirmar
        setTimeout(cleanup, 120_000);

        iframe.contentWindow?.print();
      } catch (error) {
        console.error('Erro ao acionar impressão via iframe:', error);
        cleanup();
        try {
          window.open(pdfUrl, '_blank');
        } catch {
          onError?.();
        }
      }
    }, 400);
  };

  iframe.onerror = () => {
    cleanup();
    try {
      window.open(pdfUrl, '_blank');
    } catch {
      onError?.();
    }
  };

  document.body.appendChild(iframe);
};

/**
 * Páginas do PDF como imagens em fundo branco, no tamanho real (mm), para a impressão no computador. Imprimir o
 * visualizador de PDF do Chromium numa janela escondida saía todo preto em algumas impressoras (o fundo escuro
 * do visualizador); as imagens saem iguais ao documento em qualquer impressora, térmicas incluídas (203 ppp).
 */
export const rasterizePdfForPrint = async (pdfBytes: Uint8Array, dpi = 203) => {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
  const pages: Array<{ dataUrl: string; widthMm: number; heightMm: number }> = [];
  try {
    for (let number = 1; number <= Math.min(pdf.numPages, 60); number++) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(dpi / 72, 2600 / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível preparar a página para impressão.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, background: '#ffffff' } as any).promise;
      pages.push({ dataUrl: canvas.toDataURL('image/png'), widthMm: (base.width * 25.4) / 72, heightMm: (base.height * 25.4) / 72 });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
};

export const printPdfFromUrl = async (
  pdfUrl: string,
  onError?: (message?: string) => void,
  onSuccess?: (printerName?: string, printersCount?: number) => void,
  fileName = 'documento.pdf',
  options: { printerName?: string } = {},
) => {
  if (!pdfUrl) {
    onError?.('PDF indisponível para impressão.');
    return;
  }

  if (!window.electronAPI?.printPdf) {
    printPdfWithIframe(pdfUrl, () => {
      try {
        const win = window.open(pdfUrl, '_blank');
        if (!win) onError?.('Não foi possível abrir a janela de impressão. Por favor, autorize os pop-ups.');
      } catch {
        onError?.('Não foi possível abrir a janela de impressão deste documento.');
      }
    });
    return;
  }

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error('Não foi possível carregar o PDF para impressão.');

    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    const printers = window.electronAPI.getPrinters ? await window.electronAPI.getPrinters() : [];
    const defaultPrinter = options.printerName || printers.find((printer) => printer.isDefault)?.name || printers[0]?.name;

    const result = window.electronAPI.printImages
      ? await window.electronAPI.printImages({ pages: await rasterizePdfForPrint(pdfBytes), fileName, printerName: defaultPrinter, silent: true })
      : await window.electronAPI.printPdf({ pdfData: pdfBytes, fileName, printerName: defaultPrinter, silent: true });

    if (!result?.success) {
      throw new Error(result?.error || 'A impressão não foi concluída.');
    }

    onSuccess?.(result.printerName, result.printers?.length ?? printers.length);
  } catch (error: any) {
    console.warn('Falha no printPdf silencioso do Electron, a tentar pré-visualização padrão:', error);
    // Em caso de falha silenciosa no desktop (ex.: sem impressora padrão configurada), recorre à pré-visualização padrão
    printPdfWithIframe(pdfUrl, () => {
      try {
        window.open(pdfUrl, '_blank');
      } catch {
        onError?.(error?.message || 'Não foi possível imprimir o documento.');
      }
    });
  }
};
