import type {MenuEntry} from './voice-engine';
const available=(m:MenuEntry)=>m.isAvailable&&(m.stockQty===null||m.stockQty>0);
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean).map(w=>w.replace(/s$/,'')).join(' ');
export function isMenuQuestion(speech:string){return /\b(?:do (?:you|u)(?: (?:have|sell|serve|carry|offer))?|have you got|is .*(?:available|in stock|on (?:the |your )?menu)|(?:can|could) (?:you|u) (?:recommend|suggest)|what .*recommend|anything similar|something similar|alternatives?|recommend|suggest)\b/i.test(speech);}
export function questionCategory(speech:string,menu:MenuEntry[]):string|undefined{
 const t=speech.toLowerCase();
 if(/\b(drinks?|sodas?|cola|coke|pepsi|sprite|fanta|lemonade|water|juice|tea|coffee|espresso|latte|shakes?|milkshakes?|smoothies?|boba)\b/.test(t))return 'Drinks';
 if(/\b(combos?|deals?|meals?|feast)\b/.test(t))return 'Deals';
 if(/\b(burgers?|chicken|wraps?|pizza|pasta|sandwich|tenders?|rice|biryani)\b/.test(t))return 'Mains';
 if(/\b(fries|sides?|salad|rings|sticks)\b/.test(t))return 'Sides';
 if(/\b(desserts?|brownies?|cake|cookies?|ice cream)\b/.test(t))return 'Desserts';
 return [...menu].sort((a,b)=>b.name.length-a.name.length).find(m=>t.includes(m.name.toLowerCase()))?.category;
}
function topic(speech:string){const what=speech.match(/what\s+(.+?)\s+do (?:you|u) (?:have|sell|serve|carry|offer)/i);if(what)return what[1].replace(/\b(?:a|an|the|any|some)\b/gi,'').trim();return speech.replace(/[?!.]/g,'').replace(/^.*?\b(?:do (?:you|u)(?: (?:have|sell|serve|carry|offer))?|have you got|is|can (?:you|u) recommend|could (?:you|u) suggest|recommend|suggest)\s+/i,'').replace(/\b(?:available|in stock|on (?:the |your )?menu|or something similar|anything similar|something similar|please)\b/gi,'').replace(/\b(?:a|an|the|any|some)\b/gi,'').replace(/\s+/g,' ').trim().slice(0,90)||'that item';}
function options(items:MenuEntry[]){return items.slice(0,3).map(m=>`${m.name}, item ${m.itemNumber}, $${(m.priceCents/100).toFixed(2)}`).join('; ');}
export function answerMenuQuestion(speech:string,menu:MenuEntry[],categoryHint?:string):string|null{
 if(!isMenuQuestion(speech))return null;
 const requested=topic(speech),key=normalized(requested);
 const category=questionCategory(speech,menu)??categoryHint;
 const exact=menu.filter(m=>normalized(m.name)===key);
 const family=/^(burger|drink|soda|shake|milkshake|side|main|deal|combo|dessert|chicken|frie)$/.test(key);
 const familyItems=family?menu.filter(m=>category===m.category&&(key==='burger'?/burger/i.test(m.name):/shake|milkshake/.test(key)?/shake/i.test(m.name):true)):[];
 const inStock=menu.filter(available);
 let similar=inStock.filter(m=>m.category===category&&!exact.some(x=>x.id===m.id)).sort((a,b)=>{
  const score=(m:MenuEntry)=>normalized(m.name).split(' ').filter(w=>key.split(' ').includes(w)).length+(/shake|milkshake/.test(key)&&/shake/i.test(m.name)?4:0)+(/burger/.test(key)&&/burger/i.test(m.name)?4:0);
  return score(b)-score(a)||(a.itemNumber??999)-(b.itemNumber??999);
 });
 const kind=/shake|milkshake/.test(key)?/shake/i:/\b(pepsi|coke|cola|soda|sprite|fanta)\b/.test(key)?/cola|soda|pepsi|coke|sprite|fanta/i:/burger/.test(key)?/burger/i:null;
 const sameKind=kind?similar.filter(m=>kind.test(m.name)):[];
 if(sameKind.length)similar=sameKind;
 const suggestions=similar.length?` ${similar.length===1?'A similar option is':'Similar options are'} ${options(similar)}.`:'';
 if(exact.length){const m=exact[0];return available(m)?`Yes, we have ${options([m])}. Would you like to add it?`:`${m.name} is currently unavailable.${suggestions}${suggestions?' Would you like one of those instead?':''}`;}
 if(familyItems.length){const offered=familyItems.filter(available);return offered.length?`Yes, we have ${options(offered)}. Which would you like?`:`Those items are currently unavailable.${suggestions}`;}
 if(/\b(recommend|suggest|similar|alternative)\b/i.test(speech)&&similar.length)return `You could try ${options(similar)}. Would you like one of those?`;
 return `We do not carry ${requested} on our menu.${suggestions||' We have mains, sides, drinks, deals, and desserts. Which category interests you?'}${suggestions?' Would you like one of those instead?':''}`;
}

export function dietaryMenuReply(speech:string,menu:MenuEntry[]):string|null{
 if(!/\b(?:diet(?: free)?|zero[ -]?sugar|sugar[ -]?free|no sugar)\b/i.test(speech)||!(/\b(?:have|carry|sell|serve|any|options|available|what|which)\b/i.test(speech)))return null;
 const listed=menu.filter(m=>available(m)&&/\b(?:diet|zero[ -]?sugar|sugar[ -]?free|no sugar)\b/i.test(m.name+' '+(m.description??'')));
 return listed.length?`Our listed diet or zero-sugar options are ${listed.map(m=>m.name).join(', ')}. Which would you like?`:'No, we do not have any drinks listed as diet or zero-sugar on this menu. Would you like to hear our other drinks?';
}
