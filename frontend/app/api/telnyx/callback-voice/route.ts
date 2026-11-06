// Fail closed if the staging callback application ever fetches its default URL.
// Normal callback speech is supplied inline by the consent-checked job worker.
export async function GET(){return new Response('<Response><Hangup/></Response>',{headers:{'Content-Type':'application/xml','Cache-Control':'no-store'}});}
export const POST=GET;
