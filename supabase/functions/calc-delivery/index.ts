// V22 — proxy opcional para esconder a chave ORS do frontend.
// Para usar: salve ORS_API_KEY como Secret no Supabase e altere o frontend para chamar esta função.
const corsHeaders={
  'Access-Control-Allow-Origin':'https://luizemsaopaulo.github.io',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const key=Deno.env.get('ORS_API_KEY');if(!key)throw new Error('ORS_API_KEY não configurada.');
    const {coordinates}=await req.json();
    if(!Array.isArray(coordinates)||coordinates.length!==2)throw new Error('coordinates inválido.');
    const r=await fetch('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson',{method:'POST',headers:{Authorization:key,'Content-Type':'application/json','Accept':'application/geo+json'},body:JSON.stringify({coordinates,instructions:false})});
    const data=await r.text();return new Response(data,{status:r.status,headers:{...corsHeaders,'Content-Type':r.headers.get('content-type')||'application/json'}});
  }catch(e){return new Response(JSON.stringify({error:String(e?.message||e)}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});}
});
