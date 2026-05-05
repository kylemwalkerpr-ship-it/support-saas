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
const MAX_SITEMAP_URLS = 120
const MAX_DOCS = 80

function configuredSitemaps() {
  return (process.env.YOUSAFE_CHAT_SITEMAPS || DEFAULT_SITEMAPS.join(','))
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
}

function stripTags(html: string) {
  return html
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
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

function isUsefulPage(url: string) {
  return (
    /^https?:\/\//i.test(url) &&
    !url.includes('/api/') &&
    !url.includes('/sign-') &&
    !url.includes('/cdn-cgi/') &&
    !url.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|pdf)$/i)
  )
}

function termsFor(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .filter(
      (term) =>
        ![
          'the',
          'and',
          'for',
          'with',
          'you',
          'your',
          'how',
          'what',
          'can',
          'are',
          'this',
          'that',
          'need',
          'help',
          'about',
        ].includes(term)
    )
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

  const seenSitemaps = new Set<string>()
  const pageUrls = new Set<string>()
  const queue = configuredSitemaps()

  while (queue.length && seenSitemaps.size < 12 && pageUrls.size < MAX_SITEMAP_URLS) {
    const sitemapUrl = queue.shift()
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue
    seenSitemaps.add(sitemapUrl)

    const xml = await fetchText(sitemapUrl)
    if (!xml) continue

    for (const loc of parseLocs(xml)) {
      if (loc.endsWith('.xml') && !seenSitemaps.has(loc)) {
        queue.push(loc)
      } else if (isUsefulPage(loc)) {
        pageUrls.add(loc)
      }
    }
  }

  const urls = [...pageUrls].slice(0, MAX_DOCS)

  const pages = await Promise.all(
    urls.map(async (url) => {
      const html = await fetchText(url)
      if (!html) return null
      const text = stripTags(html).slice(0, 9000)
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
    const urlHit = doc.url.toLowerCase().includes(term) ? 3 : 0
    const matches = haystack.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'))?.length ?? 0
    return score + titleHit + urlHit + Math.min(matches, 8)
  }, 0)
}

function snippetFor(doc: SiteDoc, terms: string[]) {
  const lower = doc.text.toLowerCase()
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0]
  const start = Math.max(0, (firstHit ?? 0) - 120)
  return doc.text.slice(start, start + 520).trim()
}

function classifyIntent(message: string) {
  const text = message.toLowerCase()
  if (/(price|cost|fee|pay|payment|refund|invoice|billing)/.test(text)) return 'billing'
  if (/(visa|study permit|f-1|opt|pgwp|immigration|school|admission)/.test(text)) return 'study'
  if (/(login|sign in|portal|dashboard|account|password|student)/.test(text)) return 'portal'
  if (/(human|agent|representative|support staff|live chat|urgent|complaint)/.test(text)) return 'live'
  return 'general'
}

function answerFromDocs(message: string, docs: SiteDoc[]) {
  const terms = termsFor(message)
  const ranked = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (ranked.length === 0) return null

  const intent = classifyIntent(message)
  const context = ranked
    .map(({ doc }, index) => `${index + 1}. ${doc.title}\n${snippetFor(doc, terms)}\n${doc.url}`)
    .join('\n')

  const opener =
    intent === 'billing'
      ? 'I found the most relevant Yousafe billing and service guidance:'
      : intent === 'study'
        ? 'I found the most relevant Yousafe study/support guidance:'
        : intent === 'portal'
          ? 'I found the most relevant Yousafe portal guidance:'
          : intent === 'live'
            ? 'I can connect you with a live support agent. Here is the closest site guidance while you wait:'
            : 'I found this in the Yousafe knowledge base:'

  return [
    opener,
    context,
    'For account-specific status, payments, documents, refunds, or case-sensitive immigration questions, I can connect you with a live agent from this chat.',
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

  if (siteAnswer) return siteAnswer

  return [
    FALLBACK_ANSWER,
    SYSTEM_KNOWLEDGE.trim(),
    'I could not find a precise matching page in the current sitemap cache. A live support agent can take over from this chat if you need account-specific help.',
  ].join('\n\n')
}
