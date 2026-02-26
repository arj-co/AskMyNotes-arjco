# AskMyNotes

A focused study workspace built around one constraint:  
**You can create up to three subjects — and everything stays strictly inside them.**

Upload your notes. Ask questions. Generate quizzes.  
All answers are grounded entirely in your own material.

Repository: https://github.com/arj-co/AskMyNotes-arjco

---

# Overview

AskMyNotes turns static notes into an interactive revision system.

Each subject acts as an isolated knowledge container. The system:

- Answers questions strictly from uploaded notes
- Provides citations and evidence snippets
- Includes a confidence level for every answer
- Explicitly states when something is not found
- Generates quizzes grounded only in your content

No external knowledge is injected. No guessing. No hallucinated answers.

---

# Core Features

## 1. Three-Subject Limit

- Maximum of 3 subjects
- Clear subject isolation
- Context resets when switching subjects
- Prevents cross-topic contamination

## 2. Note Upload

- Upload PDF or TXT files
- Notes are processed and indexed per subject
- Files are tied strictly to their subject

## 3. Subject-Scoped Q&A

When you ask a question:

- The system retrieves relevant content from the selected subject only
- Generates an answer strictly from retrieved material
- Returns:
  - Answer
  - Citations (file + page/chunk)
  - Evidence snippets
  - Confidence level (High / Medium / Low)

If information is not present:
> “Not found in your notes for [Subject]”

## 4. Study Mode

Automatically generates:
- 5 multiple-choice questions
- 3 short-answer questions

All questions:
- Are grounded in your notes
- Include citations
- Stay within subject scope

---

# How It Works (Conceptually)

1. You create a subject.
2. You upload notes for that subject.
3. Notes are processed and structured.
4. When you ask a question:
   - Relevant segments are retrieved.
   - An answer is generated only from those segments.
   - Output is validated and structured.

Strict grounding ensures reliability.

---

# Getting Started (Local Setup)

## 1. Clone the Repository

```bash
git clone https://github.com/arj-co/AskMyNotes-arjco.git
cd AskMyNotes-arjco
2. Install Dependencies
`npm i`
`npm run dev`

Make sure Node.js and npm are installed.

Usage Flow

Step 1 — Create a Subject
	•	You can create up to 3 subjects.
	•	This defines the knowledge boundary.

Step 2 — Upload Notes
	•	Add at least one file to activate Q&A.
	•	Notes become the only source of truth.

Step 3 — Ask Questions
	•	Select a subject.
	•	Ask a question.
	•	Receive:
	•	Grounded answer
	•	Citations
	•	Evidence snippets
	•	Confidence level

Step 4 — Study Mode
	•	Generate practice questions from your material.
	•	Test understanding without drifting outside your syllabus.

⸻
Why AskMyNotes

Most AI tools are general-purpose.
AskMyNotes is constrained by design.

It strengthens revision by:
	•	Eliminating hallucination
	•	Enforcing source grounding
	•	Keeping subjects isolated
	•	Providing citation transparency

The goal is not broader intelligence.
The goal is controlled, reliable study.
