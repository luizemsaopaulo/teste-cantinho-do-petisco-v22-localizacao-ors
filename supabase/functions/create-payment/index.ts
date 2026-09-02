// Cantinho do Petisco — V25
// Cria Checkout Integrado InfinitePay com valor recalculado no servidor.
// Não recebe nem expõe segredo da InfinitePay: a identificação pública é a InfiniteTag/handle.
// A função consulta preços/opções atuais no Supabase e recalcula a taxa de entrega antes de gerar o link.

const INFINITEPAY_LINKS_URL = 'https://api.checkout.infinitepay.io/links';
const ORS_BASE = 'https://api.heigit.org';
const RESTAURANT_COORDS: [number, number] = [-46.3526171, -23.055199];
const RESTAURANT_CITY = 'Piracaia';
const RESTAURANT_STATE = 'SP';
const ALLOWED_ORIGINS = new Set(['https://luizemsaopaulo.github.io']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : 'https://luizemsaopaulo.github.io',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-cantinho-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}
function json(origin: string | null, status: number, body: Record<string, unknown>) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }); }
function originAllowed(origin: string | null) { return !!origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)); }
function parsePublishableKeys() { const out = new Set<string>(); try { const obj = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'); for (const value of Object.values(obj)) if (typeof value === 'string') out.add(value); } catch {} const legacy = Deno.env.get('SUPABASE_ANON_KEY'); if (legacy) out.add(legacy); return out; }
function clientKeyAllowed(req: Request) { const allowed = parsePublishableKeys(); if (!allowed.size) return true; return allowed.has(req.headers.get('apikey') || ''); }
function fail(message: string, code = 'BAD_REQUEST', status = 400): never { throw Object.assign(new Error(message), { code, status }); }
function cents(value: unknown) { const n = Number(value); if (!Number.isFinite(n)) return null; return Math.round(n * 100); }
function clampInt(value: unknown, min: number, max: number) { const n = Math.trunc(Number(value)); if (!Number.isFinite(n)) return min; return Math.max(min, Math.min(max, n)); }
function normalizeText(v: unknown) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }

function supabaseEnv() {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) fail('Servidor sem acesso ao banco.', 'SUPABASE_SERVER_CONFIG', 503);
  return { url, key };
}
async function db(path: string) {
  const { url, key } = supabaseEnv();
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  let data: any = null; try { data = await r.json(); } catch {}
  if (!r.ok) fail('Não foi possível validar o pedido no banco.', 'DB_ERROR', 503);
  return data;
}
function inFilter(ids: string[]) { return `in.(${ids.join(',')})`; }

async function getPaymentSettings() {
  const rows = await db('payment_settings?id=eq.1&select=*');
  const s = rows?.[0];
  if (!s) fail('As formas de pagamento ainda não foram configuradas.', 'PAYMENT_NOT_CONFIGURED', 503);
  s.infinitepay_handle = String(s.infinitepay_handle || '').trim().replace(/^[$@]+/, '');
  return s;
}

