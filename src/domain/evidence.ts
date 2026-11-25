import { z } from 'zod';

export const evidenceSchema = z.strictObject({ ruta: z.string(), campo: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export type Evidence = z.infer<typeof evidenceSchema>;
export type Sources = Record<string, Evidence>;
export class ProcurementError extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) { super(mensaje); this.codigo = codigo; }
}
