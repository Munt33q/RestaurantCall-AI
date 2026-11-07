export async function sendTextBeeSms(input:{phone:string;message:string;transport?:typeof fetch}){
 const key=process.env.TEXTBEE_API_KEY?.trim();
 const deviceId=process.env.TEXTBEE_DEVICE_ID?.trim();
 if(!key||!deviceId)throw new Error('TextBee configuration missing');
 const response=await (input.transport??fetch)('https://api.textbee.dev/api/v1/gateway/send-sms',{method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({recipients:[input.phone],message:input.message,deviceId}),signal:AbortSignal.timeout(9000)});
 const data=await response.json().catch(()=>null);
 return {response,data,batchId:data?.data?.smsBatchId};
}
