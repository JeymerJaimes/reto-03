import { z } from 'zod';

export const text = z.string().min(1);
export const email = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u);
export const date = z.iso.date();
export const instant = z.iso.datetime({ offset: true });
export const currency = z.enum(['COP', 'USD']);
export const caseId = z.string().regex(/^sol-[0-9]+$/);
export const requestSchema = z.strictObject({
  solicitud_id: text, solicitante: text, proveedor_nombre: text, proveedor_nit: text.optional(),
  descripcion: text, centro_costo: text, subarea: text, cantidad: z.number(),
  valor_unitario: z.number(), valor_total: z.number(), moneda: currency,
  indicador_iva: text.optional(), condiciones_pago: text.optional(), fecha_solicitud: date,
});
export const emailSource = z.object({
  id: text, de: email, para: email.optional(), asunto: text, fecha: instant,
  cuerpo: z.string(), adjuntos: z.array(text),
});
export const approvalSource = z.object({
  de: email, para: email, fecha: instant, asunto: text, cuerpo: z.string(), cc: z.array(email).optional(),
});
export const quoteSchema = z.strictObject({
  referencia: text, proveedor: text, nit: text.nullable(), fecha: date, total: z.number(), moneda: currency,
  validez_hasta: date.nullable(), validez_dias: z.number().int().nullable(), texto: text,
});
export const invoiceSchema = z.strictObject({ numero: text, fecha: date, total: z.number(), moneda: currency, texto: text });
export const packageSchema = z.strictObject({
  correo: emailSource.pick({ id: true, de: true, asunto: true, fecha: true }),
  solicitud: requestSchema.nullable(),
  cotizacion: quoteSchema.nullable(),
  aprobacion: z.strictObject({ de: email, fecha: instant, aprobado: z.boolean(), texto: z.string() }).nullable(),
  factura: invoiceSchema.nullable(),
  faltantes: z.array(z.enum(['solicitud.json', 'cotizacion.txt', 'aprobacion.json', 'factura.txt'])),
});
export type PurchaseRequest = z.infer<typeof requestSchema>;
export type Paquete = z.infer<typeof packageSchema>;
export type ApprovalEvidence = z.infer<typeof approvalSource>;
