import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyTelnyxWebhook } from '../lib/telnyx';
import { issueStaffSession, verifyStaffSession } from '../lib/staff-session';
test('Telnyx accepts base64 raw Ed25519 public key and rejects tampering/stale timestamps',()=>{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 process.env.TELNYX_PUBLIC_KEY=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const time=String(Math.floor(Date.now()/1000)); const body='CallSid=abc&From=%2B15555555555';
 const sig=crypto.sign(null,Buffer.from(`${time}|${body}`),privateKey).toString('base64');
 assert.equal(verifyTelnyxWebhook(body,sig,time),true);
 assert.equal(verifyTelnyxWebhook(body+'x',sig,time),false);
 assert.equal(verifyTelnyxWebhook(body,sig,'1'),false);
});
test('staff sessions reject forged cookies and expiry',()=>{
 process.env.STAFF_SESSION_SECRET='test-only-secret-at-least-32-characters';
 const token=issueStaffSession(1000); assert.equal(verifyStaffSession(token,1001),true);
 assert.equal(verifyStaffSession('demo',1001),false); assert.equal(verifyStaffSession(token+'x',1001),false);
 assert.equal(verifyStaffSession(token,1000+8*60*60+1),false);
});
import {staffCredentialsMatch} from '../lib/staff-session';
test('missing staff credentials fail closed',()=>{
 delete process.env.DEMO_STAFF_USERNAME;delete process.env.DEMO_STAFF_PASSWORD;
 assert.equal(staffCredentialsMatch('staff','securepassword'),false);
 process.env.DEMO_STAFF_USERNAME='staff';process.env.DEMO_STAFF_PASSWORD='a-long-test-only-password';
 assert.equal(staffCredentialsMatch('staff','a-long-test-only-password'),true);
 assert.equal(staffCredentialsMatch('staff','wrong'),false);
});
