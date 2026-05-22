export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  console.log('[BFF /api/token] body received:', JSON.stringify(body));

  // Both inputs can come from the request body (the dev console at `/`
  // exposes them as form fields so the playground can hit arbitrary orgs)
  // or fall back to server-side runtimeConfig (the abbey-road production
  // pattern only sends flow-level fields and lets the BFF supply the
  // secret).
  const organizationsUrl = body?.organizations_url || config.organizationsUrl;
  const secretKey = body?.secret_key || config.secretKey;
  const actionType = body?.action_type;
  const allowedNetwork = body?.allowed_network;
  const allowedAtsId = body?.allowed_ats_id;
  // Optional partner-flow pin. When set, the organizations service issues
  // a token with `action_type: "external_user"` semantics: it authorizes
  // the org-scoped ATS routes (`/v1/organizations/{org}/...`) for the one
  // user named here. The widget treats it as an opaque bearer like any
  // other session token.
  const externalUserRef = body?.external_user_ref;

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
  if (typeof externalUserRef === 'string' && externalUserRef.length > 0) {
    payload.external_user_ref = externalUserRef;
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
    const merged: Record<string, unknown> = { ...(result as Record<string, unknown>) };
    // Echo the authorized network so the frontend can pass it to the widget.
    if (allowedNetwork) {
      merged.network = allowedNetwork;
    }
    // External-user flow: the demo pages need to set the widget's
    // `organization-id` attribute alongside the token. Echoing the org id
    // here (from server-side config) means the page never has to learn it
    // out-of-band.
    if (payload.external_user_ref && config.organizationId) {
      merged.organization_id = config.organizationId;
    }
    return merged;
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
