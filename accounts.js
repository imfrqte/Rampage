(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const data = window.FirebirdData;
  const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
  const statusNames = {pending:'На рассмотрении',accepted:'Подтверждена оператором',declined:'Отклонена',cancelled:'Отменена'};
  const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const apiBase = new URL('api/', document.baseURI);
  const offlineText = 'Сервер пока не подключён. Каталог работает, но регистрация, заказы и письма станут доступны после запуска серверной части.';
  let config = null, user = null, csrf = '', mode = 'login', pendingProvider = null;
  let renderVersion = 0, captchaWidget = null, captchaToken = '', captchaScript = null;
  let requestKey = '', lastOrderBody = '', resetToken = '', verifyToken = '';
  // Do not retain email action tokens in history or pass them to third-party scripts.
  const actionUrl = new URL(location.href);
  resetToken = actionUrl.searchParams.get('reset') || '';
  verifyToken = actionUrl.searchParams.get('verify') || '';
  if (resetToken || verifyToken) {
    actionUrl.searchParams.delete('reset'); actionUrl.searchParams.delete('verify');
    history.replaceState(null, '', actionUrl.pathname + actionUrl.search + actionUrl.hash);
  }
  document.querySelector('.topbar').insertAdjacentHTML('beforeend', '<div class="account-nav"><button type="button" id="account-open">Войти <span aria-hidden="true">↗</span></button></div>');
  document.querySelector('main footer').insertAdjacentHTML('beforebegin', `
    <section class="account-hub" id="account-hub" aria-labelledby="account-heading">
      <div class="account-heading"><div><p class="bento-label">ОТ ВЫБОРА К ПЛАНУ</p><h2 id="account-heading">Всё для вашего <em>события.</em></h2></div><p>Один аккаунт. Ваши заявки.<br>Новые имена в почте.</p></div>
      <div class="account-grid">
        <article class="account-tile account-tile--accent"><span class="account-tile-icon" aria-hidden="true">◎</span><p class="bento-label">ЛИЧНЫЙ КАБИНЕТ</p><h3>Давайте знакомиться.</h3><p>Аккаунт с подтверждением почты. Вход по паролю и защита от автоматических регистраций.</p><button class="account-action" type="button" data-account-view="register">Создать аккаунт <span aria-hidden="true">↗</span></button></article>
        <article class="account-tile account-tile--lime"><span class="account-tile-icon" aria-hidden="true">▦</span><p class="bento-label">ВАШИ ПЛАНЫ</p><h3>У события есть дата.</h3><p>Выберите подрядчика, предложите бюджет и расскажите о пожеланиях. Следите за статусом заявки.</p><button class="account-action" type="button" data-account-view="orders">Мои заявки <span aria-hidden="true">↗</span></button></article>
        <article class="account-tile account-tile--dark"><span class="account-tile-icon" aria-hidden="true">✉</span><p class="bento-label">НОВЫЕ ЛЮДИ</p><h3>Хорошие новости.</h3><p>Узнавайте о новых подрядчиках в каталоге. Только по вашей подписке, с возможностью отключить письма.</p><button class="account-action" type="button" data-account-view="subscription">Настроить письма <span aria-hidden="true">↗</span></button></article>
      </div><p class="account-status" id="account-service-status" data-state="offline" role="status">Проверяем подключение личного кабинета…</p>
    </section>`);
  document.body.insertAdjacentHTML('beforeend', '<dialog id="account-dialog" class="account-dialog" aria-labelledby="account-dialog-title"><div class="dialog-header"><p class="eyebrow">FIREBIRD · ЛИЧНОЕ</p><button type="button" id="account-close" class="icon-button" aria-label="Закрыть личный кабинет">×</button></div><div id="account-content"></div></dialog>');
  const dialog = $('account-dialog');
  const footer = document.querySelector('main footer p');
  footer.textContent = 'Демонстрационный каталог HackAlem AI. Имена анонимизированы. Заявка не является оплатой или гарантированной бронью; сведения и стоимость нужно подтвердить у подрядчика.';

  async function api(path, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL(path, apiBase), {
        method:body === undefined ? 'GET' : 'POST', credentials:'same-origin', cache:'no-store', signal:controller.signal,
        headers:body === undefined ? {'Accept':'application/json'} : {'Accept':'application/json','Content-Type':'application/json','X-CSRF-Token':csrf},
        ...(body === undefined ? {} : {body:JSON.stringify(body)})
      });
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error(offlineText);
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) { user=null; updateIdentity(); }
        const error = new Error(result.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.');
        error.code=result.code; error.status=response.status; throw error;
      }
      if (result.csrfToken) csrf=result.csrfToken;
      if (Object.hasOwn(result,'user')) { user=result.user; updateIdentity(); }
      return result;
    } catch(error) {
      if (error.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Попробуйте ещё раз — повтор заявки не создаст дубликат.');
      if (error instanceof TypeError) throw new Error('Нет связи с сервером. Проверьте подключение и повторите запрос.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function updateIdentity() { $('account-open').textContent=user ? 'Мой кабинет ↗' : 'Войти ↗'; }
  function message(text, kind='error') {
    const element=$('account-message'); if(!element)return;
    element.textContent=text; element.dataset.kind=kind; element.hidden=!text;
  }
  function resetCaptcha() {
    captchaToken='';
    if (captchaWidget !== null && window.turnstile) { window.turnstile.remove(captchaWidget); captchaWidget=null; }
  }
  function loadCaptcha() {
    if(window.turnstile) return Promise.resolve();
    if(captchaScript) return captchaScript;
    captchaScript=new Promise((resolve,reject)=>{
      const script=document.createElement('script'); script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async=true;
      const timer=setTimeout(()=>{script.remove();captchaScript=null;reject(new Error('Защита от ботов не загрузилась. Проверьте блокировщик и откройте форму снова.'));},12000);
      script.onload=()=>{clearTimeout(timer);resolve();}; script.onerror=()=>{clearTimeout(timer);script.remove();captchaScript=null;reject(new Error('Не удалось загрузить защиту от ботов. Проверьте соединение.'));};
      document.head.append(script);
    });
    return captchaScript;
  }
  async function mountCaptcha(action, version) {
    if (!config?.available || !config.captchaRequired) return;
    try {
      await loadCaptcha(); if(version!==renderVersion || !dialog.open || !$('account-captcha'))return;
      captchaWidget=window.turnstile.render('#account-captcha',{sitekey:config.captchaSiteKey,action,theme:'light',size:'flexible',
        callback:token=>{captchaToken=token;},'expired-callback':()=>{captchaToken='';},
        'error-callback':()=>{captchaToken='';message('Проверка на бота не завершена. Попробуйте открыть форму заново.');}});
    } catch(error) { if(version===renderVersion)message(error.message); }
  }
  function captchaValue() {
    if (config?.captchaRequired && !captchaToken) throw new Error('Завершите проверку на бота перед отправкой.');
    return captchaToken;
  }
  function widgetMarkup() {
    if(!config?.available) return '<p class="account-help">Проверка на бота станет доступна после настройки сервера.</p>';
    if(config?.development) return '<p class="account-help">Локальный тестовый режим: CAPTCHA отключена, письма не отправляются в интернет.</p>';
    return '<div id="account-captcha" class="account-captcha"></div><p class="account-help">Защита от ботов — Cloudflare Turnstile. Проверка выполняется сервером.</p>';
  }
  function notice() {
    return !config?.available ? `<p class="account-status" data-state="offline">${offlineText}</p>` : '';
  }
  const field=(id,label,type='text',attrs='')=>`<label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" ${attrs}>`;
  function frame(title,content) {
    resetCaptcha(); renderVersion++;
    $('account-content').innerHTML=`<h2 id="account-dialog-title">${esc(title)}</h2>${notice()}${content}<p id="account-message" class="account-message" role="alert" hidden></p>`;
  }
  function show(view='login') {
    document.querySelectorAll('dialog[open]').forEach(d=>{if(d!==dialog)d.close();});
    if(!dialog.open)dialog.showModal();
    mode=view;
    if(['account','subscription','orders','order'].includes(view) && !user) {mode='login';}
    if(view==='register' && user)mode='account';
    render();
  }
  function render() {
    const disabled=config?.available?'':'disabled';
    if(['login','register','forgot','reset','verify','resend'].includes(mode)) {
      const titles={login:'С возвращением.',register:'Познакомимся?',forgot:'Восстановить доступ',reset:'Новый пароль',verify:'Подтверждение почты',resend:'Подтвердите вашу почту'};
      const authTabs=['login','register'].includes(mode)?`<div class="account-tabs" role="group" aria-label="Вход или регистрация"><button type="button" data-account-view="login" aria-pressed="${mode==='login'}">Вход</button><button type="button" data-account-view="register" aria-pressed="${mode==='register'}">Регистрация</button></div>`:'';
      let fields='';
      if(mode==='register')fields+=field('account-name','Имя и фамилия','text','autocomplete="name" minlength="2" maxlength="80" required');
      if(['register','login','forgot'].includes(mode))fields+=field('account-email','Электронная почта','email','autocomplete="email" maxlength="254" required');
      if(['register','login','reset'].includes(mode))fields+=field('account-password','Пароль','password',`autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="${mode==='login'?1:12}" maxlength="128" required`);
      if(['register','reset'].includes(mode))fields+='<p class="account-help">От 12 до 128 символов. Используйте уникальный пароль или длинную парольную фразу.</p>';
      if(mode==='verify')fields+='<p>Нажмите кнопку, чтобы подтвердить адрес из полученного письма. Ссылка одноразовая.</p>';
      if(mode==='resend')fields+=`<p>Пришлём новую ссылку на ${esc(user?.email)}. Подтверждение нужно для заявок и подписки.</p>`;
      if(mode==='forgot')fields+='<p class="account-help">Если аккаунт существует, отправим одноразовую ссылку для нового пароля.</p>';
      const buttons={login:'Войти',register:'Создать аккаунт',forgot:'Отправить ссылку',reset:'Сохранить пароль',verify:'Подтвердить почту',resend:'Отправить письмо повторно'};
      frame(titles[mode],`${authTabs}<form id="account-form" class="account-form">${fields}${mode==='verify'?'':widgetMarkup()}${mode==='register'?'<p class="account-help">Адрес нужен для входа и служебных писем. Рассылка о подрядчиках включается отдельно в кабинете.</p>':''}<button type="submit" class="account-action" ${disabled}>${buttons[mode]}</button></form><div class="account-actions">${mode==='login'?'<button class="account-secondary" type="button" data-account-view="forgot">Забыли пароль?</button>':'<button class="account-secondary" type="button" data-account-view="login">Вернуться ко входу</button>'}</div>`);
      $('account-form').addEventListener('submit',submitAuth);
      if(!config?.available)$('account-form').querySelectorAll('input').forEach(input=>{input.disabled=true;});
      if(mode!=='verify')void mountCaptcha(mode,renderVersion);
    } else if(mode==='account'||mode==='subscription') {
      frame('Ваш личный кабинет',`<p class="account-summary"><strong>${esc(user.name)}</strong><br>${esc(user.email)}</p><p class="account-help">${user.verified?'Почта подтверждена.':'Почта ещё не подтверждена. Проверьте письмо, включая папку «Спам».'}</p>${!user.verified?'<button class="account-secondary" type="button" data-account-view="resend">Отправить подтверждение снова</button>':''}<form id="subscription-form" class="account-form"><label class="account-checkbox"><input id="subscribe-check" type="checkbox" ${user.subscribed?'checked':''} ${user.verified?'':'disabled'}><span>Присылать письма о новых подрядчиках</span></label><p class="account-help">Только новые профили после включения подписки. Можно отключить здесь или по ссылке в письме.</p><button class="account-action" type="submit" ${user.verified?'':'disabled'}>Сохранить подписку</button></form><div class="account-actions"><button class="account-secondary" type="button" data-account-view="orders">Мои заявки</button>${pendingProvider?'<button class="account-secondary" type="button" data-account-view="order">Продолжить заявку</button>':''}<button class="account-secondary" type="button" id="account-logout">Выйти</button></div>`);
      $('subscription-form').addEventListener('submit',async event=>{event.preventDefault();await busy(event.currentTarget,async()=>{await api('subscription',{enabled:$('subscribe-check').checked});message('Настройки подписки сохранены.','success');});});
      $('account-logout').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await api('auth/logout',{});user=null;pendingProvider=null;updateIdentity();show('login');message('Вы вышли из аккаунта.','success');}catch(error){message(error.message);}finally{button.disabled=false;}});
    } else if(mode==='orders') {
      frame('Мои заявки', '<p class="account-help">Это запросы на согласование, не оплаченная бронь. Подтверждение выполняет оператор, данные подрядчиков в каталоге демонстрационные.</p><div id="account-order-list" class="account-order-list" aria-live="polite">Загружаем заявки…</div><div class="account-actions"><button class="account-secondary" type="button" data-account-view="account">В кабинет</button></div>');
      void loadOrders(renderVersion);
    } else if(mode==='order') {
      if(!pendingProvider){show('orders');return;}
      const p=pendingProvider;
      const proposedDate=$('date').value||today(), initialDate=proposedDate<today()?today():proposedDate;
      frame('Расскажите о событии.', `<div class="account-provider"><div class="account-provider-avatar" aria-hidden="true">${window.FirebirdCommunity?.avatar(p.id)||'◎'}</div><div><strong>${esc(p.anon_name)}</strong><p>${esc(p.city)} · ${esc(p.categories.join(', '))}</p></div></div><p class="account-help">Цена профиля — от ${money(p.price_from_kzt)}. Укажите свой ориентир: итоговую смету согласуют отдельно.</p>${!user.verified?'<p class="account-status" data-state="offline">Сначала подтвердите почту в личном кабинете.</p>':''}<form id="order-form" class="account-form">${field('order-date','Дата мероприятия','date',`min="${today()}" max="2026-12-31" value="${esc(initialDate)}" required`)}${field('order-budget','Примерный бюджет, ₸','number',`min="1" max="1000000000" step="1" inputmode="numeric" value="${Number($('budget').value)||p.price_from_kzt||1}" required`)}<label for="order-wishes">Комментарии и пожелания <span>необязательно</span></label><textarea id="order-wishes" rows="4" maxlength="2000" placeholder="Формат, время, количество гостей, важные детали…"></textarea><p class="account-help"><span id="wishes-count">0</span> / 2000. Не указывайте пароли, платёжные данные или сведения, которые не нужны для заявки.</p>${widgetMarkup()}<p class="account-help">Календарь каталога известен до 31 декабря 2026. Занятые даты проверяются повторно на сервере. Заявка не отправляется анонимизированному подрядчику автоматически.</p><button class="account-action" type="submit" ${!user.verified||!config?.available?'disabled':''}>Создать заявку</button></form><div class="account-actions"><button class="account-secondary" type="button" data-account-view="account">В кабинет</button></div>`);
      $('order-wishes').addEventListener('input',()=>{$('wishes-count').textContent=$('order-wishes').value.length;});
      $('order-form').addEventListener('submit',submitOrder);void mountCaptcha('order',renderVersion);
    }
  }
  async function busy(form, fn) {
    if(form.dataset.busy)return;
    form.dataset.busy='true';const button=form.querySelector('[type=submit]');button.disabled=true;message('');
    try{await fn();}catch(error){message(error.message);if(error.status===403&&/csrf/i.test(error.code||'')){try{await api('session');}catch(_){}}}
    finally {delete form.dataset.busy;if(button.isConnected)button.disabled=!config?.available;if(captchaWidget!==null&&window.turnstile){window.turnstile.reset(captchaWidget);captchaToken='';}}
  }
  async function submitAuth(event) {
    event.preventDefault();const submittingMode=mode;
    await busy(event.currentTarget,async()=>{
      const body={};
      if(submittingMode!=='verify')body.captchaToken=captchaValue();
      if($('account-name'))body.name=$('account-name').value.trim();
      if($('account-email'))body.email=$('account-email').value.trim();
      if($('account-password'))body.password=$('account-password').value;
      if(submittingMode==='reset')body.token=resetToken;
      if(submittingMode==='verify')body.token=verifyToken;
      const result=await api('auth/'+submittingMode,body);
      if(submittingMode==='login'){show(pendingProvider&&user.verified?'order':'account');return;}
      if(submittingMode==='verify'){verifyToken='';await api('session');show(user?'account':'login');message('Почта подтверждена. Теперь можно создавать заявки.','success');return;}
      if(submittingMode==='reset')resetToken='';
      show(submittingMode==='resend'?'account':'login');
      message(result.message||(submittingMode==='reset'?'Пароль обновлён. Войдите с новым паролем.':'Если адрес доступен для этой операции, письмо отправлено в очередь. Проверьте почту.'),'success');
    });
  }
  async function submitOrder(event) {
    event.preventDefault();await busy(event.currentTarget,async()=>{
      const body={providerId:pendingProvider.id,date:$('order-date').value,budget:Number($('order-budget').value),wishes:$('order-wishes').value.trim()};
      const serialized=JSON.stringify(body);
      if(serialized!==lastOrderBody||!requestKey){requestKey=crypto.randomUUID();lastOrderBody=serialized;}
      await api('orders',{...body,captchaToken:captchaValue(),requestId:requestKey});
      requestKey='';lastOrderBody='';pendingProvider=null;show('orders');message('Заявка сохранена и ожидает рассмотрения. Это ещё не подтверждённая бронь.','success');
    });
  }
  async function loadOrders(version) {
    try {
      const result=await api('orders');if(version!==renderVersion)return;
      $('account-order-list').innerHTML=result.orders.length?result.orders.map(order=>`<article class="account-order"><div class="account-order-top"><h3>${esc(order.providerName)}</h3><span class="order-state" data-status="${esc(order.status)}">${esc(statusNames[order.status]||order.status)}</span></div><p class="account-order-facts">${esc(order.date)} · ориентир ${money(order.budget)}</p>${order.wishes?`<p class="account-order-wishes">${esc(order.wishes)}</p>`:''}<p class="account-help">Заявка № ${esc(order.id)}</p>${order.status==='pending'?`<button class="account-secondary" type="button" data-cancel-order="${esc(order.id)}">Отменить заявку</button>`:order.status==='accepted'?'<p class="account-help">Изменения принятой заявки согласуйте с оператором сайта.</p>':''}</article>`).join(''):'<div class="account-empty"><span aria-hidden="true">▦</span><h3>Здесь будут ваши планы.</h3><p>Откройте карточку подрядчика и нажмите «Оставить заявку».</p><button class="account-action" type="button" id="orders-to-catalog">Выбрать подрядчика ↗</button></div>';
      $('orders-to-catalog')?.addEventListener('click',()=>{dialog.close();$('workspace').scrollIntoView({block:'start'});$('city').focus({preventScroll:true});});
      $('account-order-list').querySelectorAll('[data-cancel-order]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;try{await api('orders/'+encodeURIComponent(button.dataset.cancelOrder)+'/cancel',{});await loadOrders(version);message('Заявка отменена.','success');}catch(error){message(error.message);button.disabled=false;}
      }));
    } catch(error){if(version===renderVersion){$('account-order-list').textContent='Не удалось загрузить заявки.';message(error.message);}}
  }
  function decorateCards() {
    document.querySelectorAll('.contractor').forEach(card=>{
      const provider=card.querySelector('[data-provider]');
      if(provider&&!card.querySelector('[data-order-provider]'))card.querySelector('.card-bottom')?.insertAdjacentHTML('beforeend',`<button type="button" class="order-create-btn" data-order-provider="${esc(provider.dataset.provider)}">Оставить заявку ↗</button>`);
    });
  }
  $('account-open').addEventListener('click',()=>show(user?'account':'login'));
  $('account-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{resetCaptcha();renderVersion++;$('account-content').textContent='';});
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-account-view]');if(link){show(link.dataset.accountView);return;}
    const orderButton=event.target.closest('[data-order-provider]');if(!orderButton)return;
    pendingProvider=data.catalog.find(p=>p.id===orderButton.dataset.orderProvider);if(pendingProvider)show('order');
  });
  document.addEventListener('firebird:profile',event=>{
    const p=event.detail.provider;
    $('dialog-content').insertAdjacentHTML('afterbegin',`<div class="account-actions"><button type="button" class="order-create-btn" data-order-provider="${esc(p.id)}">Оставить заявку на дату ↗</button></div>`);
  });
  new MutationObserver(decorateCards).observe($('selection'),{childList:true,subtree:true});
  decorateCards();
  async function initialize() {
    try {
      if(location.hostname.endsWith('.github.io')||location.protocol==='file:')throw new Error(offlineText);
      config=await api('config');
      if(!config.available)throw new Error(offlineText);
      await api('session');
      $('account-service-status').dataset.state=config.development?'development':'ready';
      $('account-service-status').textContent=config.development?'Локальный тестовый режим: аккаунты и заявки сохраняются в тестовой базе. CAPTCHA отключена, письма доступны только в локальном почтовом ящике.':'Личный кабинет подключён. Письма о новых подрядчиках — только по вашей подписке.';
    } catch(_) {
      config={available:false};$('account-service-status').textContent=offlineText;$('account-service-status').dataset.state='offline';
    }
    if(dialog.open)render();
    if(resetToken)show('reset');else if(verifyToken)show('verify');
  }
  void initialize();
})();
