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
        let message = text, code: unknown;
        try {
          const body = JSON.parse(text);
          code = body?.code;
          message = [body?.message, body?.error_description, body?.error, body?.error?.message]
            .filter(value => typeof value === 'string').join(' ');
        } catch { /* Plain error pages are classified but never printed. */ }
        if (/browser|user.?agent/i.test(message)) category = 'BROWSER_CONTEXT_REJECTED';
        else if (/invalid api.?key|api.?key.{0,50}(?:invalid|revoked|expired|not found)/i.test(message)) category = 'API_KEY_REJECTED';
        else if (['PGRST301', 'PGRST302', 'PGRST303'].includes(String(code)) || /jwt|token/i.test(message)) category = 'JWT_REJECTED';
        else if (code === '42501') category = 'INSUFFICIENT_PERMISSIONS';
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
