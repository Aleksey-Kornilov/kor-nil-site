// vk.js — API ВКонтакте от имени сообщества: отправка сообщений и Bots Long Poll.
// Ключ сообщества — VK_GROUP_TOKEN в .env (права: сообщения, управление, фото, стена).

const API = 'https://api.vk.ru/method/';
const V = '5.199';

export function sozdatVk(token, groupId) {
  async function vyzov(metod, params = {}) {
    const telo = new URLSearchParams({ ...params, access_token: token, v: V });
    const r = await fetch(API + metod, { method: 'POST', body: telo, signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    if (d.error) {
      const e = new Error(`${metod}: ${d.error.error_code} ${d.error.error_msg}`);
      e.kod = d.error.error_code;
      throw e;
    }
    return d.response;
  }

  /** Сообщение человеку. knopki — клавиатура ВК (объект) или null. */
  function otpravit(peerId, tekst, knopki) {
    const p = { peer_id: peerId, random_id: Math.floor(Math.random() * 2 ** 31), message: tekst, dont_parse_links: 0 };
    if (knopki) p.keyboard = JSON.stringify(knopki);
    return vyzov('messages.send', p);
  }

  /**
   * Long Poll: вызывает obrabotat(событие) на каждое событие, пока живёт процесс.
   * failed 1 — новый ts; 2 и 3 — заново взять сервер и ключ (так велит документация ВК).
   */
  async function slushat(obrabotat) {
    let srv = null, pauza = 1000;
    for (;;) {
      try {
        if (!srv) srv = await vyzov('groups.getLongPollServer', { group_id: groupId });
        const url = `${srv.server}?act=a_check&key=${srv.key}&ts=${srv.ts}&wait=25`;
        const r = await fetch(url, { signal: AbortSignal.timeout(35000) });
        const d = await r.json();
        if (d.failed === 1) { srv.ts = d.ts; continue; }
        if (d.failed) { srv = null; continue; }
        srv.ts = d.ts;
        pauza = 1000;
        for (const u of d.updates || []) {
          try { await obrabotat(u); } catch (e) { console.error(new Date().toISOString(), 'событие не обработано', u.type, e.message); }
        }
      } catch (e) {
        console.error(new Date().toISOString(), 'long poll:', e.message, '— повтор через', pauza / 1000, 'с');
        srv = null;
        await new Promise((ok) => setTimeout(ok, pauza));
        pauza = Math.min(pauza * 2, 60000);
      }
    }
  }

  return { vyzov, otpravit, slushat };
}
