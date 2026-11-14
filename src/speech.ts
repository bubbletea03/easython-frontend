import { api } from './api';
import { createSpeechPlayer } from './speechCore';

const player = createSpeechPlayer((text, signal) => api.tts(text, signal));
export const setServerSpeechEnabled = player.setServerSpeechEnabled;
export const isPrioritySpeaking = player.isPrioritySpeaking;
export const cancelSpeech = player.cancelSpeech;
export const speak = player.speak;
