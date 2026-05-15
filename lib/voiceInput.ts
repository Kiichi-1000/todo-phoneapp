// Voice input: record with expo-av in a Google-STT-compatible format,
// then send to the transcribe-audio Edge Function.
//
// Per platform (chosen for Google Speech-to-Text v2 compatibility):
//   - iOS:     LINEAR16 PCM in a WAV container (16 kHz mono, 16-bit).
//              ~1.9 MB / minute. iOS does not expose OPUS encoder.
//   - Android: AMR-WB at 16 kHz. Voice-optimized codec, ~60 KB/min.
//   - Web:     audio/webm with Opus (browser default).
//
// IMPORTANT: Google STT v2 inline `recognize` is hard-capped at 60 seconds.
// We therefore cap recordings client-side at 55 seconds with auto-stop, leaving
// a small safety margin for jitter / boundary effects. Users see a friendly
// alert when the cap is hit.
//
// Future: switch to OpenAI Whisper (25-min limit) for long-form support — see
// commented-out path in git history.

import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { supabase, supabaseUrl } from '@/lib/supabase';

let activeRecording: Audio.Recording | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

/** Hard cap on a single recording (milliseconds). 55 seconds — under Google's 60s limit. */
export const MAX_RECORDING_MS = 55 * 1000;

export async function requestMicPermission(): Promise<boolean> {
  try {
    const res = await Audio.requestPermissionsAsync();
    return res.status === 'granted';
  } catch {
    return false;
  }
}

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.amr',
    outputFormat: Audio.AndroidOutputFormat.AMR_WB,
    audioEncoder: Audio.AndroidAudioEncoder.AMR_WB,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 23850, // AMR-WB max
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000, // ignored for LINEARPCM but required by the type
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

interface StartOptions {
  /** Called when the recording auto-stops because MAX_RECORDING_MS was hit. */
  onAutoStop?: () => void;
}

export async function startRecording(opts: StartOptions = {}): Promise<void> {
  if (activeRecording) {
    await stopAndDiscardRecording();
  }

  const granted = await requestMicPermission();
  if (!granted) throw new Error('mic_permission_denied');

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
  activeRecording = recording;

  if (autoStopTimer) clearTimeout(autoStopTimer);
  autoStopTimer = setTimeout(() => {
    autoStopTimer = null;
    if (opts.onAutoStop) opts.onAutoStop();
  }, MAX_RECORDING_MS);
}

export async function stopAndDiscardRecording(): Promise<void> {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  if (!activeRecording) return;
  try {
    await activeRecording.stopAndUnloadAsync();
  } catch { /* ignore */ }
  activeRecording = null;
}

export type VoiceMode = 'raw' | 'clean' | 'summary' | 'bullet';

export interface TranscribeResult {
  text: string;        // post-processed text (or raw if mode='raw')
  rawText: string;     // always the raw STT transcript
  mode: VoiceMode;
  durationSec: number | null;
  language?: string;
}

interface FileShape {
  filename: string;
  mime: string;
}

function fileShapeForPlatform(): FileShape {
  if (Platform.OS === 'ios') return { filename: 'audio.wav', mime: 'audio/wav' };
  if (Platform.OS === 'android') return { filename: 'audio.amr', mime: 'audio/amr' };
  return { filename: 'audio.webm', mime: 'audio/webm' };
}

export async function stopAndTranscribe(
  language: 'ja' | 'en' = 'ja',
  mode: VoiceMode = 'clean',
): Promise<TranscribeResult> {
  if (!activeRecording) throw new Error('No active recording');

  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

  const recording = activeRecording;
  activeRecording = null;

  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (!uri) throw new Error('Failed to get recording URI');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { filename, mime } = fileShapeForPlatform();

  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: filename,
    type: mime,
  } as any);
  formData.append('language', language);
  formData.append('mode', mode);

  const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData as any,
  });

  if (!response.ok) {
    let body: any = null;
    try { body = await response.json(); } catch { /* ignore */ }
    throw new Error(body?.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || 'Transcription failed');
  }

  return {
    text: data.text || '',
    rawText: data.raw_text || data.text || '',
    mode: (data.mode as VoiceMode) ?? mode,
    durationSec: data.duration_sec ?? null,
    language: data.language,
  };
}

export function isRecording(): boolean {
  return activeRecording !== null;
}
