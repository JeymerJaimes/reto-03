import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { readMasters } from '../infrastructure/fixtures/read-masters.ts';
import { readCase } from '../infrastructure/fixtures/read-case.ts';
import { sha256 } from '../infrastructure/fixtures/source.ts';
import { orderSchema } from '../domain/order.ts';
import { evaluate, resolveSupplier } from '../domain/rules.ts';
import { ProcurementError, type Evidence } from '../domain/evidence.ts';
import type { ApprovalEvidence } from '../domain/documents.ts';

export function digest(value: unknown): string {
  return sha256(JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
    return item;
  }));
}
export function evidenceFile(a: ApprovalEvidence | null) {
  if (!a) throw new ProcurementError('PAQUETE_INCOMPLETO','Falta el mensaje original de aprobación.');
  const body=['De: '+a.de,'Para: '+a.para,'Fecha: '+a.fecha,'Asunto: '+a.asunto,'',a.cuerpo.replace(/\r\n?/g,'\n'),''].join('\n');
  const hash=sha256(body);
  return {content:body+'sha256: '+hash+'\n',sha256:hash};
}
export function inspect(directory:string,caso:string) {
  const expediente=readCase(directory,caso);
  const catalog=readMasters(directory);
  const report=evaluate(expediente,catalog);
  return {expediente,catalog,report};
}
export function prepare(directory:string,caso:string) {
  const {expediente,catalog,report}=inspect(directory,caso);
  if (!report.apta) throw new ProcurementError('BLOQUEO_ACTIVO',report.bloqueos.map(r=>r.regla+' '+r.detalle).join(' '));
  const {paquete:p,fuentes}=expediente;
  const s=p.solicitud!;
  const supplier=resolveSupplier(s,catalog.data)!;
  const evidence=evidenceFile(expediente.approval);
  const unit = /\bhoras?\b/i.test(s.descripcion) ? 'H' : 'UN';
  const payload=orderSchema.parse({referencia:{solicitud_id:s.solicitud_id,correo_id:p.correo.id,cotizacion_ref:p.cotizacion?.referencia??null},
    sociedad:'1000',organizacion_compras:'1000',proveedor:{codigo_sap:supplier.codigo_sap,nit:supplier.nit,nombre:supplier.nombre},
    moneda:s.moneda,condiciones_pago:s.condiciones_pago??report.derivados.condiciones_pago,
    aprobador:{email:p.aprobacion!.de,fecha_aprobacion:p.aprobacion!.fecha,evidencia_sha256:evidence.sha256},
    posiciones:[{numero:10,descripcion:s.descripcion.slice(0,40),cantidad:s.cantidad,unidad:unit,precio_unitario:s.valor_unitario,
      centro_costo:s.centro_costo,subarea:s.subarea,indicador_iva:s.indicador_iva??report.derivados.indicador_iva}],
    excepciones:report.confirmaciones.map(r=>({codigo:r.regla,detalle:r.detalle,confirmado_por:null}))});
  const pointer='/'+catalog.data.proveedores.indexOf(supplier)+'/';
  const master=(field:string)=>catalog.ref('proveedores',pointer+field);
  const prd={ruta:'PRD.md',campo:'§7.4',sha256:sha256(readFileSync(resolve(directory,'PRD.md')))};
  const trace:Record<string,Evidence[]>={};
  function from(path:string,...refs:(Evidence|undefined)[]) {trace[path]=refs.filter((r):r is Evidence=>Boolean(r));}
  from('referencia.solicitud_id',fuentes['solicitud.solicitud_id']); from('referencia.correo_id',fuentes['correo.id']);
  from('referencia.cotizacion_ref',fuentes['cotizacion.referencia']??fuentes['correo.adjuntos']);
  from('sociedad',prd); from('organizacion_compras',prd); from('moneda',fuentes['solicitud.moneda']);
  for(const k of ['nombre','nit','codigo_sap']) from('proveedor.'+k,master(k));
  from('condiciones_pago',fuentes['solicitud.condiciones_pago']??master('condiciones_pago_default'));
  from('aprobador.email',fuentes['aprobacion.de']); from('aprobador.fecha_aprobacion',fuentes['aprobacion.fecha']);
  from('aprobador.evidencia_sha256',...['de','para','fecha','asunto','cuerpo'].map(k=>fuentes['aprobacion.'+k]));
  for(const k of ['descripcion','cantidad','centro_costo','subarea']) from('posiciones.0.'+k,fuentes['solicitud.'+k]);
  from('posiciones.0.unidad',fuentes['solicitud.descripcion'],fuentes['cotizacion.texto']);
  from('posiciones.0.numero',prd); from('posiciones.0.precio_unitario',fuentes['solicitud.valor_unitario']);
  from('posiciones.0.indicador_iva',fuentes['solicitud.indicador_iva']??master('indicador_iva_default'));
  report.confirmaciones.forEach((r,i)=>{ for(const k of ['codigo','detalle','confirmado_por']) from('excepciones.'+i+'.'+k,...r.evidencias); });
  const payloadHash=digest(payload);
  const contextHash=digest({version:'RC-v1',fuentes,report,payloadHash});
  return {payload,evidence,trace,report,payloadHash,contextHash,solicitud:s};
}
