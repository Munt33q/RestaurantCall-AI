// Reconstructed integration test. The recovery runner supplies only a disposable Neon database.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {client} from '../lib/db/client';
import {openVoiceSession,processVoiceTurn,listOrders} from '../lib/repository';

test('recovery database: two distinct items require review and confirmation, concurrent retries reserve once',{skip:!process.env.DATABASE_URL},async()=>{
 const sql=client();
 try{
  const restaurant=crypto.randomUUID(),burger=crypto.randomUUID(),fries=crypto.randomUUID();
  process.env.RESTAURANT_ID=restaurant;
  await sql`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${restaurant},'Synthetic recovery test',825)`;
  await sql`INSERT INTO menu_items(id,restaurant_id,name,category,price_cents,stock_qty,item_number) VALUES(${burger},${restaurant},'Classic Burger','Mains',1299,10,1),(${fries},${restaurant},'French Fries','Sides',499,10,2)`;
  const id='recovery-'+crypto.randomUUID(),base='https://example.test';
  await openVoiceSession(id,'+12025550123',base);
  let turn=0;
  for(const speech of ['item 1','item 2','done','Recovery Fixture','yes','cash','none','no notes']){
   await processVoiceTurn({providerCallId:id,speech,turn:turn++,base});
  }
  assert.equal((await listOrders()).length,0,'Review must not create an order');
  const [draft]=await sql`SELECT d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${id}`;
  assert.equal(draft.state_json.phase,'confirm');assert.equal(draft.state_json.items.length,2);
  const replies=await Promise.all([0,1,2].map(()=>processVoiceTurn({providerCallId:id,speech:'confirm',turn,base})));
  assert.equal(new Set(replies.map(r=>r.xml)).size,1);
  const board=await listOrders();assert.equal(board.length,1);assert.equal(board[0].items.length,2);
  assert.equal(board[0].totalCents,1946);assert.equal(board[0].customerName,'Recovery Fixture');
  const stock=await sql`SELECT stock_qty FROM menu_items WHERE restaurant_id=${restaurant}`;
  assert.deepEqual(stock.map(r=>r.stock_qty),[9,9]);
 }finally{await sql.end();}
});
