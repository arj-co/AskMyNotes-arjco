import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

function estimatePage(charIndex: number, totalChars: number, estimatedPages: number): number {
  return Math.max(1, Math.ceil((charIndex / totalChars) * estimatedPages));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id, subject_id, storage_path, filename } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    let text = "";

    if (filename.endsWith(".txt")) {
      text = await fileData.text();
    } else if (filename.endsWith(".pdf")) {
      // For PDFs, extract text - basic extraction from raw bytes
      // We'll use the AI to help extract if needed, but for now do basic text extraction
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      
      // Extract text between stream/endstream markers (basic PDF text extraction)
      const streamMatches = rawText.matchAll(/stream\r?\n([\s\S]*?)endstream/g);
      const textParts: string[] = [];
      for (const match of streamMatches) {
        // Filter to only readable text
        const cleaned = match[1].replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
        if (cleaned.length > 20) {
          textParts.push(cleaned);
        }
      }
      
      if (textParts.length > 0) {
        text = textParts.join("\n\n");
      } else {
        // Fallback: try to get any readable text
        text = rawText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, "\n").trim();
        // Take only meaningful portions
        const lines = text.split("\n").filter(l => l.trim().length > 10);
        text = lines.join("\n");
      }
    }

    if (!text || text.trim().length < 10) {
      // Use AI to describe that we couldn't extract text
      text = `[Document: ${filename} - Text extraction was limited. The document may contain images or complex formatting.]`;
    }

    // Chunk the text
    const textChunks = chunkText(text);
    const estimatedPages = Math.max(1, Math.ceil(text.length / 3000));

    // Insert chunks
    const chunkRows = textChunks.map((content, index) => ({
      document_id,
      subject_id,
      content,
      page_number: estimatePage(index * 800, text.length, estimatedPages),
      chunk_index: index,
    }));

    const { error: insertError } = await supabase.from("chunks").insert(chunkRows);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, chunks_created: chunkRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process document error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
