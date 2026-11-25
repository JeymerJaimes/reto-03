import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { caseId } from '../../../../src/domain/documents.ts';
import { getContext } from '../../../../src/agent/http.ts';
import { useStore } from '../../../../src/infrastructure/store.ts';
export async function GET(_req:Request,{params}:{params:Promise<{caso:string}>}) {
  const {caso}=await params,ctx=await getContext();
  if(!caseId.safeParse(caso).success)return new Response(null,{status:404});
  const store=await useStore(ctx);
  const allowed=store.events.some(e=>e.sessionId===ctx.sessionId&&e.tipo==='herramienta_fin'&&e.data.nombre==='oc_generar_evidencia'&&e.data.resumen==='out/'+caso+'/aprobacion.txt');
  if(!allowed)return new Response(null,{status:404});
  return new Response(await readFile(join(store.root,caso,'aprobacion.txt'),'utf8'),{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="'+caso+'-aprobacion.txt"','Cache-Control':'no-store'}});
}
