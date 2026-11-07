// otzyvy.js — отзывы заказчиков для страниц работ.
// Текст и подпись лежат вне репозитория: репозиторий публичный на GitHub, а согласие заказчика
// разрешает показ только на kor-nil.ru. Здесь только код; данные читаются при сборке на этом компьютере.
// Нет файлов — блоков отзывов на страницах просто не будет.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PAPKA = join(homedir(), 'CC_PROJ', 'dom', 'site-private');

export default function () {
  let spisok;
  try {
    spisok = JSON.parse(readFileSync(join(PAPKA, 'otzyvy.json'), 'utf8'));
  } catch (e) {
    console.warn('[otzyvy] нет списка отзывов, блоки не выводятся');
    return [];
  }
  return spisok.flatMap((o) => {
    let tekst = '';
    try {
      tekst = readFileSync(join(PAPKA, o.tekst), 'utf8').replace(/^﻿/, '').trim();
    } catch (e) { /* файла нет — ниже пропустим */ }
    if (!tekst) {
      console.warn(`[otzyvy] пустой текст: ${o.id}, отзыв не выводится`);
      return [];
    }
    const abzacy = tekst.split(/\r?\n\s*\r?\n/).map((a) => a.trim()).filter(Boolean);
    return [{ rabota: o.rabota, nazvanie: o.nazvanie, url: o.url, podpis: o.podpis, abzacy }];
  });
}
