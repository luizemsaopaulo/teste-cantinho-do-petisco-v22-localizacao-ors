(()=>{
  'use strict';

  const BASE = 'https://luizemsaopaulo.github.io/cantinho-do-petisco-v14/';
  const DELIVERY_URL = BASE + '?v=22';
  const RESTAURANT_URL = BASE + 'restaurante.html?v=22';
  let deferredPrompt = null;
  let lastMenuFocus = null;

  const $ = id => document.getElementById(id);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isiOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const safariIOS = () => isiOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  function toast(message, type='success'){
    const region = $('toastRegion');
    if(!region) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    region.appendChild(el);
    setTimeout(()=>el.remove(), 2600);
  }

  function refreshInstallButton(){
    const button = $('installAdminPwa');
    if(!button) return;
    button.classList.toggle('hidden', standalone() || (!deferredPrompt && !safariIOS()));
  }

  async function installAdmin(){
    if(safariIOS()){
      closeMenu(false);
      const dialog = $('adminIosInstallDialog');
      if(dialog && !dialog.open) dialog.showModal();
      return;
    }
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(()=>({outcome:'dismissed'}));
    if(choice.outcome === 'accepted') toast('Cantinho Admin instalado.');
    deferredPrompt = null;
    refreshInstallButton();
    closeMenu(false);
  }

  function share(mode){
    const delivery = mode === 'delivery';
    const url = delivery ? DELIVERY_URL : RESTAURANT_URL;
    const title = delivery ? '🍽️ *Cantinho do Petisco*' : '🍽️ *Cantinho do Petisco — Cardápio do Restaurante*';
    const line = delivery ? 'Confira nosso cardápio e faça seu pedido:' : 'Confira nosso cardápio completo:';
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${line}\n${url}`)}`, '_blank', 'noopener');
    closeMenu(false);
  }

  function qr(mode){
    const delivery = mode === 'delivery';
    $('qrDialogTitle').textContent = delivery ? 'QR Code — Delivery' : 'QR Code — Restaurante';
    $('qrDialogImage').src = delivery ? 'assets/qr-delivery-v22.png' : 'assets/qr-restaurante-v22.png';
    $('qrDialogLink').textContent = delivery ? DELIVERY_URL : RESTAURANT_URL;
    closeMenu(false);
    const dialog = $('qrDialog');
    if(dialog && !dialog.open) dialog.showModal();
  }

  function menuFocusable(){
    const menu = $('adminToolsMenu');
    if(!menu) return [];
    return [...menu.querySelectorAll('button:not(.hidden):not([disabled]),a[href]')];
  }

  function openMenu(){
    const menu = $('adminToolsMenu');
    const overlay = $('adminToolsOverlay');
    const toggle = $('adminToolsMenuBtn');
    if(!menu || !overlay || !toggle) return;
    lastMenuFocus = document.activeElement;
    menu.classList.add('open');
    menu.setAttribute('aria-hidden','false');
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden','false');
    toggle.setAttribute('aria-expanded','true');
    document.body.classList.add('admin-tools-open');
    requestAnimationFrame(()=>menuFocusable()[0]?.focus());
  }

  function closeMenu(restoreFocus=true){
    const menu = $('adminToolsMenu');
    const overlay = $('adminToolsOverlay');
    const toggle = $('adminToolsMenuBtn');
    if(!menu || !overlay || !toggle) return;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden','true');
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden','true');
    toggle.setAttribute('aria-expanded','false');
    document.body.classList.remove('admin-tools-open');
    if(restoreFocus) (lastMenuFocus || toggle).focus?.();
  }

  function toggleMenu(){
    $('adminToolsMenu')?.classList.contains('open') ? closeMenu() : openMenu();
  }

  function trapMenuFocus(event){
    if(event.key === 'Escape' && $('adminToolsMenu')?.classList.contains('open')){
      event.preventDefault();
      closeMenu();
      return;
    }
    if(event.key !== 'Tab' || !$('adminToolsMenu')?.classList.contains('open')) return;
    const items = menuFocusable();
    if(!items.length) return;
    const first = items[0], last = items[items.length-1];
    if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
  }

  if('serviceWorker' in navigator){
    addEventListener('load', ()=>navigator.serviceWorker.register('service-worker.js?v=22',{scope:'./'}).catch(()=>{}));
  }

  addEventListener('beforeinstallprompt', event=>{
    event.preventDefault();
    deferredPrompt = event;
    refreshInstallButton();
  });
  addEventListener('appinstalled', ()=>{
    deferredPrompt = null;
    refreshInstallButton();
  });

  document.addEventListener('DOMContentLoaded', ()=>{
    refreshInstallButton();
    $('adminToolsMenuBtn')?.addEventListener('click', toggleMenu);
    $('closeAdminToolsMenu')?.addEventListener('click', ()=>closeMenu());
    $('adminToolsOverlay')?.addEventListener('click', ()=>closeMenu());
    document.addEventListener('keydown', trapMenuFocus);

    $('installAdminPwa')?.addEventListener('click', installAdmin);
    $('closeAdminIosInstall')?.addEventListener('click', ()=>$('adminIosInstallDialog')?.close());

    $('openDeliveryQuick')?.addEventListener('click', ()=>{
      window.open(DELIVERY_URL,'_blank','noopener');
      closeMenu(false);
    });
    $('openRestaurantQuick')?.addEventListener('click', ()=>{
      window.open(RESTAURANT_URL,'_blank','noopener');
      closeMenu(false);
    });
    $('shareDeliveryWhatsApp')?.addEventListener('click', ()=>share('delivery'));
    $('shareRestaurantWhatsApp')?.addEventListener('click', ()=>share('restaurant'));
    $('qrDeliveryBtn')?.addEventListener('click', ()=>qr('delivery'));
    $('qrRestaurantBtn')?.addEventListener('click', ()=>qr('restaurant'));
    $('closeQrDialog')?.addEventListener('click', ()=>$('qrDialog')?.close());
  });
})();
