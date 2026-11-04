import type {MenuEntry} from './voice-engine';
export function healthProbeItems(menu:MenuEntry[]){const selected=menu.filter(i=>i.isAvailable&&(i.stockQty===null||i.stockQty>=1)).slice(0,2);if(selected.length<2)throw Error('Health probe needs two available menu items');return selected;}
