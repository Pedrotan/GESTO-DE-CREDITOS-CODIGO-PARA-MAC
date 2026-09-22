const printPdfWithIframe = (pdfUrl: string, onError?: () => void) => {
  const iframe = document.createElement('iframe');
  iframe.title = 'Impressao de PDF';
  iframe.src = pdfUrl;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (error) {
        console.warn('Nao foi possivel remover iframe de impressao.', error);
      }
    }, 1000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    } catch (error) {
      console.error('Erro ao imprimir PDF:', error);
      cleanup();
      onError?.();
    }
  };

  iframe.onerror = () => {
    cleanup();
    onError?.();
  };

  document.body.appendChild(iframe);
};

export const printPdfFromUrl = async (
  pdfUrl: string,
  onError?: (message?: string) => void,
  onSuccess?: (printerName?: string, printersCount?: number) => void,
) => {
  if (!pdfUrl) {
    onError?.('PDF indisponivel para impressao.');
    return;
  }

  if (!window.electronAPI?.printPdf) {
    printPdfWithIframe(pdfUrl, () => onError?.('Nao foi possivel abrir a janela de impressao deste PDF.'));
    return;
  }

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error('Nao foi possivel carregar o PDF para impressao.');

    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    const printers = window.electronAPI.getPrinters ? await window.electronAPI.getPrinters() : [];
    const result = await window.electronAPI.printPdf({
      pdfData: pdfBytes,
      fileName: 'contrato.pdf',
      printerName: printers.find((printer) => printer.isDefault)?.name || printers[0]?.name,
      silent: true,
    });

    if (!result?.success) {
      throw new Error(result?.error || 'A impressao nao foi concluida.');
    }

    onSuccess?.(result.printerName, result.printers?.length ?? printers.length);
  } catch (error: any) {
    console.error('Erro ao imprimir PDF:', error);
    onError?.(error?.message || 'Nao foi possivel imprimir o PDF.');
  }
};
