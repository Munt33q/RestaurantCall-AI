// Historical Bella configuration, retained for rollback. Brittany has no
// hardcoded ID: its exact account ID and supported languages must be verified.
export const BELLA_VOICE_ID='hpp4J3VqNfWAUOO0d1Us';
export function liveVoiceProfile(language='en'){
 const preferred=process.env.ELEVENLABS_VOICE_PREFERENCE?.trim()??'legacy';
 if(!['legacy','bella','brittany'].includes(preferred))throw Error('Invalid preferred voice');
 const brittany=process.env.ELEVENLABS_BRITTANY_VOICE_ID?.trim();
 const supported=(process.env.ELEVENLABS_BRITTANY_VERIFIED_LANGUAGES??'').split(',').map(x=>x.trim());
 if(preferred==='brittany'&&(!brittany||!supported.includes(language)))throw Error('Brittany account voice or language is not verified');
 const id=preferred==='brittany'?brittany!:preferred==='bella'?BELLA_VOICE_ID:process.env.ELEVENLABS_VOICE_ID?.trim()||BELLA_VOICE_ID;
 if(preferred==='brittany'&&(id===BELLA_VOICE_ID||language==='ur'))throw Error('Brittany voice/model must be independently verified');
 if(!/^[A-Za-z0-9]{20,40}$/.test(id))throw Error('Invalid ElevenLabs voice configuration');
 return {id,name:preferred==='brittany'?'Brittany':id===BELLA_VOICE_ID?'Bella':(process.env.ELEVENLABS_VOICE_NAME?.trim().slice(0,80)||'Configured ElevenLabs voice'),model:'eleven_flash_v2_5'};
}
