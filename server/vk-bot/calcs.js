// calcs.js — формулы калькуляторов сайта для бота. Берём сам src/assets/js/calculators.js
// (тот же файл, что считает на сайте) и запускаем его в песочнице vm без браузера:
// так бот и сайт всегда считают одинаково, а формулы не копируются.
// Файл рассчитан на браузер — подсовываем пустой document, а объект CALCS достаём наружу.
// Обои и краска считают стены через calc-room.js (window.CalcRoom.measure) — грузим и его.
// papka — где лежат оба файла: в репо src/assets/js, на сервере — сам выложенный сайт.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function zagruzitCalcs(papka) {
  let kod = readFileSync(path.join(papka, 'calculators.js'), 'utf8');
  const kodKomnaty = readFileSync(path.join(papka, 'calc-room.js'), 'utf8');
  const metka = 'const CALCS = {';
  if (!kod.includes(metka)) throw new Error('В calculators.js нет «const CALCS = {» — устройство файла поменялось');
  kod = kod.replace(metka, 'const CALCS = globalThis.__CALCS = {');
  const pusto = () => [];
  const document = {
    querySelectorAll: pusto, querySelector: () => null, getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }),
    addEventListener() {}, documentElement: { dataset: {} },
  };
  const window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), location: { hash: '', origin: 'https://kor-nil.ru', pathname: '/' } };
  const sandbox = { window, document, location: window.location, navigator: {}, console, setTimeout, clearTimeout, sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem() {} }, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  sandbox.globalThis = sandbox;
  window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(kodKomnaty, sandbox, { filename: 'calc-room.js' });
  vm.runInContext(kod, sandbox, { filename: 'calculators.js' });
  if (!window.CalcRoom) throw new Error('calc-room.js не выставил window.CalcRoom');
  if (!sandbox.__CALCS) throw new Error('CALCS не появился после запуска calculators.js');
  return sandbox.__CALCS;
}
