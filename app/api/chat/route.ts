import { chat, inputSchema } from '../../../src/agent/conversation.ts';
import { getContext } from '../../../src/agent/http.ts';
export const runtime='nodejs';
export async function POST(req:Request) {
  if(req.headers.get('sec-fetch-site')==='cross-site') return Response.json({error:'Origen no permitido.'},{status:403});
  try {
    const input=inputSchema.safeParse(await req.json());
    if(!input.success) return Response.json({error:'Mensaje inválido.'},{status:400});
    const ctx=await getContext();
    if(input.data.sessionId&&input.data.sessionId!==ctx.sessionId) return Response.json({error:'Sesión inválida.'},{status:403});
    return Response.json(await chat(ctx,input.data));
  } catch {return Response.json({error:'No se pudo completar el turno. Comprueba el almacenamiento y reintenta.'},{status:503});}
}
