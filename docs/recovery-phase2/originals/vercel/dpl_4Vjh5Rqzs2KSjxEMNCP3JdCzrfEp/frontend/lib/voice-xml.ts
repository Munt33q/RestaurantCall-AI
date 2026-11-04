import { xmlEscape } from './telnyx';
export function voiceXml(reply:string,base:string,turn:number,finished=false){
 const say=(text:string)=>`<Say voice="Polly.Joanna-Neural">${xmlEscape(text)}</Say>`;
 const action=xmlEscape(base.trim().replace(/\/$/,''))+'/api/telnyx/gather?turn='+turn;
 const gather=(text:string)=>`<Gather input="dtmf speech" finishOnKey="#" action="${action}" method="POST" language="en-US" speechTimeout="1" transcriptionEngine="Deepgram" model="deepgram/nova-3" keyterms="Classic Burger,Chicken Burger,Crispy Fries,Cola,Lemonade,Family Feast,cash,card,confirm" timeout="10">${say(text)}</Gather>`;
 return `<?xml version="1.0" encoding="UTF-8"?><Response>${finished?say(reply)+'<Hangup/>':gather(reply)+gather('Are you still there? You can say your order or enter an item number followed by pound.')+say('I still could not hear you. Please call again when you are ready.')+'<Hangup/>'}</Response>`;
}

export function firstSpeech(xml:string){return (xml.match(/<Say(?:\s[^>]*)?>([\s\S]*?)<\/Say>/)?.[1]??'Please repeat.').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
