import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { attempt, useStore, type Context, type Store } from '../infrastructure/store.ts';
import { currentProposal, humanDecision } from '../application/confirmations.ts';
import { processCase, type WorkflowResult } from '../application/workflow.ts';
import { provider, setting, type LanguageProvider, type Message, type ToolSpec } from '../llm/adapter.ts';
import * as tools from '../tools/oc.ts';
import { unpack } from '../tools/contract.ts';
import { caseId } from '../domain/documents.ts';
import { readCase } from '../infrastructure/fixtures/read-case.ts';
import { digest } from '../application/prepare.ts';

export const inputSchema=z.strictObject({message:z.string().trim().min(1).max(4000),messageId:z.uuid(),caso:caseId.optional(),sessionId:z.string().optional(),replyTo:z.string().optional()});
export type ChatInput=z.infer<typeof inputSchema>;
type Order=import('../domain/order.ts').OrdenCompra;
type ToolView={nombre:string;args:unknown;resultado:string};
export type Reply={reply:string;toolCalls:ToolView[];needsConfirmation:boolean;questionId?:string;preview?:Order;result?:WorkflowResult;provider?:string;error?:boolean};
function summary(r:WorkflowResult):string {
  if(r.estado==='bloqueada') return 'Compra bloqueada. '+r.report.bloqueos.map(x=>x.regla+' · '+x.detalle).join(' ');
  if(r.estado==='pendiente') return r.proposal.detalles.join('\n')+'\n'+r.proposal.pregunta;
  if(r.estado==='vista_previa') return 'Vista previa disponible para '+r.solicitud.solicitud_id+'.';
  return 'OC '+r.order.numero_oc+(r.order.idempotente?' recuperada':' creada')+' por '+r.solicitud.moneda+' '+r.solicitud.valor_total.toLocaleString('es-CO')+'. Evidencia: '+r.evidencia.ruta;
}
function resultReply(r:WorkflowResult):Reply {
  return {reply:summary(r),result:r,toolCalls:[],needsConfirmation:r.estado==='pendiente',...(r.estado==='pendiente'&&{questionId:r.proposal.questionMessageId})};
}
function callsFor(store:Store,id:string) {
  const events=store.events.filter(e=>e.attemptId===id);
  return events.flatMap((event,i)=>{
    if(event.tipo!=='herramienta_inicio') return [];
    const end=events.slice(i+1).find(e=>['herramienta_fin','herramienta_error'].includes(e.tipo)&&e.data.nombre===event.data.nombre);
    return [{nombre:String(event.data.nombre),args:event.data.args,resultado:end?.tipo==='herramienta_fin'?String(end.data.resumen??'Completada'): 'Error o interrupción'}];
  });
}
const toolNames=['leer_paquete','validar','generar_evidencia','construir_payload','crear'] as const;
const specs:ToolSpec[]=toolNames.map(n=>({type:'function',function:{name:'oc_'+n,description:tools[n].description,parameters:{
  type:'object',properties:{caso:{type:'string',description:'Expediente mencionado en el mensaje.'}},required:['caso'],additionalProperties:false}}}));
