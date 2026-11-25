import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ZodType } from 'zod';
import { ProcurementError, type Evidence } from '../../domain/evidence.ts';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function source(directory: string, path: string) {
  const root = realpathSync(resolve(directory, 'fixtures/reto-03'));
  const file = realpathSync(resolve(root, path));
  const inside = relative(root, file);
  if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) {
    throw new ProcurementError('RUTA_INVALIDA', 'La fuente está fuera del catálogo.');
  }
  const bytes = readFileSync(file);
  const ruta = 'fixtures/reto-03/' + inside.split(sep).join('/');
  const hash = sha256(bytes);
  return { ruta, texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes), ref: (campo: string): Evidence => ({ruta, campo, sha256: hash}) };
}
export function optionalSource(directory: string, path: string) {
  return existsSync(resolve(directory, 'fixtures/reto-03', path)) ? source(directory, path) : null;
}
export type Source = ReturnType<typeof source>;
export function parseJson<T>(file: Source, schema: ZodType<T>): T {
  try { return schema.parse(JSON.parse(file.texto)); }
  catch (error) {
    throw new ProcurementError('DOCUMENTO_INVALIDO', file.ruta + ': ' + (error instanceof Error ? error.message : 'JSON inválido'));
  }
}
