import { NextRequest } from 'next/server'

const COLORS = ['3C3B6E', 'B22234', '059669', 'D97706', '7C3AED']

function initialsFromSeed(seed: string) {
  const parts = seed.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'YS'
  return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function colorForSeed(seed: string) {
  const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return COLORS[total % COLORS.length]
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(request: NextRequest) {
  const seed = request.nextUrl.searchParams.get('seed') || 'YouSafe Support'
  const initials = escapeXml(initialsFromSeed(seed))
  const color = colorForSeed(seed)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="#${color}"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, Arial, sans-serif" font-size="44" font-weight="800" fill="#fff">${initials}</text>
    </svg>
  `.trim()

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
