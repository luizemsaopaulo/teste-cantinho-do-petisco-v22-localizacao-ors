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

  // V22 — localização e taxa de entrega com OpenRouteService/HeiGIT.
  // A posição GPS é obtida pelo navegador. A API calcula a rota real de carro.
  OPENROUTESERVICE_API_KEY: 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjFkNDQzYTRhMzI4YTQ2YjVhYTcyNTk2MzlmNzY1MmE4IiwiaCI6Im11cm11cjY0In0=',
  OPENROUTESERVICE_BASE_URL: 'https://api.heigit.org',
  RESTAURANT_ADDRESS: 'Avenida Joao de Moraes Goes, 255, Box 06, Centro, Piracaia - SP, 12970-000, Brasil',
  RESTAURANT_CITY: 'Piracaia',
  RESTAURANT_STATE: 'SP',
  DELIVERY_MAX_KM: 3,
  DELIVERY_FEE: 5
});
