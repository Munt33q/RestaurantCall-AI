// Keep the original request's token length/shape without granting relay access.
export function invalidRelayProbeToken(token:string){
 const parts=token.split('.');if(parts.length!==3||!parts[2])throw Error('Invalid diagnostic token shape');
 parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);return parts.join('.');
}
