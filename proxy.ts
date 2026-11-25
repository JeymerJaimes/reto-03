import { NextRequest,NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

// The dedicated tunnel instance must start with PF_PUBLIC=1 and a secret.
export function proxy(request:NextRequest){
  if(process.env.PF_PUBLIC!=='1') return NextResponse.next();
  const password=process.env.PF_ACCESS;
  if(!password) return new Response('Acceso cerrado',{status:503});
  const expected=Buffer.from('Basic '+Buffer.from('evaluador:'+password).toString('base64'));
  const supplied=Buffer.from(request.headers.get('authorization')??'');
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))
    return new Response('Acceso protegido',{status:401,headers:{'WWW-Authenticate':'Basic realm="ProcureFlow"','Cache-Control':'private, no-store'}});
  const headers=new Headers(request.headers);
  headers.delete('authorization');
  return NextResponse.next({request:{headers}});
}
