import type {MenuEntry} from '../voice-engine';import type {Line} from '../order-contract';import {answerKind} from './assistance';
export type Offer={id:string;itemId:string;category:string;text:string};
export type UpsellState={offers:Offer[];declined:boolean;pending?:Offer;interrupted?:Offer};
export const initialUpsell=():UpsellState=>({offers:[],declined:false});
type Proposal={phase:string;items:Line[];menu:MenuEntry[];requestId:string;language:string;appSpeech:boolean;hesitant:boolean;assisted:boolean;opportunity:'added'|'finishing'|'checkout'|'none'};
export function authorizeUpsell(current:UpsellState,input:Proposal){
 const state=structuredClone(current);let offer:Offer|null=null;
 if(!input.appSpeech||input.phase!=='ordering'||input.opportunity==='checkout'||input.opportunity==='none'||input.hesitant||input.assisted||state.declined||state.pending||state.offers.length>=2||state.offers.some(o=>o.id===input.requestId))return {state,offer};
 const cart=input.menu.filter(m=>input.items.some(l=>l.menuItemId===m.id));
 if(!cart.length||cart.some(m=>m.category?.toLowerCase()==='deals'||/\b(combo|feast|meal)\b/i.test(m.name)))return {state,offer};
 const categories=cart.map(m=>m.category?.toLowerCase());
 const eligible=['sides','drinks'].filter(c=>!categories.includes(c)&&!state.offers.some(o=>o.category===c));
 const item=input.menu.find(m=>eligible[0]===m.category?.toLowerCase()&&m.isAvailable&&(m.stockQty===null||m.stockQty>=1))??input.menu.find(m=>eligible.includes(m.category?.toLowerCase()??'')&&m.isAvailable&&(m.stockQty===null||m.stockQty>=1));
 if(!item)return {state,offer};
 const templates:Record<string,string>={en:`Would you like ${item.name} with that?`,es:`¿Le gustaría añadir ${item.name}?`,ar:`هل تريد إضافة ${item.name}؟`,hi:`क्या आप ${item.name} भी लेना चाहेंगे?`};
 offer={id:input.requestId,itemId:item.id,category:item.category!.toLowerCase(),text:templates[input.language]??templates.en};state.offers.push(offer);state.pending=offer;
 return {state,offer};
}
export function answerUpsell(current:UpsellState,speech:string){
 const state=structuredClone(current),answer=answerKind(speech);let acceptedItemId:string|null=null;let declined=false;
 if(!state.pending&&!state.interrupted)return {state,acceptedItemId,declined};
 if(answer==='no'){state.declined=true;state.pending=undefined;state.interrupted=undefined;declined=true;}
 if(answer==='yes'&&state.pending){acceptedItemId=state.pending.itemId;state.pending=undefined;}
 return {state,acceptedItemId,declined};
}
