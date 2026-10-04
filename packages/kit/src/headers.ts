export interface SecurityHeaderOptions {
  isDev?: boolean;
  /** Origins allowed to frame the app (embeddable widgets); default: no framing. */
  frameAncestors?: string[];
  connectSrc?: string[];
  frameSrc?: string[];
  scriptSrc?: string[];
  imgSrc?: string[];
  formAction?: string[];
}

/**
 * Security headers for next.config `headers()`. The CSP keeps 'unsafe-inline' for scripts because
 * Next.js injects inline bootstrap scripts; nonces would force every page to render dynamically.
 */
export function securityHeaders(o: SecurityHeaderOptions = {}): { key: string; value: string }[] {
  const ancestors = o.frameAncestors?.length ? o.frameAncestors.join(" ") : "'none'";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${o.isDev ? " 'unsafe-eval'" : ""} ${(o.scriptSrc ?? []).join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${(o.imgSrc ?? []).join(" ")}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${(o.connectSrc ?? []).join(" ")}${o.isDev ? " ws:" : ""}`.trim(),
    `frame-src 'self' ${(o.frameSrc ?? []).join(" ")}`.trim(),
    `frame-ancestors ${ancestors}`,
    `form-action 'self' ${(o.formAction ?? []).join(" ")}`.trim(),
    "base-uri 'self'",
    "object-src 'none'",
    ...(o.isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const headers = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.stripe.com\")" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (!o.frameAncestors?.length) headers.push({ key: "X-Frame-Options", value: "DENY" });
  if (!o.isDev) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  return headers;
}
