import postgres from 'postgres';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {migrationFiles} from './migration-profile.mjs';
const url=(process.env.DIRECT_DATABASE_URL??'').trim();
if(!url||new URL(url).hostname.includes('-pooler'))throw new Error('Use a direct DIRECT_DATABASE_URL for migrations');
const sql=postgres(url,{max:1,prepare:false});
try{
 await sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(725014271)`;
  await tx`CREATE TABLE IF NOT EXISTS app_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`;
  for(const name of migrationFiles(await readdir(new URL('../drizzle/',import.meta.url)),{directVoice:process.argv.includes('--direct-voice')})){
   const source=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');const hash=createHash('sha256').update(source).digest('hex');
   const [row]=await tx`SELECT sha256 FROM app_migrations WHERE name=${name}`;
   if(row){if(row.sha256!==hash)throw new Error(`Migration checksum changed: ${name}`);continue;}
   await tx.unsafe(source);await tx`INSERT INTO app_migrations(name,sha256) VALUES(${name},${hash})`;console.log('Applied',name);
  }
 });
}finally{await sql.end();}
