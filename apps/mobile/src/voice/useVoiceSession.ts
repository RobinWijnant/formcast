import { useCallback, useEffect, useRef, useState } from 'react';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import type { ClientMessage, ServerMessage } from '@formcast/shared';
import { sessionUrl } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { playDemoRound, type DemoPlayback } from './demoAudio';
import { useDrafts } from './drafts';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'updating' | 'stopping';
export type VoiceError = { kind: 'permission' | 'connection' | 'speech' | 'model' | 'mic'; message: string } | null;

const LEVEL_BARS = 8;

/** Level of a 16-bit PCM buffer, 0..1. */
function rms(buffer: ArrayBuffer) {
  const samples = new Int16Array(buffer);
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 4) sum += (samples[i]! / 32768) ** 2;
  return Math.min(1, Math.sqrt(sum / (samples.length / 4)) * 6);
}

/**
 * One speaking session for a job: mic -> WebSocket -> live transcript and
 * proposal snapshots into the drafts store.
 */
export function useVoiceSession(jobId: string) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<VoiceError>(null);
  const [transcript, setTranscript] = useState({ final: '', interim: '' });
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BARS).fill(0.1));
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const queue = useRef<ArrayBuffer[]>([]);
  const demo = useRef<DemoPlayback | null>(null);
  const stopping = useRef(false);

  const sendAudio = useCallback((data: ArrayBuffer) => {
    const socket = ws.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (ready.current) socket.send(data);
    else queue.current.push(data);
    const level = rms(data);
    setLevels((l) => [...l.slice(1), Math.max(0.08, level)]);
  }, []);

  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16', onBuffer: (b) => sendAudio(b.data) });

  const send = (msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  };

  const stopAudio = useCallback(() => {
    demo.current?.stop();
    demo.current = null;
    try {
      if (stream.isStreaming) stream.stop();
    } catch {
      // already stopped
    }
  }, [stream]);

  const onMessage = useCallback(
    (raw: string) => {
      const msg = JSON.parse(raw) as ServerMessage;
      switch (msg.type) {
        case 'transcript':
          setTranscript({ final: msg.final, interim: msg.interim });
          break;
        case 'status':
          if (msg.state === 'listening' || msg.state === 'updating' || msg.state === 'stopping') setState(msg.state);
          break;
        case 'proposals':
          useDrafts.getState().apply(jobId, msg.set, msg.changed, msg.removed);
          break;
        case 'error':
          setError({ kind: msg.code === 'stt' ? 'speech' : msg.code === 'llm' ? 'model' : 'connection', message: msg.message });
          break;
        case 'done':
          ws.current?.close(1000);
          break;
      }
    },
    [jobId],
  );

  const start = useCallback(async () => {
    if (ws.current) return;
    setError(null);
    setTranscript({ final: '', interim: '' });
    stopping.current = false;
    const demoVoice = usePrefs.getState().demoVoice;

    if (!demoVoice) {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError({ kind: 'permission', message: 'Microphone access is off for Formcast.' });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => undefined);
    }

    setState('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(await sessionUrl(jobId));
    } catch {
      setState('idle');
      setError({ kind: 'connection', message: "Can't reach Formcast. Check your connection." });
      return;
    }
    socket.binaryType = 'arraybuffer';
    ws.current = socket;
    ready.current = false;
    queue.current = [];

    socket.onopen = async () => {
      let sampleRate = 16000;
      try {
        if (demoVoice) {
          demo.current = await playDemoRound(sendAudio, () => stop());
          sampleRate = demo.current.sampleRate;
        } else {
          await stream.start();
          sampleRate = stream.sampleRate || 16000;
        }
      } catch {
        setError({ kind: 'mic', message: "The microphone couldn't start." });
        socket.close();
        return;
      }
      send({ type: 'init', pending: useDrafts.getState().drafts[jobId]?.pending ?? { fieldOps: [], lineOps: [] }, sampleRate });
      ready.current = true;
      for (const chunk of queue.current.splice(0)) socket.send(chunk);
      setStartedAt(Date.now());
      setState('listening');
    };
    socket.onmessage = (e) => typeof e.data === 'string' && onMessage(e.data);
    socket.onclose = () => {
      stopAudio();
      if (!stopping.current) {
        setError((err) => err ?? { kind: 'connection', message: 'Connection lost. Everything filled in so far stays on this phone.' });
      }
      ws.current = null;
      ready.current = false;
      setStartedAt(null);
      setState('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, onMessage, sendAudio, stopAudio, stream]);

  const stop = useCallback(() => {
    if (!ws.current) return;
    stopping.current = true;
    stopAudio();
    send({ type: 'stop' });
    setState('stopping');
  }, [stopAudio]);

  /** Tap on a countdown ring: drop that proposal. */
  const reject = useCallback(
    (key: string) => {
      if (ws.current?.readyState === WebSocket.OPEN) send({ type: 'reject', key });
      else useDrafts.getState().remove(jobId, key);
    },
    [jobId],
  );

  useEffect(
    () => () => {
      stopping.current = true;
      stopAudio();
      ws.current?.close();
    },
    [stopAudio],
  );

  return { state, error, clearError: () => setError(null), transcript, levels, startedAt, start, stop, reject, active: state !== 'idle' };
}
