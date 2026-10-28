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

type ContentBox = { left: number; top: number; right: number; bottom: number };

/** Zona com conteúdo (não branca) de uma página, em fracções da largura e da altura; null quando está em branco. */
const contentBox = (canvas: HTMLCanvasElement): ContentBox | null => {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const step = width * height > 2_000_000 ? 2 : 1;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      if (pixels[offset] < 235 || pixels[offset + 1] < 235 || pixels[offset + 2] < 235) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX / width, top: minY / height, right: (maxX + 1) / width, bottom: (maxY + 1) / height };
};

/**
 * Recorta as margens brancas à volta da zona dada (ex.: o BI digitalizado no topo de uma folha A4), com uma pequena
 * folga. Devolve null quando o recorte quase não tira nada.
 */
const cropToBox = (canvas: HTMLCanvasElement, box: ContentBox) => {
  const { width, height } = canvas;
  const pad = Math.round(Math.max(width, height) * 0.012);
  const left = Math.max(0, Math.floor(box.left * width) - pad), top = Math.max(0, Math.floor(box.top * height) - pad);
  const cropW = Math.min(width, Math.ceil(box.right * width) + pad) - left;
  const cropH = Math.min(height, Math.ceil(box.bottom * height) + pad) - top;
  if (cropW * cropH > width * height * 0.9) return null;
  const cropped = document.createElement('canvas');
  cropped.width = cropW;
  cropped.height = cropH;
  cropped.getContext('2d')?.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
  return cropped;
};

/** Imagem digitalizada sem as margens brancas (JPEG de alta qualidade); null quando não há nada a recortar. */
export const trimImageMargins = async (dataUrl: string, quality = 0.92) => {
  const image = new Image();
  image.src = dataUrl;
  try { await image.decode(); } catch { return null; }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const box = contentBox(canvas);
  const cropped = box && cropToBox(canvas, box);
  return cropped ? { dataUrl: cropped.toDataURL('image/jpeg', quality), width: cropped.width, height: cropped.height } : null;
};

/**
 * Páginas do PDF como imagens em fundo branco, no tamanho real (mm), para a impressão no computador. Imprimir o
 * visualizador de PDF do Chromium numa janela escondida saía todo preto em algumas impressoras (o fundo escuro
 * do visualizador); as imagens saem iguais ao documento em qualquer impressora, térmicas incluídas (203 ppp).
 */
export const rasterizePdfForPrint = async (pdfBytes: Uint8Array, dpi = 203, mime: 'image/png' | 'image/jpeg' = 'image/png',
  options: { quality?: number; trimMargins?: boolean } = {}) => {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
  const pages: Array<{ dataUrl: string; widthMm: number; heightMm: number }> = [];
  const renderPage = async (number: number, pageDpi: number) => {
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(pageDpi / 72, 2600 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a página para impressão.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, background: '#ffffff' } as any).promise;
    page.cleanup();
    return { canvas, scale };
  };
  try {
    const count = Math.min(pdf.numPages, 60);
    // Recorte igual em todas as páginas (a zona com conteúdo de todas, vista em baixa resolução): a letra fica do
    // mesmo tamanho de página para página e a última página, meio vazia, não sai ampliada.
    let box: ContentBox | null = null;
    if (options.trimMargins) {
      for (let number = 1; number <= count; number++) {
        const pageBox = contentBox((await renderPage(number, 50)).canvas);
        if (!pageBox) continue;
        box = box ? {
          left: Math.min(box.left, pageBox.left), top: Math.min(box.top, pageBox.top),
          right: Math.max(box.right, pageBox.right), bottom: Math.max(box.bottom, pageBox.bottom),
        } : pageBox;
      }
    }
    for (let number = 1; number <= count; number++) {
      const { canvas, scale } = await renderPage(number, dpi);
      const output = (box && cropToBox(canvas, box)) || canvas;
      pages.push({
        dataUrl: mime === 'image/jpeg' ? output.toDataURL('image/jpeg', options.quality ?? 0.85) : output.toDataURL('image/png'),
        // Tamanho real da parte mostrada (a página inteira ou o recorte).
        widthMm: (output.width / scale) * 25.4 / 72, heightMm: (output.height / scale) * 25.4 / 72,
      });
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
