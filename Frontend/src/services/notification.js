export function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("Browser notifications are not supported");
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

export function showBrowserNotification(
  title,
  body
) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  new Notification(title, {
    body,
    icon: "/favicon.ico",
  });
}