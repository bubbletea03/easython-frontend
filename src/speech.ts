import { api } from './api';
import { createSpeechPlayer } from './speechCore';
import { loadRecording } from './recordedSpeech';
import { getAudioContext } from './audioContext';
import { createWebAudioPlayback } from './webAudioPlayback';

const player = createSpeechPlayer((text, signal) => api.tts(text, signal), loadRecording, createWebAudioPlayback(getAudioContext));
export const setServerSpeechEnabled = player.setServerSpeechEnabled;
export const isPrioritySpeaking = player.isPrioritySpeaking;
export const cancelSpeech = player.cancelSpeech;
export const speak = player.speak;
export const cancelGuidance = player.cancelGuidance;
export const isSpeechPaused = player.isSpeechPaused;
export const getSpeechLog = player.getSpeechLog;
export const canListenDuringSpeech = player.canListenDuringSpeech;
export const getPlaybackMode = player.getPlaybackMode;
