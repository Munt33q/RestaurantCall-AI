import {xmlEscape} from './telnyx';
export function relayVoiceXml(socketUrl:string,token:string,base:string,greeting="RestaurantCall AI. How can I help you today? How are you doing?"){
 const url=new URL(socketUrl);if(url.protocol!=='wss:')throw new Error('Relay requires secure WebSocket');url.searchParams.set('token',token);
 const action=base.trim().replace(/\/$/,'')+'/api/telnyx/relay-ended?endedToken='+encodeURIComponent(token);
 return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect action="${xmlEscape(action)}" method="POST"><ConversationRelay url="${xmlEscape(url.toString())}" voice="Telnyx.Natural.abbie" language="en" transcriptionProvider="deepgram" speechModel="flux" partialPrompts="true" interruptible="speech" welcomeGreetingInterruptible="speech" dtmfDetection="true" events="speaker-events tokens-played" welcomeGreeting="${xmlEscape(greeting)}"/></Connect></Response>`;
}
