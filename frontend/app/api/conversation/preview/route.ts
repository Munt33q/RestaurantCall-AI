import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {listMenu,restaurantTaxRate} from '@/lib/repository';
import {understandVoiceTurn,type BenchmarkProfile} from '@/lib/ai-menu';
import {initialState,decideTurn} from '@/lib/voice-engine';
import {normalizeLines} from '@/lib/order-contract';
export const maxDuration=30;
export async function POST(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const body=await request.json().catch(()=>null);
 if(typeof body?.speech!=='string'||!body.speech.trim()||body.speech.length>1000)return new Response('Invalid speech',{status:400});
 try{
  const started=performance.now();const dbStarted=performance.now();const [menu,taxRateBps]=await Promise.all([listMenu(),restaurantTaxRate()]);const menuMs=Math.round(performance.now()-dbStarted);const state=initialState();
  if(Array.isArray(body.items)&&body.items.length){state.items=normalizeLines(body.items);if(state.items.some(i=>!menu.some(m=>m.id===i.menuItemId)))return new Response('Invalid menu items',{status:400});}
  if(Array.isArray(body.offeredItemIds)&&body.offeredItemIds.every((id:unknown)=>typeof id==='string'&&menu.some(m=>m.id===id)))state.suggestedItemIds=body.offeredItemIds;
  const history=Array.isArray(body.history)?body.history.slice(-6).filter((t:any)=>['user','assistant'].includes(t?.role)&&typeof t?.content==='string').map((t:any)=>({role:t.role,content:t.content.slice(0,500)})):[];
  const profile:BenchmarkProfile|undefined=['baseline','luna-low','sol-low'].includes(body.benchmarkProfile)?body.benchmarkProfile:undefined;
  const interpreted=await understandVoiceTurn(body.speech,menu,{...state,history,taxRateBps},profile);
  const result=decideTurn(state,interpreted.speech,menu,taxRateBps,interpreted.extracted,interpreted.operation,undefined,interpreted);
  // Read-only: no call/session creation, inventory writes, orders, SMS, or payment operations.
  return Response.json({reply:result.reply,reasoningSource:interpreted.reasoningSource,proposedItems:result.state.items,offeredItemIds:result.state.suggestedItemIds??[],phase:result.state.phase,diagnostics:interpreted.diagnostics,timing:{menuMs,totalMs:Math.round(performance.now()-started)}},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Conversation preview unavailable'},{status:503});}
}
