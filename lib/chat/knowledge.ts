export const SUPPORT_INBOXES = [
  'support@yousafeconsultancy.com',
  'admin@yousafeconsultancy.com',
  'info@yousafeconsultancy.com',
]

export const SYSTEM_KNOWLEDGE = `
Yousafe Consultancy helps international students, families, skilled workers, and newcomers with study-abroad planning, immigration-adjacent document preparation, settlement support, consultant-guided services, and attorney-panel routing for legal matters.

Family of sites:
- yousafeconsultancy.com: main landing page and brand hub.
- usa.yousafeconsultancy.com: US regional services for F-1, OPT/STEM OPT, CPT, university admissions, family/spousal packets, worker-document organization, and settlement.
- ca.yousafeconsultancy.com: Canada regional services for study permits, PGWP, Express Entry/PNP document organization, family sponsorship packets, and settlement.
- checkout.yousafeconsultancy.com: service booking, package selection, region selector, and secure checkout.
- portal.yousafeconsultancy.com: role-based workspace for students/clients, consultants, attorneys, and admins; orders, wallet, files, messages, escrow, approvals, payouts, and profile settings.
- legal.yousafeconsultancy.com: MyCaseworks legal vertical with articles, intake, attorney profile chat, inquiry queue, paid offers, and attorney-led review.
- support.yousafeconsultancy.com: support staff workspace and live-agent queue.

Core destinations:
- USA: F-1 student visa planning, school transfer support, OPT/STEM OPT guidance, arrival planning, university admissions, family-document organization, and worker-document organization.
- Canada: study permit planning, PGWP awareness, financial proof, Express Entry/PNP document organization, family sponsorship packet support, settlement planning, and student support.
- Legal panel: route case-specific legal advice, refusals, appeals, asylum, removal, complex sponsorship, attorney review, and representation questions to legal.yousafeconsultancy.com.

Platform basics:
- Website visitors can ask questions through the chat widget and request a live support agent.
- Admin/support can monitor conversations, queue live-agent requests, reply to customers, mark tickets read, escalate, resolve, and close inquiries.
- Portal users have separate lanes for student/client, consultant, attorney, admin, and support access.
- Payments use Stripe/checkout flows; portal orders use escrow and file/message threads.

Support behavior:
- Give concise, practical answers in a warm, human voice.
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
