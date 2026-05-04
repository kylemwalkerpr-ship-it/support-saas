import { SYSTEM_KNOWLEDGE } from '@/lib/chat/knowledge'

const FALLBACK_ANSWER =
  "I can help with Yousafe services, USA and Canada student pathways, portal questions, documents, billing basics, and getting you to a live support agent. For case-specific immigration advice, I can collect your question and connect you with the team."

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

    return (
      data.output_text ||
      data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || [])
        ?.map((content: { text?: string }) => content.text)
        ?.filter(Boolean)
        ?.join('\n') ||
      FALLBACK_ANSWER
    )
  } catch (error) {
    console.error('OpenAI chat response error', error)
    return FALLBACK_ANSWER
  }
}
