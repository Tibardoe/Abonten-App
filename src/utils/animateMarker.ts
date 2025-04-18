export const animateMarkerTo = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  duration: number,
  onUpdate: (coords: { lat: number; lng: number }) => void,
) => {
  const start = performance.now();

  const step = (timestamp: number) => {
    const progress = Math.min((timestamp - start) / duration, 1);

    const lat = from.lat + (to.lat - from.lat) * progress;
    const lng = from.lng + (to.lng - from.lng) * progress;

    onUpdate({ lat, lng });

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
};
