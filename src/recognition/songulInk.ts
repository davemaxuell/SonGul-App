// Typed proxy for the native SongulInk Capacitor plugin (Android only).
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface InkStrokePayload {
  points: { x: number; y: number; t: number }[];
}

export interface SongulInkNative {
  recognize(opts: { strokes: InkStrokePayload[]; language: string }): Promise<{
    candidates: { text: string; score?: number }[];
  }>;
  ensureModel(opts: { language: string }): Promise<{
    status: 'downloaded' | 'failed';
    message?: string;
  }>;
}

export const SongulInk = registerPlugin<SongulInkNative>('SongulInk');

export function inkRecognitionAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}
