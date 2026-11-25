import { z } from 'zod';
import { currency, email, instant, text } from './documents.ts';
import { evidenceSchema } from './evidence.ts';

export const ruleId = z.enum(['RC1','RC2','RC3','RC4','RC5','RC6','RC7','RC8','RC9','RC10']);
export const finding = z.strictObject({regla:ruleId, severidad:z.enum(['bloqueo','confirmacion','informativa']),
  estado:z.enum(['cumple','hallazgo','no_aplica','no_evaluable']), detalle:text, evidencias:z.array(evidenceSchema)});
export const defaults = z.strictObject({indicador_iva:text.optional(), condiciones_pago:text.optional()});
export const reportSchema = z.strictObject({apta:z.boolean(), retroactiva:z.boolean(), resultados:z.array(finding),
  bloqueos:z.array(finding), confirmaciones:z.array(finding), derivados:defaults});
export const orderSchema = z.strictObject({
  referencia:z.strictObject({solicitud_id:text, correo_id:text, cotizacion_ref:text.nullable()}),
  sociedad:z.literal('1000'), organizacion_compras:z.literal('1000'),
  proveedor:z.strictObject({codigo_sap:text,nit:text,nombre:text}), moneda:currency, condiciones_pago:text,
  aprobador:z.strictObject({email,fecha_aprobacion:instant,evidencia_sha256:z.string().regex(/^[a-f0-9]{64}$/)}),
  posiciones:z.array(z.strictObject({numero:z.number().int(), descripcion:text.max(40), cantidad:z.number(), unidad:z.enum(['UN','H','MES']),
    precio_unitario:z.number(), centro_costo:text, subarea:text, indicador_iva:text})).min(1),
  excepciones:z.array(z.strictObject({codigo:ruleId, detalle:text, confirmado_por:text.nullable()})),
});
export type OrdenCompra = z.infer<typeof orderSchema>;
export type ValidationReport = z.infer<typeof reportSchema>;
export type Finding = z.infer<typeof finding>;
