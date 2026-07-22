type BroadcastRequest = {
  title?: string;
  description?: string;
  readme?: string;
  language?: string;
  script?: string;
};

const audioCache = new Map<string, Uint8Array>();
const rateWindows = new Map<string, { startedAt: number; count: number }>();
const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = "Charon";

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function checkRateLimit(request: Request) {
  const key = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt > 60 * 60 * 1000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 12;
}

function pcmToWav(pcm: Uint8Array, sampleRate = 24000) {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) wav[offset + index] = value.charCodeAt(index);
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

async function requestGeminiSpeech(apiKey: string, prompt: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_TTS_MODEL,
        input: prompt,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: GEMINI_TTS_VOICE }] },
      }),
    });

    if (response.ok || response.status < 500 || attempt === 1) return response;
  }
  throw new Error("Gemini speech request exhausted its retries.");
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "Cinematic voice is not configured. Set GEMINI_API_KEY on the server." },
      { status: 503 },
    );
  }
  if (!checkRateLimit(request)) {
    return Response.json({ error: "The transmitter is cooling down. Try again later." }, { status: 429 });
  }

  let payload: BroadcastRequest;
  try {
    payload = await request.json() as BroadcastRequest;
  } catch {
    return Response.json({ error: "Invalid broadcast request." }, { status: 400 });
  }

  const title = clean(payload.title, 100);
  const description = clean(payload.description, 500);
  const readme = clean(payload.readme, 1300);
  const language = clean(payload.language, 60) || "unclassified";
  const customScript = clean(payload.script, 360);
  if (!title) return Response.json({ error: "Project title is required." }, { status: 400 });

  const readmeSentences = (readme.match(/[^.!?]+[.!?]+/g) || [readme]).filter(Boolean).slice(0, 1).join(" ");
  const script = customScript || [
    `${title} is a ${language} project.`,
    description || readmeSentences,
    "The live build is open behind me. Take control and explore it for yourself.",
  ].filter(Boolean).join("\n\n");
  const cacheKey = await digest(`gemini-charon-jhorror-v9\n${script}`);
  const cached = audioCache.get(cacheKey);
  if (cached) {
    return new Response(cached.slice().buffer, {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=31536000, immutable", "X-Audio-Cache": "HIT" },
    });
  }

  const performancePrompt = [
    "Synthesize one very short single-speaker late-night project bulletin. Speak only the words inside TRANSCRIPT; never read these directions aloud.",
    "AUDIO PROFILE: One adult male overnight news presenter with a very low, intimate register. He is clearly human, but the microphone is much too close: dry lips, restrained inhales, and the dead room are audible. His voice is soft, nearly breathless, drained of warmth, and recorded in an old empty concrete television studio.",
    "SCENE: A routine public bulletin has continued after the entire station was evacuated. He describes the project as perfectly ordinary. Something else in the room seems to anticipate the ends of his sentences.",
    "DIRECTOR'S NOTES: Use the patient timing of Japanese psychological horror: speak in natural English with no accent imitation, far slower than a normal bulletin. Let the first words emerge after a short breath. Leave two conspicuously long pockets of dead air inside the reading. Begin professionally, then let the breath thin and the pitch settle lower without becoming theatrical. Hold one harmless word long enough to feel accidental. Deliver the final clause very quietly and emotionally empty, as though it is meant only for one person standing behind the camera. The final word should almost disappear. No monster voice, robotic cadence, growling, melodrama, trailer delivery, invented words, music, effects, or sign-off. The damaged reverse voice and concrete-room echo are added during playback.",
    "TRANSCRIPT BEGINS",
    script,
    "TRANSCRIPT ENDS",
  ].join("\n\n");

  const response = await requestGeminiSpeech(process.env.GEMINI_API_KEY, performancePrompt);

  if (!response.ok) {
    const detail = await response.text();
    console.error("Audio generation failed", response.status, detail.slice(0, 500));
    return Response.json({ error: "The cinematic voice service rejected the transmission." }, { status: 502 });
  }

  const result = await response.json() as {
    output_audio?: { data?: string };
    outputAudio?: { data?: string };
    steps?: Array<{ content?: Array<{ data?: string; mime_type?: string; mimeType?: string }> }>;
  };
  const stepAudio = result.steps
    ?.flatMap(step => step.content || [])
    .find(content => (content.mime_type || content.mimeType || "").startsWith("audio/"));
  const encoded = result.output_audio?.data || result.outputAudio?.data || stepAudio?.data;
  if (!encoded) return Response.json({ error: "The voice service returned no audio." }, { status: 502 });

  const pcm = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const binary = pcmToWav(pcm);
  audioCache.set(cacheKey, binary);
  if (audioCache.size > 24) audioCache.delete(audioCache.keys().next().value as string);

  return new Response(binary.slice().buffer, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=31536000, immutable", "X-Audio-Cache": "MISS" },
  });
}
