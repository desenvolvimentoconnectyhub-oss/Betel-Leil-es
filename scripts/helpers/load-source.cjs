/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
exports.loadSource = function loadSource(file, mocks = {}, globals = {}, expose = []) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8') + expose.map(name => '\nexports.' + name + ' = ' + name + ';').join(''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  const scopedRequire = name => {
    if (name === 'server-only') return {};
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return loadSource(path.join('src', name.slice(2) + '.ts'), mocks, globals);
    if (name.startsWith('.')) return loadSource(path.resolve(path.dirname(file), name + '.ts'), mocks, globals);
    return require(name);
  };
  vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: scopedRequire, process, Buffer, console, fetch, AbortSignal, URL, setTimeout, clearTimeout, ...globals }, { filename: file });
  return compiledModule.exports;
};
