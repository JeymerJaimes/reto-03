import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processCase } from './src/application/workflow.ts';
import { humanDecision } from './src/application/confirmations.ts';
import { attempt, releaseStore, useStore } from './src/infrastructure/store.ts';
import { listCases } from './src/infrastructure/fixtures/read-case.ts';

const directory=fileURLToPath(new URL('.',import.meta.url));
const runs=join(directory,'.demo');
mkdirSync(runs,{recursive:true});
const output=join(mkdtempSync(join(runs,'run-')),'out');
const ctx={directory,output,sessionId:'demo'};
const store=await useStore(ctx);
const expected=['creada','bloqueada','bloqueada','pendiente','pendiente','pendiente'];
try {
  const cases=listCases(directory);
  assert.equal(cases.length,6);
  for(const [i,caso] of cases.entries()) {
    const r=await processCase(ctx,caso);
    assert.equal(r.estado,expected[i]);
    console.log(caso,JSON.stringify({apta:r.report.apta,estado:r.estado,bloqueos:r.report.bloqueos.map(x=>x.regla),
      confirmaciones:r.report.confirmaciones.map(x=>x.regla),derivados:r.report.derivados,retroactiva:r.report.retroactiva}));
    if(r.estado==='bloqueada') console.log(r.report.bloqueos.map(x=>x.detalle).join(' '));
    if(r.estado==='creada') {
      const again=await processCase(ctx,caso);
      assert(again.estado==='creada' && again.order.idempotente && again.order.numero_oc===r.order.numero_oc);
      console.log('OC',r.order.numero_oc,'· referencia recuperada al repetir.');
    }
    if(r.estado==='pendiente') {
      console.log(r.proposal.detalles.join(' '),r.proposal.pregunta);
      const next=attempt(ctx);
      humanDecision(store,next,r.proposal.questionMessageId,'decision-'+caso,'confirmo','guion_demo');
      const result=await processCase(next,caso,true);
      assert(result.estado==='creada');
      console.log('Guion: confirmo → OC',result.order.numero_oc);
    }
  }
  assert.equal(store.orders.length,4);
  const cloud=store.orders.find(o=>o.payload.referencia.solicitud_id==='SOL-2026-004')!.payload.posiciones[0]!;
  assert.equal(cloud.cantidad*cloud.precio_unitario,25000000);
  assert.equal(store.orders.find(o=>o.payload.referencia.solicitud_id==='SOL-2026-005')!.retroactiva,true);
  assert.deepEqual(store.orders.find(o=>o.payload.referencia.solicitud_id==='SOL-2026-006')!.payload.excepciones.map(e=>e.codigo),['RC6']);
  console.log('6 expedientes · 4 OC únicas · 2 bloqueos · 3 confirmaciones. Salida:',output);
} finally {await releaseStore(ctx);}
