import type {EngagementState} from './engagement/turn';
import {smsDeliveryAvailable,directSpeech,orderQuestion,pickupName,phasePrompt,explicitMenuLines} from './voice-intents';
import {answerMenuQuestion} from './menu-advisor';
import { normalizeLines, type Line } from './order-contract';
import {promotionQuote,type Promotion} from './catalog-policy';
import type {LanguagePreference} from './call-language';
export type MenuEntry = {id:string; name:string; itemNumber:number|null; priceCents:number; isAvailable:boolean; stockQty:number|null;category?:string;description?:string;aliases?:string[];tags?:string[];version?:number};
export type CartState = {isAcceptanceTest?:boolean;languagePreference?:LanguagePreference;languageAttempts?:number;promotions?:Promotion[];catalogRevision?:number;engagement?:EngagementState;phase:'ordering'|'name'|'payment'|'payment_link'|'notification'|'notes'|'confirm'|'complete';notes?:string;notesCollected?:boolean;items:Line[];customerName:string;nameConfirmed?:boolean;awaitingNameConfirmation?:boolean;paymentMethod:'cash'|'stripe'|null;paymentLinkSmsConsent?:boolean;notificationChannel?:'none'|'sms'|'call';notificationConsent?:boolean;quoteKey?:string;misses?:number;lastReply?:string;suggestedItemIds?:string[];relayReviewReady?:boolean;relayRevision?:number;relayDeliveryId?:string;relayDeliveryTurn?:number;relayRequiresReadback?:boolean};
export function initialState(): CartState {return {phase:'ordering',items:[],customerName:'',paymentMethod:null};}
const words:Record<string,number>={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
const quantityWords=Object.keys(words).join('|');
const escapePattern=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function parseMenuSpeech(speech:string, menu:MenuEntry[]):Line[] {
 let text=speech.toLowerCase().replace(/[^a-z0-9\s]/g,' ');
 const found:{menuItemId:string;quantity:number;position:number}[]=[];
 // Consume the longest complete names first so a combo never also adds its burger.
 const phrases=menu.flatMap(item=>{
  const full=item.name.toLowerCase();const last=full.split(' ').pop()!;
  const alias=last==='fries'?'fries':last.replace(/s$/,'');
  const unique=menu.filter(m=>m.name.toLowerCase().split(' ').pop()!.replace(/s$/,'')===last.replace(/s$/,'')).length===1;
  return [{item,phrase:full},...(unique&&alias!==full?[{item,phrase:alias}]:[])];
 }).sort((a,b)=>b.phrase.length-a.phrase.length);
 for(const {item,phrase} of phrases){
  const pattern=new RegExp(`\\b(?:(${quantityWords}|\\d+)\\s+)?${escapePattern(phrase)}s?\\b`,'g');
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
export function menuReply(speech:string,menu:MenuEntry[]):string|null{
 if(/\b(what is in|what comes with|tell me about|describe)\b/i.test(speech)){
  const item=[...menu].sort((a,b)=>b.name.length-a.name.length).find(m=>speech.toLowerCase().includes(m.name.toLowerCase()));
  if(item)return `${item.name}: ${item.description||'Ask the restaurant about ingredients.'} It is $${(item.priceCents/100).toFixed(2)} before tax.`;
 }
 const catalogCategory=menu.find(m=>m.category&&speech.toLowerCase().includes(m.category.toLowerCase()))?.category?.toLowerCase().replace(/s$/,'');
 const category=catalogCategory??speech.match(/\b(mains?|sides?|drinks?|deals?|desserts?)\b/i)?.[1]?.toLowerCase().replace(/s$/,'');
 const browse=/\b(menu|options|what do you have|what .*do you have|list|hear|show)\b/i.test(speech)||/^(mains?|sides?|drinks?|deals?|desserts?)$/i.test(speech.trim());
 if(!browse)return null;
 const available=menu.filter(m=>m.isAvailable&&(m.stockQty===null||m.stockQty>0));
 if(!category)return 'Our menu has '+[...new Set(available.map(m=>m.category).filter(Boolean))].join(', ')+'. Say a category to hear its items and prices, or order by item name or number.';
 const selected=available.filter(m=>m.category?.toLowerCase().replace(/s$/,'')===category).sort((a,b)=>(a.itemNumber??999)-(b.itemNumber??999));
 return selected.length?selected.map(m=>`Item ${m.itemNumber}: ${m.name}, $${(m.priceCents/100).toFixed(2)}`).join('. ')+'. What would you like to order?':'There are no available items in that category. Please choose another category.';
}
export function cartQuote(state:CartState,menu:MenuEntry[],tax:number){return promotionQuote(state.items.map(l=>({itemId:l.menuItemId,priceCents:menu.find(m=>m.id===l.menuItemId)?.priceCents??0,quantity:l.quantity})),tax,state.promotions??[]);}
function quoteKey(state:CartState,menu:MenuEntry[],tax:number){return JSON.stringify([state.catalogRevision??0,cartQuote(state,menu,tax),state.items.map(l=>[l.menuItemId,l.quantity,menu.find(m=>m.id===l.menuItemId)?.priceCents,menu.find(m=>m.id===l.menuItemId)?.version,menu.find(m=>m.id===l.menuItemId)?.isAvailable,menu.find(m=>m.id===l.menuItemId)?.stockQty])]);}
export function readback(state:CartState,menu:MenuEntry[],taxRateBps:number):string {
 const lines=state.items.map(l=>({item:menu.find(m=>m.id===l.menuItemId)!,quantity:l.quantity}));
 const quote=cartQuote(state,menu,taxRateBps);
 return `${state.customerName}, your order is ${lines.map(l=>`${l.quantity} ${l.item.name}`).join(', ')}. ${quote.discountCents?'Discount $'+(quote.discountCents/100).toFixed(2)+'. ':''}Total including tax is $${(quote.totalCents/100).toFixed(2)}. Payment ${state.paymentMethod==='cash'?'cash at pickup':'by card using a payment link'}.${state.notificationChannel==='sms'?' Ready update by text.':state.notificationChannel==='call'?' A call when your order is ready.':state.notificationChannel==='none'?' No order update messages.':''}${state.notes?` Kitchen notes requested: ${state.notes}. The kitchen will review these requests.`:''} Say confirm to place this order, change order to edit, or cancel.`;
}
export function decideTurn(current:CartState,speech:string,menu:MenuEntry[],taxRateBps:number,extracted?:Line[],operation?:'set',menuCategory?:string,dialogue?:{assistantReply?:string;offeredItemIds?:string[]}) {
 const state:CartState=structuredClone(current);
 speech=directSpeech(speech,state)??speech;
 const text=speech.trim().toLowerCase().replace(/[.!?]/g,'');
 const reply=(message:string,submit=false,endCall=false)=>({state,reply:message,submit,endCall});
 if(state.phase==='complete')return reply('Your order has already been placed. Thank you.');
 if(!/^(?:start over|cancel|cancel my order)$/.test(text)&&state.items.some(l=>!menu.some(m=>m.id===l.menuItemId&&m.isAvailable&&(m.stockQty===null||m.stockQty>=l.quantity)))){state.phase='ordering';state.quoteKey=undefined;state.relayReviewReady=false;return reply('An item in your draft is no longer available in that quantity. Please say start over and choose again.');}
 if(text==='end call')return reply('Your draft has not been placed. Thank you. Goodbye.',false,true);
 const question=orderQuestion(speech);
 if(question){
  if(!state.items.length)return reply(`You have not added any items yet.${question==='tax'?` The configured tax rate is ${taxRateBps/100} percent.`:''} What would you like?`);
  if(question==='summary'&&state.phase==='confirm')return reply(readback(state,menu,taxRateBps));
  const quote=cartQuote(state,menu,taxRateBps);
  const summary=question==='summary'?`Your order is ${state.items.map(l=>`${l.quantity} ${menu.find(m=>m.id===l.menuItemId)!.name}`).join(', ')}. `:'';
  return reply(`${summary}Subtotal is $${(quote.subtotalCents/100).toFixed(2)}. ${quote.discountCents?'Discount $'+(quote.discountCents/100).toFixed(2)+'. ':''}Tax at ${taxRateBps/100} percent is $${(quote.taxCents/100).toFixed(2)}. Total including tax is $${(quote.totalCents/100).toFixed(2)}. ${phasePrompt(state)}`);
 }
 if(text==='friendly checkin')return reply('I am doing well, thank you for asking! '+(state.phase==='ordering'&&!state.items.length?'What can I get started for you?':phasePrompt(state)));
 if(text==='resume checkout')return reply(state.phase==='confirm'?readback(state,menu,taxRateBps):phasePrompt(state));
 if(dialogue?.assistantReply){state.misses=0;state.suggestedItemIds=dialogue.offeredItemIds??[];const next=state.phase!=='ordering'?phasePrompt(state):'';return reply(next&&!dialogue.assistantReply.endsWith(next)?`${dialogue.assistantReply} ${next}`:dialogue.assistantReply);}
 if(/^(cancel|cancel my order|start over)$/.test(text)) {Object.assign(state,initialState(),{nameConfirmed:false,awaitingNameConfirmation:false,paymentLinkSmsConsent:false,notificationChannel:undefined,notificationConsent:false,notes:undefined,notesCollected:false,quoteKey:undefined,suggestedItemIds:undefined});return reply('The draft is cleared. What would you like to order?');}
 if(/^(change|change order|change my order|edit order)$/.test(text)){state.phase='ordering';return reply('Tell me what to add, or say start over to replace the draft.');}
 if(!text){state.misses=(state.misses??0)+1;return reply(state.misses>=3?'I am having trouble hearing you. Please call again, or use our online menu. Goodbye.':state.misses===2?'The audio is not coming through. You can enter an item number, followed by the pound key.':'Sorry, the line was quiet. What would you like?',false,state.misses>=3);}
 state.misses=0;
 const answer=answerMenuQuestion(speech,menu,menuCategory);
 if(answer){state.suggestedItemIds=menu.filter(m=>m.isAvailable&&(m.stockQty===null||m.stockQty>0)&&answer.includes(m.name+', item ')).map(m=>m.id);return reply(answer);}
 if((state.phase==='ordering'||state.phase==='confirm')&&state.suggestedItemIds?.length&&/^(yes|yes please|add it|that one|i will take it)$/.test(text)){
  if(state.suggestedItemIds.length>1)return reply('Which one would you like? Please say its name or item number.');
  extracted=[{menuItemId:state.suggestedItemIds[0],quantity:1}];
 }
 if(!/\b(repeat|say that again|what did you say)\b/.test(text))state.suggestedItemIds=undefined;
 if(/\b(repeat|say that again|what did you say)\b/.test(text))return reply(state.lastReply??'We have mains, sides, drinks, deals, and desserts. Which would you like?');
 if(/\b(minus|negative)\b|[-−]\s*\d/.test(text))return reply('Please use a positive whole number for each quantity.');
 if(state.phase==='ordering'||state.phase==='confirm'){const browsing=menuReply(speech,menu);if(browsing)return reply(browsing);}
 if(state.phase==='notes'&&text&&!/^(?:cancel|cancel my order|start over|change order|resume checkout)$/.test(text)){if(/^(?:confirm|yes|done|checkout)$/.test(text))return reply(phasePrompt(state));state.notes=/^(?:no|none|no thanks|no notes|nothing|no special requests)[.!]?$/i.test(text)?'':speech.trim().slice(0,500);state.notesCollected=true;state.phase='confirm';state.quoteKey=quoteKey(state,menu,taxRateBps);return reply(readback(state,menu,taxRateBps));}
 const parsed=extracted??explicitMenuLines(speech,menu,parseMenuSpeech);
 if((state.phase==='ordering'||state.phase==='confirm'||!!extracted||/\b(add|get|order|remove)\b/i.test(speech))&&parsed.length){
  try {
   const remove=/\b(remove|no|without)\b/.test(text);
   const combined=remove?state.items.filter(l=>!parsed.some(p=>p.menuItemId===l.menuItemId)):normalizeLines([...(operation==='set'?state.items.filter(l=>!parsed.some(p=>p.menuItemId===l.menuItemId)):state.items),...parsed]);
   for(const l of combined){const m=menu.find(m=>m.id===l.menuItemId);if(!m||!m.isAvailable||(m.stockQty!==null&&m.stockQty<l.quantity))return reply(`${m?.name??'That item'} is unavailable in that quantity. Please choose another item.`);}
   state.items=combined;state.phase='ordering';return reply(`${remove?'Removed':operation==='set'?'Updated to':'Added'} ${parsed.map(l=>`${l.quantity} ${menu.find(m=>m.id===l.menuItemId)!.name}`).join(', ')}. Anything else?`);
  }catch{return reply('Please order between one and twenty of each item.');}
 }
 if(state.phase==='ordering') {
  if(/^(done|that'?s all|that is all|nothing else|finish|checkout|check out|confirm|yes)$/.test(text)&&state.items.length){if(state.customerName&&state.nameConfirmed){state.phase=state.paymentMethod?(state.notificationChannel===undefined?'notification':'confirm'):'payment';if(state.phase==='confirm'){state.quoteKey=quoteKey(state,menu,taxRateBps);return reply(readback(state,menu,taxRateBps));}return reply(phasePrompt(state));}state.phase='name';return reply('What name should I put on the order? You can say it or spell it.');}
  if(/\b(menu|options|what do you have)\b/.test(text))return reply(menu.filter(m=>m.isAvailable).map(m=>`Item ${m.itemNumber}: ${m.name}, $${(m.priceCents/100).toFixed(2)}`).join('. ')+'. What would you like?');
  return reply('Please say a menu item name or item number. You can say menu to hear the options.');
 }
 if(state.phase==='name'){
  if(state.awaitingNameConfirmation&&text==='yes'){state.awaitingNameConfirmation=false;state.nameConfirmed=true;state.phase='payment';return reply(phasePrompt(state));}
  if(state.awaitingNameConfirmation&&text==='no'){state.customerName='';state.awaitingNameConfirmation=false;state.nameConfirmed=false;return reply('What is the correct name for pickup?');}
  const name=pickupName(speech);if(!name)return reply(phasePrompt(state));
  state.customerName=name;state.nameConfirmed=false;state.awaitingNameConfirmation=true;return reply(phasePrompt(state));
 }
 if(state.phase==='payment'){
  if(/\bcash\b/.test(text))state.paymentMethod='cash';else if(/\b(card|credit|debit|stripe)\b/.test(text))state.paymentMethod='stripe';else return reply('Please say cash at pickup or card.');
  state.phase=state.paymentMethod==='stripe'?'payment_link':'notification';return reply(phasePrompt(state));
 }
 if(state.phase==='payment_link'){
  if(text==='yes'&&!smsDeliveryAvailable())return reply(phasePrompt(state));
  if(!['yes','no'].includes(text))return reply(phasePrompt(state));state.paymentLinkSmsConsent=text==='yes';state.phase='notification';return reply((text==='no'?'No payment text will be sent. Ask the restaurant for your payment link. ':'')+phasePrompt(state));
 }
 if(state.phase==='notification'){
  if(text==='text'&&!smsDeliveryAvailable())return reply(phasePrompt(state));
  if(!['text','call','none'].includes(text))return reply(phasePrompt(state));state.notificationChannel=text==='text'?'sms':text as 'call'|'none';state.notificationConsent=text!=='none';state.phase=state.notesCollected?'confirm':'notes';if(state.phase==='notes')return reply(phasePrompt(state));state.quoteKey=quoteKey(state,menu,taxRateBps);return reply(readback(state,menu,taxRateBps));
 }
 if(state.phase==='confirm'){
  const updated=quoteKey(state,menu,taxRateBps);if(state.quoteKey!==updated){state.quoteKey=updated;return reply('The price has changed. '+readback(state,menu,taxRateBps));}
  if(/^(confirm|yes|yes confirm|place (?:the |my )?order|confirm (?:the |my )?order)$/.test(text)) {state.phase='complete';return reply('Order confirmed.',true);}
  return reply('Shall I place that order? Say confirm, change order, or cancel.');
 }
 return reply('Please repeat.');
}
