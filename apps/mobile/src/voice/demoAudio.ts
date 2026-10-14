import { Asset } from 'expo-asset';

// Recorded demo script (scripts/make-demo-audio.py), streamed like a microphone.
const ROUNDS = [require('../../assets/demo/round1.wav'), require('../../assets/demo/round2.wav')];
let nextRound = 0;

export interface DemoPlayback {
  sampleRate: number;
  stop: () => void;
}

/** Streams the next demo round in 100 ms PCM chunks; calls onEnd when done. */
export async function playDemoRound(onChunk: (chunk: ArrayBuffer) => void, onEnd: () => void): Promise<DemoPlayback> {
  const asset = Asset.fromModule(ROUNDS[nextRound % ROUNDS.length]);
  nextRound++;
  await asset.downloadAsync();
  const wav = await (await fetch(asset.localUri ?? asset.uri)).arrayBuffer();

  // Find the PCM data chunk after the RIFF header.
  const view = new DataView(wav);
  const sampleRate = view.getUint32(24, true);
  let offset = 12;
  while (offset < wav.byteLength - 8) {
    const id = String.fromCharCode(...new Uint8Array(wav, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') break;
    offset += 8 + size;
  }
  const pcm = wav.slice(offset + 8);
  const chunk = (sampleRate * 2) / 10;

  let position = 0;
  const timer = setInterval(() => {
    if (position >= pcm.byteLength) {
      clearInterval(timer);
      onEnd();
      return;
    }
    onChunk(pcm.slice(position, position + chunk));
    position += chunk;
  }, 100);

  return { sampleRate, stop: () => clearInterval(timer) };
}
