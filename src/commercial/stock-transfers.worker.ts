/// <reference lib="webworker" />
import { stockTransfers, type TransferProduct } from './stock-transfers';

addEventListener('message', ({ data }: MessageEvent<TransferProduct[]>) => {
  try {
    postMessage({ routes: stockTransfers(data, 30, 90, false) });
  } catch {
    postMessage({ error: 'No se pudieron calcular los traslados. Selecciona otro rubro o vuelve a intentar.' });
  }
});
