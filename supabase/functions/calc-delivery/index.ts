// Cantinho do Petisco — V23
// Proxy seguro: ORS_API_KEY vive somente nos Secrets do Supabase.

const ORS_BASE = 'https://api.heigit.org';
const RESTAURANT_ADDRESS = 'Avenida Joao de Moraes Goes, 255, Box 06, Centro, Piracaia - SP, 12970-000, Brasil';
const RESTAURANT_CITY = 'Piracaia';
const RESTAURANT_STATE = 'SP';
const ALLOWED_ORIGINS = new Set(['https://luizemsaopaulo.github.io']);
let restaurantCoordsCache: [number, number] | null = null;

function cors(origin: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : 'https://luizemsaopaulo.github.io',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-cantinho-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
}
function json(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}
function originAllowed(origin: string | null) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function finite(n: unknown) { return Number.isFinite(Number(n)); }
function validCoords(lon: unknown, lat: unknown): [number, number] | null {
  if (!finite(lon) || !finite(lat)) return null;
  const x = Number(lon), y = Number(lat);
  if (x < -180 || x > 180 || y < -90 || y > 90) return null;
  // Área ampla ao redor do estado de SP; impede usar esta função como roteador genérico mundial.
  if (x < -54 || x > -43 || y < -26 || y > -19) return null;
  return [x, y];
}
function parsePublishableKeys() {
  const out = new Set<string>();
  try {
    const obj = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    for (const value of Object.values(obj)) if (typeof value === 'string') out.add(value);
  } catch {}
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) out.add(legacy);
  return out;
}
function clientKeyAllowed(req: Request) {
  const allowed = parsePublishableKeys();
  if (!allowed.size) return true; // compatibilidade com projetos antigos que não expõem a variável nova.
  const supplied = req.headers.get('apikey') || '';
  return allowed.has(supplied);
}
async function ors(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('ORS_API_KEY');
  if (!key) throw Object.assign(new Error('ORS_API_KEY não configurada.'), { code: 'ORS_NOT_CONFIGURED', status: 503 });
  const r = await fetch(`${ORS_BASE}${path}`, {
    ...init,
    headers: { Authorization: key, ...(init.headers || {}) }
  });
  let data: any = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const detail = data?.error?.message || data?.message || data?.error || `ORS ${r.status}`;
    throw Object.assign(new Error(typeof detail === 'string' ? detail : 'Falha no OpenRouteService.'), { code: 'ORS_ERROR', status: r.status === 429 ? 429 : 502 });
  }
  return data;
}
function addressProps(feature: any) {
  const p = feature?.properties || {};
  return { label: p.label || p.name || '', district: p.neighbourhood || p.borough || p.locality || p.localadmin || '' };
}
async function geocodeAddress(address: string, district = '') {
  const safeAddress = address.trim().slice(0, 180);
  const safeDistrict = district.trim().slice(0, 80);
  if (!safeAddress) throw Object.assign(new Error('Digite um endereço.'), { code: 'ADDRESS_REQUIRED', status: 400 });
  const text = [safeAddress, safeDistrict, RESTAURANT_CITY, RESTAURANT_STATE, 'Brasil'].filter(Boolean).join(', ');
  const q = new URLSearchParams({ text, size: '1', 'boundary.country': 'BR' });
  const data = await ors(`/pelias/v1/search?${q}`);
  const f = data?.features?.[0];
  const c = f?.geometry?.coordinates;
  const coords = Array.isArray(c) ? validCoords(c[0], c[1]) : null;
  if (!coords) throw Object.assign(new Error('Endereço não encontrado.'), { code: 'ADDRESS_NOT_FOUND', status: 404 });
  return { coords, ...addressProps(f) };
}
async function reverse(lon: number, lat: number) {
  const q = new URLSearchParams({ 'point.lon': String(lon), 'point.lat': String(lat), size: '1' });
  try {
    const data = await ors(`/pelias/v1/reverse?${q}`);
    const f = data?.features?.[0];
    return f ? addressProps(f) : { label: '', district: '' };
  } catch {
    return { label: '', district: '' };
  }
}
async function restaurantCoords(): Promise<[number, number]> {
  if (restaurantCoordsCache) return restaurantCoordsCache;
  const q = new URLSearchParams({ text: RESTAURANT_ADDRESS, size: '1', 'boundary.country': 'BR' });
  const data = await ors(`/pelias/v1/search?${q}`);
  const c = data?.features?.[0]?.geometry?.coordinates;
  const coords = Array.isArray(c) ? validCoords(c[0], c[1]) : null;
  if (!coords) throw Object.assign(new Error('Não foi possível localizar o restaurante.'), { code: 'RESTAURANT_NOT_FOUND', status: 502 });
  restaurantCoordsCache = coords;
  return coords;
}
async function routeToCustomer(customer: [number, number]) {
  const origin = await restaurantCoords();
  const data = await ors('/openrouteservice/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
    body: JSON.stringify({ coordinates: [origin, customer], instructions: false })
  });
  const summary = data?.features?.[0]?.properties?.summary;
  const meters = Number(summary?.distance), seconds = Number(summary?.duration || 0);
  if (!Number.isFinite(meters)) throw Object.assign(new Error('Rota sem distância válida.'), { code: 'ROUTE_INVALID', status: 502 });
  return { distanceKm: meters / 1000, durationMin: Number.isFinite(seconds) ? seconds / 60 : null };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) return json(origin, 403, { ok: false, code: 'ORIGIN_BLOCKED', message: 'Origem não autorizada.' });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== 'POST') return json(origin, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
  if (!originAllowed(origin)) return json(origin, 403, { ok: false, code: 'ORIGIN_BLOCKED', message: 'Origem não autorizada.' });
  if (!clientKeyAllowed(req)) return json(origin, 401, { ok: false, code: 'BAD_CLIENT_KEY', message: 'Cliente não autorizado.' });

  try {
    const body = await req.json();
    const action = String(body?.action || '');
    let coords: [number, number];
    let info = { label: '', district: '' };

    if (action === 'gps') {
      const c = validCoords(body?.lon, body?.lat);
      if (!c) return json(origin, 400, { ok: false, code: 'BAD_COORDS', message: 'Coordenadas inválidas.' });
      coords = c;
      const [route, reverseInfo] = await Promise.all([routeToCustomer(coords), reverse(coords[0], coords[1])]);
      return json(origin, 200, { ok: true, coords, ...reverseInfo, ...route });
    }

    if (action === 'address') {
      const found = await geocodeAddress(String(body?.address || ''), String(body?.district || ''));
      coords = found.coords;
      info = { label: found.label, district: found.district };
      const route = await routeToCustomer(coords);
      return json(origin, 200, { ok: true, coords, ...info, ...route });
    }

    return json(origin, 400, { ok: false, code: 'BAD_ACTION', message: 'Ação inválida.' });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    const code = String(e?.code || 'SERVER_ERROR');
    const safeMessage = code === 'ORS_NOT_CONFIGURED' ? 'Serviço de rota não configurado.' : code === 'ORS_ERROR' ? 'Serviço de rota temporariamente indisponível.' : (e?.message || 'Erro interno.');
    return json(origin, status, { ok: false, code, message: safeMessage });
  }
});
