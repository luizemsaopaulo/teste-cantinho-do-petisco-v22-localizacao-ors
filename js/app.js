(() => {
  'use strict';
  const api = window.supabaseRest;
  const C = window.APP_CONFIG;
  const money = new Intl.NumberFormat(C.LOCALE,{style:'currency',currency:C.CURRENCY});
  const whatsappMoney=value=>money.format(Number(value)).replace(/[\u00a0\u202f]/g,' ');
  const MENU_MODE=(document.body.dataset.menuMode||'delivery').toLowerCase();
  const HIDDEN_CATEGORY_SLUGS=new Set(MENU_MODE==='delivery'?(C.DELIVERY_HIDDEN_CATEGORY_SLUGS||[]):[]);
  const CART_KEY=`cantinho_petisco_cart_${MENU_MODE}_v4`;
  const HISTORY_KEY='cantinho_petisco_order_history_v1';
  const HISTORY_LIMIT=30;
  const SIZE_ORDER={P:1,M:2,G:3};
  const state={allCategories:[],categories:[],products:[],specials:[],optionGroups:[],productOptions:[],cart:[],query:'',category:'all',selected:null,selectedQty:1,selectedVariants:[],selectedOptions:new Map(),selectedOptionQty:new Map(),specialOverride:null,groupMap:new Map(),validationPrompt:false,paymentSettings:null,editingCartIndex:null,pendingRepeatOrder:null,finalizeBusy:false};
  const $=s=>document.querySelector(s);
  const els={
    status:$('#menuStatus'),root:$('#menuRoot'),nav:$('#categoryNav'),search:$('#searchInput'),clear:$('#clearSearch'),specialSection:$('#dailySpecialSection'),specialCard:$('#dailySpecialCard'),overlay:$('#overlay'),drawer:$('#cartDrawer'),cartItems:$('#cartItems'),cartEmpty:$('#cartEmpty'),cartFooter:$('#cartFooter'),cartTotal:$('#cartTotal'),cartCountTop:$('#cartCountTop'),cartCountMobile:$('#cartCountMobile'),cartTotalMobile:$('#cartTotalMobile'),mobileCartBar:$('#mobileCartBar'),itemDialog:$('#itemDialog'),itemForm:$('#itemForm'),itemVisual:$('#itemDialogVisual'),itemCategory:$('#itemDialogCategory'),itemName:$('#itemDialogName'),itemDesc:$('#itemDialogDescription'),itemPrice:$('#itemDialogPrice'),itemAvailability:$('#itemAvailability'),itemNote:$('#itemNote'),itemNoteWrap:$('#itemNoteWrap'),itemOptions:$('#itemOptions'),itemQty:$('#itemQty'),addItem:$('#addItemBtn'),sizePickerWrap:$('#sizePickerWrap'),sizePicker:$('#sizePicker'),selectedSizeLabel:$('#selectedSizeLabel'),sizeRequiredMessage:$('#sizeRequiredMessage'),checkout:$('#checkoutDialog'),checkoutForm:$('#checkoutForm'),checkoutTotal:$('#checkoutTotal'),addressFields:$('#addressFields'),address:$('#customerAddress'),district:$('#customerDistrict'),payment:$('#paymentMethod'),paymentSuboptions:$('#paymentSuboptions'),changeField:$('#changeField'),changeFor:$('#changeFor'),changeEstimate:$('#changeEstimate'),privacy:$('#privacyDialog'),historyDialog:$('#historyDialog'),historyList:$('#historyList'),historyEmpty:$('#historyEmpty'),clearHistory:$('#clearHistoryBtn'),repeatChoiceDialog:$('#repeatChoiceDialog'),toast:$('#toastRegion')
  };
  const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize=(s='')=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const catById=id=>state.allCategories.find(c=>c.id===id);
  const categoryAllowed=c=>!!c&&!HIDDEN_CATEGORY_SLUGS.has(c.slug);
  const productById=id=>state.products.find(p=>p.id===id);
  const sizeRank=s=>SIZE_ORDER[String(s||'').toUpperCase()]||99;
  const sortVariants=list=>[...list].sort((a,b)=>sizeRank(a.size)-sizeRank(b.size)||(a.sort_order||0)-(b.sort_order||0));
  const isMarmita=p=>catById(p.category_id)?.slug==='marmitas';
  function iconFor(slug=''){if(slug.includes('bebidas-alcoolicas'))return'🥃';if(slug.includes('cervejas'))return'🍺';if(slug.includes('sucos'))return'🍹';if(slug.includes('refrigerantes'))return'🥤';if(slug.includes('porcoes'))return'🍟';if(slug.includes('massas'))return'🍝';if(slug.includes('marmitas'))return'🍱';return'🍽️';}
  function imageMarkup(p,cls='placeholder'){if(p?.image_path)return`<img src="${escapeHtml(api.publicImageUrl(p.image_path))}" alt="${escapeHtml(p.name)}" loading="lazy">`;return`<div class="${cls}" aria-hidden="true">${iconFor(p?catById(p.category_id)?.slug:'')}</div>`;}
  function toast(msg,type=''){const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;els.toast.appendChild(d);setTimeout(()=>d.remove(),3000);}
  const WEEKDAY_LABELS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  function currentRestaurantWeekday(){
    try{
      const short=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:C.TIME_ZONE||'America/Sao_Paulo'}).format(new Date());
      return {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[short] ?? new Date().getDay();
    }catch{return new Date().getDay();}
  }
  async function loadMenu(){try{const data=await api.getPublicMenu();state.allCategories=(data.categories||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.categories=state.allCategories.filter(categoryAllowed);const allowedIds=new Set(state.categories.map(c=>c.id));state.products=(data.products||[]).filter(p=>allowedIds.has(p.category_id)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.specials=data.daily_specials||[];state.optionGroups=(data.product_option_groups||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));state.productOptions=(data.product_options||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));restoreCart();renderNav();renderSpecial();renderMenu();renderCart();els.status.classList.add('hidden');els.root.classList.remove('hidden');}catch(e){els.status.innerHTML=`<p><strong>Não foi possível carregar o cardápio.</strong></p><p>${escapeHtml(e.message||'Verifique sua conexão e tente novamente.')}</p><button class="secondary-button" id="retryLoad">Tentar novamente</button>`;$('#retryLoad')?.addEventListener('click',()=>{els.status.innerHTML='<div class="spinner"></div><p>Carregando o cardápio…</p>';loadMenu();});}}
  function renderNav(){els.nav.innerHTML=[{slug:'all',name:'Tudo'},...state.categories].map(c=>`<button type="button" class="category-chip ${state.category===c.slug?'active':''}" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('');els.nav.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>{state.category=btn.dataset.category;renderNav();renderMenu();if(state.category!=='all'&&!state.query)document.getElementById(`cat-${state.category}`)?.scrollIntoView({behavior:'smooth',block:'start'});}));}
  function renderSpecial(){
    const weekday=currentRestaurantWeekday();let specials=state.specials.filter(x=>x.active&&Number(x.weekday)===weekday);
    if(!specials.length&&C.DEMO_MODE)specials=state.specials.filter(x=>x.active).slice(0,3);
    const seen=new Set(),cards=[];
    for(const s of specials){const p=productById(s.product_id);if(!p||!p.active||!p.available)continue;const key=`${p.category_id}|${normalize(p.name)}`;if(seen.has(key))continue;seen.add(key);const variants=groupVariantsForProduct(p).filter(v=>v.active&&v.available);if(!variants.length)continue;const rep=variants[0];const desc=s.note||rep.description||'Uma escolha especial da casa para hoje.';cards.push(`<article class="special-content special-content-multi"><span class="special-label">✦ Prato do dia · ${escapeHtml(WEEKDAY_LABELS[Number(s.weekday)])}</span><h3>${escapeHtml(rep.name)}</h3><p>${escapeHtml(desc)}</p><div class="special-choice-note">Escolha o tamanho e as opções ao abrir o prato.</div><button class="special-action" type="button" data-special-product="${escapeHtml(rep.id)}">Escolher este prato</button></article>`);}
    if(!cards.length){els.specialSection.classList.add('hidden');return;}
    els.specialCard.innerHTML=cards.join('');els.specialSection.classList.remove('hidden');els.specialCard.querySelectorAll('[data-special-product]').forEach(b=>b.addEventListener('click',()=>openItem(b.dataset.specialProduct,null)));
  }
  function visibleProductsForCategory(cat){const q=normalize(state.query);return state.products.filter(p=>p.category_id===cat.id&&p.active&&(!q||normalize(`${p.name} ${p.description||''} ${p.size||''}`).includes(q)));}
  function groupProducts(cat,products){if(cat.slug!=='marmitas')return products.map(p=>({id:`single-${p.id}`,name:p.name,variants:[p],grouped:false}));const m=new Map();for(const p of products){const k=normalize(p.name);if(!m.has(k))m.set(k,{id:`group-${p.id}`,name:p.name,variants:[],grouped:true});m.get(k).variants.push(p);}return[...m.values()].map(g=>({...g,variants:sortVariants(g.variants)}));}
  function groupPriceLabel(variants){const prices=variants.filter(v=>v.available&&v.price!=null).map(v=>Number(v.price));if(!prices.length)return'Consulte';const min=Math.min(...prices),max=Math.max(...prices);return min===max?money.format(min):`A partir de ${money.format(min)}`;}
  function cardSizeMarkup(variants){const sized=variants.filter(v=>v.size);if(!sized.length)return'';return`<div class="card-size-list" aria-label="Tamanhos disponíveis">${sized.map(v=>`<span class="card-size-pill ${!v.available||v.price==null?'disabled':''}"><b>${escapeHtml(v.size)}</b><small>${v.price!=null?money.format(Number(v.price)):'sem preço'}</small></span>`).join('')}</div>`;}
  function productGroupCard(group,cat){const v=group.variants,visual=v.find(x=>x.image_path)||v.find(x=>x.featured)||v[0],can=v.some(x=>x.available&&x.price!=null),allOff=v.every(x=>!x.available),featured=v.some(x=>x.featured),desc=v.find(x=>x.description)?.description||'',meta=group.grouped?'Escolha o tamanho':(visual.size?`Tamanho ${visual.size}`:'');return`<article class="product-card ${!can?'unavailable':''} ${group.grouped?'product-card-grouped':''}" data-card-group="${escapeHtml(group.id)}"><div class="product-card-body">${meta?`<div class="product-meta">${escapeHtml(meta)}</div>`:''}<h3>${escapeHtml(group.name)}</h3>${desc?`<p class="product-description">${escapeHtml(desc)}</p>`:''}${group.grouped?cardSizeMarkup(v):''}<div class="product-bottom"><strong class="product-price">${groupPriceLabel(v)}</strong><button class="add-circle" type="button" data-open-group="${escapeHtml(group.id)}" ${!can?'disabled':''} aria-label="Escolher ${escapeHtml(group.name)}">${allOff?'×':'+'}</button></div></div><div class="product-visual">${imageMarkup(visual)}${featured?'<span class="featured-badge">Destaque</span>':''}</div></article>`;}
  function marmitaGuide(){return`<div class="marmita-size-guide" aria-label="Guia de tamanhos"><div><span class="eyebrow">Tamanhos</span><strong>Escolha o prato primeiro.</strong><small>Depois selecione o tamanho disponível.</small></div><div class="guide-sizes"><span><b>P</b><small>Pequena</small></span><span><b>M</b><small>Média</small></span><span><b>G</b><small>Grande</small></span></div></div>`;}
  function renderMenu(){const cats=state.category==='all'?state.categories:state.categories.filter(c=>c.slug===state.category),sections=[];state.groupMap=new Map();for(const c of cats){const products=visibleProductsForCategory(c);if(!products.length)continue;const groups=groupProducts(c,products);groups.forEach(g=>state.groupMap.set(g.id,g));sections.push(`<section class="menu-section" id="cat-${escapeHtml(c.slug)}"><div class="section-heading"><div><span class="eyebrow">Cardápio</span><h2>${escapeHtml(c.name)}</h2>${c.description?`<p>${escapeHtml(c.description)}</p>`:''}</div></div>${c.slug==='marmitas'?marmitaGuide():''}<div class="product-grid">${groups.map(g=>productGroupCard(g,c)).join('')}</div></section>`);}els.root.innerHTML=sections.length?sections.join(''):'<div class="no-results"><strong>Nenhum item encontrado.</strong><p>Tente buscar por outro nome.</p></div>';els.root.querySelectorAll('[data-open-group]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openGroup(b.dataset.openGroup);}));els.root.querySelectorAll('[data-card-group]').forEach(card=>card.addEventListener('click',()=>openGroup(card.dataset.cardGroup)));}
  function groupVariantsForProduct(p){if(!isMarmita(p))return[p];const k=normalize(p.name);return sortVariants(state.products.filter(x=>x.active&&x.category_id===p.category_id&&normalize(x.name)===k));}
  function chooseDefaultVariant(vars,preferredId=null){return(preferredId&&vars.find(v=>v.id===preferredId))||vars.find(v=>v.available&&v.price!=null)||vars[0]||null;}
  function hasExplicitSizeChoice(){return state.selectedVariants.some(v=>!!v.size);}
  function displayProduct(){return state.selected||chooseDefaultVariant(state.selectedVariants)||null;}
  function optionGroupsForProduct(productId){return state.optionGroups.filter(g=>g.product_id===productId&&g.active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
  function optionsForGroup(groupId){return state.productOptions.filter(o=>o.group_id===groupId&&o.active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
  function resetSelectedOptions(){state.selectedOptions=new Map();state.selectedOptionQty=new Map();state.validationPrompt=false;}
  function selectedIdsForGroup(groupId){return state.selectedOptions.get(groupId)||new Set();}
  function groupMin(g){return g.min_selections!=null?Number(g.min_selections):(g.required?1:0);}
  function isAdditionalGroup(g){return normalize(`${g?.code||''} ${g?.name||''}`).includes('adicion');}
  function optionAllowsQuantity(o,g){
    const configured=o?.allow_quantity;
    const enabled=configured==null?(isAdditionalGroup(g)&&!o?.is_none_option&&(o?.price_mode||'add')==='add'):configured!==false;
    return !!enabled&&g?.selection_type==='multiple'&&!o?.is_none_option&&(o?.price_mode||'add')==='add';
  }
  function maxOptionQuantity(o){return o?.max_quantity==null?null:Math.max(1,Number(o.max_quantity)||1);}
  function selectedOptionQuantity(o,g){if(!optionAllowsQuantity(o,g))return 1;return Math.max(1,Number(state.selectedOptionQty.get(o.id)||1));}
  function groupMax(g){if(g.selection_type==='single')return 1;return g.max_selections==null?null:Number(g.max_selections);}
  function groupSelectionComplete(g){const n=selectedIdsForGroup(g.id).size,min=groupMin(g),max=groupMax(g);return n>=min&&(max==null||n<=max);}
  function selectionComplete(){
    if(hasExplicitSizeChoice()&&!state.selected)return false;
    const p=state.selected||displayProduct();if(!p)return false;
    return optionGroupsForProduct(p.id).every(groupSelectionComplete);
  }
  function missingOptionGroups(){const p=state.selected;if(!p)return[];return optionGroupsForProduct(p.id).filter(g=>!groupSelectionComplete(g));}
  function refreshRequiredValidationAfterChoice(){if(state.validationPrompt&&selectionComplete())state.validationPrompt=false;}
  function vibrateRequiredFeedback(){try{if(typeof navigator.vibrate==='function')navigator.vibrate([90,45,90]);}catch{}}
  function shakeAddButton(){if(!els.addItem)return;els.addItem.classList.remove('required-action-shake');void els.addItem.offsetWidth;els.addItem.classList.add('required-action-shake');setTimeout(()=>els.addItem?.classList.remove('required-action-shake'),650);}
  function showMissingRequiredFeedback(){
    if(hasExplicitSizeChoice()&&!state.selected){
      state.validationPrompt=true;renderSizePicker();renderOptionGroups();renderAddButton();
      toast('Falta escolher o tamanho da marmita.','error');
      vibrateRequiredFeedback();shakeAddButton();
      requestAnimationFrame(()=>{
        els.sizePickerWrap?.scrollIntoView({behavior:'smooth',block:'center'});
        els.sizePickerWrap?.classList.remove('required-size-pulse');void els.sizePickerWrap?.offsetWidth;els.sizePickerWrap?.classList.add('required-size-pulse');
        setTimeout(()=>{const focusable=els.sizePicker?.querySelector('button:not([disabled])');try{focusable?.focus({preventScroll:true});}catch{focusable?.focus();}},320);
      });
      return true;
    }
    const missing=missingOptionGroups();if(!missing.length)return false;
    state.validationPrompt=true;renderOptionGroups();renderAddButton();
    const names=missing.map(g=>g.name).filter(Boolean);
    toast(missing.length===1?`Falta selecionar: ${names[0]||'uma opção obrigatória'}.`:`Faltam ${missing.length} escolhas obrigatórias. Confira os campos destacados.`,'error');
    vibrateRequiredFeedback();shakeAddButton();
    requestAnimationFrame(()=>{
      const blocks=[...els.itemOptions.querySelectorAll('[data-option-group-block]')];
      const first=blocks.find(el=>el.dataset.optionGroupBlock===missing[0].id);
      if(!first)return;
      first.scrollIntoView({behavior:'smooth',block:'center'});
      first.classList.remove('required-missing-pulse');void first.offsetWidth;first.classList.add('required-missing-pulse');
      setTimeout(()=>{const focusable=first.querySelector('input:not([disabled]),button:not([disabled])');try{focusable?.focus({preventScroll:true});}catch{focusable?.focus();}},320);
    });
    return true;
  }
  function selectedOptionRows(){
    const p=state.selected;if(!p)return[];const out=[];
    for(const g of optionGroupsForProduct(p.id)){
      const ids=selectedIdsForGroup(g.id);
      for(const o of optionsForGroup(g.id))if(ids.has(o.id))out.push({group_id:g.id,group_name:g.name,group_code:g.code,option_id:o.id,option_name:o.name,option_code:o.code,price_mode:o.price_mode||'add',price_value:Number(o.price_value||0),is_none_option:!!o.is_none_option,allow_quantity:optionAllowsQuantity(o,g),max_quantity:maxOptionQuantity(o),quantity:selectedOptionQuantity(o,g)});
    }
    return out;
  }
  function unitPriceForSelected(){
    const p=state.selected;if(!p)return null;let base=effectiveVariantPrice(p);if(base==null)return null;base=Number(base);
    const chosen=selectedOptionRows();const setter=chosen.find(o=>o.price_mode==='set');if(setter)base=Number(setter.price_value||0);
    return base+chosen.filter(o=>o.price_mode!=='set').reduce((sum,o)=>sum+Number(o.price_value||0)*Math.max(1,Number(o.quantity)||1),0);
  }
  function optionPriceText(o){const v=Number(o.price_value||0);if((o.price_mode||'add')==='set')return money.format(v);return v>0?`+ ${money.format(v)}`:'Sem acréscimo';}
  function optionGroupHint(g){const min=groupMin(g),max=groupMax(g),hasQty=optionsForGroup(g.id).some(o=>optionAllowsQuantity(o,g));if(g.selection_type==='single')return g.required?'Escolha 1 opção · obrigatório':'Escolha até 1 opção · opcional';if(hasQty&&min===0&&max==null)return'Escolha os adicionais e ajuste a quantidade · ilimitada quando não houver limite';if(min>0&&max!=null)return`Escolha de ${min} até ${max} tipos de opção · obrigatório`;if(min>0)return`Escolha pelo menos ${min} tipo de opção · obrigatório`;if(max!=null)return`Escolha até ${max} tipos de opção · opcional`;return'Você pode escolher mais de uma opção · opcional';}
  function handleOptionInput(input){
    const g=state.optionGroups.find(x=>x.id===input.dataset.optionGroup),o=state.productOptions.find(x=>x.id===input.value);if(!g||!o)return;
    let ids=new Set(selectedIdsForGroup(g.id));
    if(g.selection_type==='single'){ids=input.checked?new Set([o.id]):new Set();}
    else if(input.checked){
      if(o.is_none_option){ids=new Set([o.id]);for(const candidate of optionsForGroup(g.id))state.selectedOptionQty.delete(candidate.id);}
      else{for(const candidate of optionsForGroup(g.id))if(candidate.is_none_option)ids.delete(candidate.id);ids.add(o.id);const max=groupMax(g);if(max!=null&&ids.size>max){ids.delete(o.id);input.checked=false;toast(`Escolha no máximo ${max} opção${max===1?'':'ões'} em ${g.name}.`,'error');}}
    }else{ids.delete(o.id);state.selectedOptionQty.delete(o.id);}
    state.selectedOptions.set(g.id,ids);refreshRequiredValidationAfterChoice();renderOptionGroups();renderAddButton();
  }
  function changeOptionQty(groupId,optionId,delta){
    const g=state.optionGroups.find(x=>x.id===groupId),o=state.productOptions.find(x=>x.id===optionId);if(!g||!o||!optionAllowsQuantity(o,g))return;
    let ids=new Set(selectedIdsForGroup(g.id));const wasSelected=ids.has(o.id);let current=wasSelected?Math.max(1,Number(state.selectedOptionQty.get(o.id)||1)):0;let next=current+delta;
    if(next<=0){ids.delete(o.id);state.selectedOptionQty.delete(o.id);state.selectedOptions.set(g.id,ids);refreshRequiredValidationAfterChoice();renderOptionGroups();renderAddButton();return;}
    if(!wasSelected){const maxTypes=groupMax(g);if(maxTypes!=null&&ids.size>=maxTypes){toast(`Escolha no máximo ${maxTypes} opção${maxTypes===1?'':'ões'} em ${g.name}.`,'error');return;}for(const candidate of optionsForGroup(g.id))if(candidate.is_none_option)ids.delete(candidate.id);ids.add(o.id);}
    const maxQty=maxOptionQuantity(o);if(maxQty!=null&&next>maxQty){toast(`O limite de ${o.name} é ${maxQty}.`,'error');return;}
    state.selectedOptionQty.set(o.id,next);state.selectedOptions.set(g.id,ids);refreshRequiredValidationAfterChoice();renderOptionGroups();renderAddButton();
  }
  function renderOptionGroups(){
    const p=state.selected;if(!els.itemOptions)return;if(!p){els.itemOptions.innerHTML='';els.itemOptions.classList.add('hidden');return;}const groups=optionGroupsForProduct(p.id);
    if(!groups.length){els.itemOptions.innerHTML='';els.itemOptions.classList.add('hidden');return;}
    els.itemOptions.classList.remove('hidden');
    const missingIds=new Set(state.validationPrompt?missingOptionGroups().map(g=>g.id):[]);
    const alertMarkup=state.validationPrompt&&missingIds.size?`<div class="required-options-alert" role="alert" aria-live="assertive"><span class="required-options-alert-icon">⚠️</span><div><strong>Falta selecionar ${missingIds.size===1?'uma opção obrigatória':'opções obrigatórias'}</strong><span>Confira ${missingIds.size===1?'o campo destacado abaixo':'os campos destacados abaixo'} para continuar.</span></div></div>`:'';
    els.itemOptions.innerHTML=alertMarkup+groups.map(g=>{const opts=optionsForGroup(g.id),ids=selectedIdsForGroup(g.id),type=g.selection_type==='single'?'radio':'checkbox',missing=missingIds.has(g.id);return`<fieldset class="item-option-group ${missing?'required-missing':''}" data-option-group-block="${escapeHtml(g.id)}" ${missing?'aria-invalid="true"':''}><legend><span>${escapeHtml(g.name)}</span>${g.required?'<b>Obrigatório</b>':'<small>Opcional</small>'}</legend><p class="option-group-hint">${escapeHtml(optionGroupHint(g))}</p>${missing?'<p class="required-group-error">Selecione uma opção para continuar.</p>':''}<div class="option-choice-list">${opts.map(o=>{const qtyEnabled=optionAllowsQuantity(o,g),qty=ids.has(o.id)?selectedOptionQuantity(o,g):0,maxQty=maxOptionQuantity(o);if(qtyEnabled)return`<div class="option-choice option-choice-quantity ${qty>0?'selected':''}"><span class="option-choice-copy"><strong>${escapeHtml(o.name)}</strong><small>${escapeHtml(optionPriceText(o))} cada${maxQty!=null?` · máx. ${maxQty}`:' · quantidade livre'}</small></span><div class="option-inline-qty" aria-label="Quantidade de ${escapeHtml(o.name)}"><button type="button" data-option-qty-dec="${escapeHtml(o.id)}" data-option-qty-group="${escapeHtml(g.id)}" ${qty<=0?'disabled':''}>−</button><strong>${qty}</strong><button type="button" data-option-qty-inc="${escapeHtml(o.id)}" data-option-qty-group="${escapeHtml(g.id)}" ${maxQty!=null&&qty>=maxQty?'disabled':''}>+</button></div></div>`;return`<label class="option-choice ${ids.has(o.id)?'selected':''}"><input type="${type}" name="option-${escapeHtml(g.id)}" value="${escapeHtml(o.id)}" data-option-group="${escapeHtml(g.id)}" ${ids.has(o.id)?'checked':''}><span class="option-choice-copy"><strong>${escapeHtml(o.name)}</strong><small>${escapeHtml(optionPriceText(o))}</small></span><span class="option-choice-mark" aria-hidden="true">${type==='radio'?'●':'✓'}</span></label>`;}).join('')}</div></fieldset>`;}).join('');
    els.itemOptions.querySelectorAll('[data-option-group]').forEach(input=>input.addEventListener('change',()=>handleOptionInput(input)));
    els.itemOptions.querySelectorAll('[data-option-qty-inc]').forEach(btn=>btn.addEventListener('click',()=>changeOptionQty(btn.dataset.optionQtyGroup,btn.dataset.optionQtyInc,1)));
    els.itemOptions.querySelectorAll('[data-option-qty-dec]').forEach(btn=>btn.addEventListener('click',()=>changeOptionQty(btn.dataset.optionQtyGroup,btn.dataset.optionQtyDec,-1)));
  }
  function syncPageInteractionLock(){
    const modalOpen=[els.itemDialog,els.checkout,els.privacy,els.historyDialog,els.repeatChoiceDialog].some(d=>d?.open);
    const drawerOpen=els.drawer?.classList.contains('open');
    document.body.style.overflow=(modalOpen||drawerOpen)?'hidden':'';
  }
  function openAppDialog(dialog){
    if(!dialog?.open)dialog.showModal();
    syncPageInteractionLock();
  }
  function openGroup(id){const g=state.groupMap.get(id);if(!g)return;state.editingCartIndex=null;state.specialOverride=null;state.selectedVariants=sortVariants(g.variants);state.selected=state.selectedVariants.some(v=>v.size)?null:chooseDefaultVariant(state.selectedVariants);state.selectedQty=1;resetSelectedOptions();els.itemNote.value='';renderItemDialog();openAppDialog(els.itemDialog);}
  function openItem(id,overridePrice=null){const p=productById(id);if(!p)return;state.editingCartIndex=null;state.selectedVariants=groupVariantsForProduct(p);state.specialOverride=overridePrice==null?null:{productId:p.id,price:Number(overridePrice)};state.selected=state.selectedVariants.some(v=>v.size)?null:chooseDefaultVariant(state.selectedVariants,p.id);state.selectedQty=1;resetSelectedOptions();els.itemNote.value='';renderItemDialog();openAppDialog(els.itemDialog);}
  function effectiveVariantPrice(p){return state.specialOverride?.productId===p.id?state.specialOverride.price:p.price;}
  function renderSizePicker(){
    const vars=state.selectedVariants.filter(v=>v.size);
    if(!vars.length){els.sizePickerWrap.classList.add('hidden');els.sizePickerWrap.classList.remove('required-size-missing','required-size-pulse');els.sizePicker.innerHTML='';els.selectedSizeLabel.textContent='';els.sizeRequiredMessage?.classList.add('hidden');return;}
    const missing=state.validationPrompt&&!state.selected;
    els.sizePickerWrap.classList.remove('hidden');els.sizePickerWrap.classList.toggle('required-size-missing',missing);els.sizePickerWrap.setAttribute('aria-invalid',missing?'true':'false');
    els.selectedSizeLabel.textContent=state.selected?.size?`Tamanho ${state.selected.size}`:'Obrigatório';
    els.sizeRequiredMessage?.classList.toggle('hidden',!missing);
    els.sizePicker.innerHTML=vars.map(v=>{const price=state.specialOverride?.productId===v.id?state.specialOverride.price:v.price,disabled=!v.available||price==null,selected=state.selected?.id===v.id,label=v.size==='P'?'Pequena':v.size==='M'?'Média':v.size==='G'?'Grande':`Tamanho ${v.size}`;return`<button type="button" class="size-option ${selected?'selected':''}" data-size-variant="${escapeHtml(v.id)}" role="radio" aria-checked="${selected}" ${disabled?'disabled':''}><span class="size-letter">${escapeHtml(v.size||'—')}</span><span class="size-option-copy"><strong>${escapeHtml(label)}</strong><small>${price!=null?money.format(Number(price)):'Sem preço'}</small></span>${selected?'<span class="size-check">✓</span>':''}</button>`;}).join('');
    els.sizePicker.querySelectorAll('[data-size-variant]').forEach(btn=>btn.addEventListener('click',()=>{const v=productById(btn.dataset.sizeVariant);if(!v||!v.available||effectiveVariantPrice(v)==null)return;state.selected=v;resetSelectedOptions();renderItemDialog();}));
  }
  function renderAddButton(){
    const p=state.selected||displayProduct();if(!p)return;
    const missingSize=hasExplicitSizeChoice()&&!state.selected;
    const price=missingSize?null:unitPriceForSelected(),needsChoice=!selectionComplete();
    const anyAvailable=state.selectedVariants.some(v=>v.available&&effectiveVariantPrice(v)!=null);
    const disabled=!anyAvailable;
    if(!needsChoice&&price!=null)els.itemPrice.textContent=money.format(Number(price));
    els.addItem.disabled=disabled;els.addItem.setAttribute('aria-invalid',needsChoice?'true':'false');
    const action=state.editingCartIndex!=null?'Salvar alteração':'Adicionar';els.addItem.textContent=disabled?'Indisponível':missingSize?action:needsChoice?action:`${action} • ${money.format(Number(price)*state.selectedQty)}`;
  }
  function renderItemDialog(){
    const p=displayProduct();if(!p)return;const cat=catById(p.category_id),hasSize=hasExplicitSizeChoice(),basePrice=state.selected?effectiveVariantPrice(state.selected):(!hasSize?effectiveVariantPrice(p):null),visual=state.selectedVariants.find(v=>v.image_path)||p;
    els.itemQty.textContent=String(state.selectedQty);els.itemVisual.innerHTML=imageMarkup(visual);els.itemCategory.textContent=cat?.name||'';els.itemName.textContent=p.name;els.itemDesc.textContent=p.description||state.selectedVariants.find(v=>v.description)?.description||'';
    els.itemPrice.textContent=hasSize&&!state.selected?'Selecione o tamanho':basePrice!=null?money.format(Number(basePrice)):'Preço não informado';
    if(hasSize&&!state.selected){els.itemAvailability.textContent='Escolha obrigatória';els.itemAvailability.className='unavailable-text';}else{const selected=state.selected||p;els.itemAvailability.textContent=selected.available?'Disponível':'Indisponível';els.itemAvailability.className=selected.available?'available-text':'unavailable-text';}
    if(els.itemNoteWrap){els.itemNoteWrap.classList.toggle('hidden',p.allow_notes===false);els.itemNote.disabled=p.allow_notes===false;els.itemNote.maxLength=p.notes_max_length?Math.min(5000,Number(p.notes_max_length)):180;}renderSizePicker();renderOptionGroups();renderAddButton();
  }
  function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(state.cart));}catch{}}
  function restoreCart(){try{const raw=JSON.parse(localStorage.getItem(CART_KEY)||'[]');state.cart=Array.isArray(raw)?raw.filter(x=>productById(x.product_id)&&Number(x.qty)>0).map(x=>({...x,qty:Math.min(99,Math.max(1,Number(x.qty)||1))})):[];}catch{state.cart=[];}}
  function addSelected(){
    if(!selectionComplete()){showMissingRequiredFeedback();return false;}
    const p=state.selected;if(!p)return false;const price=unitPriceForSelected();if(price==null||!p.available)return false;
    const note=p.allow_notes===false?'':els.itemNote.value.trim(),options=selectedOptionRows(),optionKey=options.map(o=>`${o.option_id}:${Math.max(1,Number(o.quantity)||1)}`).sort().join(','),key=`${p.id}|${optionKey}|${note}|${price}`,item={key,product_id:p.id,name:p.name,size:p.size||'',price:Number(price),qty:state.selectedQty,note,options};
    if(state.editingCartIndex!=null&&state.cart[state.editingCartIndex]){
      const idx=state.editingCartIndex,dup=state.cart.findIndex((x,i)=>i!==idx&&x.key===key);
      if(dup>=0){state.cart[dup].qty=Math.min(99,state.cart[dup].qty+item.qty);state.cart.splice(idx,1);}else state.cart[idx]=item;
      state.editingCartIndex=null;toast(`${p.name} atualizado no pedido.`,'success');
    }else{
      const existing=state.cart.find(x=>x.key===key);if(existing)existing.qty=Math.min(99,existing.qty+state.selectedQty);else state.cart.push(item);toast(`${p.name}${p.size?` · ${p.size}`:''} adicionado ao pedido.`,'success');
    }
    saveCart();renderCart();els.mobileCartBar.classList.remove('bump');requestAnimationFrame(()=>{els.mobileCartBar.classList.add('bump');setTimeout(()=>els.mobileCartBar.classList.remove('bump'),420);});return true;
  }
  const cartTotal=()=>state.cart.reduce((a,x)=>a+Number(x.price)*x.qty,0),cartCount=()=>state.cart.reduce((a,x)=>a+x.qty,0);
  const deliveryFee=()=>document.querySelector('input[name="fulfillment"]:checked')?.value==='Entrega'?(window.deliveryService?.getFee?.()||0):0;
  const orderTotal=()=>cartTotal()+deliveryFee();
  function cartOptionMarkup(x){if(!Array.isArray(x.options)||!x.options.length)return'';const byGroup=new Map();x.options.forEach(o=>{if(!byGroup.has(o.group_name))byGroup.set(o.group_name,[]);byGroup.get(o.group_name).push(o);});return`<div class="cart-options">${[...byGroup.entries()].map(([group,opts])=>`<p><strong>${escapeHtml(group)}:</strong> ${opts.map(o=>{const q=Math.max(1,Number(o.quantity)||1),prefix=q>1?`${q}x `:'',extra=o.price_mode==='add'&&Number(o.price_value)>0?` (+${money.format(Number(o.price_value)*q)})`:'';return`${prefix}${escapeHtml(o.option_name)}${extra}`;}).join(', ')}</p>`).join('')}</div>`;}
  function renderCart(){const count=cartCount(),total=cartTotal();window.deliveryService?.setSubtotal?.(total);els.cartCountTop.textContent=count;els.cartCountMobile.textContent=count;els.cartTotalMobile.textContent=money.format(total);els.cartTotal.textContent=money.format(total);els.checkoutTotal.textContent=money.format(orderTotal());els.mobileCartBar.classList.toggle('hidden',!count);els.cartEmpty.classList.toggle('hidden',!!count);els.cartFooter.classList.toggle('hidden',!count);els.cartItems.innerHTML=state.cart.map((x,i)=>`<div class="cart-line" data-line="${i}"><div><h4>${escapeHtml(x.name)}${x.size?` · <span class="cart-size">${escapeHtml(x.size)}</span>`:''}</h4>${cartOptionMarkup(x)}${x.note?`<p class="cart-note">Obs.: ${escapeHtml(x.note)}</p>`:''}<div class="cart-line-actions"><div class="mini-qty"><button type="button" data-dec="${i}" aria-label="Diminuir">−</button><strong>${x.qty}</strong><button type="button" data-inc="${i}" aria-label="Aumentar">+</button></div><button class="edit-line" type="button" data-edit="${i}">Editar</button><button class="remove-line" type="button" data-remove="${i}">Remover</button></div></div><div class="cart-line-price">${money.format(x.price*x.qty)}</div></div>`).join('');els.cartItems.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>changeQty(+b.dataset.dec,-1));els.cartItems.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>changeQty(+b.dataset.inc,1));els.cartItems.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openCartEdit(+b.dataset.edit));els.cartItems.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removeLine(+b.dataset.remove));}
  function preloadLineOptions(line){resetSelectedOptions();for(const saved of line.options||[]){const g=state.optionGroups.find(x=>x.id===saved.group_id&&x.product_id===line.product_id&&x.active!==false),o=state.productOptions.find(x=>x.id===saved.option_id&&x.group_id===saved.group_id&&x.active!==false);if(!g||!o)continue;const ids=new Set(selectedIdsForGroup(g.id));ids.add(o.id);state.selectedOptions.set(g.id,ids);state.selectedOptionQty.set(o.id,Math.max(1,Number(saved.quantity)||1));}}
  function openCartEdit(i){const line=state.cart[i],p=line&&productById(line.product_id);if(!line||!p||!p.active||!p.available){toast('Este item não está mais disponível para edição.','error');return;}state.editingCartIndex=i;state.specialOverride=null;state.selectedVariants=groupVariantsForProduct(p);state.selected=p;state.selectedQty=Math.max(1,Number(line.qty)||1);preloadLineOptions(line);els.itemNote.value=line.note||'';renderItemDialog();closeCart();openAppDialog(els.itemDialog);}
  function changeQty(i,d){if(!state.cart[i])return;state.cart[i].qty+=d;if(state.cart[i].qty<=0)state.cart.splice(i,1);else state.cart[i].qty=Math.min(99,state.cart[i].qty);saveCart();renderCart();}
  function removeLine(i){state.cart.splice(i,1);saveCart();renderCart();}
  function openCart(){els.drawer.classList.add('open');els.drawer.setAttribute('aria-hidden','false');els.overlay.classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeCart(){els.drawer.classList.remove('open');els.drawer.setAttribute('aria-hidden','true');els.overlay.classList.add('hidden');syncPageInteractionLock();}
  function paymentSettingsReady(v){
    const s={...api.paymentDefaults?.(),...(v||{})};
    s.pix_key=String(s.pix_key||'').trim();s.pix_receiver_name=String(s.pix_receiver_name||'').trim();
    s.pixReady=!!s.pix_direct_enabled&&!!s.pix_key&&!!s.pix_receiver_name;
    s.creditMachineEnabled=s.credit_machine_enabled!==false;
    return s;
  }
  async function loadPaymentSettings(){
    try{state.paymentSettings=paymentSettingsReady(await api.getPublicPaymentSettings());}
    catch(e){state.paymentSettings=paymentSettingsReady({credit_machine_enabled:true,debit_machine_enabled:true,cash_enabled:true,_loadError:true});toast('Não foi possível carregar todas as formas de pagamento.','error');}
    return state.paymentSettings;
  }
  function availablePaymentMethods(){
    const s=state.paymentSettings||paymentSettingsReady({});const out=[];
    if(s.pixReady)out.push({value:'pix',label:'Pix'});
    if(s.creditMachineEnabled)out.push({value:'credit_card',label:'Cartão de crédito'});
    if(s.debit_machine_enabled!==false)out.push({value:'debit_card',label:'Cartão de débito'});
    if(s.cash_enabled!==false)out.push({value:'cash',label:'Dinheiro'});
    return out;
  }
  function paymentLabel(){
    const method=els.payment.value,type=document.querySelector('input[name="fulfillment"]:checked')?.value||'Retirada';
    if(method==='pix')return'Pix';
    if(method==='credit_card')return`Cartão de crédito — maquininha na ${type==='Entrega'?'entrega':'retirada'}`;
    if(method==='debit_card')return`Cartão de débito — maquininha na ${type==='Entrega'?'entrega':'retirada'}`;
    if(method==='cash')return'Dinheiro';return'';
  }
  function parseMoneyInput(value){let t=String(value||'').trim().replace(/R\$/gi,'').replace(/\s/g,'');if(!t)return NaN;if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');else if((t.match(/\./g)||[]).length>1)t=t.replace(/\./g,'');const n=Number(t.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:NaN;}
  function cashChoice(){return document.querySelector('input[name="needsChange"]:checked')?.value||'';}
  function updateChangeEstimate(){
    const choice=cashChoice(),show=els.payment.value==='cash'&&choice==='yes';els.changeField.classList.toggle('hidden',!show);els.changeFor.required=show;
    if(!show){els.changeFor.setCustomValidity('');if(choice==='no')els.changeFor.value='';if(els.changeEstimate)els.changeEstimate.textContent='';return;}
    const value=parseMoneyInput(els.changeFor.value),total=orderTotal();if(!Number.isFinite(value)){if(els.changeEstimate)els.changeEstimate.textContent='Informe para quanto será o pagamento.';return;}const change=value-total;if(els.changeEstimate)els.changeEstimate.textContent=change>=0?`Troco estimado: ${money.format(change)}`:'O valor informado é menor que o total do pedido.';
  }
  function syncCheckoutButton(){const b=$('#sendWhatsappBtn');if(!b)return;const method=els.payment.value;if(!method){b.textContent='Escolha a forma de pagamento';return;}if(method==='cash'&&!cashChoice()){b.textContent='Informe se precisa de troco';return;}b.textContent='Enviar pedido no WhatsApp';}
  function renderPaymentSuboptions(){
    const box=els.paymentSuboptions;if(!box)return;const method=els.payment.value,type=document.querySelector('input[name="fulfillment"]:checked')?.value||'Retirada',where=type==='Entrega'?'com o entregador':'no momento da retirada';box.innerHTML='';box.classList.add('hidden');els.changeField.classList.add('hidden');els.changeFor.required=false;els.changeFor.setCustomValidity('');
    if(method==='pix'){box.innerHTML='<p class="payment-method-note"><strong>Pix.</strong> A chave cadastrada pelo restaurante será colocada somente no final da comanda que abrir no WhatsApp.</p>';box.classList.remove('hidden');}
    else if(method==='credit_card'){box.innerHTML=`<p class="payment-method-note"><strong>Cartão de crédito na maquininha.</strong> O pagamento será realizado ${where}.</p>`;box.classList.remove('hidden');}
    else if(method==='debit_card'){box.innerHTML=`<p class="payment-method-note"><strong>Cartão de débito na maquininha.</strong> O pagamento será realizado ${where}.</p>`;box.classList.remove('hidden');}
    else if(method==='cash'){
      box.innerHTML='<fieldset><legend>Vai precisar de troco?</legend><div class="payment-choice-list cash-choice-list"><label class="payment-choice"><input type="radio" name="needsChange" value="no"><span><strong>Não</strong><small>Não preciso de troco.</small></span></label><label class="payment-choice"><input type="radio" name="needsChange" value="yes"><span><strong>Sim</strong><small>Vou informar para quanto preciso de troco.</small></span></label></div></fieldset>';box.classList.remove('hidden');box.querySelectorAll('input[name="needsChange"]').forEach(r=>r.addEventListener('change',()=>{updateChangeEstimate();syncCheckoutButton();}));
    }
    updateChangeEstimate();syncCheckoutButton();
  }
  function renderPaymentMethods(preferred=''){const methods=availablePaymentMethods();if(!methods.length){els.payment.innerHTML='<option value="">Nenhuma forma de pagamento disponível</option>';els.payment.disabled=true;els.paymentSuboptions.innerHTML='<p class="payment-method-note">No momento não há formas de pagamento disponíveis. Entre em contato com o estabelecimento.</p>';els.paymentSuboptions.classList.remove('hidden');$('#sendWhatsappBtn').disabled=true;syncCheckoutButton();return;}els.payment.disabled=false;$('#sendWhatsappBtn').disabled=false;els.payment.innerHTML='<option value="">Selecione</option>'+methods.map(m=>`<option value="${m.value}">${m.label}</option>`).join('');if(preferred&&methods.some(m=>m.value===preferred))els.payment.value=preferred;else if(methods.length===1)els.payment.value=methods[0].value;renderPaymentSuboptions();}
  async function prepareCheckout(){closeCart();els.checkoutTotal.textContent=money.format(orderTotal());els.payment.innerHTML='<option value="">Carregando formas de pagamento…</option>';els.payment.disabled=true;els.paymentSuboptions.classList.add('hidden');els.changeFor.value='';openAppDialog(els.checkout);await loadPaymentSettings();renderPaymentMethods();}
  function paymentMessageLines(){
    const method=els.payment.value,type=document.querySelector('input[name="fulfillment"]:checked')?.value||'Retirada',total=orderTotal(),s=state.paymentSettings||paymentSettingsReady({}),lines=['','*FORMA DE PAGAMENTO:*'];
    if(method==='pix'){lines.push('*Pix*',`*Valor a pagar:* ${whatsappMoney(total)}`,`*Chave Pix (${s.pix_key_type||'Pix'}):*`,s.pix_key,`*Recebedor:* ${s.pix_receiver_name}`,'Copie a chave acima e realize o pagamento.');}
    else if(method==='credit_card'){lines.push('*Cartão de crédito*',type==='Entrega'?'Pagamento na maquininha com o entregador.':'Pagamento na maquininha no momento da retirada.');}
    else if(method==='debit_card'){lines.push('*Cartão de débito*',type==='Entrega'?'Pagamento na maquininha com o entregador.':'Pagamento na maquininha no momento da retirada.');}
    else if(method==='cash'){const choice=cashChoice();lines.push('*Dinheiro*');if(choice==='no')lines.push('*Troco:* Não precisa');else{const value=parseMoneyInput(els.changeFor.value),change=value-total;lines.push(`*Total:* ${whatsappMoney(total)}`,`*Troco para:* ${whatsappMoney(value)}`,`*Troco estimado:* ${whatsappMoney(Math.max(0,change))}`);}}
    return lines;
  }
  function buildWhatsAppMessage(){
    const name=$('#customerName').value.trim(),type=document.querySelector('input[name="fulfillment"]:checked')?.value||'Retirada',lines=['*PEDIDO:*'];
    state.cart.forEach(x=>{lines.push(`*${x.qty}x ${x.name}${x.size?` (${x.size})`:''}* — ${whatsappMoney(x.price*x.qty)}`);if(Array.isArray(x.options)&&x.options.length){const byGroup=new Map();x.options.forEach(o=>{if(!byGroup.has(o.group_name))byGroup.set(o.group_name,[]);const q=Math.max(1,Number(o.quantity)||1),extra=o.price_mode==='add'&&Number(o.price_value)>0?` (+${whatsappMoney(Number(o.price_value)*q)})`:'';byGroup.get(o.group_name).push(`${q>1?`${q}x `:''}${o.option_name}${extra}`);});for(const [group,opts] of byGroup)lines.push(`_${group}: ${opts.join(', ')}_`);}if(x.note)lines.push(`_Obs.: ${x.note}_`);});
    lines.push('',`*Total dos itens:* ${whatsappMoney(cartTotal())}`);if(type==='Entrega'){const d=window.deliveryService?.getState?.()||{};lines.push(`*Taxa de entrega:* ${whatsappMoney(deliveryFee())}`);if(Number.isFinite(Number(d.distanceKm)))lines.push(`*Distância da entrega:* ${Number(d.distanceKm).toFixed(2).replace('.',',')} km`);lines.push(`*TOTAL:* ${whatsappMoney(orderTotal())}`);}else lines.push(`*TOTAL:* ${whatsappMoney(cartTotal())}`);
    const note=$('#orderNote').value.trim();if(note)lines.push('',`*Observação geral:* ${note}`);lines.push('');if(type==='Entrega'){lines.push('*DADOS PARA ENTREGA:*',`*Endereço:* ${els.address.value.trim()}`);if(els.district.value.trim())lines.push(`*Bairro:* ${els.district.value.trim()}`);}else lines.push('*RETIRADA NO LOCAL*');lines.push(`*Nome do cliente:* ${name}`);lines.push(...paymentMessageLines());return lines.join('\n');
  }
  function readHistory(){try{const v=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(v)?v:[];}catch{return[];}}
  function writeHistory(list){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(list.slice(0,HISTORY_LIMIT)));}catch{}}
  function historyFingerprint(){return JSON.stringify({cart:state.cart.map(x=>[x.product_id,x.qty,x.note,(x.options||[]).map(o=>[o.option_id,o.quantity])]),fulfillment:document.querySelector('input[name="fulfillment"]:checked')?.value,payment:els.payment.value,total:Number(orderTotal().toFixed(2))});}
  function saveOrderHistory(){const list=readHistory(),fingerprint=historyFingerprint(),now=Date.now();if(list[0]?.fingerprint===fingerprint&&now-Date.parse(list[0].created_at||0)<30000)return list[0];const order={id:`pedido-${now}-${Math.random().toString(36).slice(2,7)}`,created_at:new Date(now).toISOString(),fingerprint,menu_mode:MENU_MODE,items:state.cart.map(x=>JSON.parse(JSON.stringify(x))),subtotal:Number(cartTotal().toFixed(2)),delivery_fee:Number(deliveryFee().toFixed(2)),total:Number(orderTotal().toFixed(2)),fulfillment:document.querySelector('input[name="fulfillment"]:checked')?.value||'Retirada',payment_method:els.payment.value,payment_label:paymentLabel(),order_note:$('#orderNote').value.trim()};list.unshift(order);writeHistory(list);return order;}
  function sendToWhatsApp(){if(state.finalizeBusy)return;state.finalizeBusy=true;const b=$('#sendWhatsappBtn'),old=b?.textContent;if(b){b.disabled=true;b.textContent='Abrindo WhatsApp…';}saveOrderHistory();renderHistory();const url=`https://wa.me/${C.WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage())}`;window.__TEST_LAST_WHATSAPP_URL__=url;try{if(typeof window.__WHATSAPP_NAVIGATOR__==='function')window.__WHATSAPP_NAVIGATOR__(url);else window.location.assign(url);}finally{setTimeout(()=>{state.finalizeBusy=false;if(b){b.disabled=false;b.textContent=old||'Enviar pedido no WhatsApp';syncCheckoutButton();}},900);}}
  function rebuildHistoryLine(saved){
    const p=productById(saved.product_id);if(!p||p.active===false||!p.available||p.price==null)return {line:null,itemMissing:true,optionMissing:false};const groups=optionGroupsForProduct(p.id),groupIds=new Set(groups.map(g=>g.id)),options=[];let optionMissing=false;
    for(const old of saved.options||[]){const g=state.optionGroups.find(x=>x.id===old.group_id&&groupIds.has(x.id)&&x.active!==false),o=state.productOptions.find(x=>x.id===old.option_id&&x.group_id===old.group_id&&x.active!==false);if(!g||!o){optionMissing=true;continue;}let q=Math.max(1,Number(old.quantity)||1),max=maxOptionQuantity(o);if(max!=null)q=Math.min(q,max);options.push({group_id:g.id,group_name:g.name,group_code:g.code,option_id:o.id,option_name:o.name,option_code:o.code,price_mode:o.price_mode||'add',price_value:Number(o.price_value||0),is_none_option:!!o.is_none_option,allow_quantity:optionAllowsQuantity(o,g),max_quantity:max,quantity:q});}
    for(const g of groups){const count=new Set(options.filter(o=>o.group_id===g.id).map(o=>o.option_id)).size;if(count<groupMin(g))return {line:null,itemMissing:true,optionMissing:true};}
    let price=Number(p.price),setter=options.find(o=>o.price_mode==='set');if(setter)price=Number(setter.price_value||0);price+=options.filter(o=>o.price_mode!=='set').reduce((sum,o)=>sum+Number(o.price_value||0)*Math.max(1,Number(o.quantity)||1),0);const note=p.allow_notes===false?'':String(saved.note||'').slice(0,Number(p.notes_max_length)||180),optionKey=options.map(o=>`${o.option_id}:${o.quantity}`).sort().join(','),key=`${p.id}|${optionKey}|${note}|${price}`;return {line:{key,product_id:p.id,name:p.name,size:p.size||'',price,qty:Math.min(99,Math.max(1,Number(saved.qty)||1)),note,options},itemMissing:false,optionMissing};
  }
  function rebuildHistoryOrder(order){const lines=[];let missingItems=0,missingOptions=0;for(const saved of order?.items||[]){const r=rebuildHistoryLine(saved);if(r.line)lines.push(r.line);if(r.itemMissing)missingItems++;if(r.optionMissing)missingOptions++;}return {lines,missingItems,missingOptions};}
  function mergeLineIntoCart(line){const existing=state.cart.find(x=>x.key===line.key);if(existing)existing.qty=Math.min(99,existing.qty+line.qty);else state.cart.push(line);}
  function applyHistoryOrder(order,mode='add'){const rebuilt=rebuildHistoryOrder(order);if(!rebuilt.lines.length){toast('Os itens deste pedido não estão mais disponíveis.','error');return;}if(mode==='replace')state.cart=[];rebuilt.lines.forEach(mergeLineIntoCart);saveCart();renderCart();els.repeatChoiceDialog?.close();els.historyDialog?.close();openCart();if(rebuilt.missingItems||rebuilt.missingOptions)toast('Alguns itens ou adicionais não estão mais disponíveis e não foram adicionados.','error');else toast('Pedido anterior adicionado com os preços atuais.','success');}
  function formatHistoryDate(iso){try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso));}catch{return iso||'';}}
  function historyItemMarkup(x){return `<li><strong>${Math.max(1,Number(x.qty)||1)}x ${escapeHtml(x.name)}${x.size?` (${escapeHtml(x.size)})`:''}</strong>${x.options?.length?`<small>${escapeHtml(x.options.map(o=>`${Math.max(1,Number(o.quantity)||1)>1?`${Math.max(1,Number(o.quantity)||1)}x `:''}${o.option_name}`).join(', '))}</small>`:''}${x.note?`<small>Obs.: ${escapeHtml(x.note)}</small>`:''}</li>`;}
  function renderHistory(){if(!els.historyList||!els.historyEmpty)return;const list=readHistory();els.historyEmpty.classList.toggle('hidden',!!list.length);els.historyList.classList.toggle('hidden',!list.length);els.clearHistory?.classList.toggle('hidden',!list.length);els.historyList.innerHTML=list.map(o=>`<article class="history-card" data-history-id="${escapeHtml(o.id)}"><div class="history-card-head"><div><strong>${escapeHtml(formatHistoryDate(o.created_at))}</strong><small>${escapeHtml(o.fulfillment||'')} · ${escapeHtml(o.payment_label||'')}</small></div><strong>${money.format(Number(o.total)||0)}</strong></div><ul class="history-preview">${(o.items||[]).slice(0,3).map(historyItemMarkup).join('')}${(o.items||[]).length>3?`<li><small>+ ${(o.items||[]).length-3} item(ns)</small></li>`:''}</ul><div class="history-details hidden">${o.order_note?`<p><strong>Observação:</strong> ${escapeHtml(o.order_note)}</p>`:''}<p>Valor na ocasião: <strong>${money.format(Number(o.total)||0)}</strong>. Ao repetir, os preços atuais são usados.</p></div><div class="history-actions"><button class="secondary-button small" type="button" data-history-view="${escapeHtml(o.id)}">Ver pedido</button><button class="primary-button small" type="button" data-history-repeat="${escapeHtml(o.id)}">Repetir pedido</button></div></article>`).join('');els.historyList.querySelectorAll('[data-history-view]').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('.history-card'),d=card?.querySelector('.history-details');d?.classList.toggle('hidden');b.textContent=d?.classList.contains('hidden')?'Ver pedido':'Ocultar';}));els.historyList.querySelectorAll('[data-history-repeat]').forEach(b=>b.addEventListener('click',()=>requestRepeat(list.find(o=>o.id===b.dataset.historyRepeat))));}
  function openHistory(){closeCart();renderHistory();openAppDialog(els.historyDialog);}
  function requestRepeat(order){if(!order)return;if(!state.cart.length){applyHistoryOrder(order,'replace');return;}state.pendingRepeatOrder=order;openAppDialog(els.repeatChoiceDialog);}
  function validateCheckout(){if(!state.cart.length){toast('Seu pedido está vazio.','error');return false;}const delivery=document.querySelector('input[name="fulfillment"]:checked')?.value==='Entrega';if(delivery&&!els.address.value.trim()){els.address.focus();toast('Confirme o endereço da entrega.','error');return false;}if(delivery){const check=window.deliveryService?.validate?.()||{ok:false,message:'Calcule a distância da entrega.'};if(!check.ok){toast(check.message||'Calcule a entrega antes de continuar.','error');return false;}}if(!els.checkoutForm.reportValidity())return false;if(!els.payment.value){els.payment.focus();toast('Escolha a forma de pagamento.','error');return false;}if(els.payment.value==='cash'){const choice=cashChoice();if(!choice){toast('Informe se vai precisar de troco.','error');return false;}if(choice==='yes'){const value=parseMoneyInput(els.changeFor.value),total=orderTotal();if(!Number.isFinite(value)){els.changeFor.setCustomValidity('Informe um valor válido para o troco.');els.changeFor.reportValidity();return false;}if(value+0.0001<total){els.changeFor.setCustomValidity('O valor informado para troco precisa ser igual ou maior que o total do pedido.');els.changeFor.reportValidity();return false;}els.changeFor.setCustomValidity('');}}return true;}
  function finalizeCheckout(){if(!validateCheckout())return;sendToWhatsApp();}
  function initEvents(){
    [els.itemDialog,els.checkout,els.privacy,els.historyDialog,els.repeatChoiceDialog].forEach(d=>d?.addEventListener('close',syncPageInteractionLock));
    els.itemDialog?.addEventListener('close',()=>{state.editingCartIndex=null;});
    els.search.addEventListener('input',()=>{state.query=els.search.value.trim();els.clear.classList.toggle('hidden',!state.query);renderMenu();});els.clear.addEventListener('click',()=>{els.search.value='';state.query='';els.clear.classList.add('hidden');renderMenu();els.search.focus();});
    $('#openCartTop').onclick=openCart;els.mobileCartBar.onclick=openCart;$('#openHistoryTop')?.addEventListener('click',openHistory);$('#openHistoryFooter')?.addEventListener('click',openHistory);$('#closeHistoryDialog')?.addEventListener('click',()=>els.historyDialog?.close());$('#closeHistoryBottom')?.addEventListener('click',()=>els.historyDialog?.close());
    els.clearHistory?.addEventListener('click',()=>{if(confirm('Deseja realmente apagar seu histórico de pedidos deste aparelho?')){writeHistory([]);renderHistory();toast('Histórico apagado.','success');}});
    $('#repeatAddBtn')?.addEventListener('click',()=>{if(state.pendingRepeatOrder)applyHistoryOrder(state.pendingRepeatOrder,'add');state.pendingRepeatOrder=null;});$('#repeatReplaceBtn')?.addEventListener('click',()=>{if(state.pendingRepeatOrder)applyHistoryOrder(state.pendingRepeatOrder,'replace');state.pendingRepeatOrder=null;});$('#repeatCancelBtn')?.addEventListener('click',()=>{state.pendingRepeatOrder=null;els.repeatChoiceDialog?.close();});$('#closeRepeatChoice')?.addEventListener('click',()=>{state.pendingRepeatOrder=null;els.repeatChoiceDialog?.close();});
    $('#closeCart').onclick=closeCart;els.overlay.onclick=closeCart;$('#privacyBtn').onclick=()=>openAppDialog(els.privacy);$('#itemQtyMinus').onclick=()=>{state.selectedQty=Math.max(1,state.selectedQty-1);els.itemQty.textContent=state.selectedQty;renderAddButton();};$('#itemQtyPlus').onclick=()=>{state.selectedQty=Math.min(99,state.selectedQty+1);els.itemQty.textContent=state.selectedQty;renderAddButton();};els.itemForm.addEventListener('submit',e=>{e.preventDefault();if(addSelected())els.itemDialog.close();});$('#closeItemDialog').onclick=()=>els.itemDialog.close();$('#closeCheckoutDialog').onclick=()=>els.checkout.close();$('#checkoutBtn').onclick=prepareCheckout;
    document.querySelectorAll('input[name="fulfillment"]').forEach(r=>r.addEventListener('change',()=>{const delivery=document.querySelector('input[name="fulfillment"]:checked')?.value==='Entrega';els.addressFields.classList.toggle('hidden',!delivery);els.address.required=delivery;window.deliveryService?.setEnabled?.(delivery);els.checkoutTotal.textContent=money.format(orderTotal());renderPaymentSuboptions();}));els.payment.addEventListener('change',renderPaymentSuboptions);els.changeFor.addEventListener('input',()=>{els.changeFor.setCustomValidity('');updateChangeEstimate();});els.checkoutForm.addEventListener('submit',e=>{e.preventDefault();finalizeCheckout();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.drawer.classList.contains('open'))closeCart();});
  }
  document.addEventListener('cantinho:delivery-updated',()=>{if(els.checkoutTotal)els.checkoutTotal.textContent=money.format(orderTotal());});
  initEvents();loadMenu();
})();
