import { z } from 'zod';

export type ToolSpec={type:'function';function:{name:string;description:string;parameters:Record<string,unknown>}};
export type Call={name:string;args:Record<string,unknown>;id:string};
export type Message={role:'system'|'user'|'assistant'|'tool';content:string;calls?:Call[];toolId?:string;name?:string};
export interface LanguageProvider {
  name:string;model:string;
  send(messages:Message[],tools:ToolSpec[],tokens:number):Promise<{content:string;calls:Call[];usage:number|null}>;
}
export function setting(name:string,fallback:number) {
  const n=Number(process.env[name]??fallback);
  return Number.isSafeInteger(n)&&n>0?n:fallback;
}
export function config() {
  const name=process.env.AI_PROVIDER??'ollama';
  if(name!=='ollama'&&name!=='openai') throw Error('AI_PROVIDER inválido.');
  const model=name==='ollama'?(process.env.OLLAMA_MODEL||'qwen3.5:4b'):(process.env.OPENAI_MODEL||'');
  return {name,model,url:name==='ollama'?(process.env.OLLAMA_BASE_URL||'http://127.0.0.1:11434').replace(/\/$/,''):'https://api.openai.com/v1'};
}
const functionCall=z.object({name:z.string(),arguments:z.union([z.record(z.string(),z.unknown()),z.string()])});
const completion=z.object({content:z.string().nullable().optional(),tool_calls:z.array(z.object({id:z.string().optional(),function:functionCall})).optional()});
const ollama=z.object({message:completion,prompt_eval_count:z.number().optional(),eval_count:z.number().optional()});
const openai=z.object({choices:z.array(z.object({message:completion})).min(1),usage:z.object({total_tokens:z.number()}).optional()});
export function provider():LanguageProvider {
  const {name,model,url}=config();
  const local=name==='ollama';
  return {name,model,async send(messages,tools,tokens) {
    if(!model || (!local&&!process.env.OPENAI_API_KEY)) throw Error('Falta configurar el modelo o la credencial del proveedor seleccionado.');
    const serialized=messages.map(m=>({role:m.role,content:m.content,...(m.toolId&&{[local?'tool_name':'tool_call_id']:local?m.name:m.toolId}),
      ...(m.calls?.length&&{tool_calls:m.calls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:local?c.args:JSON.stringify(c.args)}}))})}));
    const body={model,messages:serialized,tools,stream:false,...(local?{think:false,options:{temperature:0,num_predict:tokens}}:{max_completion_tokens:tokens})};
    let res:Response;
    try {res=await fetch(url+(local?'/api/chat':'/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(!local&&{Authorization:'Bearer '+process.env.OPENAI_API_KEY})},body:JSON.stringify(body),signal:AbortSignal.timeout(setting('AI_TIMEOUT_MS',60000)),cache:'no-store'});}
    catch(e){throw Error(e instanceof Error&&/timeout|abort/i.test(e.name)?'Tiempo de espera del modelo agotado.':'Proveedor de IA sin conexión.');}
    if(!res.ok) throw Error('El proveedor rechazó la solicitud (HTTP '+res.status+'). Verifica modelo y configuración.');
    const raw:unknown=await res.json();
    const parsed=local?ollama.parse(raw):openai.parse(raw);
    const message='message' in parsed?parsed.message:parsed.choices[0]!.message;
    const usage='choices' in parsed?parsed.usage?.total_tokens??null:
      parsed.prompt_eval_count!==undefined && parsed.eval_count!==undefined?parsed.prompt_eval_count+parsed.eval_count:null;
    return {content:message.content??'',usage,calls:(message.tool_calls??[]).map((c,i)=>({name:c.function.name,
      args:z.record(z.string(),z.unknown()).parse(typeof c.function.arguments==='string'?JSON.parse(c.function.arguments):c.function.arguments),id:c.id??'call_'+i}))};
  }};
}
