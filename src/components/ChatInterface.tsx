import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, FileText, ChevronDown, ChevronUp, Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { transcribeAudio, textToSpeech } from "@/lib/api";
import { toast } from "sonner";

interface Citation {
  filename: string;
  page: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  evidence?: { quote: string; page: string; section: string; lines: string }[];
  confidence?: "High" | "Medium" | "Low";
  timestamp: Date;
}

interface ChatInterfaceProps {
  subjectName: string;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  isLoading: boolean;
}

function ConfidenceBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const colors = {
    High: "bg-success/10 text-success",
    Medium: "bg-warning/10 text-warning",
    Low: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[level]}`}>
      {level} Confidence
    </span>
  );
}

function SpeakButton({ text }: { text: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSpeak = useCallback(async () => {
    if (isSpeaking && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    try {
      // Strip markdown for cleaner TTS
      const cleanText = text.replace(/[#*_`>\[\]()!]/g, "").replace(/\n{2,}/g, ". ").trim();
      const audio = await textToSpeech(cleanText);
      audioRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); audioRef.current = null; };
      audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; };
      await audio.play();
    } catch {
      toast.error("Failed to generate speech");
      setIsSpeaking(false);
    }
  }, [text, isSpeaking]);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  return (
    <button
      onClick={handleSpeak}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
        isSpeaking
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
      title={isSpeaking ? "Stop speaking" : "Read aloud"}
    >
      <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? "animate-pulse" : ""}`} />
      {isSpeaking ? "Stop" : "Listen"}
    </button>
  );
}

function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="prose prose-sm max-w-none text-foreground leading-relaxed [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4">
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>

      {msg.citations && msg.citations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Citations</p>
          <div className="flex flex-wrap gap-1.5">
            {msg.citations.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-xs text-secondary-foreground">
                <FileText className="w-3 h-3" />
                {c.filename}, {c.page}
              </span>
            ))}
          </div>
        </div>
      )}

      {msg.evidence && msg.evidence.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Supporting Evidence ({msg.evidence.length})
          </button>
          {showEvidence && (
            <div className="mt-2 space-y-2 animate-fade-in">
              {msg.evidence.map((e, i) => (
                <blockquote key={i} className="pl-3 border-l-2 border-primary/30 text-xs text-muted-foreground italic">
                  "{typeof e === 'string' ? e : e.quote}"
                  {typeof e !== 'string' && (e.lines || e.page) && (
                    <span className="block mt-1 not-italic font-medium text-muted-foreground/70">
                      {e.lines && `Lines ${e.lines}`}{e.lines && e.page ? ' · ' : ''}{e.page && `Page ${e.page}`}
                    </span>
                  )}
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {msg.confidence && <ConfidenceBadge level={msg.confidence} />}
        <SpeakButton text={msg.content} />
      </div>
    </div>
  );
}

export function ChatInterface({ subjectName, messages, onSend, isLoading }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeakingResponse, setIsSpeakingResponse] = useState(false);
  const [speakNext, setSpeakNext] = useState(false);
  const speakAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const prevMsgCountRef = useRef(messages.length);

  // Auto-speak latest assistant response when mic was used
  useEffect(() => {
    if (speakNext && !isLoading && messages.length > prevMsgCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant") {
        const cleanText = lastMsg.content.replace(/[#*_`>\[\]()!]/g, "").replace(/\n{2,}/g, ". ").trim();
        setIsSpeakingResponse(true);
        textToSpeech(cleanText).then((audio) => {
          speakAudioRef.current = audio;
          audio.onended = () => { setIsSpeakingResponse(false); speakAudioRef.current = null; setSpeakNext(false); };
          audio.onerror = () => { setIsSpeakingResponse(false); speakAudioRef.current = null; setSpeakNext(false); };
          audio.play();
        }).catch(() => { setIsSpeakingResponse(false); setSpeakNext(false); });
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, isLoading, speakNext]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 1000) return; // too short

        setIsTranscribing(true);
        try {
          const text = await transcribeAudio(audioBlob);
          if (text.trim()) {
            setSpeakNext(true);
            onSend(text.trim());
          } else {
            toast.error("Couldn't understand the audio. Try again.");
          }
        } catch {
          toast.error("Transcription failed");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [onSend]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground mb-1">
              Ask about {subjectName}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Upload your notes, then ask questions. Type or use the <Mic className="inline w-3.5 h-3.5" /> microphone. Answers are grounded strictly in your uploaded materials.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border rounded-bl-md shadow-sm"
              }`}
            >
              {msg.role === "user" ? (
                <p className="text-sm">{msg.content}</p>
              ) : (
                <AssistantMessage msg={msg} />
              )}
            </div>
          </div>
        ))}

        {(isLoading || isTranscribing) && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs text-muted-foreground">Transcribing...</span>
                  </>
                ) : (
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse-soft" />
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse-soft" style={{ animationDelay: "0.3s" }} />
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse-soft" style={{ animationDelay: "0.6s" }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 md:p-4 bg-card/50 backdrop-blur-sm">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || isTranscribing}
            className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 ${
              isRecording
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            }`}
            title={isRecording ? "Stop recording" : "Voice input"}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${subjectName}...`}
            rows={1}
            className="flex-1 resize-none bg-secondary rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export type { ChatMessage, Citation };
