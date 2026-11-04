// Exact, phase-bound phrases only: substrings must never authorize confirmation.
const phrases={
 yes:['جی ہاں','ہاں','جی','بالکل درست','یہ درست ہے','sí','si','sí correcto','نعم','أجل','صحيح','हाँ','हां','जी हाँ','सही है'],
 no:['نہیں','جی نہیں','no','لا','नहीं','नही'],
 checkout:['یہ سب ہے','بس یہی','آرڈر مکمل کریں','eso es todo','nada más','quiero terminar','finalizar pedido','هذا كل شيء','هذا كل شي','انتهيت','बस इतना ही','इतना ही','ऑर्डर पूरा करें'],
 cash:['نقد','نقد ادائیگی','کیش','efectivo','en efectivo','pago en efectivo','نقدا','نقداً','كاش','نقدي','नकद','नकद भुगतान','कैश'],
 card:['کارڈ','کارڈ سے','tarjeta','con tarjeta','pago con tarjeta','بطاقة','بالبطاقة','कार्ड','कार्ड से'],
 none:['کوئی نہیں','اطلاع نہیں','کوئی اطلاع نہیں','نہیں شکریہ','ninguno','ninguna','sin avisos','sin actualizaciones','no gracias','بدون تحديثات','لا تحديثات','بدون إشعارات','कोई अपडेट नहीं','अपडेट नहीं'],
 call:['کال','فون کریں','کال کریں','llamada','llámame','una llamada','اتصال','اتصل بي','कॉल','कॉल करें'],
 text:['پیغام','میسج','ایس ایم ایس','mensaje','mensajes','sms','رسالة','رسائل','संदेश','मैसेज'],
 noNotes:['کوئی ہدایت نہیں','کوئی نوٹ نہیں','sin notas','sin comentarios','ninguna nota','لا ملاحظات','بدون ملاحظات','कोई नोट नहीं','कोई विशेष अनुरोध नहीं'],
 confirm:['تصدیق کریں','آرڈر درج کریں','آرڈر کر دیں','جی تصدیق','adelante','es correcto','hágalo','نعم صحيح','نفذ الطلب','कर दीजिए','confirmar','confirmo','confirmar pedido','confirmo el pedido','sí confirmar','أكد الطلب','تأكيد الطلب','أؤكد الطلب','أؤكد','ऑर्डर की पुष्टि करें','पुष्टि करें','हाँ पुष्टि करें'],
 cancel:['منسوخ کریں','آرڈر منسوخ کریں','cancelar','cancelar pedido','إلغاء الطلب','الغاء الطلب','ऑर्डर रद्द करें'],
 edit:['آرڈر بدلیں','ترمیم کریں','cambiar pedido','editar pedido','تعديل الطلب','ऑर्डर बदलें'],
};
function key(s:string){return s.normalize('NFC').toLowerCase().trim().replace(/^[¿¡]+|[.!?؟।،۔]+$/gu,'').replace(/\s+/g,' ');}
const matches=(speech:string,kind:keyof typeof phrases)=>phrases[kind].some(x=>key(x)===key(speech));
export function normalizeCheckoutLanguage(speech:string,state:{phase:string}):string{
 if(/^(?:cu[aá]nto es el total|cu[aá]nto cuesta mi pedido|ما المجموع|كم المجموع|کل رقم کتنی ہے|کل کتنا ہے|कुल कितना है)[.!?؟।۔]*$/iu.test(speech.trim()))return 'what is my total';
 if(/^(?:cu[aá]nto es el impuesto|ما الضريبة|ٹیکس کتنا ہے|कर कितना है)[.!?؟।۔]*$/iu.test(speech.trim()))return 'how much is tax';
 if(/^(?:menú|القائمة|مینو|मेन्यू)[.!?؟।۔]*$/iu.test(speech.trim()))return 'menu';
 if(/^(?:repite|أعد الطلب|آرڈر دہرائیں|ऑर्डर दोहराएँ)[.!?؟।۔]*$/iu.test(speech.trim()))return 'repeat';
 if(/^(?:adiós|مع السلامة|خدا حافظ|अलविदा)[.!?؟।۔]*$/iu.test(speech.trim()))return 'goodbye';
 const availability=speech.trim().match(/^(?:tienen|tienes|hay|هل (?:عندكم|لديكم|يوجد)|کیا (?:آپ کے پاس )?|क्या (?:आपके पास )?)\s*(.+?)(?:\s+(?:ہے|ہیں|है|हैं))?[?؟.!۔।]*$/iu);if(availability)return 'do you have '+availability[1];
 if(matches(speech,'cancel'))return 'cancel';
 if(matches(speech,'edit'))return 'change order';
 if(state.phase==='ordering'&&matches(speech,'checkout'))return 'checkout';
 if(state.phase==='name'){
  if(matches(speech,'yes'))return 'yes';
  if(matches(speech,'no'))return 'no';
  return speech.trim().replace(/^(?:me llamo|mi nombre es|اسمي|اسمى|میرا نام|मेरा नाम)\s+/iu,'').replace(/\s+(?:है|ہے)[.!।۔]?$/u,'').replace(/[.!?؟।]+$/u,'');
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
