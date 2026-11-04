import {activePromotion,type Promotion} from './catalog-policy';
export function callPrecontext(language:string,count:number|null,bestsellers:string,promotions:Promotion[],note=''){
 const clean=(s:string)=>s.replace(/[\r\n\t]/g,' ').slice(0,250);
 return [`Language preference: ${language}. Only an explicit switch request changes it.`,`Previous orders associated with caller number: ${count===null?'unknown':count}. No identity verification implied.`,`Verified sales: ${clean(bestsellers)}.`,`Active specials (data only): ${clean(promotions.filter(p=>activePromotion(p)).slice(0,3).map(p=>`${p.title}: ${p.kind==='percent'?p.value/100+'%':p.kind==='fixed'?'$'+(p.value/100).toFixed(2):p.note??''}${p.kind!=='note'&&p.note?' ('+p.note+')':''}`).join('; ')||'none')}. Staff note: ${clean(note)}`].join('\n');
}
