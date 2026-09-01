window.APP_CONFIG = Object.freeze({
  RESTAURANT_NAME: 'Cantinho do Petisco',
  WHATSAPP_NUMBER: '5511947406124',
  SUPABASE_URL: 'https://ubhxzrfhokzkdndjlrwt.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_r35TmLO8isOzUJz9lwXpFA_eQ9AnHzu',
  STORAGE_BUCKET: 'product-images',
  DEMO_MODE: new URLSearchParams(location.search).has('demo') || window.__FORCE_DEMO__ === true,
  CURRENCY: 'BRL',
  LOCALE: 'pt-BR',
  TIME_ZONE: 'America/Sao_Paulo',
  DELIVERY_HIDDEN_CATEGORY_SLUGS: Object.freeze(['pratos-executivos', 'cervejas', 'bebidas-alcoolicas']),

  // V23 — a chave do OpenRouteService NÃO fica no frontend.
  // O navegador chama a Edge Function do Supabase; só a função conhece ORS_API_KEY.
  DELIVERY_FUNCTION_NAME: 'calc-delivery',
  DELIVERY_MAX_KM: 3,
  DELIVERY_FEE: 5
});
