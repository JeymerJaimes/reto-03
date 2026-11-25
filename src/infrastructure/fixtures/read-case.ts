import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { approvalSource, caseId, emailSource, packageSchema, requestSchema, type Paquete } from '../../domain/documents.ts';
import { ProcurementError, type Sources } from '../../domain/evidence.ts';
import { parseInvoice, parseQuote } from './parse-commercial.ts';
import { optionalSource, parseJson, source } from './source.ts';

export function listCases(directory: string) {
  return readdirSync(resolve(directory, 'fixtures/reto-03/solicitudes'), {withFileTypes: true})
    .filter(e => e.isDirectory() && caseId.safeParse(e.name).success).map(e => e.name).sort();
}
export function readCase(directory: string, caso: string) {
  if (!listCases(directory).includes(caso)) throw new ProcurementError('CASO_DESCONOCIDO', 'Selecciona un expediente del catálogo.');
  const prefix = 'solicitudes/' + caso + '/';
  const mailFile = source(directory, prefix + 'correo.json');
  const mail = parseJson(mailFile, emailSource);
  const requestFile = optionalSource(directory, prefix + 'solicitud.json');
  const approvalFile = optionalSource(directory, prefix + 'aprobacion.json');
  const quoteFile = optionalSource(directory, prefix + 'cotizacion.txt');
  const invoiceFile = optionalSource(directory, prefix + 'factura.txt');
  const solicitud = requestFile && parseJson(requestFile, requestSchema);
  const approval = approvalFile && parseJson(approvalFile, approvalSource);
  const faltantes: Paquete['faltantes'] = [];
  if (!requestFile) faltantes.push('solicitud.json');
  if (!quoteFile) faltantes.push('cotizacion.txt');
  if (!approvalFile) faltantes.push('aprobacion.json');
  if (!invoiceFile && mail.adjuntos.some(name => /^factura\.(pdf|txt)$/i.test(name))) faltantes.push('factura.txt');
  const paquete = packageSchema.parse({
    correo: mail, solicitud, cotizacion: quoteFile && parseQuote(quoteFile), factura: invoiceFile && parseInvoice(invoiceFile),
    aprobacion: approval && {de: approval.de, fecha: approval.fecha, aprobado: /\baprobado\b/i.test(approval.cuerpo) && !/\bno\s+aprobado\b/i.test(approval.cuerpo), texto: approval.cuerpo},
    faltantes,
  });
  const fuentes: Sources = {};
  for (const key of Object.keys(mail)) fuentes['correo.' + key] = mailFile.ref('/' + key);
  if (requestFile && solicitud) for (const key of Object.keys(solicitud)) fuentes['solicitud.' + key] = requestFile.ref('/' + key);
  if (approvalFile && approval) for (const key of Object.keys(approval)) fuentes['aprobacion.' + key] = approvalFile.ref('/' + key);
  if (quoteFile) for (const [key, label] of Object.entries({referencia:'COTIZACIÓN', proveedor:'Proveedor:', nit:'NIT:', fecha:'Fecha:', total:'TOTAL (IVA incluido):', moneda:'TOTAL (IVA incluido):', validez_dias:'Validez de la oferta:', texto:'texto íntegro'}))
    fuentes['cotizacion.' + key] = quoteFile.ref(label);
  if (invoiceFile) for (const [key, label] of Object.entries({numero:'FACTURA ELECTRÓNICA DE VENTA No.', fecha:'Fecha de emisión:', total:'TOTAL:', moneda:'TOTAL:', texto:'texto íntegro'}))
    fuentes['factura.' + key] = invoiceFile.ref(label);
  return { caso, paquete, approval, fuentes };
}
export type ProcurementCase = ReturnType<typeof readCase>;
