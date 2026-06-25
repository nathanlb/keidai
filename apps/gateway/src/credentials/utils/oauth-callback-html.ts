export function oauthCallbackSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Torii OAuth</title></head>
<body>
  <p>Authorization complete. You can close this window and return to the app.</p>
</body>
</html>`;
}

export function oauthCallbackErrorHtml(message: string): string {
  const escaped = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Torii OAuth</title></head>
<body>
  <p>Authorization failed: ${escaped}</p>
</body>
</html>`;
}
