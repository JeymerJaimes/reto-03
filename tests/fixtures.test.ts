import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { listCases, readCase } from '../src/infrastructure/fixtures/read-case.ts';
import { readMasters } from '../src/infrastructure/fixtures/read-masters.ts';
import { requestSchema } from '../src/domain/documents.ts';

const root = process.cwd();
const totals = [11400000, 8500000, 74000000, 25000000, 3200000, 5400000];
describe('Originales del reto', () => {
  it('lee cuatro maestros y seis carpetas', () => {
    const {data} = readMasters(root);
    expect(Object.values(data).map(rows => rows.length)).toEqual([5,3,3,4]);
    expect(listCases(root)).toHaveLength(6);
  });
  it.each(listCases(root))('%s conserva documentos y evidencia', caso => {
    const {paquete, fuentes} = readCase(root, caso);
    const index = Number(caso.slice(4)) - 1;
    expect(paquete.solicitud?.valor_total).toBe(totals[index]);
    expect(paquete.cotizacion?.total).toBe(index === 3 ? 26500000 : totals[index]);
    expect(paquete.faltantes).toEqual([]);
    expect(paquete.aprobacion?.aprobado).toBe(true);
    expect(paquete.factura?.fecha ?? null).toBe(index === 4 ? '2026-08-10' : null);
    for (const ref of Object.values(fuentes)) {
      const bytes = readFileSync(join(root, ref.ruta));
      expect(ref.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      if (ref.campo.startsWith('/')) expect(JSON.parse(bytes.toString())).toHaveProperty(ref.campo.slice(1));
      else if (ref.campo !== 'texto íntegro') expect(bytes.toString()).toContain(ref.campo);
    }
  });
  it('mantiene ausencias, direcciones UTF-8 y autoridad originales', () => {
    const p = readCase(root,'sol-006').paquete;
    expect(p.solicitud).not.toHaveProperty('proveedor_nit');
    expect(p.solicitud).not.toHaveProperty('indicador_iva');
    expect(p.solicitud).not.toHaveProperty('condiciones_pago');
    expect(p.correo.de).toContain('andrés.');
    expect(p.cotizacion?.nit).toBe('900.555.111-2');
    expect(readCase(root,'sol-003').paquete.aprobacion?.de).toMatch(/^fvargas@/);
    expect(readCase(root,'sol-004').approval?.cuerpo).toContain('25 millones');
  });
});
let scratch: string | undefined;
function copyCase() {
  scratch = mkdtempSync(join(tmpdir(), 'procureflow-test-'));
  const relative = 'fixtures/reto-03/solicitudes/sol-001';
  cpSync(join(root, relative), join(scratch, relative), {recursive:true});
  return {directory:scratch, folder:join(scratch,relative)};
}
afterEach(() => { if (scratch) {rmSync(scratch,{recursive:true,force:true}); scratch=undefined;} });
it('distingue ausencia de JSON malformado y monto inválido', () => {
  const {directory,folder} = copyCase();
  unlinkSync(join(folder,'cotizacion.txt'));
  expect(readCase(directory,'sol-001').paquete.faltantes).toEqual(['cotizacion.txt']);
  writeFileSync(join(folder,'solicitud.json'),'{');
  expect(() => readCase(directory,'sol-001')).toThrow(/solicitud.json/);
  expect(requestSchema.safeParse({...readCase(root,'sol-001').paquete.solicitud,valor_total:'1'}).success).toBe(false);
});
it('rechaza un total TXT ilegible y rutas externas', () => {
  const {directory,folder} = copyCase();
  const f=join(folder,'cotizacion.txt');
  writeFileSync(f,readFileSync(f,'utf8').replace('TOTAL (IVA incluido): COP 11.400.000','TOTAL (IVA incluido): pendiente'));
  expect(() => readCase(directory,'sol-001')).toThrow(/TOTAL/);
  expect(() => readCase(root,'../maestros')).toThrow(/catálogo/);
});
