import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prepare } from './prepare.ts';
import { ProcurementError } from '../domain/evidence.ts';
import type { Context, Store } from '../infrastructure/store.ts';

export const proposalSchema=z.object({id:z.string(),questionMessageId:z.string(),caso:z.string(),solicitud_id:z.string(),
  payloadHash:z.string(),contextHash:z.string(),importe:z.number(),moneda:z.string(),reglas:z.array(z.string()),detalles:z.array(z.string()),pregunta:z.string()});
export type Proposal=z.infer<typeof proposalSchema>;
export function currentProposal(store:Store,ctx:Context) {
  const event=store.events.findLast(e=>e.sessionId===ctx.sessionId&&['propuesta','decision','propuesta_invalidada'].includes(e.tipo));
  return event?.tipo==='propuesta'?proposalSchema.parse(event.data):null;
}
export function openQuestion(store:Store,ctx:Context,caso:string) {
  const b=prepare(ctx.directory,caso);
  if(!b.report.confirmaciones.length) throw new ProcurementError('SIN_EXCEPCIONES','No hay excepciones para confirmar.');
  const total=b.solicitud.valor_total.toLocaleString('es-CO');
  const propuesta={id:randomUUID(),questionMessageId:randomUUID(),caso,solicitud_id:b.solicitud.solicitud_id,
    payloadHash:b.payloadHash,contextHash:b.contextHash,importe:b.solicitud.valor_total,moneda:b.solicitud.moneda,
    reglas:b.report.confirmaciones.map(r=>r.regla),detalles:b.report.confirmaciones.map(r=>r.detalle),
    pregunta:'¿Confirmas crear la OC de '+b.solicitud.solicitud_id+' por '+b.solicitud.moneda+' '+total+' con estas excepciones?'};
  store.event(ctx,'propuesta',propuesta);
  return propuesta;
}
// Only called by trusted user-message ingress (or the isolated demo composition).
export function humanDecision(store:Store,ctx:Context,replyTo:string,messageId:string,message:string,origin:'usuario'|'guion_demo') {
  const q=currentProposal(store,ctx);
  if(!q || q.questionMessageId!==replyTo) throw new ProcurementError('CONFIRMACION_REQUERIDA','La pregunta ya no está vigente en esta sesión.');
  const value=message.trim().normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[.!]$/,'');
  const accept=['confirmo','si','acepto'].includes(value);
  if(!accept && !['no','rechazo','cancelar'].includes(value)) throw new ProcurementError('CONFIRMACION_REQUERIDA','Responde «confirmo» o «rechazo» a la propuesta.');
  const b=prepare(ctx.directory,q.caso);
  if(b.contextHash!==q.contextHash || b.payloadHash!==q.payloadHash) {
    store.event(ctx,'propuesta_invalidada',{id:q.id});
    throw new ProcurementError('DATOS_DESACTUALIZADOS','Cambió la evidencia. Procesa nuevamente el expediente.');
  }
  store.event(ctx,'decision',{...q,aceptada:accept,messageId,mensaje:message,origen:origin});
  return {aceptada:accept,caso:q.caso};
}
export function acceptance(store:Store,ctx:Context,caso:string,payloadHash:string,contextHash:string) {
  const last=store.events.findLast(e=>e.sessionId===ctx.sessionId&&['propuesta','decision','propuesta_invalidada'].includes(e.tipo));
  if(last?.tipo==='decision' && last.data.aceptada===true && last.data.caso===caso && last.data.payloadHash===payloadHash && last.data.contextHash===contextHash && last.data.messageId) return last;
  return null;
}
