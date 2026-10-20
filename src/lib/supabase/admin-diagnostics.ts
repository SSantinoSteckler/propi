const knownCodes = ['PGRST301', 'PGRST302', 'PGRST303', 'PGRST202', 'PGRST205', '42501', '42P01', '42883'] as const;
export type DatabaseOperation = 'billing_is_test_owner' | 'billing_get_entitlements' | 'billing_rate_limit' | 'billing_query';

// Return a fixed category, never a provider message, hint, URL, or arbitrary code.
export function classifyAdminFailure(status: number | null, error: unknown, secret = '') {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = knownCodes.find(item => item === value.code) || null;
  let message = [value.message, value.error_description, value.error]
    .filter(item => typeof item === 'string').join(' ');
  if (secret) message = message.split(secret).join('[REDACTED]');
  if (code === '42501') return { category: 'INSUFFICIENT_PERMISSIONS', code } as const;
  if (code === 'PGRST202' || code === '42883') return { category: 'RPC_NOT_AVAILABLE', code } as const;
  if (code === 'PGRST205' || code === '42P01') return { category: 'TABLE_NOT_AVAILABLE', code } as const;
  if (status === 401 || status === 403) {
    if (/browser|user.?agent/i.test(message)) return { category: 'BROWSER_CONTEXT_REJECTED', code } as const;
    if (/invalid api.?key|api.?key.{0,50}(?:invalid|revoked|expired|not found)/i.test(message)) return { category: 'API_KEY_REJECTED', code } as const;
    if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code || '') || /jwt|token/i.test(message)) return { category: 'JWT_REJECTED', code } as const;
    return { category: 'AUTH_REJECTION_UNSPECIFIED', code } as const;
  }
  if (status === 0) return { category: 'CONNECTION_FAILED', code } as const;
  if (status !== null && status >= 500) return { category: 'UPSTREAM_UNAVAILABLE', code } as const;
  return { category: 'DATABASE_QUERY_FAILED', code } as const;
}

export function databaseFailureDiagnostic(result: { status?: number; error: unknown }, operation: DatabaseOperation, secret = '') {
  const status = typeof result.status === 'number' && Number.isInteger(result.status)
    && (result.status === 0 || (result.status >= 100 && result.status <= 599)) ? result.status : null;
  const failure = classifyAdminFailure(status, result.error, secret);
  return { operation, upstreamStatus: status, upstreamCode: failure.code, category: failure.category };
}
export type DatabaseFailureDiagnostic = ReturnType<typeof databaseFailureDiagnostic>;

// Auth failures only. Never log request headers, URLs, raw bodies, or exceptions.
export async function logAdminAuthFailure(
  response: Response,
  key: string,
  headers: Headers,
  operation: string,
  write: (line: string) => void = console.warn,
) {
  if (response.status !== 401 && response.status !== 403) return;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = response.clone().body?.getReader();
    let text = '', size = 0;
    const decoder = new TextDecoder();
    let category = 'AUTH_REJECTION_UNSPECIFIED';
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) { text += decoder.decode(); break; }
        size += chunk.value.byteLength;
        if (size > 8192) { void reader.cancel().catch(() => {}); category = 'ERROR_BODY_TOO_LARGE'; break; }
        text += decoder.decode(chunk.value, { stream: true });
      }
      if (category !== 'ERROR_BODY_TOO_LARGE') {
        text = key ? text.split(key).join('[REDACTED]') : text;
        let error: unknown = { message: text };
        try {
          error = JSON.parse(text);
        } catch { /* Plain error pages are classified but never printed. */ }
        category = classifyAdminFailure(response.status, error, key).category;
      }
    }
    write(JSON.stringify({
      stage: 'supabase_admin_auth',
      operation: operation === '/rest/v1/rpc/billing_is_test_owner' ? 'billing_is_test_owner' : 'other_admin_request',
      http: response.status,
      category,
      keyType: key.startsWith('sb_secret_') ? 'secret' : key.split('.').length === 3 ? 'legacy_jwt' : 'other',
      apiKeyHeaderMatchesConfigured: headers.get('apikey') === key,
      authorizationHeaderPresent: headers.has('authorization'),
      secretKeyUsedAsBearer: key.startsWith('sb_secret_') && headers.get('authorization') === `Bearer ${key}`,
      serverUserAgent: headers.get('user-agent')?.startsWith('propi-billing-server/') === true,
    }));
  } catch { /* Diagnostics never change authentication, delivery, or HTTP results. */ }
  finally { reader?.releaseLock(); }
}
