import { createServer, type Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { sha256 } from './fixtures/source.ts';
import { orderSchema, type ValidationReport } from '../domain/order.ts';
import { ProcurementError } from '../domain/evidence.ts';

const eventSchema=z.object({id:z.string(),tipo:z.string(),ts:z.string(),sessionId:z.string(),attemptId:z.string(),data:z.record(z.string(),z.unknown())});
type Event=z.infer<typeof eventSchema>;
const rowSchema=z.object({numero_oc:z.string().regex(/^\d+$/),fecha:z.string(),attemptId:z.string(),retroactiva:z.boolean(),payload:orderSchema});
export type OrderRecord=z.infer<typeof rowSchema>;
export type Context={directory:string;sessionId:string;output?:string;attemptId?:string;allowCreate?:boolean;activeCase?:string};
export const attempt=(ctx:Context):Context & {attemptId:string}=>({...ctx,attemptId:ctx.attemptId??randomUUID()});
function syncDirectory(path:string) {
  if(process.platform==='win32') return;
  const fd=openSync(path,'r'); try {fsyncSync(fd);} finally {closeSync(fd);}
}
export function atomic(path:string,content:string) {
  mkdirSync(dirname(path),{recursive:true});
  const temp=path+'.'+randomUUID()+'.tmp';
  const fd=openSync(temp,'wx',0o600);
  try {writeFileSync(fd,content);fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(temp,path);
  syncDirectory(dirname(path));
}
function jsonLines<T>(path:string,schema:z.ZodType<T>,recoverTail=false):T[] {
  if(!existsSync(path)) return [];
  let raw=readFileSync(path,'utf8');
  if(raw && !raw.endsWith('\n')) {
    if(!recoverTail) throw new Error('Registro incompleto en '+path);
    const end=raw.lastIndexOf('\n')+1;
    atomic(path+'.fragment-'+randomUUID(),raw.slice(end));
    raw=raw.slice(0,end); atomic(path,raw);
  }
  return raw.split('\n').filter(Boolean).map(line=>schema.parse(JSON.parse(line)));
}
const cell=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
export class Store {
  readonly root:string;
  readonly events:Event[];
  readonly orders:OrderRecord[];
  private turn:Promise<unknown>=Promise.resolve();
  constructor(root:string) {
    this.root=root;
    this.events=jsonLines(join(root,'log.jsonl'),eventSchema,true);
    this.orders=jsonLines(join(root,'sap/ordenes.jsonl'),rowSchema);
    const keys=this.orders.map(r=>r.payload.referencia.solicitud_id);
    if(new Set(keys).size!==keys.length || new Set(this.orders.map(r=>r.numero_oc)).size!==keys.length) throw new Error('Registro SAP inconsistente.');
    this.recover();
  }
  exclusive<T>(action:()=>Promise<T>|T):Promise<T> {
    const result=this.turn.then(action);
    this.turn=result.catch(()=>undefined);
    return result;
  }
  event(ctx:Pick<Context,'sessionId'|'attemptId'>,tipo:string,data:Record<string,unknown>) {
    const e={id:randomUUID(),tipo,ts:new Date().toISOString(),sessionId:ctx.sessionId,attemptId:ctx.attemptId??'',data};
    const path=join(this.root,'log.jsonl');
    const fresh=!existsSync(path);
    const fd=openSync(path,'a',0o600);
    try {appendFileSync(fd,JSON.stringify(e)+'\n');fsyncSync(fd);} finally {closeSync(fd);}
    if(fresh) syncDirectory(this.root);
    this.events.push(e);
    return e;
  }
  hasOutcome(id:string) {return this.events.some(e=>e.tipo==='control'&&e.attemptId===id);}
  closeAttempt(ctx:Context,solicitud_id:string,resultado:string,report:Pick<ValidationReport,'retroactiva'|'bloqueos'|'confirmaciones'>,numero_oc='') {
    if(!ctx.attemptId || !this.hasOutcome(ctx.attemptId)) this.event(ctx,'control',{solicitud_id,resultado,numero_oc,
      retroactiva:report.retroactiva,bloqueos:report.bloqueos.map(r=>r.regla),confirmaciones:report.confirmaciones.map(r=>r.regla)});
    this.projectControl();
  }
  projectControl() {
    const columns=['solicitud_id','resultado','numero_oc','retroactiva','bloqueos','confirmaciones','ts'];
    const rows=this.events.filter(e=>e.tipo==='control').map(e=>columns.map(k=>cell(k==='ts'?e.ts:e.data[k])).join(','));
    atomic(join(this.root,'control.csv'),[columns.join(','),...rows].join('\n')+'\n');
  }
  publishOrder(record:OrderRecord) {
    const parsed=rowSchema.parse(record);
    atomic(join(this.root,'sap/ordenes.jsonl'),[...this.orders,parsed].map(r=>JSON.stringify(r)).join('\n')+'\n');
    this.orders.push(parsed);
  }
  private recover() {
    for(const e of this.events.filter(e=>e.tipo==='crear_preparada'&&!this.hasOutcome(e.attemptId))) {
      const order=this.orders.find(o=>o.attemptId===e.attemptId);
      this.event(e,'control',{...e.data.control as Record<string,unknown>,resultado:order?'creada':'interrumpida',numero_oc:order?.numero_oc??''});
    }
    this.projectControl();
  }
}

// Ownership is released by the OS on process death. Containers additionally hold
// a volume-level flock at entrypoint, including across separate network namespaces.
type Owner={store:Store;server:Server};
const shared=globalThis as typeof globalThis & {procureflowStores?:Map<string,Promise<Owner>>};
const owners=shared.procureflowStores??=new Map();
function storeRoot(ctx:Context) {
  const path=resolve(ctx.output??join(ctx.directory,'out'));
  mkdirSync(path,{recursive:true});
  return realpathSync(path);
}
export async function useStore(ctx:Context):Promise<Store> {
  const root=storeRoot(ctx);
  let entry=owners.get(root);
  if(!entry) {
    entry=(async()=>{
      const key=sha256(process.platform==='win32'?root.toLowerCase():root).slice(0,32);
      const socket=process.platform==='win32'?'\\\\.\\pipe\\procureflow-'+key:'\0procureflow-'+key;
      const server=createServer(s=>s.destroy());
      await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(socket,ok);});
      server.unref();
      try{return {server,store:new Store(root)};}catch(e){server.close();throw e;}
    })();
    owners.set(root,entry);
    entry.catch(()=>owners.delete(root));
  }
  return (await entry).store;
}
export async function releaseStore(ctx:Context) {
  const root=storeRoot(ctx);
  const owner=await owners.get(root);
  if(owner) {await new Promise<void>((ok,fail)=>owner.server.close(e=>e?fail(e):ok()));owners.delete(root);}
}
export function requireCase(ctx:Context,caso:string) {
  if(ctx.activeCase && ctx.activeCase!==caso) throw new ProcurementError('ACCION_NO_AUTORIZADA','El expediente no corresponde al turno.');
}
