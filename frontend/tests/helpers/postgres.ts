// Reconstructed Phase 3 helper. Never defaults to the application's production URI.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {client} from '../../lib/db/client';
export const databaseEnabled=!!process.env.TEST_DATABASE_URL;
export async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const uri=process.env.TEST_DATABASE_URL;if(!uri)throw Error('TEST_DATABASE_URL required');
 const u=new URL(uri);assert.match(u.pathname,/^\/recovery_[a-z0-9_]+$/);
 assert.notEqual(process.env.TEST_NEON_BRANCH,'br-patient-flower-b8mm4pad');
 assert.match(process.env.TEST_NEON_BRANCH??'',/^br-/,'Explicit disposable branch required');
 process.env.DATABASE_URL=uri;process.env.DIRECT_DATABASE_URL=uri;
 process.env.SMS_DELIVERY_ENABLED='false';process.env.OUTBOUND_UPDATES_ENABLED='false';
 process.env.STAFF_SESSION_SECRET='phase3-fixture-signing-secret-at-least-32-characters';
 process.env.DRAFT_RECOVERY_SECRET='phase3-fixture-recovery-secret-at-least-32-characters';
 const sql=client();t.after(async()=>{await sql.end();});
 const restaurant=crypto.randomUUID();process.env.RESTAURANT_ID=restaurant;
 await sql`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${restaurant},'Phase3 synthetic fixture',825)`;
 const item=crypto.randomUUID();await sql`INSERT INTO menu_items(id,restaurant_id,name,category,price_cents,stock_qty,item_number) VALUES(${item},${restaurant},'Classic Burger','Mains',1000,10,1)`;
 return {sql,restaurant,item};
}
