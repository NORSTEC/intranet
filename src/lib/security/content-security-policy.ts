type ContentSecurityPolicyInput = {
  development: boolean;
  nonce: string;
  supabaseOrigin: string;
};

export function contentSecurityPolicy({
  development,
  nonce,
  supabaseOrigin,
}: ContentSecurityPolicyInput) {
  const supabaseWebSocketOrigin = supabaseOrigin.replace(/^http/, "ws");
  const imageSources = ["'self'", "data:", "blob:", supabaseOrigin].filter(
    Boolean,
  );
  const connectionSources = [
    "'self'",
    supabaseOrigin,
    supabaseWebSocketOrigin,
    "https://www.recaptcha.net",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.recaptcha.net/recaptcha/ https://www.gstatic.com/recaptcha/${
      development ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectionSources.join(" ")}`,
    "frame-src https://www.recaptcha.net/recaptcha/ https://recaptcha.google.com/recaptcha/",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
