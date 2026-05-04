import { SYSTEM_KNOWLEDGE } from '@/lib/chat/knowledge'

const FALLBACK_ANSWER =
  "I can help with Yousafe services, USA and Canada student pathways, portal questions, documents, billing basics, and getting you to a live support agent. For case-specific immigration advice, I can collect your question and connect you with the team."

function extractResponseText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null

  const outputText = (data as { output_text?: unknown }).output_text
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim()
  }

  const output = (data as { output?: unknown }).output
  if (!Array.isArray(output)) return null

  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue

    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string' && text.trim()) {
        chunks.push(text.trim())
      }
    }
  }

  return chunks.length ? chunks.join('\n') : null
}

export async function generateChatAnswer({
  message,
  history,
}: {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
}) {
  if (!process.env.OPENAI_API_KEY) {
    return FALLBACK_ANSWER
  }

  const recentHistory = history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
    .join('\n')

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions: SYSTEM_KNOWLEDGE,
        input: `${recentHistory}\nCustomer: ${message}`,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('OpenAI chat response failed', data)
      return FALLBACK_ANSWER
    }

    return extractResponseText(data) ?? FALLBACK_ANSWER
  } catch (error) {
    console.error('OpenAI chat response error', error)
    return FALLBACK_ANSWER
  }
}
