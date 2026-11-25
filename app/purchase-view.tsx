import type { OrdenCompra, ValidationReport } from '../src/domain/order.ts';

const labels:Record<string,string>={caso:'Expediente',paquete:'Documentos',payload:'Orden propuesta',derivados:'Valores derivados',confirmado:'Confirmación indicada',solicitud_id:'Solicitud',centro_costo:'Centro de costo',subarea:'Subárea',condiciones_pago:'Condición de pago',indicador_iva:'Indicador de IVA',valor_total:'Valor solicitado',valor_unitario:'Precio unitario',nit:'NIT',sha256:'Huella de integridad',codigo_sap:'Código SAP',texto:'Texto original',referencia:'Referencia',validez_hasta:'Vigencia hasta',cuerpo:'Contenido'};
function label(key:string){const name=key.replaceAll('_',' ');return labels[key]??name.charAt(0).toUpperCase()+name.slice(1);}
export function Fields({value}:{value:unknown}){
  if(value===null||value===undefined)return <>Sin informar</>;
  if(typeof value==='boolean')return <>{value?'Sí':'No'}</>;
  if(typeof value==='number')return <>{value.toLocaleString('es-CO')}</>;
  if(typeof value!=='object')return <>{String(value)}</>;
  const entries=Object.entries(value);
  if(!entries.length)return <>Ninguno</>;
  return <dl className="fields">{entries.map(([k,v])=><div key={k}><dt>{Array.isArray(value)?'Elemento '+(Number(k)+1):label(k)}</dt><dd>{v&&typeof v==='object'?<details><summary>Ver detalle</summary><Fields value={v}/></details>:<Fields value={v}/>}</dd></div>)}</dl>;
}
export function OrderView({order}:{order:OrdenCompra}){
  const money=(n:number)=>order.moneda+' '+n.toLocaleString('es-CO');
  return <section className="order"><h3>Orden de compra</h3><dl className="facts">{Object.entries({'Proveedor':order.proveedor.nombre,'NIT':order.proveedor.nit,'Código SAP':order.proveedor.codigo_sap,'Solicitud':order.referencia.solicitud_id,'Cotización':order.referencia.cotizacion_ref??'Sin cotización','Pago':order.condiciones_pago,'Aprobador':order.aprobador.email,'Sociedad / organización':order.sociedad+' / '+order.organizacion_compras}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  <div className="table-scroll"><table><caption>Posiciones de la orden</caption><thead><tr>{['Posición y descripción','Cantidad','Precio unitario','Importe','Imputación','IVA'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{order.posiciones.map(p=><tr key={p.numero}><td>{p.numero} · {p.descripcion}</td><td>{p.cantidad} {p.unidad}</td><td>{money(p.precio_unitario)}</td><td>{money(p.cantidad*p.precio_unitario)}</td><td>{p.centro_costo} · {p.subarea}</td><td>{p.indicador_iva}</td></tr>)}</tbody></table></div></section>;
}
const states={cumple:'Cumple',no_aplica:'No aplica',no_evaluable:'Sin datos suficientes',hallazgo:'Hallazgo'};
export function Checks({report}:{report:ValidationReport}){
  return <details><summary>Ver los {report.resultados.length} controles</summary><ul className="checks">{report.resultados.map(r=><li key={r.regla}><strong>{r.regla} · {r.estado==='hallazgo'?{bloqueo:'Bloqueo',informativa:'Informativo',confirmacion:'Requiere confirmación'}[r.severidad]:states[r.estado]}</strong><span>{r.detalle}</span></li>)}</ul></details>;
}
