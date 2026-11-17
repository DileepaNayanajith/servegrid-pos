/* FASTPOS — dependency-free touchscreen + keyboard cashier client */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (value) => 'Rs. ' + Number(value || 0).toLocaleString('en-LK');
  const state = {
    items:[], category:'All', meal:'breakfast', service:'Takeaway', payment:'Cash', cart:{},
    tender:'', feedback:'', undo:[], lastOrder:null, pending:false, orderKey:null,
    demoMode:true, adminConfigured:false, adminLoggedIn:false, adminTab:'menu',
    orders:[], sales:{count:0,total:0}, adminError:'', confirmedExternal:false
  };
  const categoryOrder = ['Rice & Curry','Bread Kottu','Breakfast Foods','String Hoppers','Short Eats','Fried Rice','Kottu','Water','Hot Drinks','Soft Drinks','Desserts'];
  const categoryLabels = {};
  const mealLabels = {breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner'};
  const presetMap = {}; // Hopper sets are individually priced SKUs, not a per-piece multiplication.
  const codeInput = $('code-input');
  const quickCodes = ['401','202','203','501'];
  const finePointer = window.matchMedia ? window.matchMedia('(pointer:fine)') : {matches:true};
  const catSlug = (c) => String(c||'').toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');

  // Public customer preview uses a browser-only simulator, never the hotel database.
  const api = async (path, method='GET', body=null) => window.BataDemoAPI(path, method, body);

  // Search text without an optional "2*" quantity prefix.
  function searchQuery(){return codeInput.value.trim().toLowerCase().replace(/^\d{1,3}\s*[x*]\s*/, '').trim();}
  function searchQty(){const m=codeInput.value.trim().match(/^(\d{1,3})\s*[xX*]/);return m?Number(m[1]):1;}
  function matchesQuery(food,query){return !query || (/^\d+$/.test(query)?food.code.startsWith(query):food.name.toLowerCase().includes(query));}
  function highlight(text,query,isCode){
    const raw=String(text??'');
    if(!query)return escapeHtml(raw);
    const at=isCode?(raw.startsWith(query)?0:-1):raw.toLowerCase().indexOf(query);
    if(at<0)return escapeHtml(raw);
    return escapeHtml(raw.slice(0,at))+'<mark>'+escapeHtml(raw.slice(at,at+query.length))+'</mark>'+escapeHtml(raw.slice(at+query.length));
  }
  // Restartable, purely visual feedback. Never delays the action itself.
  function flash(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);clearTimeout(el._fx);el._fx=setTimeout(()=>el.classList.remove(cls),650);}
  function refocusSearch(){if(finePointer.matches&&$('modal-backdrop').classList.contains('hidden'))codeInput.focus({preventScroll:true});}

  function toast(message) {
    const node=$('toast'); node.textContent=message; node.classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>node.classList.add('hidden'),3000);
  }
  function feedback(message, kind='') {
    const node=$('feedback'); node.textContent=message;
    node.className='feedback-line ' + kind;
  }
  function item(code) {return state.items.find(x => x.code === code && x.active);}
  function cartLines() {return Object.entries(state.cart).filter(([code,qty])=>qty>0 && item(code)).map(([code,qty])=>({food:item(code),qty}));}
  function billTotal(){return cartLines().reduce((sum,row)=>sum+row.food.price*row.qty,0);}
  function sumQty(){return cartLines().reduce((sum,row)=>sum+row.qty,0);}
  function invalidatePayment(){state.orderKey=null;state.confirmedExternal=false;$('external-warning').textContent='This is a demonstration. No card or QR payment is processed.';}

  function addFood(code, qty=1) {
    if(state.pending){toast("Order is saving. Please wait.");return;}
    const food=item(code);
    if(!food || !food.meals.includes(state.meal)){feedback('This food code is not available for the selected meal.', 'error');return;}
    if(!Number.isInteger(qty)||qty<1 || (state.cart[code]||0)+qty>999){feedback('Maximum quantity per food is 999.', 'error');return;}
    state.undo.push({...state.cart}); if(state.undo.length>30)state.undo.shift();
    state.cart[code]=(state.cart[code]||0)+qty;
    invalidatePayment();state.tender='';
    feedback(`✓ Added ${food.name} × ${qty}  (now ${state.cart[code]})  •  එකතු කළා`,'positive');
    state.lastChanged=code;
    renderCart();
    document.querySelectorAll(`[data-code="${code}"],[data-quick-code="${code}"]`).forEach(el=>flash(el,'just-added'));
  }
  function changeQty(code, delta) {
    if(state.pending){toast("Order is saving. Please wait.");return;}
    if(!state.cart[code])return;
    let next=state.cart[code]+delta;
    if(next>999)return toast('Maximum quantity is 999.');
    state.undo.push({...state.cart});if(state.undo.length>30)state.undo.shift();
    if(next<=0)delete state.cart[code];else state.cart[code]=next;
    invalidatePayment();state.tender='';
    state.lastChanged=next>0?code:null;
    renderCart();
  }
  function undo() {
    if(state.pending)return;
    if(!state.undo.length)return;
    state.cart=state.undo.pop();state.tender='';invalidatePayment();
    renderCart();feedback('↶ Last change undone • අන්තිම වෙනස අහෝසි කළා','positive');
  }
  function enterCode() {
    const input=codeInput.value.trim();
    // 3*101 or 3x101, or just 101
    const match=input.match(/^(?:(\d{1,3})\s*[xX*]\s*)?(\d{3})$/);
    if(!match){
      // A name search with exactly one available food can also be added with Enter.
      const query=searchQuery();
      const hits=query&&!/^\d+$/.test(query)?state.items.filter(x=>x.active&&x.meals.includes(state.meal)&&matchesQuery(x,query)):[];
      if(hits.length===1){
        const qty=searchQty(), code=hits[0].code, oldQty=(state.cart[code]||0);
        addFood(code,qty);
        if((state.cart[code]||0)>oldQty){codeInput.value='';renderMenu();}
        return;
      }
      feedback(hits.length>1?`${hits.length} foods match — tap one, or type more of the name.`:'Use a 3-digit food code, e.g. 101 or 3*101','error');
      flash(codeInput.parentElement,'shake');codeInput.select();return;
    }
    let qty=Number(match[1]||1), code=match[2];
    if(presetMap[code]){qty*=presetMap[code].qty;code=presetMap[code].code;}
    if(!qty||qty>999){feedback('Quantity should be 1 to 999','error');return;}
    const oldQty=(state.cart[code]||0);
    addFood(code,qty);
    if((state.cart[code]||0)>oldQty){codeInput.value='';renderMenu();}
  }

  const hintsHtml='<span class="hint"><kbd>↵</kbd>add code</span><span class="hint"><kbd>2*111</kbd>qty</span><span class="hint"><kbd>F2</kbd>order type</span><span class="hint"><kbd>F4</kbd>search</span><span class="hint"><kbd>F8</kbd>cash</span><span class="hint"><kbd>Esc</kbd>clear</span>';
  function renderMenu(){
    const query=searchQuery(), isCode=/^\d+$/.test(query), qty=searchQty();
    const matches=food=>matchesQuery(food,query);
    const quick=state.items.filter(x=>x.active && quickCodes.includes(x.code) && x.meals.includes(state.meal) && matches(x)).slice(0,4);
    $("quick-extras-buttons").innerHTML=quick.map(x=>`<button class="quick-extra-btn" data-quick-code="${escapeHtml(x.code)}" title="Add ${escapeHtml(x.name)} · ${fmt(x.price)}"><span class="q-wrap"><span class="q-code">#${escapeHtml(x.code)}</span> <span class="q-name">${escapeHtml(x.name)}</span></span></button>`).join("");
    document.querySelectorAll('.meal-btn').forEach(b=>{const on=b.dataset.meal===state.meal;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
    const available=state.items.filter(x=>x.meals.includes(state.meal)&&matches(x));
    const groups=[...categoryOrder.filter(c=>available.some(x=>x.category===c)),...new Set(available.map(x=>x.category).filter(x=>!categoryOrder.includes(x)))];
    if(state.category!=='All'&&!groups.includes(state.category))state.category='All';
    $('category-filters').innerHTML=['All',...groups].map(c=>{
      const n=c==='All'?available.length:available.filter(x=>x.category===c).length;
      return `<button class="category-filter ${state.category===c?'active':''}" data-category="${escapeHtml(c)}" ${c==='All'?'':`data-cat="${catSlug(c)}"`} aria-pressed="${state.category===c}">${c==='All'?'':'<span class="cat-dot" aria-hidden="true"></span>'}${escapeHtml(categoryLabels[c]||c)}<span class="cat-count">${n}</span></button>`;
    }).join('');
    const products=available.filter(x=>state.category==='All'||x.category===state.category);
    // Flat grid in category order: category colour shows grouping without extra heading rows.
    const ordered=[];
    for(const category of groups)for(const food of products)if(food.category===category)ordered.push(food);
    const exact=isCode&&query.length===3?ordered.find(x=>x.code===query&&x.active):null;
    $('clear-search').dataset.empty=String(!codeInput.value&&state.category==='All');
    const status=$('search-status');
    if(!query)status.innerHTML=hintsHtml;
    else if(exact)status.innerHTML=`<b>↵ Enter</b> adds ${qty>1?qty+' × ':''}<b>${escapeHtml(exact.name)}</b> · ${fmt(exact.price*qty)}`;
    else if(ordered.length===1&&ordered[0].active&&!isCode)status.innerHTML=`1 match · <b>↵ Enter</b> adds ${qty>1?qty+' × ':''}<b>${escapeHtml(ordered[0].name)}</b>`;
    else status.innerHTML=ordered.length?`<b>${ordered.length}</b> match${ordered.length===1?'':'es'} in ${escapeHtml(mealLabels[state.meal])}${isCode?' · type all 3 digits + Enter':' · tap to add'}`:'';
    if(ordered.length){
      $('menu-groups').innerHTML=`<div class="food-grid">${ordered.map(food=>tile(food,query,isCode,exact)).join('')}</div>`;
      syncTileBadges();
      return;
    }
    // Helpful no-result state: offer other meals that do contain the search.
    let suggest='';
    if(query){
      suggest=Object.keys(mealLabels).filter(m=>m!==state.meal).map(m=>{
        const n=state.items.filter(x=>x.meals.includes(m)&&matchesQuery(x,query)).length;
        return n?`<button type="button" data-switch-meal="${m}">Show in ${escapeHtml(mealLabels[m])} (${n})</button>`:'';
      }).join('');
    }
    $('menu-groups').innerHTML=`<div class="empty-menu">${query?`<strong>No match for “${escapeHtml(codeInput.value.trim())}” in ${escapeHtml(mealLabels[state.meal])}</strong>Check the code or name, or clear the search (Esc).<div class="suggest">${suggest}<button type="button" data-clear-search>✕ Clear search</button></div>`:'<strong>No foods in '+escapeHtml(mealLabels[state.meal])+' menu.</strong>'}</div>`;
  }
  function tile(food,query,isCode,exact){
    const cat=catSlug(food.category);
    const name=highlight(food.name,isCode?'':query,false);
    const code=highlight(food.code,isCode?query:'',true);
    if(!food.active)return `<button class="food-tile" data-cat="${cat}" disabled title="${escapeHtml(food.name)} — price to confirm"><span class="food-name">${name}</span><span class="food-meta"><span class="food-code">#${code}</span><span class="food-price">Price to confirm</span></span></button>`;
    return `<button class="food-tile${exact===food?' is-exact':''}" data-code="${escapeHtml(food.code)}" data-qty="1" data-cat="${cat}" title="Add ${escapeHtml(food.name)} · ${escapeHtml(food.category)}"><span class="food-name">${name}</span><span class="food-meta"><span class="food-code">#${code}</span><span class="food-price">${fmt(food.price)}</span></span><span class="food-qty" aria-label="in bill"></span></button>`;
  }
  function syncTileBadges(){
    document.querySelectorAll('.food-tile[data-code]').forEach(el=>{
      const q=state.cart[el.dataset.code]||0;
      el.classList.toggle('in-cart',q>0);
      const badge=el.querySelector('.food-qty');if(badge)badge.textContent=q?'×'+q:'';
    });
  }

  function renderCart(){
    const rows=cartLines(); const total=billTotal();
    $('bill-mode').textContent='• '+state.service;
    $('undo-button').disabled=state.undo.length===0;
    const units=sumQty();
    $('bill-units').textContent=units.toLocaleString('en-LK')+' items / sets';
    $('bill-lines').textContent=rows.length+' food types';
    const totalNode=$('bill-total'), totalText=fmt(total);
    if(totalNode.textContent!==totalText){totalNode.textContent=totalText;flash(totalNode,'bump');}
    $('mobile-bill-count').textContent=units+' item'+(units===1?'':'s');
    $('mobile-bill-total').textContent=totalText;
    $('bill-items').innerHTML=rows.length ? rows.map(({food,qty})=>`<div class="cart-row" data-cart-code="${escapeHtml(food.code)}"><div class="cart-desc"><strong title="${escapeHtml(food.name)}">${escapeHtml(food.name)}</strong><small>#${escapeHtml(food.code)} · ${(food.code>='101'&&food.code<='104')?'Breakfast · ':((food.code>='301'&&food.code<='304')?'Lunch/Dinner · ':'')}${fmt(food.price)} each</small></div><div class="qty-box"><button data-delta="-1" data-code="${escapeHtml(food.code)}" title="Reduce" aria-label="Reduce ${escapeHtml(food.name)}">−</button><span class="qty-count">${qty}</span><button data-delta="1" data-code="${escapeHtml(food.code)}" title="Add one" aria-label="Add one ${escapeHtml(food.name)}">+</button></div><div class="cart-amount">${fmt(food.price*qty)}</div><button class="remove-line" data-remove="${escapeHtml(food.code)}" title="Remove item" aria-label="Remove ${escapeHtml(food.name)}">✕</button></div>`).join('') : '<div class="empty-cart"><div class="empty-icon">▤</div><strong>No food added yet</strong><span>කෑමක් තෝරන්න</span></div>';
    if(state.lastChanged){
      const row=$('bill-items').querySelector(`[data-cart-code="${state.lastChanged}"]`);
      if(row){row.classList.add('flash');const box=$('bill-items');if(row.offsetTop<box.scrollTop)box.scrollTop=row.offsetTop;else if(row.offsetTop+row.offsetHeight>box.scrollTop+box.clientHeight)box.scrollTop=row.offsetTop+row.offsetHeight-box.clientHeight;}
      state.lastChanged=null;
    }
    syncTileBadges();
    renderTender();
  }
  function renderTender(){
    document.querySelectorAll('.payment-btn').forEach(b=>b.classList.toggle('active',b.dataset.payment===state.payment));
    $('cash-box').classList.toggle('hidden',state.payment!=='Cash');
    $('external-warning').classList.toggle('hidden',state.payment==='Cash');
    $('cash-received').value=state.tender;
    const total=billTotal(), received=Number(state.tender);
    const sufficient=state.tender!==''&&Number.isInteger(received)&&received>=total;
    $('change-amount').textContent=fmt(sufficient?received-total:0);
    $('complete-btn').disabled=state.pending||!cartLines().length||(state.payment==='Cash'&&!sufficient);
    $('complete-btn').innerHTML=state.pending?'Processing…':'✓ TRY DEMO CHECKOUT <span>→</span>';
  }
  function setPayment(payment){if(state.pending)return;state.payment=payment;state.tender='';invalidatePayment();renderTender();}
  function setMeal(meal,keepSearch=false){state.category='All';state.meal=meal;if(!keepSearch&&codeInput.value.trim()&&!state.items.some(x=>x.meals.includes(meal)&&matchesQuery(x,searchQuery())))codeInput.value='';renderMenu();feedback(`${mealLabels[meal]} menu selected. Existing order stays in the bill (at its original price).`);$('menu-scroll').scrollTop=0;}
  function setService(service){if(state.pending)return;state.service=service;document.querySelectorAll('.service-btn').forEach(b=>{const on=b.dataset.service===service;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});$('table-area').classList.toggle('hidden',service!=='Dine-in');renderCart();}
  function setDemoBanner(){
    $('demo-banner').classList.toggle('hidden',!state.demoMode);

  }
  async function refreshState(){
    const data=await api('/api/state');
    Object.assign(state,{items:data.items,demoMode:data.demo_mode,adminConfigured:data.admin_configured,adminLoggedIn:data.admin_logged_in,orders:data.orders,sales:data.sales});
    renderMenu();renderCart();setDemoBanner();
  }
  function openModal(markup,wide=false){
    const content=$('modal-content');content.className='modal'+(wide?' wide':'');content.innerHTML=markup;
    $('modal-backdrop').classList.remove('hidden');
  }
  function closeModal(){$('modal-backdrop').classList.add('hidden');$('modal-content').innerHTML='';state.adminError='';}
  function modalHeader(title,subtitle='') {return `<div class="modal-top"><div><h2 class="modal-title">${escapeHtml(title)}</h2>${subtitle?`<div class="modal-sub">${escapeHtml(subtitle)}</div>`:''}</div><button class="modal-close" data-close aria-label="Close">×</button></div>`;}
  function printOrder(order){
    const rows=order.lines.map(x=>`<tr><td>${escapeHtml(x.name)} × ${x.qty}</td><td style="text-align:right">${fmt(x.line_total)}</td></tr>`).join('');
    const body=`<!doctype html><html><head><title>BATA KADE Receipt #${order.id}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;color:#111;padding:8mm 1mm}h1{text-align:center;font-size:18px;margin:4px}p{text-align:center;font-size:11px}table{width:100%;border-collapse:collapse;font-size:11px}td{padding:6px 0;border-bottom:1px dashed #aaa}h2{border-top:1px dashed #aaa;text-align:right;font-size:16px;padding-top:8px}small{font-size:10px} .demo{border:2px solid #111;font-weight:900;text-align:center;padding:10px}</style></head><body><h1>BATA KADE</h1><p>Receipt #${order.id}<br>${escapeHtml(order.created_at)}<br>${escapeHtml(order.service)} ${order.table_no?'- TABLE '+escapeHtml(order.table_no):''}</p>${order.is_demo?'<div class="demo">DEMO • NOT A REAL SALE</div>':''}<table>${rows}</table><h2>${fmt(order.total)}</h2><p>Payment: ${escapeHtml(order.payment)}${order.payment==='Cash'?`<br>Received: ${fmt(order.cash_received)}<br>Change: ${fmt(order.change_due)}`:''}</p><p>Thank you</p><script>window.onload=function(){window.print();};</script></body></html>`;
    const pop=window.open('','_blank','width=440,height=650');
    if(!pop){toast('Please allow pop-ups to print this receipt.');return;}
    pop.document.open();pop.document.write(body);pop.document.close();
  }
  function receiptModal(order){
    state.lastOrder=order;
    const rows=order.lines.map(x=>`<div class="receipt-line"><span>${escapeHtml(x.name)} × ${x.qty}</span><b>${fmt(x.line_total)}</b></div>`).join('');
    const content=`${modalHeader('Order Completed!','Saved in this browser tab only — not a real sale')}
      <div style="text-align:center;margin:-5px 0 16px"><span class="${order.is_demo?'demo-pill':'live-pill'}">${order.is_demo?'DEMO RECEIPT • NOT REAL PAYMENT':'SAVED • LIVE ORDER'}</span></div>
      <div class="receipt-paper"><div class="receipt-head">BATA KADE</div><div class="receipt-note">ORDER #${String(order.id).padStart(4,'0')} • ${escapeHtml(order.service)}${order.table_no?' • Table '+escapeHtml(order.table_no):''}<br>${escapeHtml(order.created_at)}</div>${rows}<div class="receipt-total"><span>TOTAL</span><span>${fmt(order.total)}</span></div><div class="receipt-line"><span>${escapeHtml(order.payment)}</span><b>${order.payment==='Cash'?'Received '+fmt(order.cash_received):'Simulated — no payment taken'}</b></div>${order.payment==='Cash'?`<div class="receipt-line"><span>Change</span><b>${fmt(order.change_due)}</b></div>`:''}<div class="receipt-note">${order.is_demo?'CUSTOMER MENU PRICES • DEMO ONLY':'Thank you • Come again'}</div></div>
      <div class="modal-actions"><button class="modal-btn secondary" id="print-receipt">🖨 Print Sample</button><button class="modal-btn success" id="next-order">✓ NEXT CUSTOMER / NEW ORDER</button></div>`;
    openModal(content);
    $('print-receipt').onclick=()=>printOrder(order);
    $('next-order').onclick=()=>{closeModal();codeInput.focus();};
  }
  async function completeOrder(){
    if(state.pending||!cartLines().length)return;
    const total=billTotal();
    const received=Number(state.tender);
    if(state.payment==='Cash'&&(state.tender===''||!Number.isInteger(received)||received<total)){toast('Please enter cash received or tap EXACT.');return;}
    if(state.payment!=='Cash'&&!state.confirmedExternal){
      if(!window.confirm(`Simulate ${state.payment} checkout for ${fmt(total)}? No payment will be taken.`))return;
      state.confirmedExternal=true;
    }
    state.pending=true;if(!state.orderKey)state.orderKey=window.crypto?.randomUUID?.()||'order-'+Date.now()+'-'+Math.random().toString(16).slice(2);
    renderTender();
    try{
      const data=await api('/api/orders','POST',{
        key:state.orderKey,service:state.service,table_no:$('table-no').value,
        payment:state.payment,cash_received:state.payment==='Cash'?received:0,
        items:cartLines().map(x=>({code:x.food.code,qty:x.qty}))
      });
      state.cart={};state.undo=[];state.tender='';state.orderKey=null;state.confirmedExternal=false;state.payment='Cash';
      $('table-no').value='';
      state.orders=[data.order,...state.orders.filter(x=>x.id!==data.order.id)].slice(0,30);
      feedback('✓ Demo order created in this browser tab. No actual sale.','positive');
      receiptModal(data.order);
    }catch(error){toast('Cannot save: '+error.message);}
    finally{state.pending=false;renderCart();}
  }
  function cancelOrder(){
    if(state.pending||!cartLines().length)return;
    if(!window.confirm('Clear this unsaved order?\nමේ order එක ඉවත් කරන්නද?'))return;
    state.cart={};state.undo=[];state.tender='';invalidatePayment();
    renderCart();feedback('New empty order ready.');
  }
  async function ordersModal(){
    try{const data=await api('/api/orders');state.orders=data.orders;}catch(e){toast(e.message);return;}
    const list=state.orders.length?state.orders.map(o=>`<div class="order-card"><div class="order-card-head"><div><div class="order-card-title">#${String(o.id).padStart(4,'0')} · ${escapeHtml(o.service)} <span class="${o.is_demo?'demo-pill':'live-pill'}">${o.is_demo?'DEMO':'LIVE'}</span> ${o.status==='Voided'?'<span class="demo-pill">VOIDED</span>':''}</div><div class="order-card-sub">${escapeHtml(o.created_at)} • ${escapeHtml(o.payment)}</div></div><strong>${fmt(o.total)}</strong></div><div class="order-card-bottom"><span>${o.lines.map(x=>`${escapeHtml(x.name)} × ${x.qty}`).join(' · ')}</span><button class="tiny-btn" data-print-order="${o.id}">🖨 Print</button>${state.adminLoggedIn&&o.status==='Completed'?`<button class="tiny-btn" data-void-order="${o.id}">Void (Owner)</button>`:''}</div></div>`).join(''):'<p class="muted-text">No orders saved yet.</p>';
    openModal(modalHeader('Saved Orders','Sample orders are kept only in this browser tab')+`<div>${list}</div>`);
  }
  function adminModal(){
    if(!state.adminLoggedIn){
      const isSetup=!state.adminConfigured;
      openModal(modalHeader(isSetup?'Owner Setup':'Owner Login',isSetup?'Create an owner PIN on first launch. Keep it private.':'Prices and settings are protected with an owner PIN.')+
        `<form id="admin-auth-form"><label class="form-label" for="owner-pin">${isSetup?'New owner PIN (4–12 digits)':'Owner PIN'}</label><input class="modal-input" id="owner-pin" type="password" inputmode="numeric" minlength="4" maxlength="12" autocomplete="off" required placeholder="••••••"/>${state.adminError?`<p class="warning-text">${escapeHtml(state.adminError)}</p>`:''}<div class="modal-actions"><button type="submit" class="modal-btn">${isSetup?'CREATE OWNER PIN':'UNLOCK OWNER SETTINGS'}</button></div></form>`);
      $('admin-auth-form').onsubmit=async(e)=>{e.preventDefault();try{const pin=$('owner-pin').value;await api(isSetup?'/api/admin/setup':'/api/admin/login','POST',{pin});state.adminLoggedIn=true;state.adminConfigured=true;state.adminError='';await refreshState();adminModal();}catch(err){state.adminError=err.message;adminModal();}};
      $('owner-pin').focus();return;
    }
    const tabs=`<div class="admin-tabs"><button data-admin-tab="menu" class="${state.adminTab==='menu'?'selected':''}">🍽 Prices & Foods</button><button data-admin-tab="settings" class="${state.adminTab==='settings'?'selected':''}">⚙ Settings & Live Mode</button></div>`;
    openModal(modalHeader('Owner Settings','Owner features are not available in this public UI preview')+tabs+(state.adminTab==='menu'?adminMenuHtml():adminSettingsHtml())+
      `<div class="modal-actions"><button class="modal-btn secondary" id="admin-logout">Lock Owner Settings</button></div>`,true);
  }
  function adminMenuHtml(){
    let trs=state.items.map((f,index)=>`<tr class="admin-row" data-index="${index}"><td><input type="text" class="a-code" value="${escapeHtml(f.code)}" maxlength="3" aria-label="Food code"></td><td><input type="text" class="a-name" value="${escapeHtml(f.name)}" maxlength="70" aria-label="Food name"></td><td><input type="number" class="a-price" value="${f.price}" min="0" max="1000000" step="1" aria-label="Price in rupees"></td><td><input type="text" class="a-category" value="${escapeHtml(f.category)}" maxlength="40" aria-label="Category"></td><td><div class="meal-checks">${[['breakfast','B'],['lunch','L'],['dinner','D']].map(([key,label])=>`<label title="${key}"><input class="a-meal" type="checkbox" value="${key}" ${f.meals.includes(key)?'checked':''}>${label}</label>`).join('')}</div></td><td style="text-align:center"><input class="a-active" type="checkbox" ${f.active?'checked':''} title="Active"></td></tr>`).join('');
    return `<div class="modal-message"><strong>Important:</strong> Listed prices were imported from the customer menu (21 Oct 2026). Confirm with the hotel owner before switching LIVE. B / L / D = Breakfast / Lunch / Dinner.</div>
      <div class="admin-scroll"><table class="menu-admin-table"><thead><tr><th width="65">CODE</th><th>FOOD NAME</th><th width="95">PRICE (Rs.)</th><th width="135">CATEGORY</th><th width="95">MEALS</th><th width="44">ON</th></tr></thead><tbody>${trs}</tbody></table></div>
      <div class="modal-actions"><button class="modal-btn success" id="save-menu">✓ SAVE ALL MENU CHANGES</button></div>
      <div class="settings-card" style="margin-top:18px"><h3>Add Another Food</h3><div class="admin-form-grid"><div><label class="form-label">3-digit code</label><input class="modal-input" id="new-code" maxlength="3" value="${suggestCode()}" /></div><div><label class="form-label">Food name</label><input class="modal-input" id="new-name" maxlength="70" placeholder="e.g. Dhal Curry" /></div><div><label class="form-label">Price (Rs.)</label><input class="modal-input" id="new-price" type="number" min="0" step="1" placeholder="0" /></div></div><div class="modal-actions"><button class="modal-btn secondary" id="new-food">+ ADD FOOD (BREAKFAST)</button></div></div>`;
  }
  function suggestCode(){for(let n=501;n<=999;n++)if(!state.items.find(f=>f.code===String(n)))return String(n);return '999';}
  function readMenuRows(){
    return [...document.querySelectorAll('.admin-row')].map((row,index)=>({
      code:row.querySelector('.a-code').value.trim(),name:row.querySelector('.a-name').value.trim(),
      price:Number(row.querySelector('.a-price').value),category:row.querySelector('.a-category').value.trim(),
      meals:[...row.querySelectorAll('.a-meal:checked')].map(x=>x.value),active:row.querySelector('.a-active').checked,sort:index
    }));
  }
  async function saveMenu(items){
    try{await api('/api/admin/menu','POST',{items});await refreshState();toast('Menu and prices saved.');adminModal();}
    catch(err){toast('Cannot save menu: '+err.message);}
  }
  function adminSettingsHtml(){
    return `<div class="settings-card"><h3>POS Operation Mode</h3><p>Current mode: <span class="${state.demoMode?'demo-pill':'live-pill'}">${state.demoMode?'DEMO • CUSTOMER MENU PRICES':'LIVE • REAL RECORDS'}</span></p><p>Switch to LIVE only after checking food prices and testing receipt/checkout. Demo sales are not included in live sales totals.</p>${state.demoMode?`<label><input id="prices-verified" type="checkbox"> I have checked every menu price against the hotel's real price list.</label><button class="modal-btn success" id="go-live">ENABLE LIVE MODE</button>`:`<button class="modal-btn secondary" id="go-demo">SWITCH BACK TO DEMO MODE</button>`}</div>
      <div class="settings-card"><h3>Saved Local Sales</h3><p>LIVE completed orders: <b>${state.sales.count}</b><br>LIVE sales total: <b>${fmt(state.sales.total)}</b></p><p>Saved on this PC in <code>data/fastpos.db</code>. Make regular backups of the entire data folder after stopping the server.</p></div>
      <div class="settings-card"><h3>Hardware & Printing</h3><p>Receipt preview and Windows browser printing are available. Direct auto-print to a thermal receipt printer requires a separate printer integration after checking the printer model.</p></div>`;
  }
  function printHistory(orderId){const o=state.orders.find(x=>x.id===orderId);if(o)printOrder(o);}

  // Events — both large touch areas and quick keyboard codes work.
  $('category-filters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){state.category=b.dataset.category;renderMenu();$('menu-scroll').scrollTop=0;}});
  function clearSearch(){codeInput.value='';state.category='All';renderMenu();$('menu-scroll').scrollTop=0;}
  $('clear-search').onclick=()=>{clearSearch();feedback('Search cleared.');codeInput.focus();};
  function onSearchInput(){state.category='All';renderMenu();$('menu-scroll').scrollTop=0;}
  codeInput.addEventListener('input',onSearchInput);
  $('code-form').addEventListener('submit',e=>{e.preventDefault();enterCode();codeInput.focus();});
  $('quick-extras-buttons').addEventListener('click',e=>{const el=e.target.closest('[data-quick-code]');if(el){addFood(el.dataset.quickCode);refocusSearch();}});
  $('menu-groups').addEventListener('click',e=>{
    const el=e.target.closest('button[data-code]');if(el){addFood(el.dataset.code,Number(el.dataset.qty));refocusSearch();return;}
    const sw=e.target.closest('[data-switch-meal]');if(sw){setMeal(sw.dataset.switchMeal,true);refocusSearch();return;}
    if(e.target.closest('[data-clear-search]')){clearSearch();codeInput.focus();}
  });
  $('mobile-bill-bar').onclick=()=>$('bill-panel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  $('bill-items').addEventListener('click',e=>{
    const ch=e.target.closest('[data-delta]');if(ch){changeQty(ch.dataset.code,Number(ch.dataset.delta));return refocusSearch();}
    const del=e.target.closest('[data-remove]');if(del){changeQty(del.dataset.remove,-999);return refocusSearch();}
  });
  $('undo-button').onclick=()=>{undo();refocusSearch();};
  $('complete-btn').onclick=completeOrder;
  $('cancel-btn').onclick=cancelOrder;
  $('exact-cash').onclick=()=>{state.tender=String(billTotal());renderTender();};
  $('cash-received').addEventListener('input',e=>{state.tender=e.target.value;renderTender();$('cash-received').focus();});
  document.querySelectorAll('[data-tender]').forEach(b=>b.onclick=()=>{state.tender=b.dataset.tender;renderTender();});
  document.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>setMeal(b.dataset.meal));
  document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>setService(b.dataset.service));
  document.querySelectorAll('[data-payment]').forEach(b=>b.onclick=()=>setPayment(b.dataset.payment));
  const previewHelp = () => openModal(modalHeader('BATA KADE — Customer Preview', 'Try the food-ordering workflow on a touchscreen or keyboard') +
    `<div class="preview-help"><p><b>1.</b> Tap Chicken Rice, String Hoppers 10/15/20, Fried Rice, Kottu or a drink. Each String Hoppers button adds one priced set. You can also enter <kbd>101</kbd> for breakfast chicken rice or <kbd>301</kbd> for lunch chicken rice and press Enter.</p><p><b>Search:</b> type part of a code or name to filter. A full code + Enter adds it; <kbd>2*111</kbd> + Enter adds two. If only one food matches a name, Enter adds it. <kbd>Esc</kbd> clears, <kbd>F2</kbd> toggles Dine-in/Takeaway, <kbd>F4</kbd> focuses search, <kbd>F8</kbd> focuses cash.</p><p><b>2.</b> Choose Takeaway or Dine-in. Change quantities using + / − on the bill.</p><p><b>3.</b> Tap EXACT to simulate cash payment, then <b>TRY DEMO CHECKOUT</b>. You can see a sample receipt and try a new order.</p><p class="preview-help-note">This is a visual demonstration only. Listed prices come from the customer menu, but no real payment is taken, and orders stay in this browser tab. Owner menu updated 17 Nov 2026. The installed Windows POS uses a separate local database and actual hotel menu settings.</p></div>`);
  $('open-owner').onclick=previewHelp;$('banner-owner').onclick=previewHelp;$('open-orders').onclick=ordersModal;
  $('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop')||e.target.closest('[data-close]'))closeModal();});
  $('modal-content').addEventListener('click',async(e)=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.adminTab){state.adminTab=b.dataset.adminTab;adminModal();return;}
    if(b.id==='admin-logout'){
      try{await api('/api/admin/logout','POST',{});state.adminLoggedIn=false;closeModal();toast('Owner settings locked.');}catch(err){toast(err.message);}return;
    }
    if(b.id==='save-menu'){await saveMenu(readMenuRows());return;}
    if(b.id==='new-food'){
      const code=$('new-code').value.trim(), name=$('new-name').value.trim(), price=Number($('new-price').value);
      if(!/^\d{3}$/.test(code)||!name||$('new-price').value.trim()===''||!Number.isInteger(price)||price<0){toast('Enter valid code, name, and price.');return;}
      if(state.items.some(x=>x.code===code)||presetMap[code]){toast('That code is already in use / reserved.');return;}
      // Save edits already made to existing menu at the same time as adding this food.
      await saveMenu([...readMenuRows(),{code,name,price,category:'Other Foods',meals:['breakfast'],active:true}]);return;
    }
    if(b.id==='go-live'){
      if(!$('prices-verified').checked){toast('Please check the price verification checkbox.');return;}
      if(!window.confirm('Have you checked EVERY price and tested billing? Switch from DEMO to LIVE?'))return;
      try{await api('/api/admin/mode','POST',{go_live:true,prices_verified:true});await refreshState();adminModal();toast('Live mode enabled.');}catch(err){toast(err.message);}return;
    }
    if(b.id==='go-demo'){
      if(!window.confirm('Switch to demo mode? New orders will be marked DEMO.'))return;
      try{await api('/api/admin/mode','POST',{go_live:false});await refreshState();adminModal();toast('Demo mode enabled.');}catch(err){toast(err.message);}return;
    }
    if(b.dataset.printOrder){printHistory(Number(b.dataset.printOrder));return;}
    if(b.dataset.voidOrder){
      const id=Number(b.dataset.voidOrder);
      if(!window.confirm(`Void saved order #${id}? This cannot be undone. This only changes recorded status; it does NOT refund any payment.`))return;
      try{await api('/api/admin/void','POST',{order_id:id});await refreshState();ordersModal();}catch(err){toast(err.message);}return;
    }
  });

  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const hasModal=!$('modal-backdrop').classList.contains('hidden');
    if(e.key==='Escape'){
      if(hasModal)closeModal();else{clearSearch();feedback('Search cleared.');codeInput.focus();}
      e.preventDefault();return;
    }
    if(hasModal)return;
    const active=document.activeElement;
    if(e.key==='F2'){e.preventDefault();setService(state.service==='Takeaway'?'Dine-in':'Takeaway');return;}
    if(e.key==='F4'){e.preventDefault();codeInput.focus();return;}
    if(e.key==='F8'){e.preventDefault();setPayment('Cash');$('cash-received').focus();return;}
    if(active&&['INPUT','TEXTAREA','SELECT'].includes(active.tagName))return;
    if(/^[0-9*a-zA-Z]$/.test(e.key)){
      e.preventDefault();codeInput.focus();codeInput.value+=e.key;onSearchInput();
    }else if(e.key==='Enter'&&codeInput.value.trim()){
      e.preventDefault();enterCode();codeInput.focus();
    }
  });

  function clock(){const now=new Date();$('clock').textContent=now.toLocaleTimeString('en-LK',{hour:'2-digit',minute:'2-digit'});}
  clock();setInterval(clock,15000);
  refreshState().then(()=>{feedback('BATA KADE preview ready. Touch a food or type a code + Enter.');codeInput.focus();}).catch(e=>{feedback('Preview initialization problem: '+e.message,'error');toast(e.message);});
})();
