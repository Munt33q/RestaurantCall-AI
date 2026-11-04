import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMenuSpeech,decideTurn,initialState} from '../lib/voice-engine';
import {voiceXml} from '../lib/voice-xml';
const menu=[
{id:'classic',name:'Classic Burger',category:'Mains',itemNumber:1,priceCents:1299,isAvailable:true,stockQty:20},
{id:'chicken',name:'Chicken Burger',category:'Mains',itemNumber:5,priceCents:1199,isAvailable:true,stockQty:20},
{id:'cola',name:'Cola',category:'Drinks',itemNumber:10,priceCents:249,isAvailable:true,stockQty:40},
{id:'deal',name:'Classic Burger Combo',category:'Deals',itemNumber:13,priceCents:1699,isAvailable:true,stockQty:20},
];
test('full item names and combo names do not also order similarly named items',()=>{
 assert.deepEqual(parseMenuSpeech('two chicken burgers and one cola',menu),[{menuItemId:'chicken',quantity:2},{menuItemId:'cola',quantity:1}]);
 assert.deepEqual(parseMenuSpeech('one classic burger combo',menu),[{menuItemId:'deal',quantity:1}]);
 assert.deepEqual(parseMenuSpeech('a burger',menu),[]);
});
test('spoken and bare item numbers work beyond ten',()=>{
 assert.deepEqual(parseMenuSpeech('item thirteen',menu),[{menuItemId:'deal',quantity:1}]);
 assert.deepEqual(parseMenuSpeech('10',menu),[{menuItemId:'cola',quantity:1}]);
});
test('category browsing never adds items to an order',()=>{
 const result=decideTurn(initialState(),'what drinks do you have',menu,825);
 assert.equal(result.state.items.length,0);assert.match(result.reply,/Cola/);assert.doesNotMatch(result.reply,/Chicken Burger/);
});
test('inbound speech waits for speech and offers a second gather on silence',()=>{
 const xml=voiceXml('Welcome','https://example.com',0);
 assert.equal((xml.match(/<Gather /g)||[]).length,2);
 assert.match(xml,/language="en-US"/);assert.match(xml,/<Hangup\/>/);
});
test('neural speech and explicit end-of-speech window replace robotic defaults',()=>{
 const xml=voiceXml('Hello','https://example.com',0);
 assert.match(xml,/voice="Polly.Joanna-Neural"/);assert.match(xml,/speechTimeout="1"/);assert.match(xml,/input="dtmf speech"/);
});
test('empty transcripts stop after three attempts instead of repeating forever',()=>{
 let state=initialState();let r=decideTurn(state,'',menu,825);r=decideTurn(r.state,'',menu,825);r=decideTurn(r.state,'',menu,825);
 assert.equal(r.endCall,true);assert.equal(r.submit,false);
});
test('repeat replays the previous prompt without changing the cart',()=>{
 const r=decideTurn(initialState(),'item 1',menu,825);
 const again=decideTurn({...r.state,lastReply:r.reply},'can you repeat what you said',menu,825);
 assert.equal(again.reply,r.reply);assert.deepEqual(again.state.items,r.state.items);
});
test('contextual quantity correction replaces rather than adds quantities',()=>{
 const current={...initialState(),items:[{menuItemId:'classic',quantity:1}]};
 const r=decideTurn(current,'make that two',menu,825,[{menuItemId:'classic',quantity:2}],'set');
 assert.deepEqual(r.state.items,[{menuItemId:'classic',quantity:2}]);assert.equal(r.submit,false);
});
