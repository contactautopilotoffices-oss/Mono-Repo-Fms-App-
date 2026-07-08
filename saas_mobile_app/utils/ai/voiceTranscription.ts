/**
 * Voice Transcription — Record audio + Groq Whisper transcription
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { requestAudioPermissionWithSettings } from '@/utils/permissions';

/* Variables for Groq removed, now using backend API */

let currentRecording: Audio.Recording | null = null;

export async function requestAudioPermission(): Promise<boolean> {
  return await requestAudioPermissionWithSettings();
}

export async function startRecording(): Promise<boolean> {
  try {
    const canRecord = await requestAudioPermission();
    if (!canRecord) return false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    currentRecording = recording;
    return true;
  } catch (err) {
    console.warn('[VoiceTranscription] Start recording failed:', err);
    return false;
  }
}

export async function stopRecording(): Promise<string | null> {
  if (!currentRecording) return null;

  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    currentRecording = null;
    return uri;
  } catch (err) {
    console.warn('[VoiceTranscription] Stop recording failed:', err);
    currentRecording = null;
    return null;
  }
}

export function cancelRecording(): void {
  if (currentRecording) {
    currentRecording.stopAndUnloadAsync().catch(() => {});
    currentRecording = null;
  }
}

export async function transcribeAudio(audioUri: string): Promise<string | null> {
  const apiUrl = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL;
  if (!apiUrl) {
    console.warn('[VoiceTranscription] EXPO_PUBLIC_MOBILE_SERVER_URL missing');
    return null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) return null;

    const fileName = audioUri.split('/').pop() || 'recording.m4a';
    const mimeType = 'audio/m4a';

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      name: fileName,
      type: mimeType,
    } as any);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${apiUrl}/api/ai/transcribe-voice`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[VoiceTranscription] Transcription failed:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[VoiceTranscription] Transcription error:', err);
    return null;
  }
}
