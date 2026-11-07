const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const test = require('node:test');
const source = fs.readFileSync('lib/order-validation.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', compiled)(mod.exports, mod);
const { normalizeOrderLines } = mod.exports;
test('aggregates duplicate lines and sorts deterministically', () => {
  assert.deepEqual(normalizeOrderLines([{menuItemId:'b',quantity:1},{menuItemId:'a',quantity:2},{menuItemId:'b',quantity:3}]), [{menuItemId:'a',quantity:2},{menuItemId:'b',quantity:4}]);
});
test('rejects empty and oversized carts', () => {
  assert.throws(() => normalizeOrderLines([]));
  assert.throws(() => normalizeOrderLines(Array(101).fill({menuItemId:'a',quantity:1})));
});
test('rejects zero, negative, fractional and unsafe quantities', () => {
  for (const quantity of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(() => normalizeOrderLines([{menuItemId:'a',quantity}]));
});
test('rejects aggregate overflow', () => assert.throws(() => normalizeOrderLines([{menuItemId:'a',quantity:Number.MAX_SAFE_INTEGER},{menuItemId:'a',quantity:1}])));
test('rejects malformed identifiers', () => {
  for (const menuItemId of ['', ' ', null, 4]) assert.throws(() => normalizeOrderLines([{menuItemId,quantity:1}]));
});
test('does not mutate caller input', () => {
  const lines = [{menuItemId:'b',quantity:2},{menuItemId:'a',quantity:1}];
  const snapshot = JSON.stringify(lines);
  normalizeOrderLines(lines);
  assert.equal(JSON.stringify(lines), snapshot);
});
