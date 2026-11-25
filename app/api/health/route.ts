import { config } from '../../../src/llm/adapter.ts';
export const dynamic='force-dynamic';
export async function GET(){const {name,model}=config();return Response.json({ok:true,provider:name,model});}
