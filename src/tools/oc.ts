import { join } from 'node:path';
import { z } from 'zod';
import { caseId, packageSchema } from '../domain/documents.ts';
import { ProcurementError } from '../domain/evidence.ts';
import { defaults, orderSchema } from '../domain/order.ts';
import { readCase } from '../infrastructure/fixtures/read-case.ts';
import { readMasters } from '../infrastructure/fixtures/read-masters.ts';
import { atomic } from '../infrastructure/store.ts';
import { digest, evidenceFile, inspect, prepare } from '../application/prepare.ts';
import { acceptance } from '../application/confirmations.ts';
import { simulatedSap } from '../sap/mock.ts';
import { tool } from './contract.ts';

const caso=caseId.describe('Nombre de carpeta del expediente de compra.');
const paquete=packageSchema.describe('Paquete normalizado devuelto por oc_leer_paquete.');
function same(left:unknown,right:unknown) {
  if(digest(left)!==digest(right)) throw new ProcurementError('DATOS_DESACTUALIZADOS','Los datos no coinciden con el expediente vigente. Vuelve a leerlo.');
}
export const leer_paquete=tool('oc_leer_paquete','Lee los documentos originales y enumera adjuntos ausentes.',
  {caso},({caso},ctx)=>readCase(ctx.directory,caso).paquete);
export const validar=tool('oc_validar','Evalúa RC1–RC10 contra los maestros y devuelve los hallazgos.',
  {caso,paquete},({caso,paquete},ctx,store)=>{
    const b=inspect(ctx.directory,caso);
    same(paquete,b.expediente.paquete);
    if(!b.report.apta) store.closeAttempt(ctx,paquete.solicitud!.solicitud_id,'bloqueada',b.report);
    return b.report;
  });
export const generar_evidencia=tool('oc_generar_evidencia','Genera la evidencia del correo original y calcula SHA-256.',
  {caso},({caso},ctx,store)=>{
    const e=evidenceFile(readCase(ctx.directory,caso).approval);
    atomic(join(store.root,caso,'aprobacion.txt'),e.content);
    return {ruta:'out/'+caso+'/aprobacion.txt',sha256:e.sha256};
  });
export const construir_payload=tool('oc_construir_payload','Construye la vista previa de la OC y traza cada campo.',
  {caso,paquete,derivados:defaults.describe('Valores derivados por oc_validar.')},({caso,paquete,derivados},ctx,store)=>{
    const b=prepare(ctx.directory,caso);
    same(paquete,readCase(ctx.directory,caso).paquete);same(derivados,b.report.derivados);
    if(!store.orders.some(o=>o.payload.referencia.solicitud_id===b.solicitud.solicitud_id))
      atomic(join(store.root,caso,'trazabilidad.json'),JSON.stringify({payload_hash:b.payloadHash,campos:b.trace},null,2));
    return {payload:b.payload,ruta_trazabilidad:'out/'+caso+'/trazabilidad.json',payload_hash:b.payloadHash};
  });
export const crear=tool('oc_crear','Crea una OC elegible o recupera la existente por solicitud.',
  {caso,payload:orderSchema.describe('Orden devuelta por oc_construir_payload.'),confirmado:z.boolean().optional().describe('Indica que se recibió una respuesta humana, sujeta a verificación.')},
  (input,ctx,store)=>store.exclusive(async()=>{
    const {caso,payload}=input;
    const b=prepare(ctx.directory,caso);
    same(payload,b.payload);
    if(ctx.allowCreate===false) throw new ProcurementError('ACCION_NO_AUTORIZADA','El turno solo autoriza consultar.');
    const ref=b.solicitud.solicitud_id;
    const sap=simulatedSap(store,readMasters(ctx.directory).data,ctx.attemptId,b.report.retroactiva);
    const found=await sap.buscarOrdenPorReferencia(ref);
    if(found) {
      const existing=store.orders.find(o=>o.numero_oc===found.numero_oc)!;
      store.closeAttempt(ctx,ref,'idempotente',{...b.report,retroactiva:existing.retroactiva},existing.numero_oc);
      return {numero_oc:existing.numero_oc,fecha:existing.fecha,idempotente:true};
    }
    const decision=acceptance(store,ctx,caso,b.payloadHash,b.contextHash);
    if(b.report.confirmaciones.length && (!input.confirmado || !decision)) {
      store.closeAttempt(ctx,ref,'pendiente',b.report);
      throw new ProcurementError('CONFIRMACION_REQUERIDA','Falta una aceptación humana vigente de esta propuesta en esta sesión.');
    }
    const final=structuredClone(b.payload);
    if(decision) for(const [i,exception] of final.excepciones.entries()) {
      exception.confirmado_por=ctx.sessionId+'/'+String(decision.data.messageId);
      b.trace['excepciones.'+i+'.confirmado_por']=[{ruta:'out/log.jsonl',campo:decision.id,sha256:digest(decision.data)}];
    }
    atomic(join(store.root,caso,'aprobacion.txt'),b.evidence.content);
    atomic(join(store.root,caso,'trazabilidad.json'),JSON.stringify({payload_hash:digest(final),propuesta_hash:b.payloadHash,campos:b.trace},null,2));
    store.event(ctx,'crear_preparada',{caso,referencia:ref,payload_hash:digest(final),control:{
      solicitud_id:ref,retroactiva:b.report.retroactiva,bloqueos:[],confirmaciones:b.report.confirmaciones.map(r=>r.regla)}});
    const result=await sap.crearOrden(final);
    store.closeAttempt(ctx,ref,'creada',b.report,result.numero_oc);
    return {...result,idempotente:false};
  }));
