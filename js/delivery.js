(() => {
  'use strict';
  const C = window.APP_CONFIG || {};
  const money = new Intl.NumberFormat(C.LOCALE || 'pt-BR',{style:'currency',currency:C.CURRENCY || 'BRL'});
  const state={enabled:false,status:'idle',fee:0,distanceKm:null,durationMin:null,source:null,customerCoords:null,addressLabel:'',requestId:0};
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
    if(els.duration)els.duration.textContent=state.durationMin!=null?`${Math.max(1,Math.round(state.durationMin))} min`:'—';
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

  function edgeUrl(){
    const base=String(C.SUPABASE_URL||'').replace(/\/$/,'');
    const name=String(C.DELIVERY_FUNCTION_NAME||'calc-delivery').trim();
    if(!base||!name)throw new Error('Serviço de entrega não configurado.');
    return `${base}/functions/v1/${encodeURIComponent(name)}`;
  }
  async function callEdge(body){
    const key=String(C.SUPABASE_PUBLISHABLE_KEY||'').trim();
    if(!key)throw new Error('Chave pública do Supabase não configurada.');
    const response=await fetch(edgeUrl(),{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':key,'x-cantinho-client':'v23'},
      body:JSON.stringify(body)
    });
    let data=null;try{data=await response.json();}catch{}
    if(!response.ok||data?.ok===false){
      const code=data?.code||'';
      const publicMessage=data?.message||data?.error||'';
      if(code==='ORS_NOT_CONFIGURED')throw new Error('O cálculo de entrega ainda não foi ativado no servidor.');
      if(code==='ADDRESS_NOT_FOUND')throw new Error('Endereço não encontrado. Confira rua, número e bairro.');
      if(code==='ORIGIN_BLOCKED')throw new Error('Este site não está autorizado a usar o cálculo de entrega.');
      if(response.status===429)throw new Error('Muitas consultas de localização. Aguarde um pouco e tente novamente.');
      throw new Error(typeof publicMessage==='string'&&publicMessage?publicMessage:'Não foi possível calcular a entrega agora.');
    }
    if(!Number.isFinite(Number(data?.distanceKm)))throw new Error('O serviço não retornou uma distância válida.');
    return data;
  }

  function applyResult(data,source,requestId){
    if(requestId!==state.requestId)return;
    const distanceKm=Number(data.distanceKm),durationMin=Number(data.durationMin);
    state.source=source;state.distanceKm=distanceKm;state.durationMin=Number.isFinite(durationMin)?durationMin:null;state.addressLabel=String(data.label||'');
    if(Array.isArray(data.coords)&&data.coords.length===2)state.customerCoords=data.coords.map(Number);
    if(data.label&&els.address&&!els.address.value.trim())els.address.value=data.label;
    if(data.district&&els.district&&!els.district.value.trim())els.district.value=data.district;
    const max=Number(C.DELIVERY_MAX_KM||3);
    if(distanceKm<=max){state.status='ready';state.fee=Number(C.DELIVERY_FEE||0);setStatus(`Entrega disponível: ${distanceKm.toFixed(2).replace('.',',')} km. Taxa ${money.format(state.fee)}.`,'success');}
    else{state.status='outside';state.fee=0;setStatus(`Este endereço fica a ${distanceKm.toFixed(2).replace('.',',')} km. Entregamos somente até ${max.toFixed(0)} km.`,'error');}
    setBusy(false);render();
  }
  function fail(error,requestId){
    if(requestId!==state.requestId)return;
    state.status='error';state.fee=0;state.distanceKm=null;state.durationMin=null;setBusy(false);setStatus(error?.message||'Não foi possível calcular a entrega.','error');render();
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
        const data=await callEdge({action:'gps',lat,lon});
        applyResult(data,'gps',id);
      }catch(e){fail(e,id);}
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
    try{const data=await callEdge({action:'address',address,district});applyResult(data,'address',id);}catch(e){fail(e,id);}
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
