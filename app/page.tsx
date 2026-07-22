"use client";

/* eslint-disable @next/next/no-img-element -- raw broadcast layers require exact, unoptimized frame timing */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Project = {
  id: string;
  title: string;
  repoUrl: string;
  liveUrl: string;
  description: string;
  readme: string;
  language: string;
  languages: string[];
  topics: string[];
  stars: number;
  updatedAt: string;
  broadcastScript: string;
  demoFrames: string[];
  syncError?: string;
};

type Portfolio = {
  name: string;
  role: string;
  location: string;
  bio: string;
  email: string;
  github: string;
  linkedin: string;
  projects: Project[];
};

type Channel = { kind: "home" | "project" | "about" | "contact"; label: string; project?: Project };
type OwnerSession = { loading: boolean; authenticated: boolean; isOwner: boolean; displayName?: string; local?: boolean };
type StationAuthStatus = { loading: boolean; configured: boolean; authenticated: boolean; canInitialize: boolean; error?: string };
type KtvHistoryState =
  | { ktv: "entry"; mode: "choice" | "control" }
  | { ktv: "channel"; channel: number };

const demoProjects: Project[] = [
  {
    id: "stonks-climb-racing",
    title: "Stonks Climb Racing",
    repoUrl: "https://github.com/git-pull-and-pray/Stonks-Climb-Racing",
    liveUrl: "https://git-pull-and-pray.github.io/Stonks-Climb-Racing/",
    description: "A Unity arcade game that turns the stock market into terrain and financial decision-making into physics.",
    readme: "Ride the legendary Stonks Meme Guy on a Golden Bull across a dynamically generated stock graph. Liquidity replaces fuel, capital injections restore it, and every bullish peak or bearish dip turns market volatility into a physical challenge.",
    broadcastScript: "Stonks Climb Racing turns the market into the road. The live build is open behind me; take control and stay as long as you like.",
    demoFrames: ["/stonks-ride.png"],
    language: "C# / Unity",
    languages: ["Unity", "C#", "2D Physics"],
    topics: ["game-design", "finance", "procedural-generation"],
    stars: 0,
    updatedAt: "2026-07-16",
  },
  {
    id: "demo-weather",
    title: "Dead Air Weather",
    repoUrl: "",
    liveUrl: "",
    description: "A weather instrument that turns live atmospheric data into an endless nocturnal soundscape.",
    readme: "Dead Air Weather maps wind, humidity, pressure, and visibility to a browser-based synthesizer. Every location produces a transmission that never repeats exactly.",
    language: "JavaScript",
    languages: ["JavaScript", "Web Audio", "Canvas"],
    topics: ["weather", "sound", "generative"],
    stars: 0,
    updatedAt: "2026-05-19",
    broadcastScript: "",
    demoFrames: [],
  },
];

const defaultPortfolio: Portfolio = {
  name: "KAUR",
  role: "Creative developer",
  location: "New Delhi, India",
  bio: "I build expressive interfaces, useful systems, and digital objects that keep running after everyone leaves.",
  email: "hello@example.com",
  github: "",
  linkedin: "",
  projects: demoProjects,
};

function newProject(): Project {
  return {
    id: crypto.randomUUID(), title: "", repoUrl: "", liveUrl: "", description: "", readme: "",
    language: "", languages: [], topics: [], stars: 0, updatedAt: "", broadcastScript: "", demoFrames: [],
  };
}

function repoCoordinates(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !rawRepo) return null;
    return { owner, repo: rawRepo.replace(/\.git$/, "") };
  } catch { return null; }
}

function cleanMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*[#>*+\-|]+\s?/gm, " ")
    .replace(/[`_*~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1100);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function briefAnchorScript(project: Project) {
  const custom = project.broadcastScript.trim();
  if (custom) {
    const sentences = custom.match(/[^.!?]+[.!?]+/g);
    return (sentences?.slice(0, 2).join(" ") || custom).trim().slice(0, 360);
  }
  return `${project.title} is open behind me. Take control and explore it for yourself.`.slice(0, 360);
}

async function projectAudioKey(project: Project) {
  const source = JSON.stringify({ version: 13, script: briefAnchorScript(project) });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function enrichProject(project: Project): Promise<Project> {
  const coordinates = repoCoordinates(project.repoUrl);
  if (!coordinates) return project.repoUrl ? { ...project, syncError: "Use a public github.com/owner/repo URL." } : project;
  const endpoint = `https://api.github.com/repos/${coordinates.owner}/${coordinates.repo}`;
  const headers = { Accept: "application/vnd.github+json" };

  try {
    const [repoResponse, readmeResponse, languagesResponse] = await Promise.all([
      fetch(endpoint, { headers }),
      fetch(`${endpoint}/readme`, { headers }),
      fetch(`${endpoint}/languages`, { headers }),
    ]);
    if (!repoResponse.ok) throw new Error(repoResponse.status === 404 ? "Repository not found or not public." : "GitHub could not be reached.");
    const repo = await repoResponse.json();
    const readmeData = readmeResponse.ok ? await readmeResponse.json() : null;
    const languageData = languagesResponse.ok ? await languagesResponse.json() : {};
    const readme = readmeData?.content ? cleanMarkdown(decodeBase64(readmeData.content)) : project.readme;
    const languages = Object.keys(languageData).slice(0, 5);

    return {
      ...project,
      title: project.title.trim() || repo.name.replace(/[-_]/g, " "),
      liveUrl: project.liveUrl.trim() || repo.homepage || "",
      description: repo.description || project.description || "An independent software transmission.",
      readme,
      language: repo.language || languages[0] || project.language,
      languages,
      topics: (repo.topics || []).slice(0, 5),
      stars: repo.stargazers_count || 0,
      updatedAt: repo.pushed_at || repo.updated_at || "",
      syncError: undefined,
    };
  } catch (error) {
    return { ...project, syncError: error instanceof Error ? error.message : "Repository sync failed." };
  }
}

export default function Home() {
  const [portfolio, setPortfolio] = useState(defaultPortfolio);
  const [draft, setDraft] = useState(defaultPortfolio);
  const [channel, setChannel] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [clock, setClock] = useState("00:00:00");
  const [setupOpen, setSetupOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [ownerSession, setOwnerSession] = useState<OwnerSession>({ loading: true, authenticated: false, isOwner: false });
  const [entryVisible, setEntryVisible] = useState(true);
  const [entryMode, setEntryMode] = useState<"choice" | "control">("choice");
  const [stationAuth, setStationAuth] = useState<StationAuthStatus>({ loading: true, configured: false, authenticated: false, canInitialize: false });
  const [controlPhrase, setControlPhrase] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState("");
  const [atmosphereOn, setAtmosphereOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<"idle" | "generating" | "playing">("idle");
  const [broadcastError, setBroadcastError] = useState("");
  const [mouthPhase, setMouthPhase] = useState(0);
  const narrationId = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const animationFrame = useRef<number | null>(null);
  const atmosphereAudio = useRef<HTMLAudioElement | null>(null);
  const atmosphereContext = useRef<AudioContext | null>(null);
  const atmosphereMaster = useRef<GainNode | null>(null);
  const atmosphereTimer = useRef<number | null>(null);
  const switchTimer = useRef<number | null>(null);
  const historyReady = useRef(false);

  const refreshOwnerSession = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const session = await response.json() as Omit<OwnerSession, "loading">;
      setOwnerSession({ ...session, loading: false });
    } catch {
      setOwnerSession({ loading: false, authenticated: false, isOwner: false });
    }
  }, []);

  const refreshStationAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/station-auth", { cache: "no-store" });
      const result = await response.json() as Omit<StationAuthStatus, "loading"> & { error?: string };
      if (!response.ok) throw new Error(result.error || "The station vault did not answer.");
      setStationAuth({ ...result, loading: false });
    } catch (error) {
      setStationAuth({ loading: false, configured: false, authenticated: false, canInitialize: false, error: error instanceof Error ? error.message : "The station vault did not answer." });
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("ktv-portfolio");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restoredProjects = (parsed.projects || defaultPortfolio.projects).map((project: Project) => ({
          ...project,
          broadcastScript: project.broadcastScript || "",
          demoFrames: project.demoFrames || [],
        }));
        const restored = { ...defaultPortfolio, ...parsed, projects: restoredProjects };
        // Restoring browser-owned data is the external-system sync this effect performs.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPortfolio(restored);
        setDraft(restored);
      } catch { /* retain demo */ }
    }
  }, []);

  useEffect(() => {
    void fetch("/api/portfolio")
      .then(response => response.ok ? response.json() : null)
      .then((result: { portfolio?: Portfolio | null } | null) => {
        if (!result?.portfolio) return;
        const restored = {
          ...defaultPortfolio,
          ...result.portfolio,
          projects: result.portfolio.projects.map(project => ({ ...project, broadcastScript: project.broadcastScript || "", demoFrames: project.demoFrames || [] })),
        };
        setPortfolio(restored);
        setDraft(restored);
        localStorage.setItem("ktv-portfolio", JSON.stringify(restored));
      })
      .catch(() => { /* the built-in demo remains available */ });

    void fetch("/api/session", { cache: "no-store" })
      .then(response => response.json())
      .then((session: Omit<OwnerSession, "loading">) => setOwnerSession({ ...session, loading: false }))
      .catch(() => setOwnerSession({ loading: false, authenticated: false, isOwner: false }));

    void fetch("/api/station-auth", { cache: "no-store" })
      .then(async response => ({ response, result: await response.json() as Omit<StationAuthStatus, "loading"> & { error?: string } }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error || "The station vault did not answer.");
        setStationAuth({ ...result, loading: false });
      })
      .catch(error => setStationAuth({ loading: false, configured: false, authenticated: false, canInitialize: false, error: error instanceof Error ? error.message : "The station vault did not answer." }));
  }, []);

  const channels = useMemo<Channel[]>(() => [
    { kind: "home", label: "IDENT" },
    ...portfolio.projects.map(project => ({ kind: "project" as const, label: project.title || "UNTITLED", project })),
    { kind: "about", label: "ABOUT" },
    { kind: "contact", label: "OFF AIR" },
  ], [portfolio.projects]);

  const current = channels[Math.min(channel, channels.length - 1)] || channels[0];

  const stopBroadcast = useCallback(() => {
    narrationId.current += 1;
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    if (audioContext.current) void audioContext.current.close();
    audioContext.current = null;
    setSpeaking(false);
    setMouthPhase(0);
    setBroadcastStatus("idle");
  }, []);

  const stopAtmosphere = useCallback(() => {
    if (atmosphereAudio.current) {
      atmosphereAudio.current.pause();
      atmosphereAudio.current.currentTime = 0;
    }
    atmosphereAudio.current = null;
    if (atmosphereTimer.current) window.clearInterval(atmosphereTimer.current);
    atmosphereTimer.current = null;
    if (atmosphereContext.current) void atmosphereContext.current.close();
    atmosphereContext.current = null;
    atmosphereMaster.current = null;
    setAtmosphereOn(false);
    localStorage.setItem("ktv-atmosphere", "off");
  }, []);

  const startAtmosphere = useCallback(() => {
    if (typeof Audio !== "undefined") {
      if (atmosphereAudio.current) return;
      const score = new Audio("/night-bed.wav");
      score.loop = true;
      score.preload = "auto";
      score.volume = .78;
      atmosphereAudio.current = score;
      void score.play().then(() => {
        setAtmosphereOn(true);
        localStorage.setItem("ktv-atmosphere", "on");
      }).catch(() => {
        atmosphereAudio.current = null;
        setAtmosphereOn(false);
      });
      return;
    }
    if (atmosphereContext.current) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextClass();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = .16;
    compressor.threshold.value = -28;
    compressor.ratio.value = 3;
    master.connect(compressor).connect(context.destination);

    const droneFilter = context.createBiquadFilter();
    const droneGain = context.createGain();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 420;
    droneGain.gain.value = .3;
    droneFilter.connect(droneGain).connect(master);
    [43.65, 65.41, 69.3, 92.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : index === 3 ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 2 ? -11 : index * 2;
      gain.gain.value = [.62, .2, .18, .045][index];
      oscillator.connect(gain).connect(droneFilter);
      oscillator.start();
    });
    const tremolo = context.createOscillator();
    const tremoloDepth = context.createGain();
    tremolo.type = "sine";
    tremolo.frequency.value = .11;
    tremoloDepth.gain.value = .08;
    tremolo.connect(tremoloDepth).connect(droneGain.gain);
    tremolo.start();

    const tapeNoise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const tapeData = tapeNoise.getChannelData(0);
    for (let index = 0; index < tapeData.length; index += 1) tapeData[index] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = tapeNoise;
    noise.loop = true;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 720;
    noiseFilter.Q.value = .35;
    noiseGain.gain.value = .014;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    const playNewsMotif = () => {
      if (context.state === "closed") return;
      const start = context.currentTime + .04;
      [261.63, 246.94, 196, 138.59, 130.81].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        const at = start + index * .52;
        oscillator.type = index >= 3 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        filter.type = "lowpass";
        filter.frequency.value = 1120;
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(index === 0 ? .22 : .14, at + .045);
        gain.gain.exponentialRampToValueAtTime(.0001, at + 1.18);
        oscillator.connect(filter).connect(gain).connect(master);
        oscillator.start(at);
        oscillator.stop(at + 1.24);
      });
      const pulse = context.createOscillator();
      const pulseGain = context.createGain();
      pulse.type = "sine";
      pulse.frequency.setValueAtTime(48, start + 2.4);
      pulse.frequency.exponentialRampToValueAtTime(34, start + 3.15);
      pulseGain.gain.setValueAtTime(.0001, start + 2.4);
      pulseGain.gain.exponentialRampToValueAtTime(.34, start + 2.43);
      pulseGain.gain.exponentialRampToValueAtTime(.0001, start + 3.2);
      pulse.connect(pulseGain).connect(master);
      pulse.start(start + 2.4);
      pulse.stop(start + 3.24);
    };
    playNewsMotif();
    atmosphereTimer.current = window.setInterval(playNewsMotif, 7900);
    atmosphereContext.current = context;
    atmosphereMaster.current = master;
    void context.resume().then(() => {
      setAtmosphereOn(true);
      localStorage.setItem("ktv-atmosphere", "on");
    }).catch(() => {
      if (atmosphereTimer.current) window.clearInterval(atmosphereTimer.current);
      atmosphereTimer.current = null;
      atmosphereContext.current = null;
      atmosphereMaster.current = null;
      void context.close();
      setAtmosphereOn(false);
    });
  }, []);

  const channelAddress = useCallback((index: number) => {
    const item = channels[index];
    if (!item || item.kind === "home") return "#ident";
    if (item.kind === "project") return `#project-${item.project?.id || index}`;
    return item.kind === "contact" ? "#off-air" : `#${item.kind}`;
  }, [channels]);

  const tune = useCallback((next: number) => {
    if (switching) return;
    const target = (next + channels.length) % channels.length;
    stopBroadcast();
    window.history.pushState({ ktv: "channel", channel: target } satisfies KtvHistoryState, "", channelAddress(target));
    setSwitching(true);
    switchTimer.current = window.setTimeout(() => {
      setChannel(target);
      setSwitching(false);
      switchTimer.current = null;
    }, 460);
  }, [channelAddress, channels.length, stopBroadcast, switching]);

  const enterPortfolio = useCallback((target = channel) => {
    const normalized = Math.min(Math.max(target, 0), channels.length - 1);
    stopBroadcast();
    window.history.pushState({ ktv: "channel", channel: normalized } satisfies KtvHistoryState, "", channelAddress(normalized));
    setChannel(normalized);
    setSwitching(false);
    setEntryVisible(false);
    setEntryMode("choice");
  }, [channel, channelAddress, channels.length, stopBroadcast]);

  const showMasterControl = useCallback(() => {
    setControlError("");
    setControlPhrase("");
    setConfirmPhrase("");
    window.history.pushState({ ktv: "entry", mode: "control" } satisfies KtvHistoryState, "", "#master-control");
    setEntryMode("control");
    setEntryVisible(true);
    void refreshStationAuth();
  }, [refreshStationAuth]);

  useEffect(() => {
    const restoreHistory = (state: KtvHistoryState | null) => {
      if (switchTimer.current) window.clearTimeout(switchTimer.current);
      switchTimer.current = null;
      stopBroadcast();
      setSwitching(false);

      if (state?.ktv === "channel") {
        setChannel(Math.min(Math.max(state.channel, 0), channels.length - 1));
        setEntryMode("choice");
        setEntryVisible(false);
        return;
      }

      setEntryMode(state?.mode === "control" ? "control" : "choice");
      setEntryVisible(true);
    };

    if (!historyReady.current) {
      historyReady.current = true;
      const state = window.history.state as KtvHistoryState | null;
      if (state?.ktv === "entry" || state?.ktv === "channel") {
        restoreHistory(state);
      } else {
        window.history.replaceState({ ktv: "entry", mode: "choice" } satisfies KtvHistoryState, "", "#entry");
      }
    }

    const onPopState = (event: PopStateEvent) => restoreHistory(event.state as KtvHistoryState | null);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [channels.length, stopBroadcast]);

  useEffect(() => () => {
    stopBroadcast();
    if (switchTimer.current) window.clearTimeout(switchTimer.current);
    if (atmosphereAudio.current) atmosphereAudio.current.pause();
    if (atmosphereTimer.current) window.clearInterval(atmosphereTimer.current);
    if (atmosphereContext.current) void atmosphereContext.current.close();
  }, [stopBroadcast]);

  useEffect(() => {
    const startAutomaticScore = () => startAtmosphere();
    window.addEventListener("pointerdown", startAutomaticScore, { once: true, capture: true });
    window.addEventListener("keydown", startAutomaticScore, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", startAutomaticScore, true);
      window.removeEventListener("keydown", startAutomaticScore, true);
    };
  }, [startAtmosphere]);

  useEffect(() => {
    const score = atmosphereAudio.current;
    if (score) {
      score.volume = speaking ? .2 : .78;
      return;
    }
    const context = atmosphereContext.current;
    const master = atmosphereMaster.current;
    if (!context || !master) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(speaking ? .042 : .16, context.currentTime, .24);
  }, [speaking]);

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString("en-GB"));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (setupOpen) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") tune(channel + 1);
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") tune(channel - 1);
      if (/^[1-9]$/.test(event.key) && Number(event.key) <= channels.length) tune(Number(event.key) - 1);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [channel, channels.length, setupOpen, tune]);

  function openSetup() {
    if (!ownerSession.isOwner) return;
    setSetupError("");
    setDraft(JSON.parse(JSON.stringify(portfolio)));
    setSetupOpen(true);
  }

  function openMasterControl() {
    showMasterControl();
  }

  async function submitMasterControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stationAuth.configured && controlPhrase !== confirmPhrase) {
      setControlError("The repeated control phrase does not match.");
      return;
    }
    setControlBusy(true);
    setControlError("");
    try {
      const response = await fetch("/api/station-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: stationAuth.configured ? "login" : "initialize", password: controlPhrase }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Master Control rejected the transmission.");
      await Promise.all([refreshStationAuth(), refreshOwnerSession()]);
      setControlPhrase("");
      setConfirmPhrase("");
      window.history.replaceState({ ktv: "channel", channel } satisfies KtvHistoryState, "", channelAddress(channel));
      setEntryVisible(false);
      setEntryMode("choice");
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Master Control rejected the transmission.");
    } finally {
      setControlBusy(false);
    }
  }

  async function saveAndSync() {
    setSyncing(true);
    setSetupError("");
    const projects = await Promise.all(draft.projects.map(enrichProject));
    const next = { ...draft, projects };
    try {
      const response = await fetch("/api/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: "The station could not save." })) as { error?: string };
        throw new Error(result.error || "The station could not save.");
      }
      setPortfolio(next);
      setDraft(next);
      localStorage.setItem("ktv-portfolio", JSON.stringify(next));
      setChannel(0);
      setSetupOpen(false);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "The station could not save.");
    } finally {
      setSyncing(false);
    }
  }

  async function readProject(project: Project) {
    if (broadcastStatus !== "idle") { stopBroadcast(); return; }
    stopBroadcast();
    const token = narrationId.current;
    setBroadcastError("");
    setBroadcastStatus("generating");

    try {
      // Safari will suspend an AudioContext created after the network request has
      // finished. Create and resume it while this click still owns user activation.
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      audioContext.current = context;
      await context.resume();

      const key = await projectAudioKey(project);
      const cache = "caches" in window ? await caches.open("ktv-anchor-clips-v13") : null;
      const cacheRequest = new Request(`${location.origin}/__ktv_audio_cache__/${key}`);
      let cached = cache ? await cache.match(cacheRequest) : undefined;

      if (!cached) {
        const generated = await fetch("/api/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: project.title, description: project.description, readme: project.readme, language: project.language, script: briefAnchorScript(project) }),
        });
        if (!generated.ok) {
          const message = await generated.json().catch(() => ({ error: "The voice transmission failed." })) as { error?: string };
          throw new Error(message.error || "The voice transmission failed.");
        }
        const bytes = await generated.arrayBuffer();
        cached = new Response(bytes, { headers: { "Content-Type": "audio/wav" } });
        if (cache) await cache.put(cacheRequest, cached.clone());
      }
      if (token !== narrationId.current) { void context.close(); return; }

      const bytes = await cached.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      if (token !== narrationId.current) { void context.close(); return; }
      if (context.state === "suspended") await context.resume();

      const source = context.createBufferSource();
      const voiceShadow = context.createBufferSource();
      const reverseShadow = context.createBufferSource();
      const highpass = context.createBiquadFilter();
      const lowpass = context.createBiquadFilter();
      const presence = context.createBiquadFilter();
      const saturation = context.createWaveShaper();
      const compressor = context.createDynamicsCompressor();
      const dropout = context.createGain();
      const analyser = context.createAnalyser();

      source.buffer = buffer;
      source.playbackRate.value = .855;
      voiceShadow.buffer = buffer;
      voiceShadow.playbackRate.value = .79;
      const reverseBuffer = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const original = buffer.getChannelData(channel);
        const reversed = reverseBuffer.getChannelData(channel);
        for (let sample = 0; sample < original.length; sample += 1) reversed[sample] = original[original.length - sample - 1];
      }
      reverseShadow.buffer = reverseBuffer;
      reverseShadow.playbackRate.value = .72;
      highpass.type = "highpass"; highpass.frequency.value = 115;
      lowpass.type = "lowpass"; lowpass.frequency.value = 3550;
      presence.type = "peaking"; presence.frequency.value = 1750; presence.Q.value = .9; presence.gain.value = 3.5;
      saturation.curve = Float32Array.from({ length: 512 }, (_, index) => Math.tanh(((index / 511) * 2 - 1) * 1.7));
      saturation.oversample = "2x";
      compressor.threshold.value = -25; compressor.knee.value = 9; compressor.ratio.value = 4.5; compressor.attack.value = .004; compressor.release.value = .16;
      dropout.gain.value = .86;
      analyser.fftSize = 256; analyser.smoothingTimeConstant = .34;
      source.connect(highpass).connect(lowpass).connect(presence).connect(saturation).connect(compressor).connect(dropout).connect(analyser).connect(context.destination);

      const shadowFilter = context.createBiquadFilter();
      const shadowGain = context.createGain();
      shadowFilter.type = "bandpass";
      shadowFilter.frequency.value = 910;
      shadowFilter.Q.value = .82;
      shadowGain.gain.value = .255;
      voiceShadow.connect(shadowFilter).connect(shadowGain).connect(analyser);

      const reverseFilter = context.createBiquadFilter();
      const reverseGain = context.createGain();
      reverseFilter.type = "bandpass";
      reverseFilter.frequency.value = 780;
      reverseFilter.Q.value = .55;
      reverseGain.gain.value = .09;
      reverseShadow.connect(reverseFilter).connect(reverseGain).connect(analyser);

      const roomImpulse = context.createBuffer(2, Math.ceil(context.sampleRate * 2.8), context.sampleRate);
      for (let channel = 0; channel < roomImpulse.numberOfChannels; channel += 1) {
        const impulse = roomImpulse.getChannelData(channel);
        for (let sample = 0; sample < impulse.length; sample += 1) {
          const time = sample / context.sampleRate;
          const decay = Math.pow(1 - sample / impulse.length, 3.2);
          const earlyReflection = Math.abs(time - .118) < .002 || Math.abs(time - .263) < .003 ? .7 : 0;
          impulse[sample] = ((Math.random() * 2 - 1) * .34 + earlyReflection) * decay;
        }
      }
      const room = context.createConvolver();
      const roomFilter = context.createBiquadFilter();
      const roomGain = context.createGain();
      room.buffer = roomImpulse;
      roomFilter.type = "lowpass";
      roomFilter.frequency.value = 2050;
      roomGain.gain.value = .275;
      dropout.connect(room).connect(roomFilter).connect(roomGain).connect(analyser);

      const wow = context.createOscillator();
      const wowDepth = context.createGain();
      wow.type = "sine";
      wow.frequency.value = .27;
      wowDepth.gain.value = 28;
      wow.connect(wowDepth).connect(source.detune);

      const hum = context.createOscillator();
      const humGain = context.createGain();
      hum.type = "sine"; hum.frequency.value = 59.94; humGain.gain.value = .006;
      hum.connect(humGain).connect(context.destination);

      const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * (buffer.duration + 1)), context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      const noiseFilter = context.createBiquadFilter();
      const noiseGain = context.createGain();
      noise.buffer = noiseBuffer; noiseFilter.type = "bandpass"; noiseFilter.frequency.value = 1850; noiseFilter.Q.value = .48; noiseGain.gain.value = .012;
      noise.connect(noiseFilter).connect(noiseGain).connect(context.destination);

      const now = context.currentTime;
      const sourceStart = now + .14;
      source.playbackRate.setValueAtTime(.855, sourceStart);
      source.playbackRate.linearRampToValueAtTime(.81, sourceStart + Math.min(2.3, buffer.duration * .28));
      source.playbackRate.linearRampToValueAtTime(.868, sourceStart + Math.min(4.5, buffer.duration * .54));

      const stutterAt = Math.min(2.35, Math.max(.8, buffer.duration * .31));
      const stutterOffset = Math.max(.12, stutterAt - .16);
      const stutterLength = .065;
      const repeatFilter = context.createBiquadFilter();
      const repeatGain = context.createGain();
      repeatFilter.type = "bandpass"; repeatFilter.frequency.value = 1450; repeatFilter.Q.value = .72; repeatGain.gain.value = .4;
      repeatFilter.connect(repeatGain).connect(analyser);
      for (let index = 0; index < 2; index += 1) {
        const repeat = context.createBufferSource();
        repeat.buffer = buffer;
        repeat.playbackRate.value = .94 - index * .012;
        repeat.connect(repeatFilter);
        repeat.start(sourceStart + stutterAt + index * .071, stutterOffset, stutterLength);
      }

      dropout.gain.setValueAtTime(.86, sourceStart + stutterAt - .012);
      dropout.gain.linearRampToValueAtTime(.045, sourceStart + stutterAt);
      dropout.gain.setValueAtTime(.045, sourceStart + stutterAt + .16);
      dropout.gain.linearRampToValueAtTime(.86, sourceStart + stutterAt + .205);

      const cuts = [1.23, 4.92].filter(time => time < buffer.duration - .45 && Math.abs(time - stutterAt) > .6);
      for (const cut of cuts) {
        const at = sourceStart + cut;
        dropout.gain.setValueAtTime(.86, at);
        dropout.gain.linearRampToValueAtTime(.08, at + .006);
        dropout.gain.setValueAtTime(.08, at + .034);
        dropout.gain.linearRampToValueAtTime(.86, at + .073);
        noiseGain.gain.setValueAtTime(.012, at);
        noiseGain.gain.linearRampToValueAtTime(.026, at + .006);
        noiseGain.gain.exponentialRampToValueAtTime(.012, at + .084);
      }

      const waveform = new Uint8Array(analyser.fftSize);
      let previousPhase = -1;
      const trackMouth = () => {
        if (token !== narrationId.current) return;
        analyser.getByteTimeDomainData(waveform);
        let energy = 0;
        for (const value of waveform) energy += (value - 128) ** 2;
        const rms = Math.sqrt(energy / waveform.length);
        const phase = rms < 3.2 ? 0 : rms < 10 ? 1 : 2;
        if (phase !== previousPhase) { previousPhase = phase; setMouthPhase(phase); }
        animationFrame.current = requestAnimationFrame(trackMouth);
      };

      source.onended = () => {
        window.setTimeout(() => {
          if (token === narrationId.current) stopBroadcast();
        }, 680);
      };
      setBroadcastStatus("playing");
      setSpeaking(true);
      noise.start(now); hum.start(now); wow.start(now); reverseShadow.start(sourceStart); source.start(sourceStart + .2); voiceShadow.start(sourceStart + .4);
      trackMouth();
    } catch (error) {
      if (token !== narrationId.current) return;
      setBroadcastError(error instanceof Error ? error.message : "The cinematic transmission failed.");
      stopBroadcast();
    }
  }

  return (
    <main className="broadcast">
      {entryVisible && <SignalThreshold
        mode={entryMode}
        stationAuth={stationAuth}
        password={controlPhrase}
        confirmation={confirmPhrase}
        busy={controlBusy}
        error={controlError}
        onPassword={setControlPhrase}
        onConfirmation={setConfirmPhrase}
        onViewer={() => enterPortfolio(0)}
        onControl={() => {
          if (stationAuth.authenticated) {
            enterPortfolio(channel);
            void refreshOwnerSession();
          } else {
            showMasterControl();
          }
        }}
        onBack={() => {
          if ((window.history.state as KtvHistoryState | null)?.ktv === "entry") window.history.back();
          else { setEntryMode("choice"); setControlError(""); }
        }}
        onSubmit={submitMasterControl}
      />}
      <div className="noise" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="ghost-caption" aria-hidden="true">PLEASE STAND BY</div>

      <header className="topline">
        <div className="station-mark"><span className="live-dot" /><strong>K–TV</strong><span>AUTOMATED NIGHT TRANSMISSION</span></div>
        <div className="transmission-data">
          <button className={atmosphereOn ? "sound-control active" : "sound-control"} aria-pressed={atmosphereOn} onClick={atmosphereOn ? stopAtmosphere : startAtmosphere}>{atmosphereOn ? "■ MUTE HORROR SCORE" : "SCORE ARMED"}</button>
          <span>SOURCE UNCONFIRMED</span><span>CH {String(channel + 1).padStart(2, "0")}</span><time>{clock}</time>
        </div>
      </header>

      <section className={`screen ${switching ? "switching" : ""}`} aria-live="polite">
        {current.kind === "home" && <HomeChannel portfolio={portfolio} />}
        {current.kind === "project" && current.project && <ProjectChannel project={current.project} speaking={speaking} status={broadcastStatus} mouthPhase={mouthPhase} error={broadcastError} onRead={() => readProject(current.project!)} onEject={() => tune(0)} />}
        {current.kind === "about" && <AboutChannel portfolio={portfolio} />}
        {current.kind === "contact" && <ContactChannel portfolio={portfolio} />}
        {switching && <SignalLoss target={channels[(channel + 1) % channels.length]?.label} />}
      </section>

      <aside className="remote" aria-label="Channel selector">
        <div className="remote-head"><span>{ownerSession.isOwner ? ownerSession.displayName || "MASTER CONTROL" : "FREQUENCY"}</span>{ownerSession.isOwner ? <button onClick={openSetup}>EDIT STATION</button> : <button onClick={openMasterControl}>{ownerSession.loading ? "CHECKING…" : "MASTER CONTROL"}</button>}</div>
        <div className="channel-buttons">
          {channels.map((item, index) => (
            <button key={`${item.kind}-${index}`} className={channel === index ? "active" : ""} onClick={() => tune(index)} aria-pressed={channel === index}>
              <span>{String(index + 1).padStart(2, "0")}</span><em>{item.label}</em>
            </button>
          ))}
        </div>
      </aside>

      <footer className={`signal-override ${current.kind === "contact" ? "final-condition" : ""}`}>
        <div className="override-id"><span>K–TV</span><b>OVERRIDE<br />E–03</b><time>{clock}</time></div>
        <div className="override-field">
          <small>SIGNAL FAILURE / CAMERA 03 / LOCAL AUDIO CONTAMINATION / CH {String(channel + 1).padStart(2, "0")} {current.label.toUpperCase()}</small>
          <p className="override-message message-one">PRESENTER MISSING FROM CAMERA 03</p>
          <p className="override-message message-two">VOICE SOURCE: INSIDE THIS ROOM</p>
          <p className="override-message message-three">CUT POWER BEFORE THE FINAL FRAME</p>
          <i className="override-tear" aria-hidden="true" />
        </div>
        <div className="override-order"><i />IMMEDIATE<br /><b>LEAVE<br />SIGNAL</b></div>
      </footer>

      {setupOpen && <SetupPanel draft={draft} setDraft={setDraft} syncing={syncing} error={setupError} onSave={saveAndSync} onClose={() => setSetupOpen(false)} />}
    </main>
  );
}

