/* Runs a suite written for the JavaScriptCore shell under Node.
 *
 * The suites use jsc's script-shell globals — read(), print(), load() — and
 * expect top-level `this` to be the global object. vm.runInThisContext gives
 * them all four, so the same file runs unchanged on either engine.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

globalThis.read = function (f) { return fs.readFileSync(f, 'utf8'); };
globalThis.print = function () { console.log(Array.prototype.join.call(arguments, ' ')); };
globalThis.load = function (f) {
  return vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
};

const file = process.argv[2];
vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
