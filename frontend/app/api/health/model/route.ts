import {healthProbeItems} from '@/lib/menu-health-probe';
import crypto from 'node:crypto';import {staffAuthorized} from '@/lib/auth';import {client} from '@/lib/db/client';import {listMenu,restaurantTaxRate} from '@/lib/repository';import {initialState,decideTurn} from '@/lib/voice-engine';import {understandVoiceTurn} from '@/lib/ai-menu';
export const maxDuration=60;export const dynamic='force-dynamic';
const same=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
export async function GET(request:Request){const auth=request.headers.get('authorization')??'';if(!staffAuthorized()&&![process.env.MODEL_MONITOR_SECRET,process.env.CRON_SECRET].some(s=>s&&same(auth,'Bearer '+s)))return new Response('Unauthorized',{status:401});
 const sql=client(),restaurant=process.env.RESTAURANT_ID!;const fresh=new URL(request.url).searchParams.get('fresh')==='1';
 if(!fresh){const [old]=await sql`SELECT ok,result_json FROM model_health_status WHERE restaurant_id=${restaurant} AND checked_at>now()-interval '45 seconds'`;if(old)return Response.json({...old.result_json,cached:true},{status:old.ok?200:503});}
 try{const [menu,tax]=await Promise.all([listMenu(),restaurantTaxRate()]);const chosen=healthProbeItems(menu);
 const interpreted=await understandVoiceTurn(`Please add one ${chosen[0].name} and one ${chosen[1].name} to my order.`,menu,{...initialState(),history:[],taxRateBps:tax,forceModelProbe:true});const turn=decideTurn(initialState(),interpreted.speech,menu,tax,interpreted.extracted,interpreted.operation,undefined,interpreted);
 const valid=interpreted.reasoningSource==='ai'&&turn.state.items.length===2&&chosen.every(item=>turn.state.items.some(i=>i.menuItemId===item.id&&i.quantity===1));
 const result={ok:valid,modelBacked:interpreted.reasoningSource==='ai',cartItems:turn.state.items.length,provider:interpreted.diagnostics?.provider,model:interpreted.diagnostics?.reportedModel,attempts:interpreted.diagnostics?.attempts??[],error:valid?null:interpreted.diagnostics?.error??'model_chain_contract_failed',checkedAt:new Date().toISOString()};
 await sql`INSERT INTO model_health_status(restaurant_id,checked_at,ok,result_json) VALUES(${restaurant},now(),${valid},${sql.json(result)}) ON CONFLICT(restaurant_id) DO UPDATE SET checked_at=now(),ok=EXCLUDED.ok,result_json=EXCLUDED.result_json`;return Response.json(result,{status:valid?200:503,headers:{'Cache-Control':'no-store'}});
 }catch{console.error('MODEL_HEALTH_PROBE_FAILED');return Response.json({ok:false,error:'health_probe_unavailable'},{status:503});}
}
