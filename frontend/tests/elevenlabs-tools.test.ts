import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTool,ToolError,conversationProviderIds} from '../lib/elevenlabs-tools';
import {validElevenLabsConversationId} from '../lib/elevenlabs-session';

test('refuses unknown tool and malformed conversation IDs',()=>{
 assert.throws(()=>validateTool({tool:'delete_database',conversation_id:'conv_012345678901'}),ToolError);
 assert.throws(()=>validateTool({tool:'search_menu',conversation_id:'x'}),ToolError);
});

test('accepts valid preview tool input',()=>{
 assert.equal(validateTool({tool:'search_menu',conversation_id:'conv_012345678901',query:'shawarma'}).tool,'search_menu');
});

test('conversation IDs must resolve to an existing provider session before tools run',()=>{
 assert.deepEqual(conversationProviderIds('conv_012345678901'),['conv_012345678901','elevenlabs:conv_012345678901']);
 assert.equal(validElevenLabsConversationId('conv_012345678901'),true);
 assert.equal(validElevenLabsConversationId('conv_short'),false);
 assert.equal(validElevenLabsConversationId('conv_012345678901<script>'),false);
});
