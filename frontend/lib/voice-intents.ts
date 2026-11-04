import {voiceCopy} from './voice-copy';
import {isMenuQuestion} from './menu-advisor';
import type {CartState,MenuEntry} from './voice-engine';
export type CheckoutContext={phase:string;customerName?:string;nameConfirmed?:boolean;awaitingNameConfirmation?:boolean;languagePreference?:{language:string}};
export const cleanSpeech=(speech:string)=>speech.toLowerCase().replace(/[.!?,]/g,'').replace(/’/g,"'").replace(/\s+/g,' ').trim();
export function orderQuestion(speech:string):'total'|'tax'|'summary'|null{
 const t=cleanSpeech(speech);if(/\b(add|remove|without|extra|instead)\b/.test(t))return null;
 if(/\btax(?:es)?\b/.test(t))return 'tax';
 if(t!=='bill'&&/\b(total|subtotal|bill|how much (?:is (?:it|that|my order)|do i owe|does (?:it|my order) cost))\b/.test(t))return 'total';
 if(/\b(repeat|read|review|check|what(?:'s| is))\b.*\b(?:my |the )?order\b/.test(t)||/^(?:what did i order|order summary)$/.test(t))return 'summary';return null;
}
export function pickupName(speech:string):string|null{
 if(/^(?:what|where|when|who|whose|which|why|how|is|are|do|does|did|can|could|would|should|have|has)\b/i.test(speech.trim()))return null;
 const raw=speech.trim().replace(/^(?:it is |it's )?(?:spelled|spell(?:ing)?(?: is)?)[ :]+/i,'').replace(/^(?:my name is|it is|it's)\s+/i,'');
 const letters=raw.replace(/[.,!?]+$/g,'').split(/[\s,\-]+/).filter(Boolean);
 if(letters.length>=2&&letters.length<=35&&letters.every(l=>/^\p{L}\p{M}*$/u.test(l)))return letters.join('').toLowerCase().replace(/^./,c=>c.toUpperCase());
 const name=speech.trim().replace(/[.!?]+$/g,'').replace(/^(?:my name is|the name is|this is|i am|i'm|i’m|it is|it'?s|name is|put it under|under)\s+/i,'').trim();
 if(!/^[\p{L}\p{M}\s'’-]{2,70}$/u.test(name)||/\b(?:hello|hi|hey|i|we|you|just|checking|want|need|okay|ok|finish|yes|no|confirm|cash|card|pay|order|checkout|checkup|check|pickup|repeat|cancel|help|done|thanks|thank|burger|fries|sticks|name|what|how|why|could|would|can|please|there|add|remove|that's|that is|by)\b/i.test(name))return null;
 return name;
}
export function directSpeech(speech:string,context:CheckoutContext):string|undefined{
 const t=cleanSpeech(speech);
 if(orderQuestion(speech))return speech;
 if(/^(?:how are you(?: doing)?|how is it going|how's it going|i(?:'m| am) (?:good|great|fine|well)(?: thanks)?(?: how are you)?)$/.test(t))return 'friendly checkin';
 if(/^(?:hello|hi|hey|are you there|hello are you there|you there|can you hear me|are you still there|what now|what next|what do i do next|help)$/.test(t))return 'resume checkout';
 if(/^(?:i(?:'m| am) (?:ready|done)|(?:i (?:want|would like) to |can i |let(?:'s| us) )?(?:checkout|check out|checkup)|done|that'?s (?:all|it)|that is (?:all|it)|nothing else|finish|all done|no (?:thanks|thank you|more))$/.test(t))return context.phase==='confirm'?'resume checkout':'done';
 if(context.phase==='name'){
  if(/^(?:yes|yeah|yep|yes (?:please|that'?s (?:right|correct))|correct|that'?s (?:right|correct)|no|nope|wrong|not correct)$/.test(t))return /^(?:no|nope|wrong|not correct)$/.test(t)?'no':'yes';
  if(pickupName(speech))return speech;
 }
 if(context.phase==='payment_link'){if(/^(?:yes|yes please|yes text (?:me|it)|send (?:it|the link)|text (?:me|it))$/.test(t))return 'yes';if(/^(?:no|no thanks|do not text me|don't text me)$/.test(t))return 'no';}
 if(context.phase==='notification'){if(/^(?:text|sms|text me|a text|text please|text me please)$/.test(t))return 'text';if(/^(?:call|a call|call me|call please|call me please)$/.test(t))return 'call';if(/^(?:none|no|neither|no thanks|no updates|no notifications)$/.test(t))return 'none';}
 if(context.phase==='payment'){
  if(/^(?:(?:i(?:'ll| will| want to)|let me) pay |pay |by |with |using )?(?:cash(?: at pickup)?|card|credit(?: card)?|debit(?: card)?)(?: please)?$/.test(t))return /cash/.test(t)?'cash':'card';
 }
 if(context.phase==='confirm'&&/^(?:yes|yeah|yep|yes please|yes confirm|confirm|confirm (?:the |my )?order|place it|(?:that'?s|that is) (?:right|correct)|correct|confirm (?:it|please)|place (?:the |my )?order|go ahead(?: and place (?:the |my )?order)?)$/.test(t))return 'confirm';
 if(/^(?:bye|goodbye|hang up|end (?:the )?call)$/.test(t))return 'end call';if(context.phase==='notes'&&!isMenuQuestion(speech)&&!/^\s*(?:what|which|how much|is|are|does)\b/i.test(speech))return speech;return undefined;
}
export const smsDeliveryAvailable=()=>process.env.NODE_ENV==='test'||process.env.SMS_DELIVERY_ENABLED==='true';
export function phasePrompt(context:CheckoutContext){
 const t=(key:Parameters<typeof voiceCopy>[1],...values:string[])=>voiceCopy(context.languagePreference?.language,key,...values);
 if(context.phase==='complete')return t('already');
 if(context.phase==='name')return context.awaitingNameConfirmation?t('nameCheck',context.customerName??'',Array.from(context.customerName??'').map(c=>c===' '?' / ':c.toUpperCase()).join(', ')):t('name');
 if(context.phase==='notes')return t('notes');
 if(context.phase==='payment')return t('payment');
 if(context.phase==='payment_link')return t(smsDeliveryAvailable()?'link':'linkUnavailable');
 if(context.phase==='notification')return t(smsDeliveryAvailable()?'updates':'updatesUnavailable');
 if(context.phase==='confirm')return t('confirm');
 return t('next');
}
export function explicitMenuLines(speech:string,menu:MenuEntry[],parse:(s:string,m:MenuEntry[])=>{menuItemId:string;quantity:number}[]){
 let normalized=speech;const aliases:[RegExp,RegExp,string][]=[[/\b(?:moz(?:z)?(?:arella)?|cheese) sticks\b/gi,/^mozzarella sticks$/i,'Mozzarella Sticks'],[/\bfies\b/gi,/^crispy fries$/i,'Crispy Fries']];
 for(const [alias,target,name] of aliases)if(menu.some(m=>target.test(m.name)))normalized=normalized.replace(alias,name);
 return parse(normalized,menu);
}
