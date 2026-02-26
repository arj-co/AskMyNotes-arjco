import { useState, useCallback, useEffect } from "react";
import { MessageSquare, GraduationCap, Upload, BookOpen, FileText, Brain, Sparkles } from "lucide-react";
import { SubjectManager, type Subject } from "@/components/SubjectManager";
import { FileUpload } from "@/components/FileUpload";
import { ChatInterface, type ChatMessage } from "@/components/ChatInterface";
import { StudyMode, type MCQ, type ShortAnswer } from "@/components/StudyMode";
import { toast } from "sonner";
import {
  fetchSubjects,
  createSubject as apiCreateSubject,
  deleteSubject as apiDeleteSubject,
  uploadFile,
  fetchMessages,
  sendMessage,
  generateStudyQuestions,
} from "@/lib/api";

type Tab = "chat" | "study";

export default function Index() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [studyData, setStudyData] = useState<Record<string, { mcqs: MCQ[]; shortAnswers: ShortAnswer[] }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [onboardingName, setOnboardingName] = useState("");

  useEffect(() => {
    fetchSubjects().then(setSubjects).catch(() => toast.error("Failed to load subjects"));
  }, []);

  useEffect(() => {
    if (!activeSubject) return;
    if (messages[activeSubject.id]) return;
    fetchMessages(activeSubject.id)
      .then((msgs) => setMessages((prev) => ({ ...prev, [activeSubject.id]: msgs })))
      .catch(() => {});
  }, [activeSubject?.id]);

  const createSubject = useCallback(async (name: string) => {
    if (subjects.length >= 3) return;
    try {
      const newSubject = await apiCreateSubject(name);
      setSubjects((prev) => [...prev, newSubject]);
      setActiveSubject(newSubject);
      
      setOnboardingName("");
    } catch {
      toast.error("Failed to create subject");
    }
  }, [subjects]);

  const deleteSubject = useCallback(async (id: string) => {
    try {
      await apiDeleteSubject(id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      if (activeSubject?.id === id) setActiveSubject(null);
    } catch {
      toast.error("Failed to delete subject");
    }
  }, [activeSubject]);

  const handleUpload = useCallback(async (files: File[]) => {
    if (!activeSubject) return;
    for (const file of files) {
      try {
        await uploadFile(activeSubject.id, file);
      } catch (e: any) {
        toast.error(`Failed to upload ${file.name}`);
        console.error(e);
      }
    }
    const updated = await fetchSubjects();
    setSubjects(updated);
    const refreshed = updated.find((s) => s.id === activeSubject.id);
    if (refreshed) setActiveSubject(refreshed);
    toast.success("Files uploaded & processed");
  }, [activeSubject]);

  const handleSend = useCallback(async (content: string) => {
    if (!activeSubject) return;
    const subjectId = activeSubject.id;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => ({
      ...prev,
      [subjectId]: [...(prev[subjectId] || []), userMsg],
    }));

    setIsLoading(true);

    try {
      const result = await sendMessage(subjectId, content);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.content,
        citations: result.citations,
        evidence: result.evidence,
        confidence: result.confidence as any,
        timestamp: new Date(),
      };
      setMessages((prev) => ({
        ...prev,
        [subjectId]: [...(prev[subjectId] || []), assistantMsg],
      }));
    } catch (e: any) {
      toast.error(e.message || "Failed to get response");
    } finally {
      setIsLoading(false);
    }
  }, [activeSubject]);

  const handleGenerateStudy = useCallback(async () => {
    if (!activeSubject) return;
    setIsGenerating(true);
    try {
      const result = await generateStudyQuestions(activeSubject.id);
      setStudyData((prev) => ({ ...prev, [activeSubject.id]: result }));
    } catch {
      toast.error("Failed to generate questions");
    } finally {
      setIsGenerating(false);
    }
  }, [activeSubject]);

  const currentMessages = activeSubject ? messages[activeSubject.id] || [] : [];
  const currentStudy = activeSubject ? studyData[activeSubject.id] : undefined;

  // ── No subjects: full-screen onboarding ──
  if (subjects.length === 0) {
    return (
      <div className="flex h-screen bg-background items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">Welcome to AskMyNotes</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              Create a subject to get started. Upload your notes, ask questions, and study smarter.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              <BookOpen className="w-4 h-4" />
              Create a subject ({subjects.length}/3 created)
            </div>
            <input
              autoFocus
              value={onboardingName}
              onChange={(e) => setOnboardingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && onboardingName.trim()) createSubject(onboardingName.trim());
              }}
              placeholder="e.g. Biology, History, Physics..."
              className="w-full px-4 py-3 rounded-lg bg-secondary text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
            />
            <button
              onClick={() => onboardingName.trim() && createSubject(onboardingName.trim())}
              disabled={!onboardingName.trim()}
              className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Create Subject
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { icon: FileText, title: "RAG-Powered", desc: "Answers from your notes" },
              { icon: Sparkles, title: "AI Citations", desc: "Line & page references" },
              { icon: Brain, title: "Study Mode", desc: "Auto-generated quizzes" },
            ].map((item) => (
              <div key={item.title} className="bg-card/50 border border-border rounded-lg p-3 text-center">
                <item.icon className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs font-medium text-foreground">{item.title}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Has subjects: normal sidebar + main layout ──
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-72 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="font-display text-lg font-bold text-foreground">AskMyNotes</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <SubjectManager
            subjects={subjects}
            activeSubject={activeSubject}
            onSelectSubject={(s) => setActiveSubject(s)}
            onCreateSubject={createSubject}
            onDeleteSubject={deleteSubject}
          />
        </div>

        {activeSubject && (
          <div className="p-4 border-t border-border">
            <FileUpload subjectId={activeSubject.id} subjectName={activeSubject.name} onUpload={handleUpload} />
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-3 flex-shrink-0">
          {activeSubject ? (
            <>
              <h2 className="font-display font-semibold text-foreground truncate">{activeSubject.name}</h2>
              <span className="text-xs text-muted-foreground">
                {activeSubject.documentCount} file{activeSubject.documentCount !== 1 ? "s" : ""}
              </span>
              <div className="ml-auto flex items-center gap-1 bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[36px] ${
                    activeTab === "chat" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
                <button
                  onClick={() => setActiveTab("study")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[36px] ${
                    activeTab === "study" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Study</span>
                </button>
              </div>
            </>
          ) : (
            <h2 className="font-display font-semibold text-muted-foreground">Select a subject</h2>
          )}
        </header>

        <div className="flex-1 min-h-0">
          {!activeSubject ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
              <GraduationCap className="w-10 h-10 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a subject from the sidebar to begin</p>
            </div>
          ) : activeTab === "chat" ? (
            <ChatInterface
              subjectName={activeSubject.name}
              messages={currentMessages}
              onSend={handleSend}
              isLoading={isLoading}
            />
          ) : (
            <StudyMode
              subjectName={activeSubject.name}
              mcqs={currentStudy?.mcqs || []}
              shortAnswers={currentStudy?.shortAnswers || []}
              onGenerate={handleGenerateStudy}
              isGenerating={isGenerating}
            />
          )}
        </div>
      </main>
    </div>
  );
}
