const fs = require('fs');
const vm = require('vm');
const path = 'e:/decode/decode';
const html = fs.readFileSync(path, 'utf8');
// Extract the first <script>...</script> block that contains the obfuscated code (skip the CryptoJS external script tag)
const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
let targetScript = '';
if (scriptBlocks) {
  for (let b of scriptBlocks) {
    if (b.includes('CryptoJS.AES.decrypt') || b.includes("document.write")) {
      // strip <script> tags
      targetScript = b.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      break;
    }
  }
}
if (!targetScript) {
  console.error('No target script found');
  process.exit(1);
}
// Create minimal document mock
const doc = {
  _out: '',
  open: function(){ this._out = ''; },
  write: function(s){ this._out += s; },
  close: function(){},
  toString: function(){ return this._out; }
};
// Provide console, CryptoJS via require
const CryptoJS = require('crypto-js');
const sandbox = { document: doc, CryptoJS: CryptoJS, window: {}, console: console };
try {
  vm.createContext(sandbox);
  vm.runInContext(targetScript, sandbox, {timeout: 10000});
  const out = sandbox.document._out;
  fs.writeFileSync('e:/decode/decrypted_output.html', out, 'utf8');
  console.log('Wrote decrypted output to e:/decode/decrypted_output.html');
} catch (e) {
  console.error('Error executing script:', e);
}
