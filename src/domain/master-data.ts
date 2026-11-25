import { z } from 'zod';
import { email, text } from './documents.ts';

export const suppliers = z.array(z.strictObject({
  codigo_sap: text, nit: text, nombre: text, condiciones_pago_default: text, indicador_iva_default: text, activo: z.boolean(),
}));
export const centers = z.array(z.strictObject({
  centro_costo: text, nombre: text, subareas: z.array(text),
  aprobadores: z.array(z.strictObject({email, nombre: text, tope: z.number()})),
}));
export const taxes = z.array(z.strictObject({codigo: text, descripcion: text, tasa: z.number()}));
export const terms = z.array(z.strictObject({codigo: text, descripcion: text, dias: z.number().int()}));
export const mastersSchema = z.strictObject({proveedores: suppliers, centros: centers, iva: taxes, pagos: terms});
export type Masters = z.infer<typeof mastersSchema>;
