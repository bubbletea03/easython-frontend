import { api } from './api';
import { createSpeechPlayer } from './speechCore';
import { loadRecording } from './recordedSpeech';

const player = createSpeechPlayer((text, signal) => api.tts(text, signal), loadRecording);
export const setServerSpeechEnabled = player.setServerSpeechEnabled;
export const isPrioritySpeaking = player.isPrioritySpeaking;
export const cancelSpeech = player.cancelSpeech;
export const speak = player.speak;
export const cancelGuidance = player.cancelGuidance;
