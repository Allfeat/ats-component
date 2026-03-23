export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  console.log('[BFF /api/token] body received:', JSON.stringify(body));

  const organizationsUrl = body?.organizations_url;
  const secretKey = body?.secret_key;
  const actionType = body?.action_type;
  const allowedNetwork = body?.allowed_network;
  const allowedAtsId = body?.allowed_ats_id;

  if (!organizationsUrl || !secretKey) {
    throw createError({ statusCode: 400, message: 'organizations_url and secret_key are required' });
  }

  if (!actionType) {
    throw createError({ statusCode: 400, message: 'action_type is required' });
  }

  const payload: Record<string, unknown> = {
    secret_key: secretKey,
    action_type: actionType,
    allowed_network: allowedNetwork || 'testnet',
  };

  if (allowedAtsId != null) {
    payload.allowed_ats_id = Number(allowedAtsId);
  }

  const url = `${String(organizationsUrl).replace(/\/+$/, '')}/v1/sessions`;
  console.log('[BFF /api/token] calling Organizations Service:', url);

  try {
    const result = await $fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': getRequestHeader(event, 'origin') || getRequestURL(event).origin,
      },
      body: payload,
    });
    console.log('[BFF /api/token] success');
    // Include the authorized network so the frontend can pass it to the widget
    if (allowedNetwork) {
      return { ...(result as Record<string, unknown>), network: allowedNetwork };
    }
    return result;
  } catch (err: any) {
    const status = err.status || err.statusCode || 502;
    const upstream = err.data;
    let message = 'Organizations Service error';
    if (typeof upstream === 'string') {
      message = upstream;
    } else if (typeof upstream === 'object' && upstream !== null) {
      message = upstream.error || upstream.message || upstream.detail || JSON.stringify(upstream);
    } else if (err.message) {
      message = err.message;
    }
    console.error('[BFF /api/token] upstream error:', status, message);
    throw createError({ statusCode: status, message: String(message) });
  }
});
