import { z } from 'zod';
import { ProcurementError } from '../domain/evidence.ts';
import { attempt, requireCase, useStore, type Context, type Store } from '../infrastructure/store.ts';

type Wire<T> = string & {readonly __data?: T};
export function unpack<T>(raw:Wire<T>):T {
  const result=JSON.parse(raw) as {ok:true;data:T}|{ok:false;error:{codigo:string;mensaje:string}};
  if(!result.ok) throw new ProcurementError(result.error.codigo,result.error.mensaje);
  return result.data;
}
export function tool<S extends z.ZodRawShape,T>(name:string,description:string,args:S,
  action:(args:z.output<z.ZodObject<S>>,ctx:Context & {attemptId:string},store:Store)=>T|Promise<T>) {
  const schema=z.strictObject(args);
  return {description,args,async execute(input:unknown,context:Context):Promise<Wire<T>> {
    const ctx=attempt(context);
    let store:Store|undefined;
    try {
      store=await useStore(ctx);
      const parsed=schema.parse(input);
      if('caso' in parsed && typeof parsed.caso==='string') requireCase(ctx,parsed.caso);
      store.event(ctx,'herramienta_inicio',{nombre:name,args:parsed});
      const data=await action(parsed,ctx,store);
      const result=data as Record<string,unknown>;
      const resumen=typeof result.numero_oc==='string'?'OC '+result.numero_oc
        :typeof result.apta==='boolean'?(result.apta?'Apta para revisión':'Bloqueada')
        :typeof result.ruta==='string'?result.ruta
        :typeof result.ruta_trazabilidad==='string'?result.ruta_trazabilidad:'Expediente leído';
      store.event(ctx,'herramienta_fin',{nombre:name,ok:true,resumen});
      return JSON.stringify({ok:true,data});
    } catch(e) {
      const codigo=e instanceof ProcurementError?e.codigo:e instanceof z.ZodError?'DATOS_INVALIDOS':'ERROR_TECNICO';
      const mensaje=e instanceof Error?e.message:'No fue posible completar la operación.';
      const error={codigo,mensaje,accion_sugerida:'Revisa los datos y el estado del expediente antes de reintentar.'};
      try {store?.event(ctx,'herramienta_error',{nombre:name,error});} catch { /* The caller still receives a failure if the audit volume is unavailable. */ }
      return JSON.stringify({ok:false,error});
    }
  }};
}
