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

    const arrayBuf = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    
    let text = "";
    
    if (filename.endsWith(".txt")) {
      text = await fileData.text();
    } else if (filename.endsWith(".pdf")) {
      // Use AI to extract text from PDF - sends as base64
      // Chunked base64 conversion to avoid call stack overflow
      const chunkSize = 8192;
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        for (let j = 0; j < slice.length; j++) {
          binary += String.fromCharCode(slice[j]);
        }
      }
      const base64 = btoa(binary);
      
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract ALL text content from this PDF document. Return ONLY the extracted text, preserving structure, headings, and paragraphs. No commentary.",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:application/pdf;base64,${base64}` },
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 16000,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        text = aiData.choices?.[0]?.message?.content || "";
      }
      
      // Fallback if AI extraction failed
      if (!text || text.trim().length < 10) {
        const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        text = rawText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, "\n").trim();
        const lines = text.split("\n").filter(l => l.trim().length > 10);
        text = lines.join("\n");
      }
    }

    if (!text || text.trim().length < 10) {
      text = `[Document: ${filename} - Text extraction was limited. The document may contain images or complex formatting.]`;
    }

    // Chunk the text
    const textChunks = chunkText(text);
    const estimatedPages = Math.max(1, Math.ceil(text.length / 3000));

    // Verify document still exists before inserting chunks
    const { data: docCheck } = await supabase.from("documents").select("id").eq("id", document_id).single();
    if (!docCheck) {
      throw new Error("Document was deleted before processing completed");
    }

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
