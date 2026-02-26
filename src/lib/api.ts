import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/components/ChatInterface";
import type { MCQ, ShortAnswer } from "@/components/StudyMode";

// Session ID for anonymous usage
function getSessionId(): string {
  let id = localStorage.getItem("askmynotes_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("askmynotes_session", id);
  }
  return id;
}

export const sessionId = getSessionId();

export async function fetchSubjects() {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at");
  if (error) throw error;
  return (data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    createdAt: new Date(s.created_at),
    documentCount: s.document_count,
  }));
}

export async function createSubject(name: string) {
  const { data, error } = await supabase
    .from("subjects")
    .insert({ name, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    createdAt: new Date(data.created_at),
    documentCount: data.document_count,
  };
}

export async function deleteSubject(id: string) {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadFile(subjectId: string, file: File) {
  const path = `${sessionId}/${subjectId}/${crypto.randomUUID()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file);
  if (uploadError) throw uploadError;

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      subject_id: subjectId,
      filename: file.name,
      storage_path: path,
      file_size: file.size,
    })
    .select()
    .single();
  if (docError) throw docError;

  const { count } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("subject_id", subjectId);

  await supabase
    .from("subjects")
    .update({ document_count: count || 0 })
    .eq("id", subjectId);

  // Fire-and-forget: don't await processing so upload returns fast
  supabase.functions.invoke("process-document", {
    body: {
      document_id: doc.id,
      subject_id: subjectId,
      storage_path: path,
      filename: file.name,
    },
  }).catch((e) => console.error("Process document error:", e));

  return doc;
}

export async function fetchMessages(subjectId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at");
  if (error) throw error;
  return (data || []).map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    citations: m.citations || undefined,
    evidence: m.evidence || undefined,
    confidence: m.confidence || undefined,
    timestamp: new Date(m.created_at),
  }));
}

/** Send a chat message with optional conversation history for multi-turn */
export async function sendMessage(
  subjectId: string,
  question: string,
  conversationHistory?: { role: string; content: string }[],
  mode?: "chat" | "voice_call",
): Promise<{ content: string; citations: any[]; evidence: any[]; confidence: string }> {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: { subject_id: subjectId, question, conversation_history: conversationHistory, mode: mode || "chat" },
  });

  if (error) throw new Error(error.message || "Failed to get response");
  if (data?.error) throw new Error(data.error);

  return {
    content: data.content || "",
    citations: data.citations || [],
    evidence: data.evidence || [],
    confidence: data.confidence || "Medium",
  };
}

/** Transcribe audio using ElevenLabs STT */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-transcribe`,
    {
      method: "POST",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: formData,
    }
  );

  if (!response.ok) throw new Error("Transcription failed");
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.text || "";
}

/** Generate speech from text using ElevenLabs TTS */
export async function textToSpeech(text: string): Promise<HTMLAudioElement> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!response.ok) throw new Error("TTS failed");
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  return audio;
}

export async function fetchDocuments(subjectId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, filename, file_size, created_at")
    .eq("subject_id", subjectId)
    .order("created_at");
  if (error) throw error;
  return (data || []).map((d: any) => ({
    id: d.id,
    name: d.filename,
    size: d.file_size,
    status: "done" as const,
  }));
}

export async function generateStudyQuestions(subjectId: string): Promise<{ mcqs: MCQ[]; shortAnswers: ShortAnswer[] }> {
  const { data, error } = await supabase.functions.invoke("study", {
    body: { subject_id: subjectId },
  });

  if (error) throw error;

  const mcqs = (data.mcqs || []).map((m: any, i: number) => ({
    ...m,
    id: m.id || String(i + 1),
  }));

  const shortAnswers = (data.shortAnswers || []).map((s: any, i: number) => ({
    ...s,
    id: s.id || String(i + 1),
  }));

  return { mcqs, shortAnswers };
}
