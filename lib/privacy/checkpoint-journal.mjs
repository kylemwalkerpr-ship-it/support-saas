import { DurableObject } from 'cloudflare:workers'

const hash = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
const canonical = value => JSON.stringify(value)
const normalizeJson = value => Array.isArray(value) ? value.map(normalizeJson) :
  value && Object.getPrototypeOf(value) === Object.prototype
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key,normalizeJson(value[key])])) : value
const sameJson = (a,b) => canonical(normalizeJson(a)) === canonical(normalizeJson(b))
const validHash = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const denyCheckpoint = () => { throw new Error('Checkpoint unavailable') }

// One SQLite Durable Object per tenant. Bootstrap requires a secret capability
// plus an independently provisioned enrollment tuple; no HTTP route exposes it.
export class Q02CheckpointJournal extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS checkpoint_state (
      tenant TEXT PRIMARY KEY, generation TEXT NOT NULL, sequence INTEGER NOT NULL,
      head TEXT NOT NULL, genesis TEXT NOT NULL)`)
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS checkpoint_events (
      tenant TEXT NOT NULL, sequence INTEGER NOT NULL, generation TEXT NOT NULL,
      previous_digest TEXT NOT NULL, digest TEXT NOT NULL, kind TEXT NOT NULL,
      request_digest TEXT, payload TEXT NOT NULL, preimage TEXT NOT NULL,
      PRIMARY KEY (tenant, sequence), UNIQUE (tenant, digest))`)
  }
  config() {
    try {
      const trust = JSON.parse(this.env.CHECKPOINT_TRUST ?? '')
      const jwk = JSON.parse(this.env.CHECKPOINT_SIGNING_JWK ?? '')
      const pub = trust?.publicJwk
      if (typeof trust.kid !== 'string' || !trust.kid || typeof trust.issuer !== 'string' || !trust.issuer ||
          typeof trust.audience !== 'string' || !trust.audience || trust.revoked !== false ||
          !Number.isSafeInteger(trust.notBefore) || !Number.isSafeInteger(trust.notAfter) || trust.notAfter <= trust.notBefore ||
          !pub || pub.kty !== 'EC' || pub.crv !== 'P-256' || typeof pub.x !== 'string' || typeof pub.y !== 'string' || 'd' in pub ||
          jwk?.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.d !== 'string' || jwk.x !== pub.x || jwk.y !== pub.y) denyCheckpoint()
      return { trust, jwk }
    } catch { denyCheckpoint() }
  }
  tenantId(tenant) {
    if (typeof tenant !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(tenant)) denyCheckpoint()
    const rows = this.ctx.storage.sql.exec('SELECT tenant FROM checkpoint_state').toArray()
    if (rows.length && rows[0].tenant !== tenant) denyCheckpoint()
    return tenant
  }
  async proof(tenant, nonce) {
    if (!validHash(nonce)) denyCheckpoint()
    const t = this.tenantId(tenant)
    const rows = this.ctx.storage.sql.exec('SELECT generation,sequence,head FROM checkpoint_state WHERE tenant=?', t).toArray()
    if (rows.length !== 1) denyCheckpoint()
    const { trust, jwk } = this.config(), now = Math.floor(Date.now()/1000)
    if (trust.notBefore > now || trust.notAfter <= now) denyCheckpoint()
    const enc = x => btoa(String.fromCharCode(...new TextEncoder().encode(x))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    const header = enc(JSON.stringify({alg:'ES256',typ:'q02-checkpoint+jwt',kid:trust.kid}))
    const s = rows[0]
    const payload = enc(JSON.stringify({v:1,iss:trust.issuer,aud:trust.audience,tenant:t,nonce,
      generation:s.generation,highWater:s.sequence,headDigest:s.head,iat:now,exp:Math.min(now+10,trust.notAfter)}))
    const key = await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign'])
    const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,
      new TextEncoder().encode(`${header}.${payload}`)))
    if (signature.length !== 64) denyCheckpoint()
    const token = `${header}.${payload}.${btoa(String.fromCharCode(...signature)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`
    return { proof: token }
  }
  async bootstrap(capability, approved, tenant, generation, genesis) {
    if (typeof this.env.CHECKPOINT_ADMIN_CAPABILITY !== 'string' || !this.env.CHECKPOINT_ADMIN_CAPABILITY ||
        capability !== this.env.CHECKPOINT_ADMIN_CAPABILITY || !validHash(generation) || !validHash(genesis)) denyCheckpoint()
    this.config()
    let enrollments
    try { enrollments = JSON.parse(this.env.CHECKPOINT_ENROLLMENTS ?? '[]') } catch { denyCheckpoint() }
    const approval = Array.isArray(enrollments) && enrollments.find(x => x?.tenant === tenant && x?.generation === generation && x?.genesis === genesis && x?.approved === true)
    if (!approval || approved !== true) denyCheckpoint()
    const t = this.tenantId(tenant)
    try {
      this.ctx.storage.sql.exec('INSERT INTO checkpoint_state(tenant,generation,sequence,head,genesis) VALUES(?,?,0,?,?)', t,generation,genesis,genesis)
    } catch { denyCheckpoint() }
    return this.proof(t, genesis)
  }
  async read(tenant, nonce) { return this.proof(tenant, nonce) }
  async append(tenant, nonce, expected, event) {
    const t = this.tenantId(tenant)
    if (!expected || !Number.isSafeInteger(expected.highWater) || expected.highWater < 0 || !validHash(expected.generation) || !validHash(expected.headDigest) ||
        !event || !Number.isSafeInteger(event.sequence) || event.sequence !== expected.highWater + 1 ||
        event.generation !== expected.generation || event.previousDigest !== expected.headDigest ||
        !validHash(event.digest) || !['stage','suppress'].includes(event.kind) ||
        (event.requestDigest !== null && !validHash(event.requestDigest)) || typeof event.preimage !== 'string' ||
        typeof event.payload !== 'object' || event.payload === null || !validHash(nonce)) denyCheckpoint()
    let parsed
    try { parsed = JSON.parse(event.preimage) } catch { denyCheckpoint() }
    if (!Array.isArray(parsed) || parsed.length !== 6 || parsed[0] !== event.generation ||
        parsed[1] !== event.sequence || parsed[2] !== event.previousDigest || parsed[3] !== event.kind ||
        parsed[4] !== event.requestDigest || !sameJson(parsed[5],event.payload) || await hash(event.preimage) !== event.digest) denyCheckpoint()
    const current = this.ctx.storage.sql.exec('SELECT generation,sequence,head FROM checkpoint_state WHERE tenant=?',t).toArray()
    if (current.length !== 1) denyCheckpoint()
    const s = current[0]
    if (s.generation !== expected.generation) denyCheckpoint()
    if (s.sequence === event.sequence && s.head === event.digest) {
      const prior = this.ctx.storage.sql.exec('SELECT generation,previous_digest,digest,kind,request_digest,payload,preimage FROM checkpoint_events WHERE tenant=? AND sequence=?',t,event.sequence).toArray()
      if (prior.length !== 1 || prior[0].generation !== event.generation || prior[0].previous_digest !== event.previousDigest ||
          prior[0].digest !== event.digest || prior[0].kind !== event.kind || prior[0].request_digest !== event.requestDigest ||
          !sameJson(JSON.parse(prior[0].payload),event.payload) || prior[0].preimage !== event.preimage) denyCheckpoint()
      return this.proof(t,nonce)
    }
    if (s.sequence !== expected.highWater || s.head !== expected.headDigest || event.sequence !== s.sequence+1) denyCheckpoint()
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO checkpoint_events VALUES(?,?,?,?,?,?,?,?,?)',t,event.sequence,event.generation,
        event.previousDigest,event.digest,event.kind,event.requestDigest,canonical(event.payload),event.preimage)
      const changed = this.ctx.storage.sql.exec('UPDATE checkpoint_state SET sequence=?,head=? WHERE tenant=? AND generation=? AND sequence=? AND head=?',
        event.sequence,event.digest,t,expected.generation,expected.highWater,expected.headDigest)
      if (changed.rowsWritten !== 1) denyCheckpoint()
    })
    return this.proof(t,nonce)
  }
}
