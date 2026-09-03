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

  // V24 — chave ORS oculta na Edge Function; regras de taxa/distância vêm do Supabase.
  DELIVERY_FUNCTION_NAME: 'calc-delivery'
});
