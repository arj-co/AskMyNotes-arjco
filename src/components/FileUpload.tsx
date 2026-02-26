import { useCallback, useState, useRef, useEffect } from "react";
import { Upload, FileText, X, CheckCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { fetchDocuments } from "@/lib/api";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "processing" | "done" | "error";
  progress?: number;
}

interface FileUploadProps {
  subjectId: string;
  subjectName: string;
  onUpload: (files: File[]) => Promise<void>;
}

export function FileUpload({ subjectId, subjectName, onUpload }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load existing files from DB
  useEffect(() => {
    if (!subjectId) return;
    fetchDocuments(subjectId)
      .then((docs) => setFiles(docs))
      .catch(() => {});
  }, [subjectId]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || isUploading) return;
    const accepted = Array.from(fileList).filter(
      (f) => f.name.endsWith(".pdf") || f.name.endsWith(".txt")
    );
    if (accepted.length === 0) return;

    const newFiles: UploadedFile[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      status: "uploading" as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
    setIsUploading(true);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setFiles((prev) =>
        prev.map((f) => {
          const nf = newFiles.find((n) => n.id === f.id);
          if (!nf || f.status !== "uploading") return f;
          const newProgress = Math.min((f.progress || 0) + 15, 90);
          return { ...f, progress: newProgress };
        })
      );
    }, 300);

    // Mark as processing
    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) =>
          newFiles.find((n) => n.id === f.id)
            ? { ...f, status: "processing" as const, progress: 100 }
            : f
        )
      );
    }, 1500);

    try {
      await onUpload(accepted);
      clearInterval(progressInterval);
      // Reload from DB to get real IDs
      const docs = await fetchDocuments(subjectId);
      setFiles(docs);
    } catch {
      clearInterval(progressInterval);
      setFiles((prev) =>
        prev.map((f) =>
          newFiles.find((n) => n.id === f.id)
            ? { ...f, status: "error" as const, progress: 0 }
            : f
        )
      );
    } finally {
      setIsUploading(false);
    }
  }, [onUpload, subjectId, isUploading]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-3">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
          isUploading
            ? "border-muted pointer-events-none opacity-60"
            : dragActive
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/40 hover:bg-secondary/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className={`w-6 h-6 mx-auto mb-1.5 transition-colors ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-xs font-medium text-foreground">
          Drop files or <span className="text-primary">browse</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">PDF or TXT</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
          {files.map((file) => (
            <div key={file.id} className="space-y-1">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-card rounded-lg border border-border">
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
                {file.status === "uploading" && (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                )}
                {file.status === "processing" && (
                  <span className="text-[10px] text-warning font-medium">Processing…</span>
                )}
                {file.status === "done" && (
                  <CheckCircle className="w-3.5 h-3.5 text-success" />
                )}
                {file.status === "error" && (
                  <span className="text-[10px] text-destructive font-medium">Error</span>
                )}
              </div>
              {(file.status === "uploading" || file.status === "processing") && (
                <Progress value={file.progress || 0} className="h-1" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
