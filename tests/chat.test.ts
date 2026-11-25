import { expect,it,afterEach } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { chat } from '../src/agent/conversation.ts';
import { useStore,releaseStore } from '../src/infrastructure/store.ts';
const ctx={directory:process.cwd(),output:'',sessionId:'chat'};
function start(){ctx.output=mkdtempSync(join(tmpdir(),'procureflow-chat-'));}
afterEach(async()=>{await releaseStore(ctx);rmSync(ctx.output,{recursive:true,force:true});});
const send=(message:string,replyTo?:string)=>chat(ctx,{message,messageId:randomUUID(),...(replyTo&&{replyTo})});
it('chat conserva bloqueos y requiere aceptación del siguiente turno',async()=>{
  start();
  for(const caso of ['sol-002','sol-003']) {
    expect((await send('Procesa '+caso)).result?.estado).toBe('bloqueada');
    expect((await send('confirmo')).error).toBe(true);
  }
  const p=await send('Procesa sol-004');
  expect(p.needsConfirmation).toBe(true);
  expect((await send('confirmo','otra-pregunta')).error).toBe(true);
  const p2=await send('Procesa sol-004');
  const r=await send('confirmo',p2.questionId);
  expect(r.result?.estado).toBe('creada');expect(r.toolCalls.map(t=>t.nombre)).toContain('oc_crear');
  const store=await useStore(ctx);
  const position=store.orders[0]!.payload.posiciones[0]!;
  expect(position.cantidad*position.precio_unitario).toBe(25000000);
  for(const caso of ['sol-005','sol-006']) {
    const next=await send('Procesa '+caso);
    expect(next.needsConfirmation).toBe(true);
    await send('confirmo',next.questionId);
  }
  expect(store.orders.map(o=>o.retroactiva)).toEqual([false,true,false]);
  expect(store.orders[2]?.payload.excepciones.map(e=>e.codigo)).toEqual(['RC6']);
});
it('respeta la consulta sin crear y deduplica la entrega HTTP',async()=>{
  start();await send('Procesa sol-001 pero solo muéstrame los datos');
  expect((await useStore(ctx)).orders).toHaveLength(0);
  const input={messageId:randomUUID(),message:'Procesa sol-001'};
  const first=await chat(ctx,input);
  expect(await chat(ctx,input)).toEqual(first);
  expect((await useStore(ctx)).orders).toHaveLength(1);
});
it('el ciclo del proveedor invoca herramientas verificables sin crear',async()=>{
  start();let round=0;
  const result=await chat(ctx,{messageId:randomUUID(),message:'¿Qué controles tiene sol-004?'},()=>({name:'test',model:'test',
    async send(){round++;return {content:'',usage:12,calls:round===1?[{name:'oc_validar',args:{caso:'sol-004'},id:'call'}]:[]};}}));
  expect(round).toBe(2);expect(result.toolCalls.map(t=>t.nombre)).toContain('oc_validar');expect(result.reply).toContain('6 %');
  expect((await useStore(ctx)).orders).toHaveLength(0);
});
it('una selección nueva no hereda la confirmación pendiente de otro expediente',async()=>{
  start();
  const p=await send('Vista previa sol-004');
  expect(p.needsConfirmation).toBe(true);
  const r=await chat(ctx,{caso:'sol-005',messageId:randomUUID(),message:'confirmo',replyTo:p.questionId!});
  expect(r.error).toBe(true);expect(r.needsConfirmation).toBe(false);
  expect((await useStore(ctx)).orders).toHaveLength(0);
  const b=await chat(ctx,{caso:'sol-003',messageId:randomUUID(),message:'Revisa'});
  expect(b.result?.caso).toBe('sol-003');expect(b.result?.estado).toBe('bloqueada');
});
