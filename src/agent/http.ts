import { cookies } from 'next/headers';
import { resolve } from 'node:path';
import { newCookie, sessionId } from './conversation.ts';
export async function getContext() {
  const jar=await cookies();
  let token=jar.get('pf_session')?.value;
  if(!token||!/^[0-9a-f-]{36}$/.test(token)) {
    token=newCookie();jar.set('pf_session',token,{httpOnly:true,sameSite:'strict',path:'/'});
  }
  const directory=process.cwd();
  return {directory,sessionId:sessionId(token),output:resolve(process.env.PROCUREFLOW_OUTPUT||directory+'/out')};
}
