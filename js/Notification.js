class Notification {
  static notificationContainer = null;

  static initializeContainer() {
    if (!Notification.notificationContainer) {
      Notification.notificationContainer = document.createElement("div");
      Notification.notificationContainer.className = "notification-container";
      document.body.appendChild(Notification.notificationContainer);
    }
  }

  static createNotification(message, type, duration) {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    Notification.notificationContainer.appendChild(notification);

    // Add the 'show' class to animate in
    setTimeout(() => {
      notification.classList.add("show");
    }, 10); // Start animation shortly after the element is added

    // Remove the notification after the animation
    setTimeout(() => {
      notification.remove();
    }, duration);
  }

  static success(message, duration = 3000) {
    Notification.initializeContainer();
    Notification.createNotification(message, "success", duration);
  }

  static failure(message, duration = 3000) {
    Notification.initializeContainer();
    Notification.createNotification(message, "failure", duration);
  }
}

export default Notification;

