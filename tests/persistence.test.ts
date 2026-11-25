import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { processCase } from '../src/application/workflow.ts';
import { humanDecision } from '../src/application/confirmations.ts';
import { attempt, releaseStore, useStore, type Context } from '../src/infrastructure/store.ts';
import { crear } from '../src/tools/oc.ts';

const directory=process.cwd();
let ctx:Context;
function newContext() {ctx={directory,output:mkdtempSync(join(tmpdir(),'procureflow-sap-')),sessionId:'test'};return ctx;}
afterEach(async()=>{if(ctx) {await releaseStore(ctx);rmSync(ctx.output!,{recursive:true,force:true});}});
it('dos sesiones concurrentes comparten una OC y dos intentos',async()=>{
  const c=newContext();
  const results=await Promise.all([processCase(c,'sol-001'),processCase({...c,sessionId:'otro'},'sol-001')]);
  expect(results.map(r=>r.estado==='creada'&&r.order.numero_oc)).toEqual(['4500000001','4500000001']);
  expect((await useStore(c)).orders).toHaveLength(1);
  expect(readFileSync(join(c.output!,'control.csv'),'utf8')).toContain('idempotente');
});
it('una escritura interrumpida después de SAP se concilia tras muerte real del proceso',async()=>{
  const c=newContext();
  const program=[
    "import {useStore} from './src/infrastructure/store.ts';",
    "import {processCase} from './src/application/workflow.ts';",
    "const ctx=JSON.parse(process.env.TEST_CONTEXT);const store=await useStore(ctx);",
    "const commit=store.publishOrder.bind(store);store.publishOrder=r=>{commit(r);process.exit(73)};",
    "await processCase(ctx,'sol-001');"
  ].join('\n');
  const result=await new Promise<number|null>((ok,fail)=>{const p=spawn(process.execPath,['--input-type=module','-e',program],{cwd:directory,env:{...process.env,TEST_CONTEXT:JSON.stringify(c)},stdio:'inherit'});p.on('error',fail);p.on('exit',ok);});
  expect(result).toBe(73);
  expect(readFileSync(join(c.output!,'sap/ordenes.jsonl'),'utf8').trim().split('\n')).toHaveLength(1);
  expect(readFileSync(join(c.output!,'control.csv'),'utf8')).not.toContain('4500000001');
  const store=await useStore(c);
  expect(store.events.filter(e=>e.tipo==='control'&&e.data.resultado==='creada')).toHaveLength(1);
  expect(readFileSync(join(c.output!,'control.csv'),'utf8')).toContain('4500000001');
  const r=await processCase(c,'sol-001');expect(r.estado==='creada'&&r.order.idempotente).toBe(true);
  await releaseStore(c);
  expect((await useStore(c)).orders).toHaveLength(1);
});
it('excluye un segundo proceso con el mismo volumen',async()=>{
  const c=newContext();await useStore(c);
  const run=spawnSync(process.execPath,['--input-type=module','-e',"import {useStore} from './src/infrastructure/store.ts';try{await useStore(JSON.parse(process.env.TEST_CONTEXT));process.exit(8)}catch(e){process.exit(e.code==='EADDRINUSE'?0:9)}"],
    {cwd:directory,env:{...process.env,TEST_CONTEXT:JSON.stringify(c)}});
  expect(run.status).toBe(0);
});
it('repara solo el fragmento final del diario',async()=>{
  const c=newContext();await processCase(c,'sol-001');await releaseStore(c);
  writeFileSync(join(c.output!,'log.jsonl'),'{"truncado":',{flag:'a'});
  expect((await useStore(c)).orders).toHaveLength(1);
  expect(readFileSync(join(c.output!,'log.jsonl'),'utf8').endsWith('\n')).toBe(true);
});
it('el booleano, otra sesión y la pregunta equivocada no autorizan la compra',async()=>{
  const c=newContext();const r=await processCase(c,'sol-004');
  if(r.estado!=='pendiente') throw Error('Falta propuesta');
  const args={caso:'sol-004',payload:r.payload,confirmado:true};
  expect(JSON.parse(await crear.execute(args,c)).error.codigo).toBe('CONFIRMACION_REQUERIDA');
  const store=await useStore(c);
  expect(()=>humanDecision(store,c,'otro','m','confirmo','usuario')).toThrow(/vigente/);
  humanDecision(store,c,r.proposal.questionMessageId,'m','confirmo','usuario');
  expect(JSON.parse(await crear.execute(args,{...c,sessionId:'otra'})).ok).toBe(false);
  expect(JSON.parse(await crear.execute(args,attempt(c))).ok).toBe(true);
  expect(store.orders).toHaveLength(1);
});
