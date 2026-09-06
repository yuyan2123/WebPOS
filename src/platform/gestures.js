const preventGesture = (event) => {
  event.preventDefault();
};

document.addEventListener('gesturestart', preventGesture, { passive: false, capture: true });
document.addEventListener('gesturechange', preventGesture, { passive: false, capture: true });
document.addEventListener('gestureend', preventGesture, { passive: false, capture: true });

// Fallback: intercept touches involving more than one finger.
const preventMultiTouch = (event) => {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
};

document.addEventListener('touchstart', preventMultiTouch, { passive: false, capture: true });
document.addEventListener('touchmove', preventMultiTouch, { passive: false, capture: true });
