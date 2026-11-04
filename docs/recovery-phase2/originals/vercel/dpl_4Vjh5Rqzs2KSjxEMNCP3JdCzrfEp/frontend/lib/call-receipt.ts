import {recordOrderEvent} from './operations';
export async function flagUnheardOrder(tx:any,restaurant:string,providerCallId:string){
 const warning='CALLER RECEIPT UNCONFIRMED: the call ended before order-number playback was verified. Check with the customer before preparing.';
 const orders=await tx`UPDATE orders o SET notes=concat_ws(E'\n',NULLIF(o.notes,''),${warning}::text)
 FROM call_sessions s JOIN draft_carts d ON d.session_id=s.id
 WHERE o.session_id=s.id AND s.restaurant_id=${restaurant} AND s.provider_call_id=${providerCallId}
 AND d.state_json ? 'relayActiveNonce' AND COALESCE(d.state_json->>'relayCompletionPlayed','false')<>'true'
 AND COALESCE(o.notes,'') NOT LIKE '%CALLER RECEIPT UNCONFIRMED:%' RETURNING o.id`;
 for(const order of orders)await recordOrderEvent(tx,order.id,'caller-receipt:'+providerCallId,'caller_receipt_unconfirmed',{reason:'call_ended_before_verified_receipt_playback'});
 return orders.length;
}
