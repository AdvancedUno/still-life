/**
 * voice.js
 * Gives the guard a voice with the Speech Synthesis API. Every line is also
 * returned as text so the heist screen can show it as a caption.
 */

const LINES = {
  turn: ['Hello?', 'Who’s there?', 'Hm.', 'Is someone in here?', 'I heard that.'],
  relax: ['Must be the pipes.', 'Old building.', 'Nothing. Again.', 'Probably the radiator.'],
  movement: ['Something moved.', 'Was that painting always crooked?', 'I saw that.'],
  noise: ['I can hear you breathing.', 'What was that?', 'Somebody’s humming.'],
  caught: ['Freeze! Don’t move.', 'Got you.', 'Hands where I can see them.'],
};

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

let enabled = true;
let voice = null;
let speakingUntil = 0;

function chooseVoice() {
  const voices = synth.getVoices();
  voice = voices.find((option) => option.lang === 'en-US')
    ?? voices.find((option) => option.lang?.startsWith('en'))
    ?? null;
}

if (synth) {
  chooseVoice();
  // Many browsers load their voice list a moment after the page.
  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', chooseVoice);
  }
}

export function setVoiceEnabled(value) {
  enabled = value;
  if (!value) synth?.cancel();
}

/** Says a random line of the given kind and returns it for the caption. */
export function say(kind) {
  const options = LINES[kind] ?? [];
  const line = options[Math.floor(Math.random() * options.length)];
  if (!line) return '';

  // He can't hear you while he's talking. This also keeps the microphone
  // from mistaking his voice (coming out of your speakers) for yours.
  speakingUntil = performance.now() + 600 + line.length * 75;

  if (synth && enabled) {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    if (voice) utterance.voice = voice;
    utterance.pitch = 0.6;
    utterance.rate = 0.92;
    utterance.addEventListener('end', () => {
      speakingUntil = performance.now() + 250;
    });
    synth.speak(utterance);
  }
  return line;
}

export function isSpeaking() {
  return performance.now() < speakingUntil;
}

export function hush() {
  synth?.cancel();
  speakingUntil = 0;
}
