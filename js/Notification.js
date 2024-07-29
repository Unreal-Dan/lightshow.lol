/* Notification.js */
class Notification {
  static success(message, duration = 3000) {
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    document.body.appendChild(notification);

    // Add the 'show' class to animate in
    setTimeout(() => {
      notification.classList.add("show");
      notification.classList.add("success");
    }, 10); // Start animation shortly after the element is added

    // Remove the notification after the animation
    setTimeout(() => {
      notification.remove();
    }, duration); // This should match the total animation duration
  }
  static failure(message, duration = 3000) {
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    document.body.appendChild(notification);

    // Add the 'show' class to animate in
    setTimeout(() => {
      notification.classList.add("show");
      notification.classList.add("failure");
    }, 10); // Start animation shortly after the element is added

    // Remove the notification after the animation
    setTimeout(() => {
      notification.remove();
    }, duration); // This should match the total animation duration
  }
}

export default Notification;
