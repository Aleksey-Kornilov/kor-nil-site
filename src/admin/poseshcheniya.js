// poseshcheniya.js — блок «Посещения» в сводке. Числа берёт из admin/metrika.json: файл раз в час пишет
// сервер (scripts/daily-report/panel-metrika.js), ключ Яндекса в браузер не попадает.
(function () {
  const { el } = Panel;
  const dniSlovo = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
  };
  const vizitov = (n) => `${n} ${dniSlovo(n, 'визит', 'визита', 'визитов')}`;
  const lyudej = (n) => `${n} ${dniSlovo(n, 'человек', 'человека', 'человек')}`;
  const denMesyac = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

  const sPropisnoj = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function sravnenie(seichas, bylo, s) {
    if (!bylo) return seichas ? `${s}: было 0` : `${s}: столько же`;
    if (seichas === bylo) return `${s}: столько же`;
    const p = Math.round(Math.abs(seichas - bylo) / bylo * 100);
    return `${s}: ${seichas > bylo ? '+' : '−'}${p}%`;
  }

  function plitka(chislo, podpis, poyasnenie) {
    return el('div', { klass: 'pokazatel' }, el('b', {}, chislo), el('span', {}, podpis),
      poyasnenie && el('small', {}, poyasnenie));
  }

  function grafik(dni) {
    const maks = Math.max(1, ...dni.map((x) => x.vizity));
    const podskazka = el('div', { klass: 'podskazka', hidden: true });
    const stolbcy = el('div', { klass: 'stolbcy', role: 'img',
      'aria-label': `Визиты по дням за 30 дней, больше всего за день: ${maks}. Точные числа в таблице ниже.` });
    for (const den of dni) {
      const stolbik = el('span', { klass: den.vizity ? 'stolbik' : 'stolbik nol' });
      if (den.vizity) stolbik.style.height = `${(den.vizity / maks) * 100}%`;
      const mesto = el('div', { klass: 'den' }, stolbik);
      mesto.dataset.tekst = `${denMesyac(den.d)}: ${vizitov(den.vizity)}, ${lyudej(den.lyudi)}`;
      stolbcy.append(mesto);
    }
    const pokazat = (s) => {
      const den = s.target.closest && s.target.closest('.den');
      if (!den) return;
      podskazka.textContent = den.dataset.tekst;
      podskazka.hidden = false;
      const shirina = stolbcy.clientWidth, kraj = podskazka.offsetWidth / 2;
      const x = den.offsetLeft + den.offsetWidth / 2;
      podskazka.style.left = `${Math.min(shirina - kraj, Math.max(kraj, x))}px`;
    };
    stolbcy.addEventListener('pointerover', pokazat);
    stolbcy.addEventListener('pointerdown', pokazat);
    stolbcy.addEventListener('pointerleave', () => { podskazka.hidden = true; });

    const tablica = el('details', { klass: 'po-dnyam' }, el('summary', {}, 'Таблица по дням'),
      el('table', { klass: 'prostaya' },
        el('thead', {}, el('tr', {}, ...['День', 'Визиты', 'Люди'].map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', {}, ...dni.slice().reverse().map((d) => el('tr', {}, el('td', {}, denMesyac(d.d)), el('td', {}, d.vizity), el('td', {}, d.lyudi))))));

    return el('section', { klass: 'plitka grafik' },
      el('h3', {}, 'Визиты по дням'),
      el('div', { klass: 'polotno' }, el('span', { klass: 'maks' }, maks), stolbcy, podskazka),
      el('div', { klass: 'os' }, el('span', {}, denMesyac(dni[0].d)), el('span', {}, denMesyac(dni[dni.length - 1].d))),
      tablica);
  }

  function spisokChisel(zagolovok, stroki) {
    return el('section', { klass: 'plitka' }, el('h3', {}, zagolovok),
      stroki.length
        ? el('ul', { klass: 'chisla' }, ...stroki.map(([imya, chislo]) => el('li', {}, el('span', {}, imya), el('b', {}, chislo))))
        : el('p', { klass: 'podpis' }, 'Пока пусто.'));
  }

  function blok(m) {
    const { n7, n30 } = m.periody;
    const segodnya = m.sutki[m.sutki.length - 1];
    const vremya = new Date(m.obnovleno).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return el('section', { klass: 'poseshcheniya' },
      el('div', { klass: 'golova' }, el('h2', {}, 'Посещения сайта'), el('span', { klass: 'podpis' }, `Метрика, обновлено в ${vremya}`)),
      el('div', { klass: 'pokazateli' },
        plitka(segodnya.vizity, 'Сегодня', lyudej(segodnya.lyudi)),
        plitka(n7.vizity, 'За 7 дней', sravnenie(n7.vizity, n7.bylo_vizity, 'к прошлым 7')),
        plitka(n30.vizity, 'За 30 дней', sravnenie(n30.vizity, n30.bylo_vizity, 'к прошлым 30')),
        plitka(n30.lyudi, 'Людей за 30 дней', `из поиска ${vizitov(n30.iz_poiska)}`)),
      grafik(m.sutki),
      el('div', { klass: 'tri-kolonki' },
        spisokChisel('Откуда приходят, 30 дней', m.istochniki.map((x) => [x.nazvanie, x.vizity])),
        spisokChisel('Что смотрят, 30 дней', m.stranicy.map((x) => [sPropisnoj(x.nazvanie), x.prosmotry])),
        spisokChisel('Цели, 30 дней', m.celi.filter((x) => x.n30 > 0).sort((a, b) => b.n30 - a.n30).map((x) => [sPropisnoj(x.nazvanie), x.n30]))));
  }

  Panel.poseshcheniya = async () => {
    try {
      const otvet = await fetch('/admin/metrika.json', { credentials: 'same-origin' });
      if (!otvet.ok) throw new Error('нет файла');
      const m = await otvet.json();
      if (!m.sutki || !m.sutki.length) throw new Error('пустой файл');
      return blok(m);
    } catch {
      return el('p', { klass: 'plitka podpis' }, 'Данные Метрики пока недоступны. Они обновляются раз в час.');
    }
  };
})();
