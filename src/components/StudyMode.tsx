import { useState } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Sparkles, Quote } from "lucide-react";

function ConfidenceBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const colors = {
    High: "bg-success/10 text-success",
    Medium: "bg-warning/10 text-warning",
    Low: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[level]}`}>
      {level}
    </span>
  );
}

interface MCQOption {
  label: string;
  text: string;
}

interface MCQ {
  id: string;
  question: string;
  options: MCQOption[];
  correctAnswer: string;
  explanation: string;
  citation: { filename: string; page: string };
  confidence: "High" | "Medium" | "Low";
  quotedText?: string;
  quotedLines?: string;
}

interface ShortAnswer {
  id: string;
  question: string;
  modelAnswer: string;
  citation: { filename: string; page: string };
  confidence: "High" | "Medium" | "Low";
  quotedText?: string;
  quotedLines?: string;
}

interface StudyModeProps {
  subjectName: string;
  mcqs: MCQ[];
  shortAnswers: ShortAnswer[];
  onGenerate: () => void;
  isGenerating: boolean;
}

function QuotedText({ text, lines }: { text?: string; lines?: string }) {
  if (!text) return null;
  return (
    <blockquote className="pl-3 border-l-2 border-primary/30 text-xs text-muted-foreground italic mt-2">
      <Quote className="w-3 h-3 inline mr-1 opacity-50" />
      "{text}"
      {lines && (
        <span className="block mt-1 not-italic font-medium text-muted-foreground/70">
          Lines {lines}
        </span>
      )}
    </blockquote>
  );
}

function MCQCard({ mcq, index }: { mcq: MCQ; index: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const answered = selected !== null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <p className="text-sm font-medium text-foreground leading-relaxed">{mcq.question}</p>
      </div>

      <div className="space-y-2 pl-10">
        {mcq.options.map((opt) => {
          const isCorrect = opt.label === mcq.correctAnswer;
          const isSelected = opt.label === selected;
          let optStyle = "border-border hover:border-primary/40 hover:bg-secondary/50";
          if (answered) {
            if (isCorrect) optStyle = "border-success bg-success/5";
            else if (isSelected && !isCorrect) optStyle = "border-destructive bg-destructive/5";
            else optStyle = "border-border opacity-50";
          }

          return (
            <button
              key={opt.label}
              disabled={answered}
              onClick={() => setSelected(opt.label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all min-h-[44px] ${optStyle}`}
            >
              <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold ${
                answered && isCorrect
                  ? "bg-success text-success-foreground"
                  : answered && isSelected
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}>
                {answered && isCorrect ? <CheckCircle className="w-3.5 h-3.5" /> :
                 answered && isSelected ? <XCircle className="w-3.5 h-3.5" /> : opt.label}
              </span>
              <span className="text-foreground">{opt.text}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="pl-10 space-y-2 animate-fade-in">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showExplanation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Explanation
          </button>
          {showExplanation && (
            <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 animate-fade-in space-y-2">
              <p>{mcq.explanation}</p>
              <QuotedText text={mcq.quotedText} lines={mcq.quotedLines} />
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-card rounded text-xs">
                  <FileText className="w-2.5 h-2.5" /> {mcq.citation.filename}, p.{mcq.citation.page}
                </span>
                <ConfidenceBadge level={mcq.confidence} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShortAnswerCard({ sa, index }: { sa: ShortAnswer; index: number }) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
          S{index + 1}
        </span>
        <p className="text-sm font-medium text-foreground leading-relaxed">{sa.question}</p>
      </div>

      <div className="pl-10">
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
        >
          {showAnswer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showAnswer ? "Hide" : "Show"} Model Answer
        </button>
        {showAnswer && (
          <div className="mt-2 text-sm text-foreground bg-secondary/50 rounded-lg p-3 space-y-2 animate-fade-in">
            <p>{sa.modelAnswer}</p>
            <QuotedText text={sa.quotedText} lines={sa.quotedLines} />
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-card rounded text-xs text-muted-foreground">
                <FileText className="w-2.5 h-2.5" /> {sa.citation.filename}, p.{sa.citation.page}
              </span>
              <ConfidenceBadge level={sa.confidence} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StudyMode({ subjectName, mcqs, shortAnswers, onGenerate, isGenerating }: StudyModeProps) {
  if (mcqs.length === 0 && shortAnswers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-accent" />
        </div>
        <h3 className="font-display text-lg font-semibold text-foreground mb-1">Study Mode</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Generate quiz questions from your {subjectName} notes. Get MCQs and short-answer questions with explanations.
        </p>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 min-h-[44px]"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
              Generating...
            </span>
          ) : (
            "Generate Study Questions"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Study: {subjectName}</h2>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 min-h-[44px]"
          >
            {isGenerating ? "Generating..." : "Regenerate"}
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Multiple Choice ({mcqs.length})
          </h3>
          {mcqs.map((mcq, i) => (
            <MCQCard key={mcq.id} mcq={mcq} index={i} />
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Short Answer ({shortAnswers.length})
          </h3>
          {shortAnswers.map((sa, i) => (
            <ShortAnswerCard key={sa.id} sa={sa} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export type { MCQ, ShortAnswer };
