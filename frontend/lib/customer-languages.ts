import type {CartState} from './voice-engine';
// Exact, phase-bound phrases only: substrings must never authorize confirmation.
const phrases={
 yes:['sí','si','sí correcto','نعم','أجل','صحيح','हाँ','हां','जी हाँ','सही है'],
 no:['no','لا','नहीं','नही'],
 checkout:['eso es todo','nada más','quiero terminar','finalizar pedido','هذا كل شيء','هذا كل شي','انتهيت','बस इतना ही','इतना ही','ऑर्डर पूरा करें'],
 cash:['efectivo','en efectivo','pago en efectivo','نقدا','نقداً','كاش','نقدي','नकद','नकद भुगतान','कैश'],
 card:['tarjeta','con tarjeta','pago con tarjeta','بطاقة','بالبطاقة','कार्ड','कार्ड से'],
 none:['ninguno','ninguna','sin avisos','sin actualizaciones','no gracias','بدون تحديثات','لا تحديثات','بدون إشعارات','कोई अपडेट नहीं','अपडेट नहीं'],
 call:['llamada','llámame','una llamada','اتصال','اتصل بي','कॉल','कॉल करें'],
 text:['mensaje','mensajes','sms','رسالة','رسائل','संदेश','मैसेज'],
 noNotes:['sin notas','sin comentarios','ninguna nota','لا ملاحظات','بدون ملاحظات','कोई नोट नहीं','कोई विशेष अनुरोध नहीं'],
 confirm:['confirmar','confirmo','confirmar pedido','confirmo el pedido','sí confirmar','أكد الطلب','تأكيد الطلب','أؤكد الطلب','أؤكد','ऑर्डर की पुष्टि करें','पुष्टि करें','हाँ पुष्टि करें'],
 cancel:['cancelar','cancelar pedido','إلغاء الطلب','الغاء الطلب','ऑर्डर रद्द करें'],
 edit:['cambiar pedido','editar pedido','تعديل الطلب','ऑर्डर बदलें'],
};
function key(s:string){return s.normalize('NFC').toLowerCase().trim().replace(/^[¿¡]+|[.!?؟।،]+$/gu,'').replace(/\s+/g,' ');}
const matches=(speech:string,kind:keyof typeof phrases)=>phrases[kind].some(x=>key(x)===key(speech));
export function normalizeCheckoutLanguage(speech:string,state:CartState):string{
 if(matches(speech,'cancel'))return 'cancel';
 if(matches(speech,'edit'))return 'change order';
 if(state.phase==='ordering'&&matches(speech,'checkout'))return 'checkout';
 if(state.phase==='name'){
  if(matches(speech,'yes'))return 'yes';
  if(matches(speech,'no'))return 'no';
  return speech.trim().replace(/^(?:me llamo|mi nombre es|اسمي|اسمى|मेरा नाम)\s+/iu,'').replace(/\s+है[.!।]?$/u,'').replace(/[.!?؟।]+$/u,'');
 }
 if(state.phase==='payment'){
  if(matches(speech,'cash'))return 'cash';
  if(matches(speech,'card'))return 'card';
 }
 if(state.phase==='payment_link'){
  if(matches(speech,'yes'))return 'yes';
  if(matches(speech,'no'))return 'no';
 }
 if(state.phase==='notification'){
  if(matches(speech,'none')||matches(speech,'no'))return 'none';
  if(matches(speech,'call'))return 'call';
  if(matches(speech,'text'))return 'text';
 }
 if(state.phase==='notes'&&(matches(speech,'noNotes')||matches(speech,'no')||matches(speech,'none')))return 'no notes';
 if(state.phase==='confirm'&&(matches(speech,'confirm')||matches(speech,'yes')))return 'confirm';
 return speech;
}
