export interface OAuthCallbackPageContext {
  uiOrigin?: string;
  linkId?: string;
  provider: string;
  status: "success" | "error";
  error?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildCallbackNotifyScript(context: OAuthCallbackPageContext): string {
  if (!context.uiOrigin) {
    return "";
  }

  const payload = {
    type: "torii-oauth-link",
    status: context.status,
    linkId: context.linkId ?? null,
    provider: context.provider,
    ...(context.error ? { error: context.error } : {}),
  };

  return `<script>
(function () {
  var payload = ${JSON.stringify(payload)};
  if (window.opener) {
    window.opener.postMessage(payload, ${JSON.stringify(context.uiOrigin)});
  }
  window.setTimeout(function () { window.close(); }, 150);
})();
</script>`;
}

export function oauthCallbackSuccessHtml(
  context: OAuthCallbackPageContext,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Torii OAuth</title></head>
<body>
  <p>Authorization complete. Returning to Torii…</p>
  ${buildCallbackNotifyScript(context)}
</body>
</html>`;
}

export function oauthCallbackErrorHtml(
  message: string,
  context: OAuthCallbackPageContext,
): string {
  const escaped = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Torii OAuth</title></head>
<body>
  <p>Authorization failed: ${escaped}</p>
  ${buildCallbackNotifyScript({ ...context, status: "error", error: message })}
</body>
</html>`;
}
