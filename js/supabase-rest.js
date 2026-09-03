(() => {
  const C = window.APP_CONFIG;

  class SupabaseRest {
    constructor() {
      this.sessionKey = 'cantinho_petisco_admin_session';
      this.persistenceKey = 'cantinho_petisco_admin_persistent';
      this.emailKey = 'cantinho_petisco_admin_email';
      this.dbName = 'cantinho_petisco_admin_auth_v1';
      this.dbStore = 'auth';
      this.memorySession = null;
    }

    setPersistentSession(enabled) {
      try {
        if (enabled) localStorage.setItem(this.persistenceKey, '1');
        else localStorage.removeItem(this.persistenceKey);
      } catch {}
    }

    isPersistentSession() {
      try { return localStorage.getItem(this.persistenceKey) === '1'; } catch { return false; }
    }

    rememberEmail(email) {
      try {
        if (email) localStorage.setItem(this.emailKey, email);
        else localStorage.removeItem(this.emailKey);
      } catch {}
    }

    getRememberedEmail() {
      try { return localStorage.getItem(this.emailKey) || ''; } catch { return ''; }
    }

    async requestPersistentStorage() {
      try {
        if (!navigator.storage?.persist) return false;
        if (await navigator.storage.persisted?.()) return true;
        return !!(await navigator.storage.persist());
      } catch { return false; }
    }

    openAuthDb() {
      return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return resolve(null);
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.dbStore)) db.createObjectStore(this.dbStore);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Falha ao abrir armazenamento local.'));
      });
    }

    async vaultSet(key, value) {
      try {
        const db = await this.openAuthDb();
        if (!db) return false;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(this.dbStore, 'readwrite');
          tx.objectStore(this.dbStore).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return true;
      } catch { return false; }
    }

    async vaultGet(key) {
      try {
        const db = await this.openAuthDb();
        if (!db) return null;
        const value = await new Promise((resolve, reject) => {
          const tx = db.transaction(this.dbStore, 'readonly');
          const req = tx.objectStore(this.dbStore).get(key);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return value;
      } catch { return null; }
    }

    async vaultDelete(key) {
      try {
        const db = await this.openAuthDb();
        if (!db) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(this.dbStore, 'readwrite');
          tx.objectStore(this.dbStore).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch {}
    }

    storeSession(session) {
      this.memorySession = session || null;
      try {
        if (!session) {
          sessionStorage.removeItem(this.sessionKey);
          localStorage.removeItem(this.sessionKey);
          this.vaultDelete(this.sessionKey);
          return;
        }
        const raw = JSON.stringify(session);
        if (this.isPersistentSession()) {
          localStorage.setItem(this.sessionKey, raw);
          sessionStorage.removeItem(this.sessionKey);
          this.vaultSet(this.sessionKey, session);
        } else {
          sessionStorage.setItem(this.sessionKey, raw);
          localStorage.removeItem(this.sessionKey);
          this.vaultDelete(this.sessionKey);
        }
      } catch {}
    }

    readStoredSession() {
      try {
        const localRaw = localStorage.getItem(this.sessionKey);
        if (localRaw) return JSON.parse(localRaw);
        const sessionRaw = sessionStorage.getItem(this.sessionKey);
        if (sessionRaw) return JSON.parse(sessionRaw);
      } catch {}
      return this.memorySession;
    }

    async restoreSession() {
      const direct = this.readStoredSession();
      if (direct) return direct;
      if (!this.isPersistentSession()) return null;
      const vaulted = await this.vaultGet(this.sessionKey);
      if (!vaulted) return null;
      this.memorySession = vaulted;
      try { localStorage.setItem(this.sessionKey, JSON.stringify(vaulted)); } catch {}
      return vaulted;
    }

    async hasSavedSession() {
      if (this.readStoredSession()) return true;
      if (!this.isPersistentSession()) return false;
      return !!(await this.vaultGet(this.sessionKey));
    }

    async clearSession({ clearPreference = false } = {}) {
      this.memorySession = null;
      try {
        sessionStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.sessionKey);
        if (clearPreference) localStorage.removeItem(this.persistenceKey);
      } catch {}
      await this.vaultDelete(this.sessionKey);
    }

    baseHeaders(token, extra = {}) {
      const headers = {
        apikey: C.SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        ...extra,
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
    }

    async request(path, options = {}) {
      const response = await fetch(`${C.SUPABASE_URL}${path}`, options);
      if (!response.ok) {
        let detail = '';
        let body = null;
        try {
          body = await response.json();
          detail = body.message || body.msg || body.error_description || body.error || JSON.stringify(body);
        } catch {
          detail = await response.text();
        }
        const err = new Error(detail || `Erro ${response.status}`);
        err.status = response.status;
        err.body = body;
        throw err;
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    async getPublicMenu() {
      if (C.DEMO_MODE) {
        const m = window.MOCK_MENU;
        return {
          categories: structuredClone(m.categories.filter(c => c.active)),
          products: structuredClone(m.products.filter(p => p.active)),
          daily_specials: structuredClone(m.daily_specials.filter(s => s.active)),
          product_option_groups: structuredClone((m.product_option_groups || []).filter(g => g.active !== false)),
          product_options: structuredClone((m.product_options || []).filter(o => o.active !== false)),
        };
      }
      const h = { headers: this.baseHeaders() };
      const [categories, products, daily_specials, product_option_groups, product_options] = await Promise.all([
        this.request('/rest/v1/categories?select=id,name,slug,description,sort_order,active&active=eq.true&order=sort_order.asc', h),
        this.request('/rest/v1/products?select=id,category_id,name,slug,size,description,price,image_path,active,available,featured,sort_order,allow_notes,notes_max_length&active=eq.true&order=sort_order.asc', h),
        this.request('/rest/v1/daily_specials?select=id,weekday,product_id,special_price,note,active&active=eq.true&order=weekday.asc', h),
        this.request('/rest/v1/product_option_groups?select=id,product_id,code,name,selection_type,required,min_selections,max_selections,sort_order,active&active=eq.true&order=sort_order.asc', h),
        this.request('/rest/v1/product_options?select=*&active=eq.true&order=sort_order.asc', h),
      ]);
      return { categories, products, daily_specials, product_option_groups, product_options };
    }

    async login(email, password) {
      if (C.DEMO_MODE) {
        if (email !== 'admin@demo.local' || password !== '123456') {
          throw new Error('No modo demonstração use admin@demo.local / 123456.');
        }
        const fake = { access_token: 'demo-token', refresh_token: 'demo-refresh', expires_at: Date.now() + 3600000, user: { email, id: 'demo-admin' } };
        this.storeSession(fake);
        return fake;
      }
      const data = await this.request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify({ email, password }),
      });
      const session = {
        ...data,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      };
      this.storeSession(session);
      return session;
    }

    getSession() {
      return this.readStoredSession() || null;
    }

    async ensureSession() {
      let session = await this.restoreSession();
      if (!session) return null;
      if (C.DEMO_MODE) return session;
      if ((session.expires_at || 0) - Date.now() > 60000) return session;
      if (!session.refresh_token) {
        await this.clearSession();
        return null;
      }
      try {
        const data = await this.request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: this.baseHeaders(),
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        session = { ...data, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
        this.storeSession(session);
        return session;
      } catch (err) {
        // Só apaga a sessão quando o Supabase confirma que a credencial não é mais válida.
        // Falha de rede/servidor não deve deslogar um PWA que estava lembrado.
        if (err?.status === 400 || err?.status === 401 || err?.status === 403) {
          await this.clearSession();
          return null;
        }
        const retry = new Error('Seu acesso continua salvo neste aparelho, mas não foi possível renovar a sessão agora. Verifique a internet e tente novamente.');
        retry.code = 'SAVED_SESSION_TEMPORARY_FAILURE';
        retry.cause = err;
        throw retry;
      }
    }

    async logout() {
      await this.clearSession();
    }

    async isAdmin() {
      const s = await this.ensureSession();
      if (!s) return false;
      if (C.DEMO_MODE) return true;
      try {
        const out = await this.request('/rest/v1/rpc/is_admin', {
          method: 'POST',
          headers: this.baseHeaders(s.access_token),
          body: '{}',
        });
        return out === true;
      } catch (err) {
        if (err?.status === 401 || err?.status === 403) {
          await this.clearSession();
          return false;
        }
        throw err;
      }
    }

    async adminGetAll() {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada. Entre novamente.');
      if (C.DEMO_MODE) {
        return {
          categories: structuredClone(window.MOCK_MENU.categories),
          products: structuredClone(window.MOCK_MENU.products),
          daily_specials: structuredClone(window.MOCK_MENU.daily_specials),
          product_option_groups: structuredClone(window.MOCK_MENU.product_option_groups || []),
          product_options: structuredClone(window.MOCK_MENU.product_options || []),
        };
      }
      const h = { headers: this.baseHeaders(s.access_token) };
      const [categories, products, daily_specials, product_option_groups, product_options] = await Promise.all([
        this.request('/rest/v1/categories?select=*&order=sort_order.asc', h),
        this.request('/rest/v1/products?select=*&order=sort_order.asc', h),
        this.request('/rest/v1/daily_specials?select=*&order=weekday.asc', h),
        this.request('/rest/v1/product_option_groups?select=*&order=sort_order.asc', h),
        this.request('/rest/v1/product_options?select=*&order=sort_order.asc', h),
      ]);
      return { categories, products, daily_specials, product_option_groups, product_options };
    }

    async saveProduct(product) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const row = { ...product, id: product.id || `demo-${Date.now()}` };
        const i = window.MOCK_MENU.products.findIndex(p => p.id === row.id);
        if (i >= 0) window.MOCK_MENU.products[i] = structuredClone(row); else window.MOCK_MENU.products.push(structuredClone(row));
        return row;
      }
      const { id, ...body } = product;
      if (id) {
        const rows = await this.request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }),
          body: JSON.stringify(body),
        });
        return rows?.[0] || null;
      }
      const rows = await this.request('/rest/v1/products', {
        method: 'POST',
        headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      });
      return rows?.[0] || null;
    }

    async deleteProduct(id) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) { window.MOCK_MENU.products = window.MOCK_MENU.products.filter(p => p.id !== id); return true; }
      await this.request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: this.baseHeaders(s.access_token)
      });
      return true;
    }

    async saveOptionGroup(group) {
      const session = await this.ensureSession();
      if (!session) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const row = { ...group, id: group.id || `demo-group-${Date.now()}-${Math.random().toString(36).slice(2,7)}` };
        window.MOCK_MENU.product_option_groups ||= [];
        const i = window.MOCK_MENU.product_option_groups.findIndex(g => g.id === row.id);
        if (i >= 0) window.MOCK_MENU.product_option_groups[i] = structuredClone(row); else window.MOCK_MENU.product_option_groups.push(structuredClone(row));
        return row;
      }
      const { id, ...body } = group;
      if (id) {
        const rows = await this.request(`/rest/v1/product_option_groups?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
        });
        return rows?.[0] || null;
      }
      const rows = await this.request('/rest/v1/product_option_groups', {
        method: 'POST', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
      });
      return rows?.[0] || null;
    }

    async saveOption(option) {
      const session = await this.ensureSession();
      if (!session) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const row = { ...option, id: option.id || `demo-option-${Date.now()}-${Math.random().toString(36).slice(2,7)}` };
        window.MOCK_MENU.product_options ||= [];
        const i = window.MOCK_MENU.product_options.findIndex(o => o.id === row.id);
        if (i >= 0) window.MOCK_MENU.product_options[i] = structuredClone(row); else window.MOCK_MENU.product_options.push(structuredClone(row));
        return row;
      }
      const { id, ...body } = option;
      if (id) {
        const rows = await this.request(`/rest/v1/product_options?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
        });
        return rows?.[0] || null;
      }
      const rows = await this.request('/rest/v1/product_options', {
        method: 'POST', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
      });
      return rows?.[0] || null;
    }

    async deleteOptionGroup(id) {
      const session = await this.ensureSession();
      if (!session) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const optionIds = new Set((window.MOCK_MENU.product_options || []).filter(o => o.group_id === id).map(o => o.id));
        window.MOCK_MENU.product_options = (window.MOCK_MENU.product_options || []).filter(o => !optionIds.has(o.id));
        window.MOCK_MENU.product_option_groups = (window.MOCK_MENU.product_option_groups || []).filter(g => g.id !== id);
        return true;
      }
      await this.request(`/rest/v1/product_option_groups?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.baseHeaders(session.access_token) });
      return true;
    }

    async deleteOption(id) {
      const session = await this.ensureSession();
      if (!session) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        window.MOCK_MENU.product_options = (window.MOCK_MENU.product_options || []).filter(o => o.id !== id);
        return true;
      }
      await this.request(`/rest/v1/product_options?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.baseHeaders(session.access_token) });
      return true;
    }

    async saveSpecial(special) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) {
        const row = { ...special, id: special.id || `special-${Date.now()}` };
        const i = window.MOCK_MENU.daily_specials.findIndex(x => x.id === row.id);
        if (i >= 0) window.MOCK_MENU.daily_specials[i] = structuredClone(row); else window.MOCK_MENU.daily_specials.push(structuredClone(row));
        return row;
      }
      const { id, ...body } = special;
      if (id) {
        const rows = await this.request(`/rest/v1/daily_specials?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
        });
        return rows?.[0] || null;
      }
      const rows = await this.request('/rest/v1/daily_specials', {
        method: 'POST', headers: this.baseHeaders(s.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
      });
      return rows?.[0] || null;
    }

    async deleteSpecial(id) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) { window.MOCK_MENU.daily_specials = window.MOCK_MENU.daily_specials.filter(x => x.id !== id); return true; }
      await this.request(`/rest/v1/daily_specials?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: this.baseHeaders(s.access_token)
      });
      return true;
    }

    async uploadProductImage(file) {
      const s = await this.ensureSession();
      if (!s) throw new Error('Sessão expirada.');
      if (!file) throw new Error('Selecione uma imagem.');
      if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Use imagem JPG, PNG ou WEBP.');
      if (C.DEMO_MODE) return null;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `products/${crypto.randomUUID()}.${ext}`;
      const response = await fetch(`${C.SUPABASE_URL}/storage/v1/object/${C.STORAGE_BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          apikey: C.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${s.access_token}`,
          'Content-Type': file.type,
          'x-upsert': 'false',
        },
        body: file,
      });
      if (!response.ok) {
        let msg = 'Falha ao enviar imagem.';
        try { msg = (await response.json()).message || msg; } catch {}
        throw new Error(msg);
      }
      return path;
    }

    publicImageUrl(path) {
      if (!path) return '';
      if (/^https?:\/\//i.test(path)) return path;
      return `${C.SUPABASE_URL}/storage/v1/object/public/${C.STORAGE_BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`;
    }


    paymentDefaults() {
      return { id: 1, pix_direct_enabled: false, pix_key_type: 'CNPJ', pix_key: '', pix_receiver_name: '', credit_machine_enabled: true, debit_machine_enabled: true, cash_enabled: true, _missing: false };
    }

    demoPaymentSettings() {
      const key = 'cantinho_demo_payment_settings_v27';
      try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && typeof saved === 'object') return { ...this.paymentDefaults(), ...saved }; } catch {}
      return { ...this.paymentDefaults(), pix_direct_enabled: true, pix_key: '12.345.678/0001-90', pix_receiver_name: 'Cantinho do Petisco', credit_machine_enabled: true, debit_machine_enabled: true, cash_enabled: true };
    }

    async getPublicPaymentSettings() {
      if (C.DEMO_MODE) return structuredClone(this.demoPaymentSettings());
      try {
        const fields = 'id,pix_direct_enabled,pix_key_type,pix_key,pix_receiver_name,credit_machine_enabled,debit_machine_enabled,cash_enabled';
        const rows = await this.request(`/rest/v1/payment_settings?id=eq.1&select=${fields}`, { headers: this.baseHeaders() });
        return { ...this.paymentDefaults(), ...(rows?.[0] || {}) };
      } catch (e) {
        if (e?.status === 404 || /payment_settings|relation|schema cache/i.test(String(e?.message || ''))) return { ...this.paymentDefaults(), _missing: true };
        throw e;
      }
    }

    async getPaymentSettings() {
      const session = await this.ensureSession(); if (!session) throw new Error('Sessão expirada.');
      if (C.DEMO_MODE) return structuredClone(this.demoPaymentSettings());
      const rows = await this.request('/rest/v1/payment_settings?id=eq.1&select=id,pix_direct_enabled,pix_key_type,pix_key,pix_receiver_name,credit_machine_enabled,debit_machine_enabled,cash_enabled', { headers: this.baseHeaders(session.access_token) });
      return { ...this.paymentDefaults(), ...(rows?.[0] || {}) };
    }

    async savePaymentSettings(settings) {
      const session = await this.ensureSession(); if (!session) throw new Error('Sessão expirada.');
      const body = { id: 1, pix_direct_enabled: !!settings.pix_direct_enabled, pix_key_type: settings.pix_key_type || 'CNPJ', pix_key: String(settings.pix_key || ''), pix_receiver_name: String(settings.pix_receiver_name || ''), credit_machine_enabled: settings.credit_machine_enabled !== false, debit_machine_enabled: settings.debit_machine_enabled !== false, cash_enabled: settings.cash_enabled !== false, updated_at: new Date().toISOString() };
      if (C.DEMO_MODE) { try { localStorage.setItem('cantinho_demo_payment_settings_v27', JSON.stringify(body)); } catch {} window.MOCK_PAYMENT_SETTINGS = structuredClone(body); return structuredClone(body); }
      const rows = await this.request('/rest/v1/payment_settings?id=eq.1', { method: 'PATCH', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
      if (rows?.[0]) return rows[0];
      const inserted = await this.request('/rest/v1/payment_settings', { method: 'POST', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
      return inserted?.[0] || null;
    }

    async getDeliverySettings() {
      if (C.DEMO_MODE) {
        window.MOCK_DELIVERY_SETTINGS ||= {
          id: 1, enabled: true, enforce_business_hours: false, max_distance_km: 3, minimum_order_value: null, free_delivery_over: null,
          estimated_minutes_min: 30, estimated_minutes_max: 50, blocked_districts: [],
          tiers: [{ up_to_km: 3, fee: 5 }],
          business_hours: {
            '0': { enabled: true, open: '11:00', close: '22:00' }, '1': { enabled: true, open: '11:00', close: '22:00' },
            '2': { enabled: true, open: '11:00', close: '22:00' }, '3': { enabled: true, open: '11:00', close: '22:00' },
            '4': { enabled: true, open: '11:00', close: '22:00' }, '5': { enabled: true, open: '11:00', close: '22:00' },
            '6': { enabled: true, open: '11:00', close: '22:00' }
          }
        };
        return structuredClone(window.MOCK_DELIVERY_SETTINGS);
      }
      const session = await this.ensureSession();
      if (!session) throw new Error('Sessão expirada.');
      const rows = await this.request('/rest/v1/delivery_settings?id=eq.1&select=*', { headers: this.baseHeaders(session.access_token) });
      return rows?.[0] || null;
    }

    async saveDeliverySettings(settings) {
      const session = await this.ensureSession();
      if (!session) throw new Error('Sessão expirada.');
      const body = { ...settings, id: 1, updated_at: new Date().toISOString() };
      if (C.DEMO_MODE) { window.MOCK_DELIVERY_SETTINGS = structuredClone(body); return structuredClone(body); }
      const rows = await this.request('/rest/v1/delivery_settings?id=eq.1', {
        method: 'PATCH', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
      });
      if (rows?.[0]) return rows[0];
      const inserted = await this.request('/rest/v1/delivery_settings', {
        method: 'POST', headers: this.baseHeaders(session.access_token, { Prefer: 'return=representation' }), body: JSON.stringify(body)
      });
      return inserted?.[0] || null;
    }

  }

  window.supabaseRest = new SupabaseRest();
})();
