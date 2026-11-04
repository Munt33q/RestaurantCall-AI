export type CallLanguage='en'|'es'|'ar'|'ur'|'hi';
export type LanguagePreference={language:CallLanguage;confirmed:boolean;revision:number};
const names:Record<CallLanguage,RegExp>={en:/\b(?:english|inglés|ingles)\b|الإنجليزية|الانجليزية|अंग्रेजी|انگریزی/iu,es:/\b(?:spanish|español|espanol)\b|الإسبانية|الاسبانية|स्पैनिश|ہسپانوی/iu,ar:/\b(?:arabic|árabe|arabe)\b|العربية|अरबी|عربی/iu,ur:/\burdu\b|اردو|उर्दू/iu,hi:/\b(?:hindi)\b|الهندية|हिन्दी|हिंदी|ہندی/iu};
export const languageQuestion='Hi! Thanks for calling RestaurantCall AI. For English, press 1. Para español, oprima 2. للعربية، اضغط 3. اردو کے لیے 4 دبائیں۔ हिंदी के लिए 5 दबाएँ। You can also say your language.';
export const languageDigits:Record<string,CallLanguage>={'1':'en','2':'es','3':'ar','4':'ur','5':'hi'};
export function languagePreference(current:LanguagePreference|undefined,speech:string,selection=false):LanguagePreference{
 const state=current??{language:'en',confirmed:false,revision:0};const text=speech.normalize('NFC').toLowerCase().replace(/’/g,"'").replace(/"[^"]*"|“[^”]*”|«[^»]*»|\B'[^']+'\B/gu,' ').trim();
 if(/\b(?:don'?t|do not|not|never|no cambies|no hables)\b|لا تتحدث|لا تغير|لا أريد|لا اريد|no quiero|no deseo|मत बदल|मत बोल|اردو نہ|زبان مت بدل/u.test(text))return state;
 const explicit=/^(?:(?:please|por favor)[, ]+)?(?:(?:can|could|would) you (?:please )?)?(?:(?:let's|let us) )?(?:speak\b|switch\b|talk(?: to me)? in\b|change(?: the language)? to\b|i (?:prefer|would prefer|want to speak)\b|i'd (?:prefer|like to speak)\b|prefiero\b|quiero hablar\b|habla(?:r)?\b|cambia(?:r)? a\b|أريد التحدث|أريد أن أتحدث|تحدث|تكلم|غيّر|غير اللغة|(?:براہ کرم )?(?:اردو|انگریزی|عربی|ہندی|ہسپانوی) میں (?:بول|بات)|(?:मैं )?(?:हिंदी|हिन्दी|अंग्रेजी|अरबी|स्पैनिश) में (?:बोल|बात))/u.test(text);
 if(!selection&&!explicit)return state;
 const digit=selection?languageDigits[text]:undefined;
 const detected=digit?[digit]:(Object.keys(names) as CallLanguage[]).filter(k=>names[k].test(text));
 if(detected.length!==1){if(selection&&!state.confirmed&&/^(?:no preference|any language|anything is fine)$/i.test(text))return {language:'en',confirmed:true,revision:1};return state;}
 const language=detected[0];return {language,confirmed:true,revision:state.revision+(language!==state.language||!state.confirmed?1:0)};
}
export function languageAcknowledgement(language:CallLanguage,orderingQuestion=true){const reply={en:'Of course. We will continue in English. What would you like to order?',es:'Por supuesto. Continuaremos en español. ¿Qué le gustaría pedir?',ur:'ضرور۔ ہم اردو میں بات کریں گے۔ آپ کیا منگوانا چاہیں گے؟',ar:'بالطبع. سنواصل بالعربية. ماذا تريد أن تطلب؟',hi:'ज़रूर। हम हिंदी में बात करेंगे। आप क्या ऑर्डर करना चाहेंगे?'}[language];return orderingQuestion?reply:reply.split(/[.।۔]/)[0]+'.';}

export function preferenceTurn<T extends {languagePreference?:LanguagePreference;languageAttempts?:number}>(current:T,speech:string){
 const state=structuredClone(current),old=state.languagePreference;
 const preference=languagePreference(old,speech,!old?.confirmed);state.languagePreference=preference;
 if(!preference.confirmed){state.languageAttempts=(state.languageAttempts??0)+1;return {state,reply:state.languageAttempts>=3?'I could not confirm a language preference. Please call again or contact the restaurant team. Goodbye.':languageQuestion,endCall:state.languageAttempts>=3};}
 if(!old?.confirmed||old.revision!==preference.revision)return {state,reply:languageAcknowledgement(preference.language,!old?.confirmed),endCall:false};
 return {state,reply:null,endCall:false};
}
