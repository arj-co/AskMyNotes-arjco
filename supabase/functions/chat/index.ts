import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject_id, question } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const { data: chunks } = await supabase
      .from("chunks")
      .select("content, page_number, document_id, chunk_index")
      .eq("subject_id", subject_id)
      .order("chunk_index");

    if (!chunks || chunks.length === 0) {
      const result = {
        content: "I don't have any notes to reference yet. Please upload some documents first.",
        citations: [],
        evidence: [],
        confidence: "Low",
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docIds = [...new Set(chunks.map((c) => c.document_id))];
    const { data: docs } = await supabase
      .from("documents")
      .select("id, filename")
      .in("id", docIds);

    const docMap = new Map(docs?.map((d) => [d.id, d.filename]) || []);

    let cumulativeLine = 1;
    const context = chunks
      .map((c, idx) => {
        const filename = docMap.get(c.document_id) || "unknown";
        const lines = c.content.split("\n");
        const startLine = cumulativeLine;
        const numberedContent = lines.map((line, li) => `L${startLine + li}: ${line}`).join("\n");
        cumulativeLine += lines.length;
        return `[Source: ${filename}, Page ${c.page_number || "N/A"}, Section ${idx + 1}]\n${numberedContent}`;
      })
      .join("\n\n---\n\n");

    // Single call: answer + citations in one shot using tool calling
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a study assistant for "${subject.name}". Answer ONLY from the notes below. Use markdown. After answering, call the respond tool with your answer and extracted citations.

NOTES:
${context}`,
          },
          { role: "user", content: question },
        ],
        temperature: 0.3,
        tools: [
          {
            type: "function",
            function: {
              name: "respond",
              description: "Return the answer with citations and evidence extracted from the notes.",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "The full markdown answer" },
                  citations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        filename: { type: "string" },
                        page: { type: "string" },
                      },
                      required: ["filename", "page"],
                    },
                  },
                  evidence: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        quote: { type: "string" },
                        page: { type: "string" },
                        section: { type: "string" },
                        lines: { type: "string", description: "Line range like L12-L15" },
                      },
                      required: ["quote", "lines"],
                    },
                  },
                  confidence: { type: "string", enum: ["High", "Medium", "Low"] },
                },
                required: ["content", "citations", "evidence", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "respond" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    let result = { content: "", citations: [], evidence: [], confidence: "Medium" };
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        // Fallback: use plain message content
        result.content = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
      }
    } else {
      result.content = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
    }

    // Save to DB (fire and forget)
    supabase.from("chat_messages").insert({ subject_id, role: "user", content: question }).then(() => {});
    supabase.from("chat_messages").insert({
      subject_id, role: "assistant", content: result.content,
      citations: result.citations, evidence: result.evidence, confidence: result.confidence,
    }).then(() => {});

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
