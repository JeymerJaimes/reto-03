import { invoiceSchema, quoteSchema } from '../../domain/documents.ts';
import { ProcurementError } from '../../domain/evidence.ts';
import type { Source } from './source.ts';

function field(file: Source, expression: RegExp, label: string) {
  const value = expression.exec(file.texto)?.[1]?.trim();
  if (!value) throw new ProcurementError('DOCUMENTO_INVALIDO', file.ruta + ': revisar ' + label);
  return value;
}
function money(file: Source, label: RegExp) {
  const raw = field(file, label, 'TOTAL');
  const match = /^(COP|USD)\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)$/.exec(raw);
  if (!match?.[2]) throw new ProcurementError('DOCUMENTO_INVALIDO', file.ruta + ': importe TOTAL ilegible.');
  return { moneda: match[1], total: Number(match[2].replaceAll('.', '').replace(',', '.')) };
}
export function parseQuote(file: Source) {
  const duration = /^Validez de la oferta:\s*(\d+)\s+días/im.exec(file.texto);
  return quoteSchema.parse({
    referencia: field(file, /^COTIZACIÓN[ \t]+(.+)$/m, 'referencia'),
    proveedor: field(file, /^Proveedor:[ \t]*(.+)$/m, 'Proveedor'),
    nit: /^NIT:[ \t]*(.+)$/m.exec(file.texto)?.[1]?.trim() ?? null,
    fecha: field(file, /^Fecha:[ \t]*(.+)$/m, 'Fecha'), ...money(file, /^TOTAL \(IVA incluido\):[ \t]*(.+)$/m),
    validez_dias: duration?.[1] ? Number(duration[1]) : null,
    validez_hasta: null, texto: file.texto,
  });
}
export function parseInvoice(file: Source) {
  return invoiceSchema.parse({
    numero: field(file, /^FACTURA .+? No\.[ \t]*(.+)$/m, 'número de factura'),
    fecha: field(file, /^Fecha de emisión:[ \t]*(.+)$/m, 'Fecha de emisión'),
    ...money(file, /^TOTAL:[ \t]*(.+)$/m), texto: file.texto,
  });
}
