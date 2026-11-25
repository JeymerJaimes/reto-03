import { Decimal } from 'decimal.js';
import type { ProcurementCase } from '../infrastructure/fixtures/read-case.ts';
import type { Masters } from './master-data.ts';
import { ProcurementError, type Evidence } from './evidence.ts';
import { reportSchema, type Finding, type ValidationReport } from './order.ts';

export interface Catalog {
  data: Masters;
  ref(catalog: keyof Masters, pointer: string): Evidence;
}
const normalize = (name: string) => name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const nitBase = (nit:string) => nit.split('-')[0]!.replace(/[.\s]/g,'');
const price = (n:number) => new Intl.NumberFormat('es-CO',{maximumFractionDigits:6}).format(n);
export function resolveSupplier(s: NonNullable<ProcurementCase['paquete']['solicitud']>, data: Masters) {
  const matches = data.proveedores.filter(p => s.proveedor_nit ? nitBase(p.nit) === nitBase(s.proveedor_nit) : normalize(p.nombre) === normalize(s.proveedor_nombre));
  if (matches.length > 1) throw new ProcurementError('DATOS_NO_EVALUABLES','Identificación ambigua en el maestro de proveedores.');
  return matches[0];
}
export function evaluate(expediente: ProcurementCase, catalog: Catalog): ValidationReport {
  const {paquete:p,fuentes} = expediente;
  const s = p.solicitud;
  if (!s) throw new ProcurementError('PAQUETE_INCOMPLETO','Falta solicitud.json. Solicita el documento al solicitante.');
  const m = catalog.data;
  const supplier = resolveSupplier(s,m);
  const center = m.centros.find(c => c.centro_costo === s.centro_costo);
  const approver = center?.aprobadores.find(a => a.email.toLowerCase() === p.aprobacion?.de.toLowerCase());
  const centerPath = '/' + m.centros.indexOf(center!);
  const refs = (...keys:string[]) => keys.flatMap(k => fuentes[k] ? [fuentes[k]] : []);
  const supplierRef = catalog.ref('proveedores',supplier ? '/' + m.proveedores.indexOf(supplier) : '/');
  const centerRef = catalog.ref('centros',center ? centerPath : '/');
  const resultados: Finding[] = [];
  const add = (regla:Finding['regla'], severidad:Finding['severidad'], estado:Finding['estado'], detalle:string, evidencias:Evidence[]) =>
    resultados.push({regla,severidad,estado,detalle,evidencias});
  const status = (ok: boolean) => ok ? 'cumple' : 'hallazgo';
  const derived:ValidationReport['derivados'] = {};
  add('RC1','bloqueo',status(Boolean(supplier?.activo)),supplier?.activo ? 'Proveedor activo ' + supplier.codigo_sap :
    'Verifica el NIT y solicita alta o activación del proveedor.',[...refs('solicitud.proveedor_nit','solicitud.proveedor_nombre'),supplierRef]);
  const authorized = Boolean(p.aprobacion?.aprobado && approver);
  add('RC2','bloqueo',status(authorized), authorized ? 'Aprobación acreditada para ' + s.centro_costo :
    'Se requiere aprobación expresa de un líder autorizado en ' + s.centro_costo + '.', [...refs('aprobacion.de','aprobacion.cuerpo','solicitud.centro_costo'),centerRef]);
  if (s.moneda !== 'COP' && approver) throw new ProcurementError('DATOS_NO_EVALUABLES','El maestro no aporta conversión de topes para ' + s.moneda);
  add('RC3','bloqueo',approver ? status(s.valor_total <= approver.tope) : 'no_evaluable',
    approver ? 'Importe ' + price(s.valor_total) + ' COP. Tope del aprobador ' + price(approver.tope) + ' COP.' :
    'Sin relación aprobador–centro para determinar el tope. Revisa RC2.',[...refs('solicitud.valor_total','aprobacion.de'),centerRef]);
  add('RC4','bloqueo',status(Boolean(center?.subareas.includes(s.subarea))),s.centro_costo + ' / ' + s.subarea + '. Verificar pertenencia en el maestro.',[...refs('solicitud.subarea','solicitud.centro_costo'),centerRef]);
  let quoteOk=false;
  let quoteDetail='Falta cotización. Confirma si procede crear la OC sin ella.';
  if (p.cotizacion) {
    if (p.cotizacion.moneda !== s.moneda || s.valor_total <= 0) throw new ProcurementError('DATOS_NO_EVALUABLES','RC5 requiere totales comparables y una base positiva.');
    const difference=new Decimal(p.cotizacion.total).minus(s.valor_total).abs();
    quoteOk=difference.times(100).lte(new Decimal(s.valor_total).times(2));
    quoteDetail='Solicitud ' + price(s.valor_total) + ' ' + s.moneda + ', cotización ' + price(p.cotizacion.total) + ' ' + s.moneda +
      ', diferencia ' + difference.times(100).div(s.valor_total).toDecimalPlaces(4) + ' %. La OC conserva el valor solicitado.';
  }
  add('RC5','confirmacion',status(quoteOk),quoteDetail,refs('solicitud.valor_total','cotizacion.total'));
  if (!s.indicador_iva && supplier) derived.indicador_iva=supplier.indicador_iva_default;
  const tax=m.iva.find(t=>t.codigo === (s.indicador_iva ?? derived.indicador_iva));
  if (!tax && (supplier || s.indicador_iva)) throw new ProcurementError('DATOS_NO_EVALUABLES','Indicador IVA sin referencia en el catálogo.');
  add('RC6','confirmacion',s.indicador_iva ? 'cumple' : tax ? 'hallazgo' : 'no_evaluable',
    tax ? (s.indicador_iva ? 'IVA informado ' : 'Confirma el IVA derivado del proveedor ') + tax.codigo + ' (' + new Decimal(tax.tasa).times(100) + ' %).' : 'Sin proveedor para derivar el IVA.',
    [...refs('solicitud.indicador_iva'),supplierRef,catalog.ref('iva',tax ? '/' + m.iva.indexOf(tax) : '/')]);
  if (!s.condiciones_pago && supplier) derived.condiciones_pago=supplier.condiciones_pago_default;
  const payment=m.pagos.find(t=>t.codigo === (s.condiciones_pago ?? derived.condiciones_pago));
  if (!payment && (supplier || s.condiciones_pago)) throw new ProcurementError('DATOS_NO_EVALUABLES','Condición de pago sin referencia en el catálogo.');
  add('RC7','informativa',s.condiciones_pago ? 'cumple' : payment ? 'hallazgo' : 'no_evaluable',
    payment ? (s.condiciones_pago ? 'Pago informado ' : 'Pago derivado ') + payment.codigo + ' · ' + payment.descripcion : 'Sin proveedor para derivar el pago.',
    [...refs('solicitud.condiciones_pago'),supplierRef,catalog.ref('pagos',payment ? '/' + m.pagos.indexOf(payment) : '/')]);
  const retroactiva=Boolean(p.factura && p.factura.fecha < s.fecha_solicitud);
  add('RC8','confirmacion',p.factura ? status(!retroactiva) : 'no_aplica',p.factura ?
    'Factura ' + p.factura.numero + ' de ' + p.factura.fecha + ', solicitud de ' + s.fecha_solicitud + (retroactiva ? '. La OC conservará la marca retroactiva.' : '.') : 'Sin factura adjunta.',
    refs('factura.numero','factura.fecha','solicitud.fecha_solicitud'));
  add('RC9','confirmacion',p.aprobacion ? status(p.aprobacion.fecha.slice(0,10)>=s.fecha_solicitud) : 'no_evaluable',
    'Fecha de solicitud ' + s.fecha_solicitud + ', aprobación ' + (p.aprobacion?.fecha ?? 'ausente') + '.',refs('aprobacion.fecha','solicitud.fecha_solicitud'));
  const amount=new Decimal(s.cantidad).times(s.valor_unitario);
  add('RC10','bloqueo',status(amount.minus(s.valor_total).abs().lte(1)),'Cantidad × unitario = ' + amount + ', total solicitado = ' + s.valor_total + '.',
    refs('solicitud.cantidad','solicitud.valor_unitario','solicitud.valor_total'));
  const issues = resultados.filter(r=>r.estado==='hallazgo');
  const bloqueos = issues.filter(r=>r.severidad==='bloqueo');
  return reportSchema.parse({apta:!bloqueos.length,retroactiva,resultados,bloqueos,confirmaciones:issues.filter(r=>r.severidad==='confirmacion'),derivados:derived});
}