async function validateAndPriceCart(rawCart: any[]) {
  if (!Array.isArray(rawCart) || rawCart.length < 1 || rawCart.length > 80) fail('Carrinho inválido.', 'BAD_CART');
  const cart = rawCart.map((line: any) => {
    const product_id = String(line?.product_id || '');
    if (!UUID_RE.test(product_id)) fail('Produto inválido no carrinho.', 'BAD_PRODUCT');
    const qty = clampInt(line?.qty, 1, 99);
    const options = Array.isArray(line?.options) ? line.options.slice(0, 120).map((o: any) => {
      const option_id = String(o?.option_id || ''); if (!UUID_RE.test(option_id)) fail('Adicional inválido no carrinho.', 'BAD_OPTION');
      return { option_id, quantity: clampInt(o?.quantity, 1, 99) };
    }) : [];
    return { product_id, qty, options };
  });
  const productIds = [...new Set(cart.map(x => x.product_id))];
  const products = await db(`products?id=${encodeURIComponent(inFilter(productIds))}&select=id,name,size,price,active,available`);
  const productMap = new Map((products || []).map((p: any) => [p.id, p]));
  for (const id of productIds) { const p = productMap.get(id); if (!p || p.active === false || p.available === false || p.price == null) fail('Um produto do carrinho ficou indisponível ou mudou de preço. Revise o pedido.', 'PRODUCT_CHANGED', 409); }

  const groups = await db(`product_option_groups?product_id=${encodeURIComponent(inFilter(productIds))}&select=id,product_id,name,selection_type,required,min_selections,max_selections,sort_order,active&order=sort_order.asc`);
  const groupMap = new Map((groups || []).map((g: any) => [g.id, g]));
  const groupsByProduct = new Map<string, any[]>();
  for (const g of groups || []) { if (g.active === false) continue; if (!groupsByProduct.has(g.product_id)) groupsByProduct.set(g.product_id, []); groupsByProduct.get(g.product_id)!.push(g); }

  const optionIds = [...new Set(cart.flatMap(x => x.options.map(o => o.option_id)))];
  let options: any[] = [];
  if (optionIds.length) options = await db(`product_options?id=${encodeURIComponent(inFilter(optionIds))}&select=id,group_id,name,price_mode,price_value,is_none_option,sort_order,active,allow_quantity,max_quantity&order=sort_order.asc`);
  const optionMap = new Map((options || []).map((o: any) => [o.id, o]));

  const pricedItems: { quantity: number, price: number, description: string }[] = [];
  let subtotalCents = 0;
  for (const line of cart) {
    const p: any = productMap.get(line.product_id);
    const selectedByGroup = new Map<string, any[]>();
    const seenOptionIds = new Set<string>();
    for (const selected of line.options) {
      if (seenOptionIds.has(selected.option_id)) fail('A mesma opção não pode aparecer duplicada no item.', 'DUPLICATE_OPTION');
      seenOptionIds.add(selected.option_id);
      const o: any = optionMap.get(selected.option_id);
      if (!o || o.active === false) fail('Uma opção do carrinho ficou indisponível. Revise o pedido.', 'OPTION_CHANGED', 409);
      const g: any = groupMap.get(o.group_id);
      if (!g || g.active === false || g.product_id !== line.product_id) fail('Uma opção não pertence mais a este produto.', 'OPTION_CHANGED', 409);
      if (!selectedByGroup.has(g.id)) selectedByGroup.set(g.id, []);
      selectedByGroup.get(g.id)!.push({ ...o, quantity: selected.quantity });
    }
    for (const g of groupsByProduct.get(line.product_id) || []) {
      const picked = selectedByGroup.get(g.id) || [];
      const min = g.min_selections == null ? (g.required ? 1 : 0) : Math.max(0, Number(g.min_selections) || 0);
      const max = g.selection_type === 'single' ? 1 : (g.max_selections == null ? null : Math.max(0, Number(g.max_selections) || 0));
      if (picked.length < min || (max != null && picked.length > max)) fail(`As escolhas de “${g.name}” precisam ser revisadas.`, 'OPTION_SELECTION_CHANGED', 409);
      if (g.selection_type === 'single' && picked.length > 1) fail(`Escolha apenas uma opção em “${g.name}”.`, 'OPTION_SELECTION_CHANGED', 409);
    }
    let unitCents = cents(p.price); if (unitCents == null || unitCents < 0) fail('Preço inválido no cadastro do produto.', 'BAD_PRICE', 503);
    const selectedOrdered = [...selectedByGroup.entries()].sort((a,b) => Number(groupMap.get(a[0])?.sort_order || 0) - Number(groupMap.get(b[0])?.sort_order || 0)).flatMap(([,arr]) => arr.sort((a,b) => Number(a.sort_order||0)-Number(b.sort_order||0)));
    const setter = selectedOrdered.find((o: any) => o.price_mode === 'set');
    if (setter) { const c = cents(setter.price_value); if (c == null || c < 0) fail('Preço de opção inválido.', 'BAD_PRICE', 503); unitCents = c; }
    const optionNames: string[] = [];
    for (const o of selectedOrdered) {
      let q = 1;
      if (o.price_mode === 'add' && o.allow_quantity === true && o.is_none_option !== true) { q = clampInt(o.quantity, 1, o.max_quantity == null ? 99 : Math.max(1, Number(o.max_quantity) || 1)); }
      if (o.price_mode === 'add') { const c = cents(o.price_value); if (c == null || c < 0) fail('Preço de adicional inválido.', 'BAD_PRICE', 503); unitCents += c * q; }
      optionNames.push(`${q > 1 ? `${q}x ` : ''}${String(o.name || '').slice(0,80)}`);
    }
    const description = [String(p.name || 'Produto'), p.size ? `(${String(p.size)})` : '', optionNames.length ? `— ${optionNames.join(', ')}` : ''].filter(Boolean).join(' ').slice(0, 255);
    pricedItems.push({ quantity: line.qty, price: unitCents, description });
    subtotalCents += unitCents * line.qty;
  }
  return { pricedItems, subtotalCents };
}

