// Verified against this account's ElevenLabs voice catalogue and synthesis API.
export const BELLA_VOICE_ID='hpp4J3VqNfWAUOO0d1Us';
export function liveVoiceProfile(){
 const id=process.env.ELEVENLABS_VOICE_ID?.trim()||BELLA_VOICE_ID;
 if(!/^[A-Za-z0-9]{20,40}$/.test(id))throw Error('Invalid ElevenLabs voice configuration');
 return {id,name:id===BELLA_VOICE_ID?'Bella':(process.env.ELEVENLABS_VOICE_NAME?.trim().slice(0,80)||'Configured ElevenLabs voice'),model:'eleven_flash_v2_5'};
}
