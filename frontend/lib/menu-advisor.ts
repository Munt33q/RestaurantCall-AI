import {voiceCopy} from './voice-copy';
import type {MenuEntry} from './voice-engine';
const available=(m:MenuEntry)=>m.isAvailable&&(m.stockQty===null||m.stockQty>0);
const normalized=(s:string)=>s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean).map(w=>w.replace(/s$/,'')).join(' ');
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
function options(items:MenuEntry[],language='en'){return items.slice(0,3).map(m=>voiceCopy(language,'option',m.name,String(m.itemNumber??''),'$'+(m.priceCents/100).toFixed(2))).join('; ');}
export function answerMenuQuestion(speech:string,menu:MenuEntry[],categoryHint?:string,language='en'):string|null{
 const t=(key:Parameters<typeof voiceCopy>[1],...values:string[])=>voiceCopy(language,key,...values);
 const list=(items:MenuEntry[])=>options(items,language);
 if(!isMenuQuestion(speech))return null;
 const requested=topic(speech),key=normalized(requested);
 const category=questionCategory(speech,menu)??categoryHint;
 const full=menu.filter(m=>normalized(m.name)===key||m.aliases?.some(alias=>normalized(alias)===key));
 const suffix=menu.filter(m=>normalized(m.name).endsWith(' '+key));
 const exact=full.length?full:suffix.length===1?suffix:[];
 const family=/^(burger|drink|soda|shake|milkshake|side|main|deal|combo|dessert|chicken|frie)$/.test(key);
 const familyItems=family?menu.filter(m=>category===m.category&&(key==='burger'?/burger/i.test(m.name):key==='frie'?/fries/i.test(m.name):/shake|milkshake/.test(key)?/shake/i.test(m.name):true)):[];
 const inStock=menu.filter(available);
 let similar=inStock.filter(m=>m.category===category&&!exact.some(x=>x.id===m.id)).sort((a,b)=>{
  const score=(m:MenuEntry)=>normalized(m.name).split(' ').filter(w=>key.split(' ').includes(w)).length+(/shake|milkshake/.test(key)&&/shake/i.test(m.name)?4:0)+(/burger/.test(key)&&/burger/i.test(m.name)?4:0);
  return score(b)-score(a)||(a.itemNumber??999)-(b.itemNumber??999);
 });
 const kind=/shake|milkshake/.test(key)?/shake/i:/\b(pepsi|coke|cola|soda|sprite|fanta)\b/.test(key)?/cola|soda|pepsi|coke|sprite|fanta/i:/burger/.test(key)?/burger/i:null;
 const sameKind=kind?similar.filter(m=>kind.test(m.name)):[];
 if(sameKind.length)similar=sameKind;
 const suggestions=similar.length?' '+t(similar.length===1?'similarOne':'similar',list(similar)):'';
 if(exact.length){const m=exact[0];return available(m)?t('have',list([m])):t('unavailableItem',m.name)+suggestions+(suggestions?' '+t('alternative'):'');}
 if(familyItems.length){const offered=familyItems.filter(available);return offered.length?t('choices',list(offered)):t('unavailableItem',requested)+suggestions;}
 if(/\b(recommend|suggest|similar|alternative)\b/i.test(speech)&&similar.length)return t('recommend',list(similar));
 return t('notCarried',requested)+(suggestions||' '+t('menuFallback'))+(suggestions?' '+t('alternative'):'');
}

export function dietaryMenuReply(speech:string,menu:MenuEntry[],language='en'):string|null{
 if(!/\b(?:diet(?: free)?|zero[ -]?sugar|sugar[ -]?free|no sugar)\b/i.test(speech)||!(/\b(?:have|carry|sell|serve|any|options|available|what|which)\b/i.test(speech)))return null;
 const listed=menu.filter(m=>available(m)&&/\b(?:diet|zero[ -]?sugar|sugar[ -]?free|no sugar)\b/i.test(m.name+' '+(m.description??'')));
 return listed.length?voiceCopy(language,'dietOptions',listed.map(m=>m.name).join(', ')):voiceCopy(language,'dietMissing');
}
