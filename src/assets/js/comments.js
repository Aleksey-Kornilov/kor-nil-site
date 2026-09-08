// comments.js — комментарии под статьями блога. Без регистрации: имя + текст.
// Хранятся на бэкенде ЧатЯдра (sntchat.ru, routes/kor_nil_comments.js).
// В браузере запоминаем имя и ключи своих комментариев: по ключу их можно
// править и удалять в течение суток. Текст вставляется как textContent — без HTML.

(function () {
  'use strict';
  const root = document.querySelector('.comments[data-slug]');
  if (!root) return;

  const API = 'https://sntchat.ru/api/kor-nil-comments';
  const slug = root.dataset.slug;
  const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  };
  // Ключи своих комментариев: { id: { token, ts } }. Старше суток — чистим.
  const mine = store.get('kn_comment_tokens', {});
  Object.keys(mine).forEach((id) => { if (Date.now() - mine[id].ts > EDIT_WINDOW_MS) delete mine[id]; });
  store.set('kn_comment_tokens', mine);

  const h = (tag, attrs, children) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && el.appendChild(c));
    return el;
  };

  function fmtDate(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 1) return 'только что';
    if (diff < 60) return Math.round(diff) + ' мин назад';
    if (diff < 24 * 60) return Math.round(diff / 60) + ' ч назад';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const list = h('div', { class: 'comments-list' });
  const status = h('p', { class: 'comments-status', 'aria-live': 'polite' });
  let comments = [];
  let replyTo = null;

  // --- Форма ---------------------------------------------------------------
  const nameInput = h('input', { type: 'text', id: 'cm-name', name: 'name', maxlength: '60', autocomplete: 'nickname', placeholder: 'Как вас зовут', value: store.get('kn_comment_name', '') });
  const bodyInput = h('textarea', { id: 'cm-body', name: 'body', rows: '4', maxlength: '2000', placeholder: 'Ваш комментарий' });
  const replyNote = h('p', { class: 'comments-reply-note', hidden: '' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', text: 'Отправить' });
  const form = h('form', { class: 'comments-form glass', novalidate: '' }, [
    h('h3', { text: 'Оставить комментарий' }),
    replyNote,
    h('div', { class: 'field' }, [h('label', { for: 'cm-name', text: 'Имя' }), nameInput]),
    h('div', { class: 'field' }, [h('label', { for: 'cm-body', text: 'Комментарий' }), bodyInput]),
    // Honeypot: людям не виден, боты заполняют
    h('div', { 'aria-hidden': 'true', style: 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;' }, [
      h('label', { for: 'cm-company', text: 'Не заполняйте это поле' }),
      h('input', { type: 'text', id: 'cm-company', name: 'company', tabindex: '-1', autocomplete: 'off' }),
    ]),
    h('div', { class: 'form-footer' }, [submit, h('p', { class: 'form-hint text-small text-muted', text: 'Без регистрации. Имя видят все, почту не спрашиваем. Свой комментарий можно поправить или удалить в течение суток.' })]),
    status,
  ]);

  function setReply(c) {
    replyTo = c;
    if (c) {
      replyNote.textContent = '';
      replyNote.appendChild(document.createTextNode('Ответ для ' + c.name + ' · '));
      const cancel = h('button', { type: 'button', class: 'comments-link', text: 'отменить' });
      cancel.addEventListener('click', () => setReply(null));
      replyNote.appendChild(cancel);
      replyNote.hidden = false;
      bodyInput.focus();
    } else {
      replyNote.hidden = true;
    }
  }

  async function api(method, path, data) {
    const resp = await fetch(API + path, {
      method,
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    let json = {};
    try { json = await resp.json(); } catch (e) { /* пустой ответ */ }
    if (!resp.ok) throw new Error(json.error || 'Ошибка ' + resp.status);
    return json;
  }

  function say(msg, kind) {
    status.textContent = msg || '';
    status.className = 'comments-status' + (kind ? ' is-' + kind : '');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('');
    const name = nameInput.value.trim();
    const body = bodyInput.value.trim();
    if (name.length < 2) return say('Напишите имя, хотя бы две буквы.', 'error');
    if (body.length < 3) return say('Слишком короткий комментарий.', 'error');
    submit.disabled = true;
    try {
      const data = { slug, name, body, company: form.elements.company.value };
      if (replyTo) data.parent_id = replyTo.id;
      const r = await api('POST', '/', data);
      store.set('kn_comment_name', name);
      if (r.comment) {
        mine[r.comment.id] = { token: r.token, ts: Date.now() };
        store.set('kn_comment_tokens', mine);
        comments.push(r.comment);
        render();
        bodyInput.value = '';
        setReply(null);
        say('Комментарий опубликован.', 'success');
        const el = document.getElementById('comment-' + r.comment.id);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        say('Комментарий опубликован.', 'success');
      }
    } catch (err) {
      say(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  // --- Список ---------------------------------------------------------------
  function itemEl(c, depth) {
    const own = mine[c.id];
    const meta = h('p', { class: 'comment-meta' }, [
      h('strong', { text: c.name }),
      h('span', { text: ' · ' + fmtDate(c.created_at) + (c.updated_at ? ' · изменён' : '') }),
    ]);
    const body = h('p', { class: 'comment-body', text: c.body });
    const actions = h('p', { class: 'comment-actions' });
    if (depth === 0) {
      const reply = h('button', { type: 'button', class: 'comments-link', text: 'Ответить' });
      reply.addEventListener('click', () => { setReply(c); form.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      actions.appendChild(reply);
    }
    if (own) {
      const edit = h('button', { type: 'button', class: 'comments-link', text: 'Изменить' });
      const del = h('button', { type: 'button', class: 'comments-link', text: 'Удалить' });
      edit.addEventListener('click', () => startEdit(c, body, actions));
      del.addEventListener('click', async () => {
        if (!confirm('Удалить ваш комментарий?')) return;
        try {
          await api('DELETE', '/' + c.id, { token: own.token });
          comments = comments.filter((x) => x.id !== c.id);
          delete mine[c.id]; store.set('kn_comment_tokens', mine);
          render();
        } catch (err) { say(err.message, 'error'); }
      });
      actions.appendChild(edit); actions.appendChild(del);
    }
    return h('article', { class: 'comment' + (depth ? ' comment--reply' : ''), id: 'comment-' + c.id }, [meta, body, actions]);
  }

  function startEdit(c, bodyEl, actions) {
    const ta = h('textarea', { rows: '4', maxlength: '2000' });
    ta.value = c.body;
    const save = h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Сохранить' });
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Отмена' });
    const box = h('div', { class: 'comment-edit' }, [ta, h('div', { class: 'comment-edit-actions' }, [save, cancel])]);
    bodyEl.replaceWith(box); actions.hidden = true;
    cancel.addEventListener('click', () => render());
    save.addEventListener('click', async () => {
      try {
        const r = await api('PATCH', '/' + c.id, { token: mine[c.id].token, body: ta.value.trim() });
        comments = comments.map((x) => (x.id === c.id ? r.comment : x));
        render();
      } catch (err) { say(err.message, 'error'); }
    });
  }

  function render() {
    list.innerHTML = '';
    const byParent = new Map();
    const ids = new Set(comments.map((c) => c.id));
    comments.forEach((c) => {
      const p = c.parent_id && ids.has(c.parent_id) ? c.parent_id : 0; // ответ на удалённый → наверх
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(c);
    });
    const tops = byParent.get(0) || [];
    heading.textContent = comments.length ? 'Комментарии · ' + comments.length : 'Комментарии';
    if (!tops.length) list.appendChild(h('p', { class: 'comments-empty', text: 'Пока ни одного комментария. Будьте первым.' }));
    tops.forEach((c) => {
      list.appendChild(itemEl(c, 0));
      (byParent.get(c.id) || []).forEach((r) => list.appendChild(itemEl(r, 1)));
    });
  }

  const heading = h('h2', { class: 'comments-title', text: 'Комментарии' });
  root.appendChild(heading);
  root.appendChild(list);
  root.appendChild(form);

  api('GET', '/?slug=' + encodeURIComponent(slug))
    .then((r) => { comments = r.comments || []; render(); })
    .catch(() => { list.appendChild(h('p', { class: 'comments-empty', text: 'Комментарии сейчас недоступны. Попробуйте обновить страницу позже.' })); });
})();
