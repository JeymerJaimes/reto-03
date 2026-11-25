import { listCases, readCase } from '../src/infrastructure/fixtures/read-case.ts';
import { config } from '../src/llm/adapter.ts';
import Chat from './chat.tsx';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{caso?:string}>}){
  const root=process.cwd();
  const cases=listCases(root).map(id=>{
    try{const s=readCase(root,id).paquete.solicitud;
      return {id,name:s?.proveedor_nombre??'Solicitud ausente',total:s?.valor_total??null,moneda:s?.moneda??'',descripcion:s?.descripcion??'',centro:s?.centro_costo??''};
    }catch{return {id,name:'Revisar documentos',total:null,moneda:'',descripcion:'',centro:''};}
  });
  const llm=config();
  const requested=(await searchParams).caso;
  const selected=cases.find(c=>c.id===requested)?.id??cases[0]?.id??'';
  return <Chat key={selected} selection={selected} cases={cases} model={llm.model} provider={llm.name}/>;
}

