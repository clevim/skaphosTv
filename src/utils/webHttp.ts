/**
 * webHttp.ts — adaptações necessárias APENAS no build web (Docker/navegador).
 *
 * 1) Proxy same-origin: no navegador, requisições diretas às APIs IPTV/Xtream/
 *    Jellyfin/TMDB são bloqueadas por CORS. O container web já expõe um relay em
 *    `/proxy?url=<destino>` (nginx → proxy-server.js). Um interceptor do axios
 *    reescreve toda URL http(s) absoluta para passar por esse relay. Os streams
 *    de vídeo já fazem isso por conta própria em Video.web.tsx.
 *
 * 2) Alert: `Alert.alert` do react-native-web é um no-op (não renderiza nada),
 *    então erros e confirmações sumiam silenciosamente. Aqui ele é redirecionado
 *    para window.alert/confirm, preservando os callbacks dos botões.
 *
 * Em nativo (Android/TV) este módulo é um no-op — só roda quando Platform.OS === 'web'.
 */
import axios from 'axios';
import { Alert, Platform } from 'react-native';

// Base do proxy CORS. Default: same-origin /proxy. Igual ao usado em Video.web.tsx.
// Defina EXPO_PUBLIC_PROXY_URL='' para desabilitar (ex.: dev sem proxy).
const PROXY_BASE = process.env.EXPO_PUBLIC_PROXY_URL ?? '/proxy';

/** Dobra os `params` do axios na própria URL e a envelopa no relay /proxy. */
function proxify(url: string, params?: Record<string, any>): string {
  let full = url;
  if (params) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach(v => usp.append(key, String(v)));
      else usp.append(key, String(value));
    }
    const qs = usp.toString();
    if (qs) full += (full.includes('?') ? '&' : '?') + qs;
  }
  return `${PROXY_BASE}?url=${encodeURIComponent(full)}`;
}

if (Platform.OS === 'web') {
  if (PROXY_BASE) {
    axios.interceptors.request.use((config) => {
      const url = config.url ?? '';
      // Só envelopa URLs absolutas http(s) que ainda não passam pelo proxy.
      if (!/^https?:\/\//i.test(url)) return config;
      if (url.startsWith(PROXY_BASE)) return config;
      config.url = proxify(url, config.params);
      // params já foram dobrados na URL; evitar que o axios os anexe depois ao /proxy.
      config.params = undefined;
      return config;
    });
  }

  // Polyfill do Alert para o navegador. Cobre todos os call sites de uma vez.
  Alert.alert = ((title?: string, message?: string, buttons?: any[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (buttons && buttons.length >= 2) {
      const cancel = buttons.find(b => b.style === 'cancel');
      const confirm = buttons.find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];
      // eslint-disable-next-line no-alert
      const ok = window.confirm(text);
      const chosen = ok ? confirm : cancel;
      chosen?.onPress?.();
    } else {
      // eslint-disable-next-line no-alert
      window.alert(text);
      buttons?.[0]?.onPress?.();
    }
  }) as typeof Alert.alert;
}
