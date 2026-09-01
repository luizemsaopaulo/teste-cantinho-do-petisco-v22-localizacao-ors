(() => {
  'use strict';
  const C = window.APP_CONFIG || {};
  const money = new Intl.NumberFormat(C.LOCALE || 'pt-BR',{style:'currency',currency:C.CURRENCY || 'BRL'});
  const RESTAURANT_CACHE_KEY='cantinho_restaurant_coords_v22';
  const state={enabled:false,status:'idle',fee:0,distanceKm:null,durationMin:null,source:null,customerCoords:null,restaurantCoords:null,addressLabel:'',requestId:0};
  const $=s=>document.querySelector(s);
  const els={
    card:$('#deliveryLocationCard'),status:$('#deliveryStatus'),result:$('#deliveryResult'),distance:$('#deliveryDistance'),duration:$('#deliveryDuration'),fee:$('#deliveryFee'),
    gps:$('#useLocationBtn'),addressCalc:$('#calcAddressBtn'),address:$('#customerAddress'),district:$('#customerDistrict'),send:$('#sendWhatsappBtn')
  };
  const dispatch=()=>document.dispatchEvent(new CustomEvent('cantinho:delivery-updated',{detail:getPublicState()}));
  function getPublicState(){return {enabled:state.enabled,status:state.status,fee:state.fee,distanceKm:state.distanceKm,durationMin:state.durationMin,source:state.source,addressLabel:state.addressLabel,withinArea:state.status==='ready'};}
  function setStatus(text,type='info'){
    if(!els.status)return;
    els.status.textContent=text;els.status.className=`delivery-status ${type}`;els.status.classList.remove('hidden');
  }
  function setBusy(busy){if(els.gps)els.gps.disabled=busy;if(els.addressCalc)els.addressCalc.disabled=busy;if(els.send&&state.enabled)els.send.disabled=busy||state.status!=='ready';}
  function render(){
    if(!els.card)return;
    els.card.classList.toggle('delivery-ready',state.status==='ready');
    els.card.classList.toggle('delivery-outside',state.status==='outside');
    els.card.classList.toggle('delivery-error',state.status==='error');
    if(els.result){const show=state.distanceKm!=null;els.result.classList.toggle('hidden',!show);}
    if(els.distance&&state.distanceKm!=null)els.distance.textContent=`${state.distanceKm.toFixed(2).replace('.',',')} km`;
    if(els.duration&&state.durationMin!=null)els.duration.textContent=`${Math.max(1,Math.round(state.durationMin))} min`;
    if(els.fee)els.fee.textContent=state.status==='ready'?money.format(state.fee):'—';
    if(els.send)els.send.disabled=state.enabled&&state.status!=='ready';
    dispatch();
  }
  function reset(message='Calcule a distância para liberar o envio do pedido.'){
    state.status='idle';state.fee=0;state.distanceKm=null;state.durationMin=null;state.source=null;state.customerCoords=null;state.addressLabel='';
    if(els.result)els.result.classList.add('hidden');
    if(state.enabled)setStatus(message,'info'); else if(els.status)els.status.classList.add('hidden');
    setBusy(false);render();
  }
  function setEnabled(enabled){state.enabled=!!enabled;if(state.enabled){if(state.status!=='ready')setStatus('Calcule a distância para liberar o envio do pedido.','info');}else reset('');render();}
  function invalidateManual(){if(!state.enabled||state.source!=='address'||state.status==='calculating')return;reset('O endereço foi alterado. Calcule a distância novamente.');}
  function authHeaders(extra={}){const key=String(C.OPENROUTESERVICE_API_KEY||'').trim();if(!key)throw new Error('A chave do OpenRouteService não foi configurada.');return {Authorization:key,...extra};}
  async function fetchJson(url,options={}){const response=await fetch(url,{...options,headers:authHeaders(options.headers||{})});let data=null;try{data=await response.json();}catch{}if(!response.ok){const msg=data?.error?.message||data?.message||data?.error||`Falha na API (${response.status})`;throw new Error(typeof msg==='string'?msg:'Não foi possível consultar a rota.');}return data;}
  function pickAddressProperties(feature){const p=feature?.properties||{};return {label:p.label||p.name||'',district:p.neighbourhood||p.borough||p.locality||p.localadmin||''};}
  async function geocode(text){
    const base=C.OPENROUTESERVICE_BASE_URL||'https://api.heigit.org';
    const u=new URL(`${base}/pelias/v1/search`);u.searchParams.set('text',text);u.searchParams.set('size','1');u.searchParams.set('boundary.country','BR');
    const data=await fetchJson(u.toString());const f=data?.features?.[0],coords=f?.geometry?.coordinates;if(!Array.isArray(coords)||coords.length<2)throw new Error('Endereço não encontrado. Confira rua, número e bairro.');
    return {coords:[Number(coords[0]),Number(coords[1])],...pickAddressProperties(f)};
  }
  async function reverseGeocode(lon,lat){
    const base=C.OPENROUTESERVICE_BASE_URL||'https://api.heigit.org';
    const u=new URL(`${base}/pelias/v1/reverse`);u.searchParams.set('point.lon',String(lon));u.searchParams.set('point.lat',String(lat));u.searchParams.set('size','1');
    const data=await fetchJson(u.toString());const f=data?.features?.[0];return f?pickAddressProperties(f):{label:'',district:''};
  }
  async function restaurantCoords(){
    if(Array.isArray(state.restaurantCoords))return state.restaurantCoords;
    try{const cached=JSON.parse(localStorage.getItem(RESTAURANT_CACHE_KEY)||'null');if(Array.isArray(cached)&&cached.length===2&&cached.every(Number.isFinite)){state.restaurantCoords=cached;return cached;}}catch{}
    const found=await geocode(C.RESTAURANT_ADDRESS);state.restaurantCoords=found.coords;try{localStorage.setItem(RESTAURANT_CACHE_KEY,JSON.stringify(found.coords));}catch{}return found.coords;
  }
  async function routeDistance(customerCoords){
    const base=C.OPENROUTESERVICE_BASE_URL||'https://api.heigit.org';
    const origin=await restaurantCoords();
    const data=await fetchJson(`${base}/openrouteservice/v2/directions/driving-car/geojson`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/geo+json'},body:JSON.stringify({coordinates:[origin,customerCoords],instructions:false})});
    const summary=data?.features?.[0]?.properties?.summary;if(!summary||!Number.isFinite(Number(summary.distance)))throw new Error('A rota não retornou uma distância válida.');
    return {distanceKm:Number(summary.distance)/1000,durationMin:Number(summary.duration||0)/60};
  }
  async function finalize(coords,source,addressInfo,requestId){
    const route=await routeDistance(coords);if(requestId!==state.requestId)return;
    state.customerCoords=coords;state.source=source;state.distanceKm=route.distanceKm;state.durationMin=route.durationMin;state.addressLabel=addressInfo?.label||'';
    const max=Number(C.DELIVERY_MAX_KM||3);
    if(route.distanceKm<=max){state.status='ready';state.fee=Number(C.DELIVERY_FEE||0);setStatus(`Entrega disponível: ${route.distanceKm.toFixed(2).replace('.',',')} km. Taxa ${money.format(state.fee)}.`,'success');}
    else{state.status='outside';state.fee=0;setStatus(`Este endereço fica a ${route.distanceKm.toFixed(2).replace('.',',')} km. Entregamos somente até ${max.toFixed(0)} km.`,'error');}
    setBusy(false);render();
  }
  async function calculateGps(){
    if(!state.enabled)return;
    if(!navigator.geolocation){state.status='error';setStatus('Este navegador não oferece localização. Digite o endereço e calcule por ele.','error');render();return;}
    const id=++state.requestId;state.status='calculating';setStatus('Obtendo sua localização…','loading');setBusy(true);render();
    navigator.geolocation.getCurrentPosition(async pos=>{
      if(id!==state.requestId)return;
      try{
        const lat=Number(pos.coords.latitude),lon=Number(pos.coords.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Localização inválida.');
        setStatus('Localização encontrada. Calculando a rota pelas ruas…','loading');
        let info={label:'',district:''};try{info=await reverseGeocode(lon,lat);}catch{}
        if(info.label&&els.address&&!els.address.value.trim())els.address.value=info.label;
        if(info.district&&els.district&&!els.district.value.trim())els.district.value=info.district;
        await finalize([lon,lat],'gps',info,id);
      }catch(e){if(id!==state.requestId)return;state.status='error';state.fee=0;setBusy(false);setStatus(e.message||'Não foi possível calcular a entrega.','error');render();}
    },err=>{
      if(id!==state.requestId)return;state.status='error';state.fee=0;setBusy(false);
      const msg=err?.code===1?'A localização foi negada. Permita o GPS ou calcule pelo endereço.':err?.code===3?'O GPS demorou demais. Tente novamente ou use o endereço.':'Não foi possível obter sua localização. Use o endereço manual.';
      setStatus(msg,'error');render();
    },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
  }
  async function calculateAddress(){
    if(!state.enabled)return;
    const address=els.address?.value.trim()||'';const district=els.district?.value.trim()||'';
    if(!address){els.address?.focus();setStatus('Digite rua e número antes de calcular.','error');return;}
    const id=++state.requestId;state.status='calculating';setStatus('Localizando o endereço e calculando a rota…','loading');setBusy(true);render();
    try{
      const query=[address,district,C.RESTAURANT_CITY,C.RESTAURANT_STATE,'Brasil'].filter(Boolean).join(', ');const found=await geocode(query);if(id!==state.requestId)return;
      await finalize(found.coords,'address',found,id);
    }catch(e){if(id!==state.requestId)return;state.status='error';state.fee=0;setBusy(false);setStatus(e.message||'Não foi possível calcular a entrega.','error');render();}
  }
  function validate(){
    if(!state.enabled)return {ok:true};
    if(state.status==='ready')return {ok:true};
    if(state.status==='outside')return {ok:false,message:`O endereço está fora da área de entrega de ${Number(C.DELIVERY_MAX_KM||3)} km.`};
    return {ok:false,message:'Calcule a distância da entrega antes de enviar o pedido.'};
  }
  els.gps?.addEventListener('click',calculateGps);els.addressCalc?.addEventListener('click',calculateAddress);els.address?.addEventListener('input',invalidateManual);els.district?.addEventListener('input',invalidateManual);
  window.deliveryService={setEnabled,reset,validate,getFee:()=>state.enabled&&state.status==='ready'?state.fee:0,getDistanceKm:()=>state.distanceKm,getDurationMin:()=>state.durationMin,getState:getPublicState,calculateGps,calculateAddress};
  render();
})();
