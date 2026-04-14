const rawConfiguredUrl = import.meta.env.VITE_LIVE_SERVER_URL as string | undefined;

function normalizeUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getLiveServerUrl() {
  if (rawConfiguredUrl && rawConfiguredUrl.trim()) {
    return normalizeUrl(rawConfiguredUrl.trim());
  }

  const { protocol, hostname, origin } = window.location;

  // Local dev: frontend em 8080 e live server em 8082.
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const localProtocol = protocol === "https:" ? "https:" : "http:";
    return `${localProtocol}//${hostname}:8082`;
  }

  // Producao em container unico: usa mesma origem (Traefik/EasyPanel faz proxy para a porta interna).
  return normalizeUrl(origin);
}
