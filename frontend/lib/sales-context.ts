import type {MenuEntry} from './voice-engine';
export function salesSummary(rows:{menu_item_id:string;quantity:number}[],menu:MenuEntry[]):string{
 const ranked=rows.map(r=>({item:menu.find(m=>m.id===r.menu_item_id),quantity:r.quantity})).filter(r=>r.item?.isAvailable&&(r.item.stockQty===null||r.item.stockQty>0)&&r.quantity>0).slice(0,3);
 return ranked.length?['Best sellers in recorded orders over the last 30 days:',...ranked.map((r,i)=>`${i+1}. ${r.item!.name}: ${r.quantity} sold.`)].join('\n'):'No recorded sales ranking is available yet.';
}
