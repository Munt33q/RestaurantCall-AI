// Retain Unicode letters, marks and numbers; empty transcripts prove no playback.
export function playbackMatches(played:string,expected:string):boolean{
 const normalize=(s:string)=>s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');
 const review=normalize(expected);return review.length>0&&normalize(played)===review;
}