function SignalThreshold({ mode, stationAuth, password, confirmation, busy, error, onPassword, onConfirmation, onViewer, onControl, onBack, onSubmit }: {
  mode: "choice" | "control";
  stationAuth: StationAuthStatus;
  password: string;
  confirmation: string;
  busy: boolean;
  error: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  onViewer: () => void;
  onControl: () => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const initializing = !stationAuth.loading && !stationAuth.configured;
  return <section className={`entry-screen ${mode === "control" ? "control-entry" : ""}`} role="dialog" aria-modal="true" aria-label="K-TV transmission entrance">
    <div className="entry-static" aria-hidden="true" />
    <header className="entry-header"><b>K–TV</b><span>UNAUTHORIZED OVERNIGHT TRANSMISSION</span><i>03:17:08 / SOURCE INSIDE BUILDING</i></header>
    {mode === "choice" ? <>
      <div className="menu-smoke" aria-hidden="true"><i /><i /><i /></div>
      <div className="entry-copy">
        <span>K–TV</span>
        <p>SELECT A SIGNAL</p>
      </div>
      <div className="entry-routes">
        <button className="receiver-route" onClick={onViewer}>
          <i>›</i><strong>WATCH THE TRANSMISSION</strong>
          <small>PUBLIC RECEIVER / ENTER PORTFOLIO</small>
        </button>
        <button className="control-route" onClick={onControl}>
          <i>›</i><strong>ENTER MASTER CONTROL</strong>
          <small>{stationAuth.authenticated ? "CONTROL SESSION RECOGNIZED" : stationAuth.loading ? "CHECKING STATION VAULT…" : "RESTRICTED RETURN PATH"}</small>
        </button>
      </div>
      <div className="entry-camera" aria-hidden="true"><img src="/anchor-uncanny.png" alt="" /></div>
    </> : <div className="control-vault">
      <button className="entry-back" onClick={onBack}>← RETURN TO FREQUENCY SELECT</button>
      <div className="vault-heading">
        <span>{initializing ? "FIRST OPERATOR DETECTED" : "RESTRICTED RETURN PATH"}</span>
        <h1>{initializing ? <>SEAL THE<br />CONTROL ROOM.</> : <>PROVE YOU ARE<br />THE OPERATOR.</>}</h1>
        <p>{initializing ? "Choose the phrase that will unlock portfolio editing. It cannot be recovered from the broadcast." : "The public signal is receive-only. Master Control permits the portfolio to be rewritten."}</p>
      </div>
      {stationAuth.loading ? <div className="vault-wait"><i />CONTACTING STATION VAULT</div> : initializing && !stationAuth.canInitialize ? <div className="identity-lock">
        <b>OWNER IDENTITY REQUIRED</b>
        <p>The first control phrase can only be set after the station recognizes its owner.</p>
        <a href="/signin-with-chatgpt?return_to=%2F">VERIFY STATION IDENTITY ↗</a>
      </div> : <form className="vault-form" onSubmit={onSubmit}>
        <label>{initializing ? "CREATE CONTROL PHRASE" : "CONTROL PHRASE"}
          <input type="password" name="ktv-control-signal" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" spellCheck={false} minLength={10} maxLength={128} required value={password} onChange={event => onPassword(event.target.value)} autoFocus />
        </label>
        {initializing && <label>REPEAT CONTROL PHRASE
          <input type="password" name="ktv-control-signal-confirmation" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" spellCheck={false} minLength={10} maxLength={128} required value={confirmation} onChange={event => onConfirmation(event.target.value)} />
        </label>}
        <p className="vault-rule">MINIMUM 10 CHARACTERS / FIVE FAILED ATTEMPTS SEAL THE ROOM</p>
        {(error || stationAuth.error) && <p className="vault-error" role="alert">{error || stationAuth.error}</p>}
        <button type="submit" disabled={busy}>{busy ? "WAIT FOR THE LOCK…" : initializing ? "SEAL MASTER CONTROL" : "OPEN MASTER CONTROL"}</button>
      </form>}
      <div className="vault-door" aria-hidden="true"><i /><b>MC</b><span>RETURN PATH<br />PHYSICALLY ARMED</span></div>
    </div>}
    <footer className="entry-warning"><b>THIS IS NOT A TEST</b><span>IF THE PRESENTER SMILES, LOWER YOUR EYES</span><span>DO NOT ALLOW THE SCREEN TO GO BLACK</span></footer>
  </section>;
}

function HomeChannel({ portfolio }: { portfolio: Portfolio }) {
  return <div className="home-channel channel-content">
    <div className="channel-bug">STATION IDENT / 01</div>
    <div className="ident-station-line"><b>K–TV</b><span>CHANNEL 01 / STATION IDENTIFICATION</span><i>{portfolio.location.toUpperCase()}</i></div>
    <section className="ident-premiere">
      <p>THE LATE PROGRAMME PRESENTS</p>
      <div className="ident-name">
        <span>THIS IS</span>
        <h1>{portfolio.name}</h1>
        <b aria-hidden="true">{portfolio.name}</b>
      </div>
      <div className="ident-credit"><strong>{portfolio.role}</strong><span>TRANSMITTING FROM {portfolio.location.toUpperCase()}</span></div>
    </section>
    <section className="ident-continuity">
      <span>CONTINUITY ANNOUNCEMENT / 01</span>
      <p>{portfolio.bio}</p>
      <b>THE WORK BEGINS ON THE NEXT FREQUENCY.</b>
    </section>
    <section className="ident-programme">
      <header><small>TONIGHT’S PROGRAMME</small><strong>SELECT A FREQUENCY</strong><span>PROJECTS / PROFILE / CONTACT</span></header>
      <ol>
        {portfolio.projects.slice(0, 3).map((project, index) => <li key={project.id || index}>
          <span>{String(index + 2).padStart(2, "0")}</span>
          <div><b>{project.title || "UNTITLED TRANSMISSION"}</b><small>{project.language || "PROJECT FEED"}</small></div>
        </li>)}
        <li><span>{String(portfolio.projects.length + 2).padStart(2, "0")}</span><div><b>ABOUT {portfolio.name}</b><small>PERSONAL RECORD</small></div></li>
        <li><span>{String(portfolio.projects.length + 3).padStart(2, "0")}</span><div><b>OFF AIR</b><small>CONTACT KAUR</small></div></li>
      </ol>
      <div className="ident-signoff"><span>NEXT</span><b>CH 02</b><small>USE THE FREQUENCY SELECTOR<br />TO CONTINUE</small></div>
    </section>
    <div className="ident-interruption" aria-hidden="true">
      <span>K–TV CONTINUITY / PRESENTER NOT REQUIRED</span>
      <b>NO PRESENTER HAS BEEN ASSIGNED TO CHANNEL 01</b>
    </div>
  </div>;
}

function ProjectChannel({ project, speaking, status, mouthPhase, error, onRead, onEject }: { project: Project; speaking: boolean; status: "idle" | "generating" | "playing"; mouthPhase: number; error: string; onRead: () => void; onEject: () => void }) {
  const [exploring, setExploring] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  return <div className={`project-channel channel-content ${exploring ? "is-exploring" : ""}`}>
    <div className="channel-bug">PROJECT FEED</div>
    <div className="anchor-frame">
      {exploring && <div className="demo-wall" aria-label={`Live visual feed for ${project.title}`}>
        {project.liveUrl ? <>
          {!frameReady && <div className="browser-loading"><span>CONNECTING VISUAL AID</span><i /></div>}
          <iframe
            src={project.liveUrl}
            title={`${project.title} interactive live project`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals allow-downloads"
            allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
            onLoad={() => setFrameReady(true)}
          />
        </> : project.demoFrames.length ? project.demoFrames.map((frame, index) =>
          <img key={frame} className={index === 0 ? "active" : ""} src={frame} alt={`${project.title} demonstration frame ${index + 1}`} />
        ) : <div className="demo-missing">VISUAL AID<br />UNAVAILABLE</div>}
        <div className="browser-bar">
          <span><i className={frameReady ? "online" : ""} /> {project.liveUrl ? "LIVE BUILD / INTERACTIVE" : "RECORDED DEMONSTRATION"}</span>
          {project.liveUrl && <div className="feed-controls"><a href={project.liveUrl} target="_blank" rel="noreferrer">OPEN TAB ↗</a><button onClick={() => setExploring(value => !value)}>{exploring ? "EXIT FULL FEED" : "PLAY FULL FEED"}</button></div>}
        </div>
        <div className="demo-slate"><span>{speaking ? "VISUAL AID RUNNING WITH BULLETIN" : "VISUAL AID STANDING BY"}</span><b>{project.title.toUpperCase()}</b></div>
      </div>}
      <div className={`anchor studio-anchor ${speaking ? "speaking" : ""} mouth-${mouthPhase}`} aria-label="Automated male news presenter">
        <img className="anchor-still" src="/anchor-uncanny.png" alt="Uncannily still late-night news presenter" />
        <img className="anchor-mouth anchor-mouth-a" src="/anchor-mouth-a.png" alt="" aria-hidden="true" />
        <img className="anchor-mouth anchor-mouth-b" src="/anchor-mouth-b.png" alt="" aria-hidden="true" />
        <div className="anchor-shadow-delay" aria-hidden="true" />
        <img className="anchor-skeleton" src="/anchor-skeleton-trace.png" alt="" aria-hidden="true" />
        <img className="anchor-smile" src="/anchor-smile-interrupt.png" alt="" aria-hidden="true" />
        <div className="face-tear" aria-hidden="true" />
      </div>
      <div className="anchor-caption">
        <b>{project.title.toUpperCase()}</b>
        <span>{speaking ? briefAnchorScript(project) : "LATE EDITION / PROJECT BULLETIN READY"}</span>
        <small aria-live="polite">{error ? `VOICE LINK ERROR / ${error}` : speaking ? "VOICE LINK ACTIVE" : project.liveUrl ? "LIVE PROJECT AVAILABLE / OPEN SEPARATELY" : "ARCHIVE FOOTAGE UNAVAILABLE"}</small>
      </div>
    </div>
    <article className="project-bulletin">
      <p className="bulletin-kicker">PROJECT BULLETIN / {project.language || "UNCLASSIFIED"}</p>
      <h2>{project.title}</h2>
      <p className="project-description">{project.description}</p>
      {project.readme && <p className="readme-copy">{project.readme}</p>}
      <div className="project-meta">
        {project.languages.map(language => <span key={language}>{language.toUpperCase()}</span>)}
        {project.updatedAt && <span>UPDATED {new Date(project.updatedAt).toLocaleDateString("en-GB")}</span>}
        <span>{project.stars} STARS</span>
      </div>
      {project.syncError && <p className="sync-error">REPOSITORY LINK / {project.syncError}</p>}
      <div className="project-actions">
        <button className={status !== "idle" ? "reading" : ""} onClick={onRead}>{status === "generating" ? "TUNING VOICE…" : speaking ? "STOP BROADCAST" : "READ BROADCAST"}</button>
        {project.liveUrl && <button className="primary-action" onClick={() => setExploring(true)}>▶ PLAY LIVE PROJECT</button>}
        {project.repoUrl && <a href={project.repoUrl} target="_blank" rel="noreferrer">VIEW SOURCE ↗</a>}
        <button onClick={onEject}>RETURN TO IDENT</button>
      </div>
      <div className="topics">{project.topics.map(topic => <span key={topic}>#{topic}</span>)}</div>
    </article>
  </div>;
}

function AboutChannel({ portfolio }: { portfolio: Portfolio }) {
  return <div className="about-channel channel-content">
    <div className="channel-bug">PERSONNEL FILE</div>
    <p className="eyebrow">SUBJECT LAST SEEN ONLINE</p>
    <h2>{portfolio.name}<br /><i>IS A</i><br />{portfolio.role}</h2>
    <div className="about-copy"><p>{portfolio.bio}</p><span>BASED IN {portfolio.location.toUpperCase()}</span></div>
    <div className="fingerprint" aria-hidden="true" />
  </div>;
}

function ContactChannel({ portfolio }: { portfolio: Portfolio }) {
  const [seconds, setSeconds] = useState(14);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(value => value > 0 ? value - 1 : 14), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="contact-channel channel-content">
    <div className="channel-bug">CONTACT / KAUR</div>
    <section className="last-call-copy">
      <p className="eyebrow">CONTACT KAUR / EMAIL AND SOCIAL LINKS</p>
      <h2>CONTACT<br />ME.<br /><em>BEFORE IT ANSWERS.</em></h2>
      <p className="contact-instruction">For projects, collaborations, opportunities, or just to say hello, email me directly. The overnight line is unattended; I will reply when I am back on air.</p>
      <a className="contact-link" href={`mailto:${portfolio.email}`}>
        <span><i /> PRIMARY CONTACT / EMAIL</span>
        <strong>EMAIL KAUR</strong>
        <small>{portfolio.email.toUpperCase()} ↗</small>
      </a>
    </section>
    <div className="panic-orders" aria-hidden="true">
      <span>DO NOT ANSWER LINE 02</span>
      <span>THE BREATHING IS NOT FEEDBACK</span>
      <span>DISCONNECT BEFORE ZERO</span>
    </div>
    <aside className="offair-monitor" aria-hidden="true">
      <div className="offair-monitor-head"><span>CALLER / UNRESOLVED</span><b>REC</b></div>
      <div className="phone-silhouette"><i /><i /><i /></div>
      <div className="line-wave">{Array.from({ length: 27 }, (_, index) => <i key={index} />)}</div>
      <time>00:00:{String(seconds).padStart(2, "0")}</time>
      <p>LINE 02 IS BREATHING<br />DO NOT WAIT FOR A REPLY</p>
    </aside>
    <div className="social-links"><span>OTHER WAYS TO REACH ME</span>
      {portfolio.github && <a href={portfolio.github} target="_blank" rel="noreferrer">GITHUB ↗</a>}
      {portfolio.linkedin && <a href={portfolio.linkedin} target="_blank" rel="noreferrer">LINKEDIN ↗</a>}
    </div>
    <p className="offair-fineprint">FINAL CONNECTION WINDOW / MESSAGE RETENTION CANNOT BE GUARANTEED / HANG UP IF THE TONE SPEAKS FIRST</p>
  </div>;
}

function SignalLoss({ target }: { target?: string }) {
  return <div className="signal-loss"><div className="static-bars" /><span>SEARCHING</span><small>NEXT: {target || "UNKNOWN"}</small></div>;
}

function SetupPanel({ draft, setDraft, syncing, error, onSave, onClose }: { draft: Portfolio; setDraft: (value: Portfolio) => void; syncing: boolean; error: string; onSave: () => void; onClose: () => void }) {
  const field = (key: keyof Omit<Portfolio, "projects">, value: string) => setDraft({ ...draft, [key]: value });
  const updateProject = (index: number, patch: Partial<Project>) => setDraft({ ...draft, projects: draft.projects.map((project, i) => i === index ? { ...project, ...patch } : project) });

  return <div className="setup-backdrop" role="dialog" aria-modal="true" aria-label="Station setup">
    <section className="setup-panel">
      <header><div><span>MASTER CONTROL</span><h2>STATION SETUP</h2></div><button onClick={onClose} aria-label="Close setup">×</button></header>
      <p className="setup-intro">Enter the normal portfolio details. Public GitHub repositories become project channels, deployed links open inside the studio, and the anchor delivers only a brief introduction.</p>
      <div className="setup-section">
        <h3>01 / IDENTITY</h3>
        <div className="form-grid">
          <label>NAME<input value={draft.name} onChange={e => field("name", e.target.value)} /></label>
          <label>ROLE<input value={draft.role} onChange={e => field("role", e.target.value)} /></label>
          <label>LOCATION<input value={draft.location} onChange={e => field("location", e.target.value)} /></label>
          <label>EMAIL<input type="email" value={draft.email} onChange={e => field("email", e.target.value)} /></label>
          <label className="wide">SHORT BIO<textarea value={draft.bio} onChange={e => field("bio", e.target.value)} rows={3} /></label>
          <label>GITHUB PROFILE<input type="url" placeholder="https://github.com/you" value={draft.github} onChange={e => field("github", e.target.value)} /></label>
          <label>LINKEDIN<input type="url" placeholder="https://linkedin.com/in/you" value={draft.linkedin} onChange={e => field("linkedin", e.target.value)} /></label>
        </div>
      </div>
      <div className="setup-section">
        <div className="section-title"><h3>02 / PROJECT CHANNELS</h3><button onClick={() => setDraft({ ...draft, projects: [...draft.projects, newProject()] })}>+ ADD CHANNEL</button></div>
        <p className="field-note">Add the deployed project and give the anchor one or two short sentences. The exact voice clip is cached after its first broadcast. Some hosts block embedded views, so every channel also keeps an external link.</p>
        {draft.projects.map((project, index) => <div className="project-form" key={project.id}>
          <b>CH {String(index + 2).padStart(2, "0")}</b>
          <label>GITHUB REPOSITORY<input type="url" placeholder="https://github.com/you/project" value={project.repoUrl} onChange={e => updateProject(index, { repoUrl: e.target.value, syncError: undefined })} /></label>
          <label>LIVE PROJECT <small>OPTIONAL</small><input type="url" placeholder="https://project.example" value={project.liveUrl} onChange={e => updateProject(index, { liveUrl: e.target.value })} /></label>
          <label>CUSTOM TITLE <small>OPTIONAL</small><input placeholder="Defaults to repository name" value={project.title} onChange={e => updateProject(index, { title: e.target.value })} /></label>
          <label className="anchor-copy">ANCHOR INTRO <small>ONE OR TWO SENTENCES</small><textarea rows={3} maxLength={360} placeholder="A short introduction, then invite the viewer to explore…" value={project.broadcastScript} onChange={e => updateProject(index, { broadcastScript: e.target.value })} /></label>
          <button className="remove" onClick={() => setDraft({ ...draft, projects: draft.projects.filter((_, i) => i !== index) })}>REMOVE</button>
          {project.syncError && <span className="form-error">{project.syncError}</span>}
        </div>)}
      </div>
      <footer><span>{error ? `SAVE ERROR / ${error}` : "Saved to your owner account and published to every visitor."}</span><button className="save-station" onClick={onSave} disabled={syncing}>{syncing ? "RECOVERING TRANSMISSIONS…" : "SAVE + SYNC STATION"}</button></footer>
    </section>
  </div>;
}
