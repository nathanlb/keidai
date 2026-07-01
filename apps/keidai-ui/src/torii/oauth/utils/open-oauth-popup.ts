const POPUP_NAME = "torii-oauth-link";
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;

export function openOAuthPopup(url: string): Window | null {
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2),
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2),
  );

  const features = [
    `width=${POPUP_WIDTH}`,
    `height=${POPUP_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    "popup=yes",
    "menubar=no",
    "toolbar=no",
    "location=yes",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  return window.open(url, POPUP_NAME, features);
}
