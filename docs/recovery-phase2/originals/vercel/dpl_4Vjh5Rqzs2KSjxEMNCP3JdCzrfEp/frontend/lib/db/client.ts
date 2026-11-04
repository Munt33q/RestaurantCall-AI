import postgres from 'postgres';
let singleton:ReturnType<typeof postgres>|undefined;
export function client(){
 if(!singleton){const url=process.env.DATABASE_URL?.trim();if(!url)throw new Error('DATABASE_URL is required');singleton=postgres(url,{max:3,prepare:false,idle_timeout:20,connect_timeout:10});}
 return singleton;
}
