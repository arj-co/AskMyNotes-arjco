import { useState } from "react";
import { BookOpen, GraduationCap, Brain } from "lucide-react";

export interface Subject {
  id: string;
  name: string;
  createdAt: Date;
  documentCount: number;
}

const SUBJECT_ICONS = [BookOpen, GraduationCap, Brain];
const SUBJECT_COLORS = ["bg-subject-1", "bg-subject-2", "bg-subject-3"];

interface SubjectManagerProps {
  subjects: Subject[];
  activeSubject: Subject | null;
  onSelectSubject: (subject: Subject) => void;
  onCreateSubject: (name: string) => void;
  onDeleteSubject: (id: string) => void;
}

export function SubjectManager({
  subjects,
  activeSubject,
  onSelectSubject,
  onCreateSubject,
  onDeleteSubject,
}: SubjectManagerProps) {
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = () => {
    if (newName.trim() && subjects.length < 3) {
      onCreateSubject(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Subjects ({subjects.length}/3)
        </h2>
      </div>

      <div className="space-y-2">
        {subjects.map((subject, i) => {
          const Icon = SUBJECT_ICONS[i % 3];
          const isActive = activeSubject?.id === subject.id;
          return (
            <button
              key={subject.id}
              onClick={() => onSelectSubject(subject)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all duration-200 group ${
                isActive
                  ? "bg-primary/10 ring-2 ring-primary/30"
                  : "hover:bg-secondary"
              }`}
            >
              <div
                className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${SUBJECT_COLORS[i % 3]} text-primary-foreground`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                  {subject.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subject.documentCount} file{subject.documentCount !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSubject(subject.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity text-xs px-1"
                aria-label="Delete subject"
              >
                ✕
              </button>
            </button>
          );
        })}
      </div>

      {subjects.length < 3 && (
        <>
          {isCreating ? (
            <div className="space-y-2 animate-fade-in">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Subject name..."
                className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  Create
                </button>
                <button
                  onClick={() => { setIsCreating(false); setNewName(""); }}
                  className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full px-3 py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors"
            >
              + Add Subject
            </button>
          )}
        </>
      )}
    </div>
  );
}