async function ors(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('ORS_API_KEY'); if (!key) fail('Serviço de rota não configurado.', 'ORS_NOT_CONFIGURED', 503);
  const r = await fetch(`${ORS_BASE}${path}`, { ...init, headers: { Authorization: key, ...(init.headers || {}) } });
  let data: any = null; try { data = await r.json(); } catch {}
  if (!r.ok) fail('Serviço de rota temporariamente indisponível.', 'ORS_ERROR', r.status === 429 ? 429 : 502);
  return data;
}
function validCoords(lon: unknown, lat: unknown): [number, number] | null { const x = Number(lon), y = Number(lat); if (!Number.isFinite(x) || !Number.isFinite(y) || x < -54 || x > -43 || y < -26 || y > -19) return null; return [x,y]; }
function addressProps(feature: any) { const p = feature?.properties || {}; return { label: p.label || p.name || '', district: p.neighbourhood || p.borough || p.locality || p.localadmin || '' }; }
async function geocodeAddress(address: string, district = '') { const safeAddress = address.trim().slice(0,180), safeDistrict = district.trim().slice(0,80); if (!safeAddress) fail('Confirme o endereço da entrega.', 'ADDRESS_REQUIRED'); const text = [safeAddress, safeDistrict, RESTAURANT_CITY, RESTAURANT_STATE, 'Brasil'].filter(Boolean).join(', '); const q = new URLSearchParams({ text, size:'1', 'boundary.country':'BR' }); const data = await ors(`/pelias/v1/search?${q}`); const f=data?.features?.[0], c=f?.geometry?.coordinates, coords=Array.isArray(c)?validCoords(c[0],c[1]):null; if(!coords) fail('Endereço não encontrado. Confira rua, número e bairro.', 'ADDRESS_NOT_FOUND',404); return { coords, ...addressProps(f) }; }
async function reverse(lon: number, lat: number) { const q=new URLSearchParams({'point.lon':String(lon),'point.lat':String(lat),size:'1'}); try{const data=await ors(`/pelias/v1/reverse?${q}`),f=data?.features?.[0];return f?addressProps(f):{label:'',district:''};}catch{return {label:'',district:''};} }
async function routeToCustomer(customer: [number,number]) { const data=await ors('/openrouteservice/v2/directions/driving-car/geojson',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/geo+json'},body:JSON.stringify({coordinates:[RESTAURANT_COORDS,customer],instructions:false})}); const meters=Number(data?.features?.[0]?.properties?.summary?.distance); if(!Number.isFinite(meters)) fail('Rota sem distância válida.','ROUTE_INVALID',502); return meters/1000; }
function nowSP(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const weekday=parts.find(p=>p.type==='weekday')?.value||'Mon',hour=parts.find(p=>p.type==='hour')?.value||'00',minute=parts.find(p=>p.type==='minute')?.value||'00';const dayMap:any={Sun:'0',Mon:'1',Tue:'2',Wed:'3',Thu:'4',Fri:'5',Sat:'6'};return {day:dayMap[weekday]||'1',time:`${hour}:${minute}`};}
function timeInWindow(now:string,open:string,close:string){if(!open||!close||open===close)return true;if(open<close)return now>=open&&now<=close;return now>=open||now<=close;}
async function getDeliverySettings(){const rows=await db('delivery_settings?id=eq.1&select=*');const s=rows?.[0]||{};return {enabled:s.enabled!==false,enforce_business_hours:!!s.enforce_business_hours,max_distance_km:Math.max(.1,Number(s.max_distance_km)||3),minimum_order_value:s.minimum_order_value==null?null:Math.max(0,Number(s.minimum_order_value)||0),free_delivery_over:s.free_delivery_over==null?null:Math.max(0,Number(s.free_delivery_over)||0),blocked_districts:Array.isArray(s.blocked_districts)?s.blocked_districts.map(String):[],tiers:(Array.isArray(s.tiers)?s.tiers:[{up_to_km:3,fee:5}]).map((t:any)=>({up_to_km:Number(t.up_to_km),fee:Number(t.fee)})).filter((t:any)=>Number.isFinite(t.up_to_km)&&Number.isFinite(t.fee)).sort((a:any,b:any)=>a.up_to_km-b.up_to_km),business_hours:s.business_hours||{}};}
function calculateDeliveryFee(s:any,distanceKm:number,district:string,subtotalCents:number){const subtotal=subtotalCents/100;if(!s.enabled)fail('O delivery está temporariamente desativado.','DELIVERY_DISABLED',409);if(s.enforce_business_hours){const n=nowSP(),h=s.business_hours?.[n.day];if(!h?.enabled||!timeInWindow(n.time,String(h.open||''),String(h.close||'')))fail('O delivery está fechado neste horário.','DELIVERY_CLOSED',409);}if(s.minimum_order_value!=null&&subtotal+1e-9<s.minimum_order_value)fail(`Pedido mínimo para entrega: R$ ${s.minimum_order_value.toFixed(2).replace('.',',')}.`,'MINIMUM_ORDER',409);const nd=normalizeText(district);if(nd&&s.blocked_districts.some((x:string)=>normalizeText(x)===nd))fail('Este bairro está fora da área de entrega.','DISTRICT_BLOCKED',409);if(distanceKm>s.max_distance_km+1e-9)fail(`Entregamos somente até ${s.max_distance_km.toFixed(1).replace('.',',')} km.`,'OUTSIDE_DISTANCE',409);const tier=s.tiers.find((t:any)=>distanceKm<=t.up_to_km+1e-9);if(!tier)fail('Não há taxa configurada para esta distância.','NO_TIER',409);let feeCents=Math.round(Math.max(0,Number(tier.fee)||0)*100);if(s.free_delivery_over!=null&&subtotal>=s.free_delivery_over)feeCents=0;return feeCents;}
async function serverDeliveryFee(delivery:any,subtotalCents:number){let coords:[number,number],district='';const address=String(delivery?.address||'').trim(),districtInput=String(delivery?.district||'').trim();if(address){const found=await geocodeAddress(address,districtInput);coords=found.coords;district=found.district||districtInput;}else if(Array.isArray(delivery?.coords)&&delivery.coords.length===2){const c=validCoords(delivery.coords[0],delivery.coords[1]);if(!c)fail('Localização inválida.','BAD_COORDS');coords=c;const rev=await reverse(c[0],c[1]);district=rev.district||districtInput;}else fail('Confirme a localização/endereço da entrega.','DELIVERY_LOCATION_REQUIRED');const distanceKm=await routeToCustomer(coords);const settings=await getDeliverySettings();const feeCents=calculateDeliveryFee(settings,distanceKm,district,subtotalCents);return {feeCents,distanceKm};}

function validateRedirect(raw:string,origin:string){try{const u=new URL(raw);if(u.origin!==origin)fail('URL de retorno não autorizada.','BAD_REDIRECT');return u.toString();}catch(e){if((e as any)?.code)throw e;fail('URL de retorno inválida.','BAD_REDIRECT');}}
function orderNsu(){return `cantinho-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;}

Deno.serve(async (req) => {
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS'){if(!originAllowed(origin))return json(origin,403,{ok:false,code:'ORIGIN_BLOCKED',message:'Origem não autorizada.'});return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=='POST')return json(origin,405,{ok:false,code:'METHOD_NOT_ALLOWED',message:'Use POST.'});
  if(!originAllowed(origin))return json(origin,403,{ok:false,code:'ORIGIN_BLOCKED',message:'Origem não autorizada.'});
  if(!clientKeyAllowed(req))return json(origin,401,{ok:false,code:'BAD_CLIENT_KEY',message:'Cliente não autorizado.'});
  try{
    const body=await req.json();
    const intent=String(body?.payment_intent||'');
    if(!['pix','credit_card'].includes(intent))fail('Forma de pagamento online inválida.','BAD_PAYMENT_METHOD');
    const settings=await getPaymentSettings();
    if(!settings.infinitepay_enabled||!settings.infinitepay_handle)fail('InfinitePay não está configurada no estabelecimento.','INFINITEPAY_DISABLED',409);
    if(intent==='credit_card'&&!settings.credit_online_enabled)fail('Cartão de crédito online está desativado.','CREDIT_DISABLED',409);
    const {pricedItems,subtotalCents}=await validateAndPriceCart(body?.cart);
    const fulfillment=String(body?.fulfillment||'Retirada');
    let deliveryFeeCents=0; let distanceKm:number|null=null;
    if(fulfillment==='Entrega'){const d=await serverDeliveryFee(body?.delivery||{},subtotalCents);deliveryFeeCents=d.feeCents;distanceKm=d.distanceKm;}
    else if(fulfillment!=='Retirada')fail('Forma de recebimento inválida.','BAD_FULFILLMENT');
    const totalCents=subtotalCents+deliveryFeeCents;
    const expectedCents=cents(body?.expected_total);
    if(expectedCents==null||Math.abs(expectedCents-totalCents)>1)fail('O valor do pedido mudou. Revise o carrinho antes de pagar.','TOTAL_MISMATCH',409);
    const redirectUrl=validateRedirect(String(body?.redirect_url||''),origin!);
    const items=[...pricedItems];if(deliveryFeeCents>0)items.push({quantity:1,price:deliveryFeeCents,description:'Taxa de entrega'});
    const order_nsu=orderNsu();
    const payload:any={handle:settings.infinitepay_handle,redirect_url:redirectUrl,order_nsu,items};
    const customerName=String(body?.customer?.name||'').trim().slice(0,120);if(customerName)payload.customer={name:customerName};
    const r=await fetch(INFINITEPAY_LINKS_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    let data:any=null;try{data=await r.json();}catch{}
    if(!r.ok||!data?.url)fail(data?.message||data?.error||'A InfinitePay não conseguiu criar o checkout.','INFINITEPAY_ERROR',r.status>=400&&r.status<600?r.status:502);
    if(!/^https:\/\/checkout\.infinitepay\.com\.br\//i.test(String(data.url)))fail('A InfinitePay retornou um endereço de checkout inesperado.','INFINITEPAY_INVALID_URL',502);
    return json(origin,200,{ok:true,url:data.url,order_nsu,total_cents:totalCents,subtotal_cents:subtotalCents,delivery_fee_cents:deliveryFeeCents,distance_km:distanceKm});
  }catch(e:any){const status=Number(e?.status)||500,code=String(e?.code||'SERVER_ERROR');return json(origin,status,{ok:false,code,message:String(e?.message||'Erro interno ao preparar pagamento.')});}
});
