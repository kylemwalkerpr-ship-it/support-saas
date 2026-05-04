import { SYSTEM_KNOWLEDGE } from '@/lib/chat/knowledge'

const FALLBACK_ANSWER =
  'I can help with Yousafe services, study pathways, document preparation, billing, portal access, and support questions. If your question depends on your personal account or case details, I can connect you with a live support agent.'

const DEFAULT_SITEMAPS = [
  'https://yousafeconsultancy.com/sitemap.xml',
  'https://portal.yousafeconsultancy.com/sitemap.xml',
  'https://support.yousafeconsultancy.com/sitemap.xml',
]

type SiteDoc = {
  url: string
  title: string
  text: string
}

let cachedDocs: { loadedAt: number; docs: SiteDoc[] } | null = null
const CACHE_MS = 1000 * 60 * 30

function configuredSitemaps() {
  return (process.env.YOUSAFE_CHAT_SITEMAPS || DEFAULT_SITEMAPS.join(','))
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return stripTags(match?.[1] || 'Yousafe page').slice(0, 120)
}

function parseLocs(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter((url) => /^https?:\/\//i.test(url))
}

function termsFor(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .filter((term) => !['the', 'and', 'for', 'with', 'you', 'your', 'how', 'what', 'can'].includes(term))
}

async function fetchText(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function loadSitemapDocs() {
  if (cachedDocs && Date.now() - cachedDocs.loadedAt < CACHE_MS) {
    return cachedDocs.docs
  }

  const sitemapXml = await Promise.all(configuredSitemaps().map(fetchText))
  const urls = [...new Set(sitemapXml.flatMap((xml) => (xml ? parseLocs(xml) : [])))]
    .filter((url) => !url.includes('/api/') && !url.includes('/sign-'))
    .slice(0, 30)

  const pages = await Promise.all(
    urls.map(async (url) => {
      const html = await fetchText(url)
      if (!html) return null
      const text = stripTags(html).slice(0, 4000)
      if (text.length < 80) return null
      return { url, title: extractTitle(html), text }
    })
  )

  const docs = pages.filter(Boolean) as SiteDoc[]
  cachedDocs = { loadedAt: Date.now(), docs }
  return docs
}

function scoreDoc(doc: SiteDoc, terms: string[]) {
  const haystack = `${doc.title} ${doc.text}`.toLowerCase()
  return terms.reduce((score, term) => {
    const titleHit = doc.title.toLowerCase().includes(term) ? 4 : 0
    const textHit = haystack.includes(term) ? 1 : 0
    return score + titleHit + textHit
  }, 0)
}

function snippetFor(doc: SiteDoc, terms: string[]) {
  const lower = doc.text.toLowerCase()
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0]
  const start = Math.max(0, (firstHit ?? 0) - 120)
  return doc.text.slice(start, start + 360).trim()
}

function answerFromDocs(message: string, docs: SiteDoc[]) {
  const terms = termsFor(message)
  const ranked = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (ranked.length === 0) return null

  const context = ranked
    .map(({ doc }) => `- ${doc.title}: ${snippetFor(doc, terms)} (${doc.url})`)
    .join('\n')

  return [
    'Based on the Yousafe site, here is the most relevant guidance I found:',
    context,
    'For account-specific status, payments, documents, refunds, or case-sensitive immigration questions, I can connect you with a live support agent.',
  ].join('\n\n')
}

export async function generateChatAnswer({
  message,
  history,
}: {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
}) {
  const docs = await loadSitemapDocs()
  const siteAnswer = answerFromDocs(
    `${history.slice(-3).map((item) => item.content).join(' ')} ${message}`,
    docs
  )

  return siteAnswer ?? `${FALLBACK_ANSWER}\n\n${SYSTEM_KNOWLEDGE.trim()}`
}
