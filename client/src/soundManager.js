// Simple Procedural Sound Generator using Web Audio API
// No external assets required!

const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();

const playTone = (freq, type, duration, vol = 0.1) => {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
};

// SFX Presets
export const playSFX = (type) => {
    switch (type) {
        case 'START':
            // Epic deep drone
            playTone(100, 'sawtooth', 2, 0.2);
            setTimeout(() => playTone(150, 'sine', 2, 0.2), 200);
            break;
        case 'VOTE_PHASE':
            // Tension
            playTone(300, 'square', 0.5, 0.05);
            break;
        case 'QUEST_PHASE':
            // Adventure
            playTone(400, 'triangle', 0.5, 0.1);
            setTimeout(() => playTone(600, 'triangle', 1, 0.1), 200);
            break;
        case 'ASSASSINATION':
            // Heartbeat
            playTone(60, 'sine', 0.2, 0.5);
            setTimeout(() => playTone(60, 'sine', 0.2, 0.4), 300);
            break;
        case 'SUCCESS':
            playTone(600, 'sine', 0.3, 0.1);
            setTimeout(() => playTone(1200, 'sine', 0.5, 0.1), 100);
            break;
        case 'FAIL':
            playTone(150, 'sawtooth', 0.8, 0.2);
            setTimeout(() => playTone(100, 'sawtooth', 0.8, 0.2), 200);
            break;
        case 'CLICK':
            playTone(800, 'sine', 0.05, 0.05);
            break;
        default: break;
    }
};
