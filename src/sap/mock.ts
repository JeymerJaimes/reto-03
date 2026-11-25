import type { SapAdapter } from './adapter.ts';
import type { OrdenCompra } from '../domain/order.ts';
import type { Store } from '../infrastructure/store.ts';
import type { Masters } from '../domain/master-data.ts';
// Created inside Store.exclusive by the purchase application.
export function simulatedSap(store:Store,masters:Masters,attemptId:string,retroactiva:boolean):SapAdapter {
  const search=(ref:string)=>store.orders.find(o=>o.payload.referencia.solicitud_id===ref);
  return {
    async consultarProveedor(nit) { const p=masters.proveedores.find(p=>p.nit===nit);return p?{codigo_sap:p.codigo_sap,activo:p.activo}:null; },
    async buscarOrdenPorReferencia(ref) {const r=search(ref);return r?{numero_oc:r.numero_oc}:null;},
    async crearOrden(payload:OrdenCompra) {
      const previous=search(payload.referencia.solicitud_id);
      if(previous) return {numero_oc:previous.numero_oc,fecha:previous.fecha};
      const numero_oc=String(store.orders.reduce((max,row)=>Math.max(max,Number(row.numero_oc)),4500000000)+1);
      const fecha=new Date().toISOString();
      store.publishOrder({numero_oc,fecha,attemptId,retroactiva,payload});
      return {numero_oc,fecha};
    },
  };
}
