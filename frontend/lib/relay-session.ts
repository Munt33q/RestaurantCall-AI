import crypto from 'node:crypto';
import {client} from './db/client';
import {restaurantId} from './repository';
import {signRelayPayload,type RelayGrant} from './relay-token';
export async function issueLiveRelayToken(callId:string,endedNonce?:string){
 return client().begin(async tx=>{
  const [row]=await tx`SELECT d.session_id,d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${callId} AND s.restaurant_id=${restaurantId()} AND s.expires_at>now() FOR UPDATE OF d`;
  if(!row)throw new Error('Unknown or expired call');const state=row.state_json;
  const reconnect=!!endedNonce;
  if(endedNonce&&state.relayReplacements?.[endedNonce])return signRelayPayload(state.relayReplacements[endedNonce]);
  if(endedNonce&&state.relayActiveNonce!==endedNonce)throw new Error('Stale relay callback');
  if(reconnect&&(state.relayReconnects??0)>=1)throw new Error('Relay retry exhausted');
  let grant=state.relayGrant as RelayGrant|undefined;
  if(!grant||grant.exp<=Date.now()||reconnect){
   grant={aud:'restaurant-call-relay',callId,mode:'live',nonce:crypto.randomUUID(),exp:Date.now()+30*60*1000};
   state.relayGrant=grant;state.relayActiveNonce=grant.nonce;state.relayRevision=(state.relayRevision??0)+(reconnect?1:0);state.relayReviewReady=false;
   if(reconnect){state.relayReconnects=(state.relayReconnects??0)+1;state.relayReplacements={...(state.relayReplacements??{}),[endedNonce!]:grant};}
   await tx`UPDATE draft_carts SET state_json=${tx.json(state)},updated_at=now() WHERE session_id=${row.session_id}`;
  }
  return signRelayPayload(grant);
 });
}
