import {readback,type CartState,type MenuEntry} from '../voice-engine';
export function gateRelayCheckout(result:{state:CartState;reply:string;submit:boolean;endCall:boolean},reviewPlayed:boolean,menu:MenuEntry[],tax:number){
 if(result.submit&&!reviewPlayed){result.submit=false;result.state.phase='confirm';result.reply=readback(result.state,menu,tax);}
 return result;
}
