// Reconstructed recovery tooling. Reads connection details from stdin, never logs them.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const module=require('postgres');
const postgres=module.default??module;
let input='';for await(const part of process.stdin)input+=part;
const {uri,mode}=JSON.parse(input);
const sql=postgres(uri,{max:1,prepare:false,connect_timeout:20});
try{
 const result=await sql.begin('read only',async tx=>{
  const tables=await tx`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const migrations=tables.some(t=>t.tablename==='app_migrations')?await tx`SELECT name,sha256,applied_at FROM app_migrations ORDER BY name`:[];
  const result={mode,tables:tables.map(t=>t.tablename),migrations};
  if(mode==='schema-structure'){
   result.columns=await tx`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
   result.constraints=await tx`SELECT c.relname AS table_name,p.conname,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,p.conname`;
   result.indexes=await tx`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`;
  }
  if(mode==='disposable-empty-check'){
   result.rowCounts={};
   for(const {tablename} of tables){
    const [row]=await tx.unsafe('SELECT count(*)::int AS count FROM public."'+tablename.replaceAll('"','""')+'"');
    result.rowCounts[tablename]=row.count;
   }
  }
  return result;
 });
 console.log(JSON.stringify(result));
}finally{await sql.end();}
