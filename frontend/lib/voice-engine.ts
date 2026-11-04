import {voiceCopy} from './voice-copy';
import {normalizeCheckoutLanguage} from './customer-languages';
import type {EngagementState} from './engagement/turn';
import {smsDeliveryAvailable,directSpeech,orderQuestion,pickupName,phasePrompt,explicitMenuLines} from './voice-intents';
import {answerMenuQuestion} from './menu-advisor';
import { normalizeLines, type Line } from './order-contract';
import {promotionQuote,type Promotion} from './catalog-policy';
import type {LanguagePreference} from './call-language';
import type {CheckoutResult,CheckoutRejection} from './relay/checkout';
export type MenuEntry = {id:string; name:string; itemNumber:number|null; priceCents:number; isAvailable:boolean; stockQty:number|null;category?:string;description?:string;aliases?:string[];tags?:string[];version?:number};
export type CartState = {relayTransport?:'call-control'|'texml';customerPhone?:string;elevenlabsPreviewOnly?:boolean;isAcceptanceTest?:boolean;languagePreference?:LanguagePreference;languageAttempts?:number;promotions?:Promotion[];catalogRevision?:number;engagement?:EngagementState;phase:'ordering'|'name'|'payment'|'payment_link'|'notification'|'notes'|'confirm'|'complete';notes?:string;notesCollected?:boolean;items:Line[];customerName:string;nameConfirmed?:boolean;awaitingNameConfirmation?:boolean;paymentMethod:'cash'|'stripe'|null;paymentLinkSmsConsent?:boolean;notificationChannel?:'none'|'sms'|'call';notificationConsent?:boolean;quoteKey?:string;misses?:number;lastReply?:string;orderReceipt?:string;suggestedItemIds?:string[];relayReviewReady?:boolean;relayRevision?:number;relayDeliveryId?:string;relayDeliveryTurn?:number;relayRequiresReadback?:boolean};
export function initialState(): CartState {return {phase:'ordering',items:[],customerName:'',paymentMethod:null};}
const words:Record<string,number>={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,واحد:1,اثنان:2,ثلاثة:3,أربعة:4,خمسة:5,ایک:1,دو:2,تین:3,چار:4,پانچ:5,एक:1,दो:2,तीन:3,चार:4,पाँच:5};
const quantityWords=Object.keys(words).join('|');
const escapePattern=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function parseMenuSpeech(speech:string, menu:MenuEntry[]):Line[] {
 let text=speech.normalize('NFC').toLowerCase().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c>='۰'?0x6f0:0x660))).replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ');
 const found:{menuItemId:string;quantity:number;position:number}[]=[];
 // Consume the longest complete names first so a combo never also adds its burger.
 const phrases=menu.flatMap(item=>{
  const full=item.name.toLowerCase();const last=full.split(' ').pop()!;
  const alias=last==='fries'?'fries':last.replace(/s$/,'');
  const unique=menu.filter(m=>m.name.toLowerCase().split(' ').pop()!.replace(/s$/,'')===last.replace(/s$/,'')).length===1;
  return [...(item.aliases??[]).map(phrase=>({item,phrase:phrase.normalize('NFC').toLowerCase()})),{item,phrase:full},...(unique&&alias!==full?[{item,phrase:alias}]:[])];
 }).sort((a,b)=>b.phrase.length-a.phrase.length);
 for(const {item,phrase} of phrases){
  const pattern=new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:(${quantityWords}|\\d+)\\s+)?${escapePattern(phrase)}s?(?![\\p{L}\\p{M}\\p{N}])`,'gu');
  text=text.replace(pattern,(match,q,position)=>{found.push({menuItemId:item.id,quantity:q?(words[q]??Number(q)):1,position});return ' '.repeat(match.length);});
 }
 for(const item of menu){
  if(item.itemNumber===null)continue;
  const spoken=Object.keys(words).find(k=>words[k]===item.itemNumber&&k!=='a'&&k!=='an');
  const pattern=new RegExp(`\\b(?:(${quantityWords}|\\d+)\\s+(?:of\\s+)?)?item(?:\\s+number)?\\s+(?:${item.itemNumber}${spoken?'|'+spoken:''})\\b`,'g');
  text=text.replace(pattern,(match,q,position)=>{found.push({menuItemId:item.id,quantity:q?(words[q]??Number(q)):1,position});return ' '.repeat(match.length);});
 }
 const bare=text.trim();const number=words[bare]??Number(bare);
 if(bare&&Number.isInteger(number)){const item=menu.find(m=>m.itemNumber===number);if(item)found.push({menuItemId:item.id,quantity:1,position:0});}
 return found.sort((a,b)=>a.position-b.position).map(({menuItemId,quantity})=>({menuItemId,quantity}));
}
export function menuReply(speech:string,menu:MenuEntry[],language='en'):string|null{
 const t=(key:Parameters<typeof voiceCopy>[1],...values:string[])=>voiceCopy(language,key,...values);
 if(/\b(what is in|what comes with|tell me about|describe)\b/i.test(speech)){
  const item=[...menu].sort((a,b)=>b.name.length-a.name.length).find(m=>speech.toLowerCase().includes(m.name.toLowerCase()));
  if(item)return t('description',item.name,item.description||t('descriptionMissing'),'$'+(item.priceCents/100).toFixed(2));
 }
 const catalogCategory=menu.find(m=>m.category&&speech.toLowerCase().includes(m.category.toLowerCase()))?.category?.toLowerCase().replace(/s$/,'');
 const category=catalogCategory??speech.match(/\b(mains?|sides?|drinks?|deals?|desserts?)\b/i)?.[1]?.toLowerCase().replace(/s$/,'');
 const browse=/\b(menu|options|what do you have|what .*do you have|list|hear|show)\b/i.test(speech)||/^(mains?|sides?|drinks?|deals?|desserts?)$/i.test(speech.trim());
 if(!browse)return null;
 const available=menu.filter(m=>m.isAvailable&&(m.stockQty===null||m.stockQty>0));
 if(!category)return t('menuCategories',[...new Set(available.map(m=>m.category).filter(Boolean))].join(', '));
 const selected=available.filter(m=>m.category?.toLowerCase().replace(/s$/,'')===category).sort((a,b)=>(a.itemNumber??999)-(b.itemNumber??999));
 return selected.length?selected.map(m=>t('option',m.name,String(m.itemNumber??''),'$'+(m.priceCents/100).toFixed(2))).join('. ')+'. '+t('start'):t('noCategory');
}
export function cartQuote(state:CartState,menu:MenuEntry[],tax:number){return promotionQuote(state.items.map(l=>({itemId:l.menuItemId,priceCents:menu.find(m=>m.id===l.menuItemId)?.priceCents??0,quantity:l.quantity})),tax,state.promotions??[]);}
function quoteKey(state:CartState,menu:MenuEntry[],tax:number){return JSON.stringify([state.catalogRevision??0,cartQuote(state,menu,tax),state.items.map(l=>[l.menuItemId,l.quantity,menu.find(m=>m.id===l.menuItemId)?.priceCents,menu.find(m=>m.id===l.menuItemId)?.version,menu.find(m=>m.id===l.menuItemId)?.isAvailable,menu.find(m=>m.id===l.menuItemId)?.stockQty])]);}
export function readback(state:CartState,menu:MenuEntry[],taxRateBps:number):string {
 const t=(key:Parameters<typeof voiceCopy>[1],...values:string[])=>voiceCopy(state.languagePreference?.language,key,...values);
 const lines=state.items.map(l=>`${l.quantity} ${menu.find(m=>m.id===l.menuItemId)!.name}`).join(', ');
 const quote=cartQuote(state,menu,taxRateBps),money=(cents:number)=>'$'+(cents/100).toFixed(2);
 return [t('review',state.customerName,lines),quote.discountCents?t('discount',money(quote.discountCents)):'',t('total',money(quote.totalCents)),t(state.paymentMethod==='cash'?'cash':'card'),state.notificationChannel?t(state.notificationChannel==='sms'?'updateText':state.notificationChannel==='call'?'updateCall':'updateNone'):'',state.notes?t('kitchen',state.notes):'',t('reviewConfirm')].filter(Boolean).join(' ');
}
export function decideTurn(current:CartState,speech:string,menu:MenuEntry[],taxRateBps:number,extracted?:Line[],operation?:'set',menuCategory?:string,dialogue?:{assistantReply?:string;offeredItemIds?:string[]}) {
 const state:CartState=structuredClone(current);
 const t=(key:Parameters<typeof voiceCopy>[1],...values:string[])=>voiceCopy(state.languagePreference?.language,key,...values);
 speech=normalizeCheckoutLanguage(speech,state);
 speech=directSpeech(speech,state)??speech;
 const text=speech.trim().toLowerCase().replace(/[.!?]/g,'');
 const reply=(message:string,submit=false,endCall=false,reviewRequired=false,checkoutRejection?:CheckoutRejection):CheckoutResult=>({state,reply:message,submit,endCall,reviewRequired,checkoutRejection});
 if(state.phase==='complete')return reply(state.orderReceipt??state.lastReply??t('already'));
 if(!/^(?:start over|cancel|cancel my order)$/.test(text)&&state.items.some(l=>!menu.some(m=>m.id===l.menuItemId&&m.isAvailable&&(m.stockQty===null||m.stockQty>=l.quantity)))){state.phase='ordering';state.quoteKey=undefined;state.relayReviewReady=false;return reply(t('cartUnavailable'),false,false,false,'cart_unavailable');}
 if(text==='end call')return reply(t('draftGoodbye'),false,true);
 const question=orderQuestion(speech);
 if(question){
  if(!state.items.length)return reply([t('empty'),question==='tax'?t('rate',String(taxRateBps/100)):'',t('start')].filter(Boolean).join(' '));
  if(question==='summary'&&state.phase==='confirm')return reply(readback(state,menu,taxRateBps),false,false,true);
  const quote=cartQuote(state,menu,taxRateBps),money=(cents:number)=>'$'+(cents/100).toFixed(2);
  const summary=question==='summary'?t('review',state.customerName,state.items.map(l=>`${l.quantity} ${menu.find(m=>m.id===l.menuItemId)!.name}`).join(', ')):'';
  return reply([summary,t('subtotal',money(quote.subtotalCents)),quote.discountCents?t('discount',money(quote.discountCents)):'',t('tax',String(taxRateBps/100),money(quote.taxCents)),t('total',money(quote.totalCents)),phasePrompt(state)].filter(Boolean).join(' '));
 }
 if(text==='friendly checkin')return reply(t('friendly')+' '+(state.phase==='ordering'&&!state.items.length?t('start'):phasePrompt(state)));
 if(text==='resume checkout')return reply(state.phase==='confirm'?readback(state,menu,taxRateBps):phasePrompt(state),false,false,state.phase==='confirm');
 if(dialogue?.assistantReply){state.misses=0;state.suggestedItemIds=dialogue.offeredItemIds??[];const next=state.phase!=='ordering'?phasePrompt(state):'';return reply(next&&!dialogue.assistantReply.endsWith(next)?`${dialogue.assistantReply} ${next}`:dialogue.assistantReply,false,false,false,state.phase==='confirm'?'unrecognized_confirmation':undefined);}
 if(/^(cancel|cancel my order|start over)$/.test(text)) {Object.assign(state,initialState(),{nameConfirmed:false,awaitingNameConfirmation:false,paymentLinkSmsConsent:false,notificationChannel:undefined,notificationConsent:false,notes:undefined,notesCollected:false,quoteKey:undefined,suggestedItemIds:undefined});return reply(t('cleared'));}
 if(/^(change|change order|change my order|edit order)$/.test(text)){state.phase='ordering';return reply(t('edit'));}
 if(!text){state.misses=(state.misses??0)+1;return reply(state.misses>=3?t('quietEnd'):state.misses===2?t('quietAgain'):t('quiet'),false,state.misses>=3);}
 state.misses=0;
 const answer=answerMenuQuestion(speech,menu,menuCategory,state.languagePreference?.language);
 if(answer){state.suggestedItemIds=menu.filter(m=>m.isAvailable&&(m.stockQty===null||m.stockQty>0)&&answer.includes(voiceCopy(state.languagePreference?.language,'option',m.name,String(m.itemNumber??''),'$'+(m.priceCents/100).toFixed(2)))).map(m=>m.id);return reply(answer);}
 if((state.phase==='ordering'||state.phase==='confirm')&&state.suggestedItemIds?.length&&/^(yes|yes please|add it|that one|i will take it)$/.test(text)){
  if(state.suggestedItemIds.length>1)return reply(t('choose'));
  extracted=[{menuItemId:state.suggestedItemIds[0],quantity:1}];
 }
 if(!/\b(repeat|say that again|what did you say)\b/.test(text))state.suggestedItemIds=undefined;
 if(/\b(repeat|say that again|what did you say)\b/.test(text))return reply(state.lastReply??t('menuFallback'),false,false,state.phase==='confirm'&&state.relayRequiresReadback===true);
 if(/\b(minus|negative)\b|[-−]\s*\d/.test(text))return reply(t('positive'));
 if(state.phase==='ordering'||state.phase==='confirm'){const browsing=menuReply(speech,menu,state.languagePreference?.language);if(browsing)return reply(browsing);}
 if(state.phase==='notes'&&text&&!/^(?:cancel|cancel my order|start over|change order|resume checkout)$/.test(text)){if(/^(?:confirm|yes|done|checkout)$/.test(text))return reply(phasePrompt(state));state.notes=/^(?:no|none|no thanks|no notes|nothing|no special requests)[.!]?$/i.test(text)?'':speech.trim().slice(0,500);state.notesCollected=true;state.phase='confirm';state.quoteKey=quoteKey(state,menu,taxRateBps);return reply(readback(state,menu,taxRateBps),false,false,true);}
 const parsed=extracted??explicitMenuLines(speech,menu,parseMenuSpeech);
 if((state.phase==='ordering'||state.phase==='confirm'||!!extracted||/\b(add|get|order|remove)\b/i.test(speech))&&parsed.length){
  try {
   const remove=/\b(remove|no|without)\b/.test(text);
   const combined=remove?state.items.filter(l=>!parsed.some(p=>p.menuItemId===l.menuItemId)):normalizeLines([...(operation==='set'?state.items.filter(l=>!parsed.some(p=>p.menuItemId===l.menuItemId)):state.items),...parsed]);
   for(const l of combined){const m=menu.find(m=>m.id===l.menuItemId);if(!m||!m.isAvailable||(m.stockQty!==null&&m.stockQty<l.quantity))return reply(t('unavailable',m?.name??l.menuItemId));}
   state.items=combined;state.phase='ordering';return reply(t(remove?'removed':operation==='set'?'updated':'added',parsed.map(l=>`${l.quantity} ${menu.find(m=>m.id===l.menuItemId)!.name}`).join(', ')));
  }catch{return reply(t('quantity'));}
 }
 if(state.phase==='ordering') {
  if(/^(done|that'?s all|that is all|nothing else|finish|checkout|check out|confirm|yes)$/.test(text)&&state.items.length){if(state.customerName&&state.nameConfirmed){state.phase=state.paymentMethod?(state.notificationChannel===undefined?'notification':'confirm'):'payment';if(state.phase==='confirm'){state.quoteKey=quoteKey(state,menu,taxRateBps);return reply(readback(state,menu,taxRateBps),false,false,true);}return reply(phasePrompt(state));}state.phase='name';return reply(t('name'));}
  if(/\b(menu|options|what do you have)\b/.test(text))return reply(menu.filter(m=>m.isAvailable&&(m.stockQty===null||m.stockQty>0)).map(m=>t('option',m.name,String(m.itemNumber??''),'$'+(m.priceCents/100).toFixed(2))).join('. ')+'. '+t('start'));
  return reply(t('item'));
 }
 if(state.phase==='name'){
  if(state.awaitingNameConfirmation&&text==='yes'){state.awaitingNameConfirmation=false;state.nameConfirmed=true;state.phase='payment';return reply(phasePrompt(state));}
  if(state.awaitingNameConfirmation&&text==='no'){state.customerName='';state.awaitingNameConfirmation=false;state.nameConfirmed=false;return reply(t('correctName'));}
  const name=pickupName(speech);if(!name)return reply(phasePrompt(state));
  state.customerName=name;state.nameConfirmed=false;state.awaitingNameConfirmation=true;return reply(phasePrompt(state));
 }
 if(state.phase==='payment'){
  if(/\bcash\b/.test(text))state.paymentMethod='cash';else if(/\b(card|credit|debit|stripe)\b/.test(text))state.paymentMethod='stripe';else return reply(t('payment'));
  state.phase=state.paymentMethod==='stripe'?'payment_link':'notification';return reply(phasePrompt(state));
 }
 if(state.phase==='payment_link'){
  if(text==='yes'&&!smsDeliveryAvailable())return reply(phasePrompt(state));
  if(!['yes','no'].includes(text))return reply(phasePrompt(state));state.paymentLinkSmsConsent=text==='yes';state.phase='notification';return reply((text==='no'?t('noText')+' ':'')+phasePrompt(state));
 }
 if(state.phase==='notification'){
  if(text==='text'&&!smsDeliveryAvailable())return reply(phasePrompt(state));
  if(!['text','call','none'].includes(text))return reply(phasePrompt(state));state.notificationChannel=text==='text'?'sms':text as 'call'|'none';state.notificationConsent=text!=='none';state.phase=state.notesCollected?'confirm':'notes';if(state.phase==='notes')return reply(phasePrompt(state));state.quoteKey=quoteKey(state,menu,taxRateBps);return reply(readback(state,menu,taxRateBps),false,false,true);
 }
 if(state.phase==='confirm'){
  const updated=quoteKey(state,menu,taxRateBps);if(state.quoteKey!==updated){state.quoteKey=updated;state.relayReviewReady=false;return reply(t('changed')+' '+readback(state,menu,taxRateBps),false,false,true,'quote_changed');}
  if(/^(confirm|yes|yes confirm|place (?:the |my )?order|confirm (?:the |my )?order)$/.test(text)) {state.phase='complete';return reply(t('confirmed'),true);}
  return reply(phasePrompt(state),false,false,false,'unrecognized_confirmation');
 }
 return reply(t('retry'));
}
