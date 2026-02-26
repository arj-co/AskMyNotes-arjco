import { useState, useRef, useCallback, useEffect } from "react";
import { Phone, PhoneOff, Mic, Volume2, Loader2 } from "lucide-react";
import { transcribeAudio, textToSpeech, sendMessage } from "@/lib/api";
import { toast } from "sonner";
import type { ChatMessage } from "@/components/ChatInterface";

interface VoiceCallProps {
  subjectId: string;
  subjectName: string;
  chatMessages: ChatMessage[];
  onClose: () => void;
}

type CallState = "idle" | "greeting" | "listening" | "transcribing" | "thinking" | "speaking";

export function VoiceCall({ subjectId, subjectName, chatMessages, onClose }: VoiceCallProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [callHistory, setCallHistory] = useState<{ role: string; content: string }[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const streamRef = useRef<MediaStream | null>(null);

  // Timer
  useEffect(() => {
    if (callState !== "idle") {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callState !== "idle"]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const speak = useCallback(async (text: string) => {
    setCallState("speaking");
    setAiResponse(text);
    try {
      const audio = await textToSpeech(text);
      audioRef.current = audio;
      return new Promise<void>((resolve) => {
        audio.onended = () => { audioRef.current = null; resolve(); };
        audio.onerror = () => { audioRef.current = null; resolve(); };
        audio.play();
      });
    } catch {
      toast.error("Voice synthesis failed");
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    setCallState("listening");
    setTranscript("");

    try {
      // Reuse existing stream or get new one
      if (!streamRef.current || streamRef.current.getTracks().some(t => t.readyState === "ended")) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (!activeRef.current) return;

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 500) {
          // Too short, restart listening
          if (activeRef.current) startListening();
          return;
        }

        setCallState("transcribing");
        try {
          const text = await transcribeAudio(audioBlob);
          if (!text.trim()) {
            if (activeRef.current) startListening();
            return;
          }

          setTranscript(text);
          setCallState("thinking");

          // Build full context: previous chat + this call's history
          const chatContext = chatMessages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          }));
          const fullHistory = [...chatContext, ...callHistory];

          const result = await sendMessage(subjectId, text, fullHistory, "voice_call");

          setCallHistory((prev) => [
            ...prev,
            { role: "user", content: text },
            { role: "assistant", content: result.content },
          ]);

          await speak(result.content);

          // After speaking, listen again
          if (activeRef.current) startListening();
        } catch (e: any) {
          toast.error(e.message || "Failed to process");
          if (activeRef.current) startListening();
        }
      };

      mediaRecorder.start();

      // Auto-stop after 15 seconds of recording
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 15000);
    } catch {
      toast.error("Microphone access denied");
      endCall();
    }
  }, [subjectId, chatMessages, callHistory, speak]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startCall = useCallback(async () => {
    activeRef.current = true;
    setCallState("greeting");
    setCallHistory([]);
    setCallDuration(0);

    // Build greeting based on recent chat context
    const recentTopics = chatMessages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join(", ");

    const greetingPrompt = recentTopics
      ? `The student just started a voice call. They've been asking about: ${recentTopics}. Greet them warmly, briefly reference what they were studying, and ask what they'd like help with now.`
      : `The student just started a voice call for ${subjectName}. Greet them warmly and ask what they'd like to learn about or need help with.`;

    try {
      const chatContext = chatMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await sendMessage(subjectId, greetingPrompt, chatContext, "voice_call");

      setCallHistory([
        { role: "user", content: greetingPrompt },
        { role: "assistant", content: result.content },
      ]);

      await speak(result.content);

      if (activeRef.current) startListening();
    } catch (e: any) {
      toast.error(e.message || "Failed to start call");
      endCall();
    }
  }, [subjectId, subjectName, chatMessages, speak, startListening]);

  const endCall = useCallback(() => {
    activeRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    // Stop all tracks
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearInterval(timerRef.current);
    setCallState("idle");
    onClose();
  }, [onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
    };
  }, []);

  const stateLabels: Record<CallState, string> = {
    idle: "Ready to call",
    greeting: "Connecting...",
    listening: "Listening...",
    transcribing: "Processing...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  };

  // Idle state - show call button
  if (callState === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-fade-in">
        <div className="text-center space-y-6">
          <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <Phone className="w-10 h-10 text-accent" />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">
              Voice Teacher Mode
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Start a live conversation with your AI teacher about{" "}
              <span className="font-medium text-foreground">{subjectName}</span>.
              It'll reference your notes and previous chat.
            </p>
          </div>
          <button
            onClick={startCall}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-accent text-accent-foreground font-medium text-lg hover:opacity-90 transition-opacity shadow-lg"
          >
            <Phone className="w-5 h-5" />
            Start Call
          </button>
          <button
            onClick={onClose}
            className="block mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to chat
          </button>
        </div>
      </div>
    );
  }

  // Active call
  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in">
      <div className="text-center space-y-8 max-w-md w-full px-6">
        {/* Visualizer / status */}
        <div className="relative">
          <div
            className={`w-32 h-32 rounded-full mx-auto flex items-center justify-center transition-all duration-500 ${
              callState === "speaking"
                ? "bg-accent/20 shadow-[0_0_60px_rgba(var(--accent),0.3)]"
                : callState === "listening"
                ? "bg-primary/20 shadow-[0_0_60px_rgba(var(--primary),0.3)]"
                : "bg-muted"
            }`}
          >
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                callState === "speaking"
                  ? "bg-accent/30 animate-pulse"
                  : callState === "listening"
                  ? "bg-primary/30 animate-pulse"
                  : "bg-muted-foreground/10"
              }`}
            >
              {callState === "speaking" ? (
                <Volume2 className="w-8 h-8 text-accent" />
              ) : callState === "listening" ? (
                <Mic className="w-8 h-8 text-primary" />
              ) : (
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              )}
            </div>
          </div>
        </div>

        {/* Status label - no transcript text shown */}
        <div>
          <p className="text-lg font-medium text-foreground">{stateLabels[callState]}</p>
          <p className="text-sm text-muted-foreground mt-1">{formatTime(callDuration)}</p>
        </div>

        {/* Tap to stop speaking */}
        {callState === "speaking" && (
          <button
            onClick={() => { audioRef.current?.pause(); audioRef.current = null; if (activeRef.current) startListening(); }}
            className="px-6 py-3 rounded-full bg-accent/10 text-accent font-medium text-sm hover:bg-accent/20 transition-colors animate-pulse"
          >
            Tap to stop speaking
          </button>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {callState === "listening" && (
            <button
              onClick={stopListening}
              className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
              title="Done speaking"
            >
              <Mic className="w-6 h-6" />
            </button>
          )}
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity shadow-lg"
            title="End call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
