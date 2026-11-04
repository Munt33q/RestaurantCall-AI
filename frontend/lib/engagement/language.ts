import {languagePreference} from '../call-language';
export type EngagementLanguage='en'|'es'|'ar'|'ur'|'hi';
// Only meaningful speech or an explicit request changes the language. Single
// names, item words, yes/no and fillers retain the previous language.
export function engagementLanguage(speech:string,current='en',phase='ordering'):EngagementLanguage{
 return languagePreference({language:(['en','es','ar','ur','hi'].includes(current)?current:'en') as EngagementLanguage,confirmed:true,revision:1},speech,false).language;
}
export function engagementCopy(language:string,key:'decline'|'suggest'|'unavailable'|'clarify'|'item',item=''){
 const c={en:{item:'Please say the item name you want to add.',decline:'Of course. Anything else, or shall we checkout?',suggest:`One available option is ${item}. What would you like?`,unavailable:'Please ask the restaurant for current availability.',clarify:'Would you like that suggested item? Please say yes or no.'},es:{item:'Diga el nombre del artículo que desea añadir.',decline:'Por supuesto. ¿Algo más o desea finalizar?',suggest:`Una opción disponible es ${item}. ¿Qué le gustaría?`,unavailable:'Consulte al restaurante sobre la disponibilidad.',clarify:'¿Le gustaría el artículo sugerido? Diga sí o no.'},ar:{item:'يرجى ذكر اسم الصنف الذي تريد إضافته.',decline:'بالطبع. هل تريد شيئا آخر أم ننهي الطلب؟',suggest:`أحد الخيارات المتاحة هو ${item}. ماذا تريد؟`,unavailable:'يرجى سؤال المطعم عن الأصناف المتاحة.',clarify:'هل تريد الصنف المقترح؟ قل نعم أو لا.'},ur:{item:'جو چیز شامل کرنی ہے اس کا نام بتائیں۔',decline:'ضرور۔ کچھ اور چاہیے یا آرڈر مکمل کریں؟',suggest:`ایک دستیاب چیز ${item} ہے۔ کیا چاہیے؟`,unavailable:'دستیابی کے لیے ریستوران سے پوچھیں۔',clarify:'کیا تجویز کردہ چیز چاہیے؟ ہاں یا نہیں کہیں۔'},hi:{item:'जो चीज़ जोड़नी है उसका नाम बताइए।',decline:'ज़रूर। कुछ और चाहिए या ऑर्डर पूरा करें?',suggest:`एक उपलब्ध विकल्प ${item} है। आप क्या चाहेंगे?`,unavailable:'उपलब्ध चीज़ों के बारे में रेस्तरां से पूछें।',clarify:'क्या आप सुझाई गई चीज़ लेना चाहेंगे? हाँ या नहीं कहें।'}};
 return (c[language as EngagementLanguage]??c.en)[key];
}
