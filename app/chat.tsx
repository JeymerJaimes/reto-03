'use client';
import { useEffect, useState, useRef } from 'react';
import { Checks, Fields, OrderView } from './purchase-view.tsx';
import type { Reply } from '../src/agent/conversation.ts';
type Case={id:string;name:string;total:number|null;moneda:string;descripcion:string;centro:string};
type Entry={id:string;role:'user'|'assistant';message?:string;reply?:Reply};
const money=(c:Case)=>c.total===null?'—':c.moneda+' '+c.total.toLocaleString('es-CO');
export default function Chat({selection,cases,model,provider}:{selection:string;cases:Case[];model:string;provider:string}){
  const [list,setList]=useState<Entry[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const end=useRef<HTMLDivElement>(null), retry=useRef<{message:string;messageId:string;replyTo?:string}|null>(null);
  const c=cases.find(x=>x.id===selection);
  useEffect(()=>{fetch('/api/sessions/current?caso='+encodeURIComponent(selection),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(h=>{setList(h.history);setLoaded(true);}).catch(()=>setError('No se pudo abrir la sesión. Recarga la página.'));},[selection]);
  useEffect(()=>{if(busy) end.current?.scrollIntoView({block:'nearest'});},[list,busy]);
  const last=list.at(-1)?.reply;
  async function send(message:string,replyTo?:string){
    if(busy||!loaded||!message.trim())return;
    const existing=retry.current;
    const body=existing?.message===message?existing:{message,messageId:crypto.randomUUID(),...(replyTo&&{replyTo})};
    retry.current=body;setBusy(true);setError('');setText('');
    if(!existing||existing.messageId!==body.messageId)setList(prev=>[...prev,{id:body.messageId,role:'user',message}]);
    try{
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,caso:selection})});
      if(!res.ok)throw Error();
      const reply:Reply=await res.json();
      setList(prev=>[...prev,{id:crypto.randomUUID(),role:'assistant',reply}]);retry.current=null;
    }catch{setError('No se pudo obtener el resultado. Reintenta el mismo mensaje para recuperar su estado.');setText(message);}
    finally{setBusy(false);}
  }
  return <main><aside><div className="brand"><span className="mark">P</span><div>ProcureFlow <b>AI</b></div></div>
    <h2>Expedientes <small>{cases.length}</small></h2><nav aria-label="Expedientes">{cases.map(row=><a key={row.id} href={'?caso='+row.id} aria-current={selection===row.id?'page':undefined} className={'case '+(selection===row.id?'active':'')}><strong>{row.id.toUpperCase()}</strong><span>{row.name}</span></a>)}</nav>
    <div className="provider"><strong>Proveedor configurado</strong><span>{provider} · {model}</span></div></aside>
    <section className="workspace"><header><div><span className="label">Operaciones de compras</span><h1>Asistente de compras</h1></div><span className="sap">SAP simulado</span></header>
    <div className="panel">{c&&<section className="selected"><div className="record"><strong>{c.id.toUpperCase()}</strong><span>{c.centro}</span></div><h3>{c.descripcion}</h3><p>{c.name} · <strong>{money(c)}</strong></p>
    <div className="actions"><button disabled={!loaded||busy} onClick={()=>send('Procesa '+c.id)}>Procesar expediente</button><button className="secondary" disabled={!loaded||busy} onClick={()=>send('Vista previa '+c.id)}>Vista previa</button><button className="secondary" disabled={!loaded||busy} onClick={()=>send('¿Qué controles tiene '+c.id+'?')}>Consultar con IA</button></div></section>}
    <section className="transcript" aria-label="Historial" aria-live="polite">{list.map((m,i)=><article key={m.id} className={m.role}>
      <small>{m.role==='user'?'Tú':'ProcureFlow AI'}</small><div className="message">{m.message??(m.reply?.reply.startsWith('Vista previa\n{')?'Vista previa de la orden guardada en el historial.':m.reply?.reply)}</div>
      {m.reply?.result&&<section className="outcome"><strong className={'status '+m.reply.result.estado}>{{bloqueada:'Compra bloqueada',pendiente:'Pendiente de confirmación',vista_previa:'Vista previa',creada:'Orden registrada'}[m.reply.result.estado]}</strong>
      {m.reply.result.report.retroactiva&&<strong className="status pendiente">Compra retroactiva</strong>}
      {'payload' in m.reply.result&&<OrderView order={m.reply.result.payload}/>}<Checks report={m.reply.result.report}/>
      {'evidencia' in m.reply.result&&<a href={'/api/evidencia/'+m.reply.result.caso} download>Descargar evidencia de aprobación</a>}</section>}
      {m.reply?.preview&&<OrderView order={m.reply.preview}/>}
      {!!m.reply?.toolCalls.length&&<details><summary>Actividad del asistente · {m.reply.toolCalls.length} llamadas</summary>{m.reply.toolCalls.map((t,j)=><details key={j}><summary>{t.nombre} · {t.resultado}</summary><Fields value={t.args}/></details>)}</details>}      {m.reply?.needsConfirmation&&i===list.length-1&&<div className="confirm"><button disabled={busy} onClick={()=>send('confirmo',m.reply?.questionId)}>Confirmar creación</button><button className="secondary" disabled={busy} onClick={()=>send('rechazo',m.reply?.questionId)}>Rechazar</button></div>}
    </article>)}{busy&&<p role="status">Procesando el turno…</p>}<div ref={end}/></section></div>
    <footer>{error&&<p role="alert">{error}</p>}<form onSubmit={e=>{e.preventDefault();void send(text,last?.questionId);}}><input aria-label="Mensaje" value={text} onChange={e=>setText(e.target.value)} placeholder="Pregunta por una solicitud o escribe un comando…" maxLength={4000}/><button disabled={busy||!loaded||!text.trim()}>Enviar</button></form></footer></section></main>;
}


