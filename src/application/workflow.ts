import { attempt, useStore, type Context } from '../infrastructure/store.ts';
import * as oc from '../tools/oc.ts';
import { unpack } from '../tools/contract.ts';
import { openQuestion } from './confirmations.ts';

export async function processCase(context:Context,caso:string,confirmed=false) {
  const ctx=attempt({...context,activeCase:caso});
  const store=await useStore(ctx);
  const paquete=unpack(await oc.leer_paquete.execute({caso},ctx));
  const report=unpack(await oc.validar.execute({caso,paquete},ctx));
  const base={caso,report,solicitud:paquete.solicitud!,attemptId:ctx.attemptId};
  if(!report.apta) return {...base,estado:'bloqueada' as const};
  const evidencia=unpack(await oc.generar_evidencia.execute({caso},ctx));
  const {payload}=unpack(await oc.construir_payload.execute({caso,paquete,derivados:report.derivados},ctx));
  const preview={...base,payload,evidencia};
  if(report.confirmaciones.length && !confirmed) {
    const proposal=openQuestion(store,ctx,caso);
    store.closeAttempt(ctx,base.solicitud.solicitud_id,'pendiente',report);
    return {...preview,estado:'pendiente' as const,proposal};
  }
  if(ctx.allowCreate===false) {
    store.closeAttempt(ctx,base.solicitud.solicitud_id,'vista_previa',report);
    return {...preview,estado:'vista_previa' as const};
  }
  const order=unpack(await oc.crear.execute({caso,payload,confirmado:confirmed},ctx));
  return {...preview,estado:'creada' as const,order};
}
export type WorkflowResult=Awaited<ReturnType<typeof processCase>>;