const modelArgs=z.strictObject({caso:caseId});
async function converse(ctx:Context,store:Store,msg:string,caso:string|undefined,llm:LanguageProvider):Promise<Reply> {
  if(!caso) return {reply:'Indica el expediente, por ejemplo «¿Qué controles tiene sol-004?».',needsConfirmation:false,toolCalls:[]};
  const safe={...ctx,activeCase:caso,allowCreate:false};
  const messages:Message[]=[{role:'system',content:readFileSync(join(ctx.directory,'agent/prompt.md'),'utf8')+'\n'+readFileSync(join(ctx.directory,'src/knowledge/ordenes-compra.md'),'utf8')},
    {role:'user',content:msg+'\nExpediente activo: '+caso}];
  let preview:Order|undefined;
  let answer='El modelo no solicitó una herramienta. Puedes usar «Procesa '+caso+'» para ejecutar el flujo.';
  // Financial facts are rendered from tool results even if model prose differs.
  const available=specs.filter(s=>s.function.name!=='oc_crear');
  const limit=setting('AI_MAX_ITERATIONS',25);
  for(let i=0;i<limit;i++) {
    const maxOutput=setting('AI_MAX_OUTPUT_TOKENS',512);
    const reserve=Buffer.byteLength(JSON.stringify({messages,tools:available}))+1024+maxOutput;
    const spent=store.events.filter(e=>e.sessionId===ctx.sessionId&&e.tipo==='tokens').reduce((n,e)=>n+Number(e.data.delta),0);
    if(spent+reserve>setting('AI_MAX_SESSION_TOKENS',65536)) throw Error('Presupuesto de tokens de sesión agotado.');
    store.event(ctx,'tokens',{delta:reserve,proveedor:llm.name});
    const result=await llm.send(messages,available,maxOutput);
    if(result.usage!==null) store.event(ctx,'tokens',{delta:result.usage-reserve,proveedor:llm.name});
    if(!result.calls.length) return {reply:answer,...(preview&&{preview}),provider:llm.name,needsConfirmation:false,toolCalls:[]};
    messages.push({role:'assistant',content:'',calls:result.calls});
    for(const call of result.calls) {
      if(!available.some(t=>t.function.name===call.name)||modelArgs.parse(call.args).caso!==caso) throw Error('El modelo propuso una herramienta o un expediente fuera del turno.');
      store.event(ctx,'llm_tool',{proveedor:llm.name,modelo:llm.model,nombre:call.name,caso});
      const p=unpack(await tools.leer_paquete.execute({caso},safe));
      if(call.name==='oc_leer_paquete') {
        answer=p.solicitud?p.solicitud.solicitud_id+' · '+p.solicitud.descripcion+' · '+p.solicitud.moneda+' '+p.solicitud.valor_total.toLocaleString('es-CO'):'Solicitud ausente.';
      } else if(call.name==='oc_generar_evidencia') {
        const e=unpack(await tools.generar_evidencia.execute({caso},safe));answer='Evidencia '+e.ruta+' · SHA-256 '+e.sha256;
      } else {
        const report=unpack(await tools.validar.execute({caso,paquete:p},safe));
        answer=report.resultados.map(r=>r.regla+' · '+r.estado+' · '+r.detalle).join('\n');
        if(call.name==='oc_construir_payload'&&report.apta) {
          const b=unpack(await tools.construir_payload.execute({caso,paquete:p,derivados:report.derivados},safe));preview=b.payload;answer='Vista previa de '+b.payload.referencia.solicitud_id+'.';
        }
      }
      messages.push({role:'tool',toolId:call.id,name:call.name,content:answer});
    }
    // A bounded follow-up gives the model a chance to request a distinct tool.
    if(i>0 && result.calls.every(c=>messages.slice(0,-result.calls.length-1).some(m=>m.calls?.some(p=>p.name===c.name)))) break;
  }
  return {reply:answer+'\nFin del ciclo de consulta.',...(preview&&{preview}),provider:llm.name,needsConfirmation:false,toolCalls:[]};
}
const queues=new Map<string,Promise<unknown>>();
export async function chat(context:Context,input:ChatInput,makeProvider:()=>LanguageProvider=provider):Promise<Reply> {
  const previous=queues.get(context.sessionId)??Promise.resolve();
  const next=previous.catch(()=>undefined).then(()=>turn(context,input,makeProvider));
  queues.set(context.sessionId,next);
  try{return await next;}finally{if(queues.get(context.sessionId)===next) queues.delete(context.sessionId);}
}
async function turn(context:Context,input:ChatInput,makeProvider:()=>LanguageProvider) {
  const ctx=attempt(context),store=await useStore(ctx);
  const old=store.events.findLast(e=>e.sessionId===ctx.sessionId&&e.tipo==='respuesta'&&e.data.messageId===input.messageId);
  if(old) return old.data.reply as Reply;
  const prior=store.events.find(e=>e.sessionId===ctx.sessionId&&e.tipo==='usuario'&&e.data.messageId===input.messageId);
  if(prior){if(prior.data.message!==input.message) throw Error('El identificador de mensaje ya fue utilizado.');ctx.attemptId=prior.attemptId;}

  const offered=currentProposal(store,ctx);
  const historyCase=store.events.findLast(e=>e.sessionId===ctx.sessionId&&e.tipo==='caso_activo')?.data.caso;
  const matches=[...input.message.toLowerCase().matchAll(/\bsol-(?:2026-)?(\d{3})\b/g)].map(m=>'sol-'+m[1]);
  const caso=input.caso??matches[0]??(typeof historyCase==='string'?historyCase:undefined);
  if(!prior) store.event(ctx,'usuario',{messageId:input.messageId,message:input.message,caso});
  let reply:Reply;
  try {
    if(input.caso && matches.some(id=>id!==input.caso)) throw Error('Selecciona el expediente mencionado en el menú.');
    if(new Set(matches).size>1) throw Error('Selecciona un expediente por turno.');
    const decision=/^(confirmo|s[ií]|acepto|no|rechazo|cancelar)[.!]?$/i.test(input.message.trim());
    if(decision) {
      if(!offered||!input.replyTo||(input.caso&&offered.caso!==input.caso)) throw Error('No hay una pregunta vigente vinculada a esta respuesta.');
      const d=humanDecision(store,ctx,input.replyTo,input.messageId,input.message,'usuario');
      if(d.aceptada) reply=resultReply(await processCase(ctx,d.caso,true));
      else {
        store.event(ctx,'control',{solicitud_id:offered.solicitud_id,resultado:'rechazada',numero_oc:'',retroactiva:offered.reglas.includes('RC8'),bloqueos:[],confirmaciones:offered.reglas});store.projectControl();
        reply={reply:'Propuesta rechazada. El intento queda registrado.',needsConfirmation:false,toolCalls:[]};
      }
    } else {
      if(offered) store.event(ctx,'propuesta_invalidada',{id:offered.id,motivo:'nuevo turno'});
      if(caso) store.event(ctx,'caso_activo',{caso});
      const command=/^(procesa(?:r)?|crea(?:r)?|revisa(?:r)?|muestra(?:me)?|muéstrame|vista previa)\b/i.test(input.message);
      const preview=!/^(?:procesa(?:r)?|crea(?:r)?)\s+(?:(?:la\s+)?(?:solicitud|orden|oc)\s+)?["“]?(?:sol-(?:2026-)?\d{3})["”]?[.!]?$/i.test(input.message.trim());
      if(caso && command) reply=resultReply(await processCase({...ctx,allowCreate:!preview},caso));
      else reply=await converse(ctx,store,input.message,caso,makeProvider());
    }
  } catch(e) {
    const message=e instanceof Error?e.message:'Error de procesamiento.';
    const active=currentProposal(store,ctx);
    const pending=active&&(!input.caso||active.caso===input.caso)?active:null;
    reply={reply:message,needsConfirmation:Boolean(pending),...(pending&&{questionId:pending.questionMessageId}),error:true,toolCalls:[]};
    if(caso&&!store.hasOutcome(ctx.attemptId)&&!store.events.some(e=>e.attemptId===ctx.attemptId&&e.tipo==='crear_preparada')) {
      let solicitud_id='';try{solicitud_id=readCase(ctx.directory,caso).paquete.solicitud?.solicitud_id??'';}catch{/* Input may be unreadable. */}
      store.event(ctx,'control',{solicitud_id,resultado:'error',numero_oc:'',retroactiva:pending?pending.reglas.includes('RC8'):'',bloqueos:[],confirmaciones:[],motivo:message});store.projectControl();
    }
  }
  reply.toolCalls=callsFor(store,ctx.attemptId);
  store.event(ctx,'respuesta',{messageId:input.messageId,caso,reply});
  return reply;
}
export function sessionId(cookie:string) {return digest(cookie);}
export const newCookie=()=>randomUUID();


