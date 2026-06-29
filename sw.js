self.addEventListener("push", function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Stack Tracker";
  const options = {
    body: data.body || "Time to dose.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "stack-tracker",
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
