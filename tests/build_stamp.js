// Assinatura da versão (a mesma que o painel mostra no tooltip do logo), calculada pelo próprio cep.js.
// uso: node tests/build_stamp.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '../bin-cep');
const g = {};
g.window = g;
vm.runInNewContext(fs.readFileSync(path.join(dir, 'js/cep.js'), 'utf8'), g);
const stamp = g.BIN.stamp((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
console.log(stamp);
module.exports = stamp;
