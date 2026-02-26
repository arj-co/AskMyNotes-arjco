import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get subject
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", subject_id)
      .single();

    if (!subject) {
      return new Response(JSON.stringify({ error: "Subject not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get chunks
    const { data: chunks } = await supabase
      .from("chunks")
      .select("content, page_number, document_id")
      .eq("subject_id", subject_id)
      .order("chunk_index");

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ mcqs: [], shortAnswers: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get filenames
    const docIds = [...new Set(chunks.map((c) => c.document_id))];
    const { data: docs } = await supabase
      .from("documents")
      .select("id, filename")
      .in("id", docIds);

    const docMap = new Map(docs?.map((d) => [d.id, d.filename]) || []);

    const context = chunks
      .map((c, idx) => {
        const filename = docMap.get(c.document_id) || "unknown";
        const lines = c.content.split("\n");
        const startLine = idx * 50 + 1;
        const numberedContent = lines.map((line, li) => `L${startLine + li}: ${line}`).join("\n");
        return `[Source: ${filename}, Page ${c.page_number || "N/A"}, Section ${idx + 1}]\n${numberedContent}`;
      })
      .join("\n\n---\n\n");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a study assistant for "${subject.name}".

Using ONLY the provided context, generate:

1) 5 Multiple Choice Questions (MCQs)
   - 4 options each
   - Indicate correct answer
   - Provide brief explanation
   - Add citation (file name + chunk/page)

2) 3 Short Answer Questions
   - Provide model answer
   - Add citation

STRICT RULES:
- Do NOT use outside knowledge.
- Do NOT ask questions about metadata, file names, dates, or document properties.
- ONLY ask questions about the actual content and concepts within the notes.
- If insufficient information, say: "Not enough information in notes."
- Every question and answer must include citation.
- Add confidence level (High/Medium/Low) for each question.
- Make questions varied in difficulty. Cover different topics from the notes.

Return response in JSON format:
{
  "mcqs": [
    {
      "id": "unique string",
      "question": "",
      "options": [
        {"label": "A", "text": ""},
        {"label": "B", "text": ""},
        {"label": "C", "text": ""},
        {"label": "D", "text": ""}
      ],
      "correctAnswer": "A/B/C/D",
      "explanation": "",
      "quotedText": "exact short quote from the notes that supports the answer",
      "quotedLines": "L12-L15",
      "citation": {"filename": "", "page": ""},
      "confidence": "High/Medium/Low"
    }
  ],
  "shortAnswers": [
    {
      "id": "unique string",
      "question": "",
      "modelAnswer": "",
      "quotedText": "exact short quote from the notes that supports the answer",
      "quotedLines": "L12-L15",
      "citation": {"filename": "", "page": ""},
      "confidence": "High/Medium/Low"
    }
  ]
}

NOTES:
${context}`,
          },
          { role: "user", content: "Generate study questions from these notes." },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    const result = parsed || { mcqs: [], shortAnswers: [] };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Study error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
