import {readback,type CartState,type MenuEntry} from '../voice-engine';
export type CheckoutRejection='missing_playback_evidence'|'quote_changed'|'unrecognized_confirmation'|'cart_unavailable';
export type CheckoutResult={state:CartState;reply:string;submit:boolean;endCall:boolean;reviewRequired?:boolean;checkoutRejection?:CheckoutRejection};
export function gateRelayCheckout<T extends CheckoutResult>(result:T,reviewPlayed:boolean,menu:MenuEntry[],tax:number){
 if(result.submit&&!reviewPlayed){result.submit=false;result.state.phase='confirm';result.state.relayReviewReady=false;result.reply=readback(result.state,menu,tax);result.reviewRequired=true;result.checkoutRejection='missing_playback_evidence';}
 return result;
}
