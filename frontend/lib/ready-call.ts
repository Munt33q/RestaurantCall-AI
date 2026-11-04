type Input={requestId:string;to:string;orderNumber:string};
type Accepted={callSid:string;to:string;status:string};
export type ReadyCallStore={claim:(id:string)=>Promise<boolean>;save:(call:Accepted)=>Promise<void>};
export async function readyCall(input:Input,config:{apiKey:string;applicationId:string;from:string},store:ReadyCallStore,transport:typeof fetch=fetch){
 if(!input||!/^\+[1-9]\d{7,14}$/.test(input.to)||!/^\d{1,6}$/.test(input.orderNumber)||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(input.requestId))throw new Error('Invalid call request');
 if(!config.apiKey||!/^\d+$/.test(config.applicationId)||!/^\+[1-9]\d{7,14}$/.test(config.from))throw new Error('Outbound calling is not configured');
 if(!await store.claim(input.requestId))throw new Error('Call already attempted; inspect call history before any new attempt');
 const message=`Hello. This is an automated notification from RestaurantCall AI. Your order number ${input.orderNumber} is ready for pickup. Please have your order number handy when you arrive. Thank you, and have a great day.`;
 // Never retry an outbound POST: a lost response may still mean the phone rang.
 const response=await transport(`https://api.telnyx.com/v2/texml/calls/${config.applicationId}`,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({From:config.from,To:input.to,Texml:`<Response><Say voice="Polly.Joanna-Neural">${message}</Say><Hangup/></Response>`}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();
 if(!response.ok)throw new Error(`Telnyx rejected call (${response.status}): ${JSON.stringify(data.errors??[]).slice(0,600)}`);
 if(typeof data.call_sid!=='string'||!data.call_sid)throw new Error('Provider response uncertain; inspect call history before any new attempt');
 const accepted={callSid:data.call_sid,to:input.to,status:String(data.status??'queued')};await store.save(accepted);return accepted;
}
