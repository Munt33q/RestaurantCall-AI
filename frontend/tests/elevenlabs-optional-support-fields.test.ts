import test from 'node:test';import assert from 'node:assert/strict';import {validateTool} from '../lib/elevenlabs-tools';
const conversation_id='conv_fixture_menu123';
test('menu/cart actions ignore optional order-support fields emitted by the provider',()=>{
 for(const tool of ['search_menu','get_cart','update_cart','set_customer_details','set_order_notes','review_order','place_order']){
 const input={tool,conversation_id,order_number:'',callback_preference:'',callback_stages:[],consent:false};
 const parsed=validateTool(input);assert.equal(parsed.tool,tool);assert.equal(parsed.order_number,undefined);assert.equal(parsed.callback_preference,undefined);assert.equal(parsed.callback_stages,undefined);assert.equal(input.order_number,'');
 }
});
test('order support still validates real references and explicit callback choices',()=>{
 assert.equal(validateTool({tool:'get_order_status',conversation_id,order_number:'957c5096',callback_preference:''}).order_number,'957c5096');
 assert.throws(()=>validateTool({tool:'get_order_status',conversation_id,order_number:'invalid'}),/order number/);
 assert.throws(()=>validateTool({tool:'set_notification_preference',conversation_id,callback_preference:'maybe'}),/preference/);
 assert.throws(()=>validateTool({tool:'search_menu',conversation_id,prices:1}),/Unknown/);
});
