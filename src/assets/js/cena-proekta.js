// cena-proekta.js — «Сколько будет стоить ваш проект» на /uslugi/dom/: площадь → три цены «от».
// Ставки — те же, что в карточках услуг на странице; меняются вместе.
(function () {
  const pl = document.getElementById('cena-pl'), out = document.getElementById('cena-itog');
  if (!pl || !out) return;
  const fmt = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const VARIANTY = [
    ['Проект дома целиком', (s) => s * 600],
    ['Только расстановка и 3D', (s) => Math.max(10000, s * 200)],
    ['Инженерия по вашей расстановке', (s) => s * 400],
  ];
  const schitat = () => {
    const s = Math.min(5000, Math.max(0, Number(pl.value) || 0));
    out.innerHTML = s ? VARIANTY.map(([t, f]) => `<li><span>${t}</span><b>от ${fmt(f(s))}</b></li>`).join('') : '';
  };
  pl.addEventListener('input', schitat);
  schitat();
})();
