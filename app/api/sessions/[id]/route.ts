import { getContext } from '../../../../src/agent/http.ts';
import { useStore } from '../../../../src/infrastructure/store.ts';
import { currentProposal } from '../../../../src/application/confirmations.ts';
import type { Reply } from '../../../../src/agent/conversation.ts';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params,ctx=await getContext();
  if(id!=='current'&&id!==ctx.sessionId) return Response.json({error:'Sesión no disponible.'},{status:404});
  const store=await useStore(ctx);
  const filter=new URL(req.url).searchParams.get('caso');
  const events=store.events.filter(e=>e.sessionId===ctx.sessionId);
  const byAttempt=new Map<string,string>();
  for(const e of events) {
    const caso=e.data.caso??(e.data.reply as Reply|undefined)?.result?.caso;
    if(typeof caso==='string') byAttempt.set(e.attemptId,caso);
  }
  const active=currentProposal(store,ctx);
  const history=events.filter(e=>['usuario','respuesta'].includes(e.tipo)&&(!filter||byAttempt.get(e.attemptId)===filter))
    .map(e=>{
      const reply=e.data.reply as Reply|undefined;
      return {role:e.tipo==='usuario'?'user':'assistant',message:e.data.message,id:e.id,
        reply:reply?.needsConfirmation&&reply.questionId!==active?.questionMessageId?{...reply,needsConfirmation:false}:reply};
    });
  return Response.json({sessionId:ctx.sessionId,history},{headers:{'Cache-Control':'no-store'}});
}
