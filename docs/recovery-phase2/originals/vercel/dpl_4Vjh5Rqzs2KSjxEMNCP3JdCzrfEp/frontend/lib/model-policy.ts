export type ModelAttempt={provider:string;model:string;ok:boolean;ms:number;error?:string;status?:number;requestId?:string|null};
export function shouldAlert(events:{ok:boolean;error?:string;at:number}[],now=Date.now()){return events.filter(e=>!e.ok&&e.error!=='cancelled'&&e.at>now-300000&&e.at<=now).length>2;}
export function modelError(error:unknown,cancelled=false){if(cancelled)return 'cancelled';const e=error as {name?:string;cause?:{code?:string}};if(e?.name==='TimeoutError'||e?.name==='AbortError')return 'timeout';return e?.cause?.code?`network_${e.cause.code}`:'network_error';}
