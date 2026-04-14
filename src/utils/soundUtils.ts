export const playNotificationSound = () => {
  // Check if the AudioContext is available
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) {
    console.warn("Browser does not support AudioContext");
    return;
  }

  const audioContext = new AudioContext();

  // Create a simple sine wave tone
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5 note
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);

  oscillator.start(audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
  oscillator.stop(audioContext.currentTime + 0.5);
};