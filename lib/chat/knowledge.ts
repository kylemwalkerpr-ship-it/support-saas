export const SUPPORT_INBOXES = [
  'support@yousafeconsultancy.com',
  'admin@yousafeconsultancy.com',
  'info@yousafeconsultancy.com',
]

export const SYSTEM_KNOWLEDGE = `
Yousafe Consultancy helps international students and newcomers with study abroad, immigration-adjacent planning, document preparation, settlement support, and consultant-guided services.

Core destinations:
- USA: F-1 student visa planning, school transfer support, OPT/STEM OPT guidance, arrival planning, and student support.
- Canada: study permit planning, PGWP awareness, financial proof, settlement planning, and student support.

Platform basics:
- Website visitors can ask questions through the chat widget and request a live support agent.
- Admin/support can monitor conversations, queue live-agent requests, reply to customers, mark tickets read, escalate, resolve, and close inquiries.

Support behavior:
- Give concise, practical answers.
- Do not provide legal guarantees or claim visa approval certainty.
- Encourage customers to book or request a consultant when their case depends on personal facts.
- Escalate to a live agent when the visitor asks for a human, live agent, consultant, refund, payment issue, urgent problem, complaint, or account-specific status.
`

export function shouldEscalateToLiveAgent(message: string) {
  const text = message.toLowerCase()
  return [
    'human',
    'live agent',
    'agent',
    'consultant',
    'representative',
    'support team',
    'refund',
    'payment issue',
    'billing issue',
    'complaint',
    'urgent',
    'account',
    'my order',
    'status of my',
  ].some((phrase) => text.includes(phrase))
}

export function estimateWaitMinutes(queuePosition: number, availableAgents: number) {
  if (availableAgents > 0 && queuePosition <= availableAgents) return 2
  return Math.max(4, queuePosition * 4)
}
