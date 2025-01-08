// Notification.js
class Notification {
  static notificationContainer = null;
  static notifications = [];         // Will keep track of all active notifications
  static removalChainRunning = false; // Flag to indicate if removal is in progress

  static initializeContainer() {
    if (!Notification.notificationContainer) {
      Notification.notificationContainer = document.createElement("div");
      Notification.notificationContainer.className = "notification-container";
      document.body.appendChild(Notification.notificationContainer);
    }
  }

  static createNotification(message, type, duration) {
    // Create the DOM element
    const el = document.createElement("div");
    el.className = `notification ${type}`;
    el.textContent = message;

    // Insert at the top so new ones are above old ones
    Notification.notificationContainer.prepend(el);

    // Force reflow before adding the "show" class
    // (so the CSS transition can kick in properly)
    window.getComputedStyle(el).opacity;
    el.classList.add("show");

    // Keep track of this notification
    Notification.notifications.unshift({ el, duration });

    // If no removal chain is active, start it
    if (!Notification.removalChainRunning) {
      Notification.runRemovalChain();
    }
  }

  // Sequentially remove the oldest (bottom) notification one at a time
  static runRemovalChain() {
    // If no notifications remain, we're done
    if (Notification.notifications.length === 0) {
      Notification.removalChainRunning = false;
      return;
    }

    Notification.removalChainRunning = true;

    // The bottom-most notification is at the end of the array
    const { el, duration } = Notification.notifications[Notification.notifications.length - 1];

    // Schedule its removal after "duration"
    setTimeout(() => {
      // Start fade-out by removing "show" class
      el.classList.remove("show");

      // Wait for the fade-out transition to complete before removing from DOM
      // (300ms matches our CSS transition time, adjust if needed)
      setTimeout(() => {
        el.remove();
        // Remove from our array
        Notification.notifications.pop();
        // Proceed to the next notification
        Notification.runRemovalChain();
      }, 300);
    }, duration);
  }

  static success(message, duration = 2000) {
    Notification.initializeContainer();
    Notification.createNotification(message, "success", duration);
  }

  static failure(message, duration = 2000) {
    Notification.initializeContainer();
    Notification.createNotification(message, "failure", duration);
  }
}

export default Notification;

