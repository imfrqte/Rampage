(function(){
  'use strict';
  const $=id=>document.getElementById(id),t=s=>window.FirebirdI18n?.text(s)||s;
  const dialog=document.createElement('dialog');dialog.id='ai-dialog';dialog.setAttribute('aria-labelledby','ai-title');
  dialog.innerHTML=`<header class="ai-header"><div><span class="ai-kicker">FIREBIRD ASSISTANT</span><h2 id="ai-title">Помощник для вашего события</h2></div><button type="button" id="ai-close" aria-label="Закрыть помощника">×</button></header><div class="ai-connection"><span id="ai-status" role="status">Проверяем подключение…</span><button type="button" id="ai-refresh">Проверить снова</button></div><p class="ai-context" id="ai-context"></p><div id="ai-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="История диалога"></div><div id="ai-suggestions"><button type="button" data-ai-prompt="Сравни варианты из текущей подборки. Чем они отличаются?">Сравнить варианты</button><button type="button" data-ai-prompt="Можно ли найти дешевле, сохранив остальные условия?">Найти дешевле</button><button type="button" data-ai-prompt="Помоги составить план подготовки к мероприятию из формы.">План мероприятия</button></div><p id="ai-error" class="ai-error" role="alert" hidden></p><form id="ai-form"><label for="ai-input">Ваш вопрос</label><textarea id="ai-input" rows="3" maxlength="3000" placeholder="Например: а если бюджет 500 тысяч?" disabled></textarea><div class="ai-form-actions"><button type="button" id="ai-clear">Новый диалог</button><button type="button" id="ai-stop" hidden>Остановить</button><button type="submit" id="ai-send" disabled>Отправить</button></div></form><p class="ai-privacy">При отправке вопрос, история и параметры мероприятия передаются OpenAI. Не вводите пароли и платёжные данные. Ответы ИИ могут содержать ошибки.</p>`;
  document.body.append(dialog);
  const intro=document.createElement('p');intro.className='ai-intro';intro.textContent='Опишите задачу своими словами. Помощник учтёт параметры формы, поможет сравнить варианты и составить план.';$('ai-messages').before(intro);
  const launcher=document.createElement('button');launcher.id='ai-launcher';launcher.type='button';launcher.setAttribute('aria-controls','ai-dialog');launcher.setAttribute('aria-haspopup','dialog');launcher.innerHTML='<span aria-hidden="true">✳</span> ИИ-помощник';document.body.append(launcher);
  let base='',configured=false,busy=false,checking=false,sessionId,controller,configLoaded=false;
  const errors={not_configured:'ИИ ещё не подключён. Владелец сайта добавит сервер и ключ модели.',provider_auth:'Ключ модели не принят. Владельцу сайта нужно проверить настройки сервера.',provider_access:'Модель недоступна для сервера. Владельцу сайта нужно проверить доступ.',provider_quota:'На сервере закончился доступный лимит API. Попробуйте позже.',provider_rate:'Модель временно перегружена. Попробуйте через минуту.',provider_unavailable:'Сервис ИИ временно недоступен. Ваш вопрос сохранён.',invalid_reply:'Не удалось получить корректный ответ. Попробуйте повторить вопрос.',connection_error:'Не удалось связаться с моделью. Ваш вопрос сохранён.',timeout:'Модель не успела ответить. Попробуйте ещё раз.',cancelled:'Ответ остановлен. Вопрос сохранён.',rate_limit:'Слишком много запросов. Попробуйте через 10 минут.',daily_limit:'Сегодняшний лимит помощника исчерпан. Подбор в форме работает.',busy:'Помощник занят. Попробуйте чуть позже.',session_expired:'История на сервере истекла. Начните новый диалог; текст вопроса сохранён.',invalid_context:'Проверьте параметры мероприятия в форме перед отправкой.',invalid_message:'Введите вопрос длиной до 3000 символов.',refused:'Помощник не может ответить на этот запрос. Попробуйте переформулировать.',origin_forbidden:'Сервер ещё не разрешил подключение этого сайта.',server_error:'Ошибка сервера. Ваш вопрос сохранён.'};
  function error(code){$('ai-error').textContent=errors[code]||errors.connection_error;$('ai-error').hidden=false;}
  function sync(){
    $('ai-input').disabled=!configured||busy;$('ai-send').disabled=!configured||busy;
    $('ai-stop').hidden=!busy;$('ai-clear').disabled=busy;$('ai-refresh').disabled=checking||busy;
    document.querySelectorAll('[data-ai-prompt]').forEach(b=>b.disabled=!configured||busy);
    $('ai-input').placeholder=configured?'Например: а если бюджет 500 тысяч?':'Чат откроется после подключения сервера и модели';
    $('ai-status').textContent=checking?'Проверяем подключение…':busy?'Обдумываю вопрос и проверяю данные…':configured?'ИИ подключён':'ИИ ещё не подключён. Владелец сайта добавит сервер и ключ модели.';
    dialog.classList.toggle('ai-offline',!configured);
  }
  function context(){
    const q=window.FirebirdApp.readQuery();
    $('ai-context').textContent=`${q.city} · ${q.category} · ${q.date} · ${Number.isFinite(q.budget)?q.budget.toLocaleString('ru-RU'):'—'} ₸`;
    return q;
  }
  async function check(){
    if(checking||busy)return;checking=true;sync();$('ai-error').hidden=true;
    try{
      const configResponse=await fetch('ai-config.json',{cache:'no-store',signal:AbortSignal.timeout(6000)});
      if(!configResponse.ok)throw Error('config');
      const config=await configResponse.json();
      if(typeof config.apiBase!=='string')throw Error('config');
      if(config.apiBase){const u=new URL(config.apiBase,location.origin);if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))||u.username||u.password||u.search||u.hash)throw Error('config');base=u.href.replace(/\/$/,'');}
      else if(['localhost','127.0.0.1','[::1]'].includes(location.hostname))base=location.origin;
      else{base='';configured=false;configLoaded=true;return;}
      const response=await fetch(base+'/api/assistant/status',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw Error('status');const status=await response.json();configured=status.configured===true;configLoaded=true;
    }catch{configured=false;error('connection_error');}finally{checking=false;sync();}
  }
  function bubble(role,text){const article=document.createElement('article');article.className='ai-message ai-'+role;const label=document.createElement('strong');label.textContent=t(role==='user'?'Вы':'Firebird');const content=document.createElement('div');content.className='ai-message-text';content.textContent=text;article.append(label,content);$('ai-messages').append(article);article.scrollIntoView({block:'nearest'});return article;}
  function showResult(result){
    const article=bubble('assistant',result.answer);
    if(Array.isArray(result.sources)&&result.sources.length){const list=document.createElement('div');list.className='ai-sources';
      for(const source of result.sources.slice(0,3)){if(!window.FirebirdData.catalog.some(p=>p.id===source.id))continue;const button=document.createElement('button');button.type='button';button.dataset.provider=source.id;button.textContent=source.name+' · '+t('от')+' '+Number(source.price_from_kzt).toLocaleString()+' ₸';button.addEventListener('click',()=>dialog.close());list.append(button);}article.append(list);}
    if(result.proposal){
      try{const q=window.FirebirdMatcher.validate(result.proposal.query,window.FirebirdData);const block=document.createElement('div');block.className='ai-proposal';
        const summary=document.createElement('p');summary.textContent=[q.city,q.category,q.format,q.date,q.budget.toLocaleString()+' ₸',q.language,q.hours===null?'':q.hours+' '+t('ч')].filter(Boolean).map(t).join(' · ');
        const button=document.createElement('button');button.type='button';button.textContent=t('Применить параметры');button.addEventListener('click',()=>{window.FirebirdApp.applyQuery(q);button.disabled=true;button.textContent=t('Применено');context();});block.append(summary,button);article.append(block);
      }catch{/* An invalid proposal cannot mutate the form. */}
    }
    article.scrollIntoView({block:'nearest'});
  }
  async function send(){
    const message=$('ai-input').value.trim();if(!message||busy||!configured)return;
    let q;try{q=window.FirebirdMatcher.validate(context(),window.FirebirdData);}catch{q=null;}
    busy=true;controller=new AbortController();sync();$('ai-error').hidden=true;
    const own=bubble('user',message);
    try{
      const response=await fetch(base+'/api/assistant/message',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)]),body:JSON.stringify({message,context:q,locale:window.FirebirdI18n?.locale||'ru',...(sessionId?{sessionId}:{})})});
      const result=await response.json();if(!response.ok)throw Object.assign(Error('api'),{code:result.error});
      if(typeof result.answer!=='string'||typeof result.sessionId!=='string')throw Object.assign(Error('reply'),{code:'invalid_reply'});
      sessionId=result.sessionId;showResult(result);$('ai-input').value='';
    }catch(e){own.remove();if(e.code==='not_configured')configured=false;error(e.code||(controller.signal.aborted?'cancelled':e.name==='TimeoutError'?'timeout':'connection_error'));}
    finally{busy=false;controller=null;sync();if(dialog.open&&configured)$('ai-input').focus();}
  }
  launcher.addEventListener('click',()=>{context();dialog.showModal();if(!configLoaded||!configured)check();else $('ai-input').focus();});
  $('ai-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>launcher.focus());
  $('ai-refresh').addEventListener('click',check);$('ai-form').addEventListener('submit',e=>{e.preventDefault();send();});
  $('ai-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}});
  $('ai-stop').addEventListener('click',()=>controller?.abort());
  $('ai-clear').addEventListener('click',()=>{sessionId=undefined;$('ai-messages').replaceChildren();$('ai-error').hidden=true;$('ai-input').focus();});
  document.querySelectorAll('[data-ai-prompt]').forEach(b=>b.addEventListener('click',()=>{$('ai-input').value=t(b.dataset.aiPrompt);send();}));
  document.addEventListener('firebird:results',()=>context());document.addEventListener('firebird:locale',()=>{context();sync();});
  sync();
})();
