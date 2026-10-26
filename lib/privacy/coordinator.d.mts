export type Denial = Readonly<{decision:'DENY'; derivedUse:false; reason:'ATOMIC_AUTHORITY_UNPROVEN'}>
export type Bindings = Readonly<Record<'support_site'|'portal_site'|'tenant'|'support_sub'|'portal_sub'|'support_epoch'|'portal_epoch'|'support_jti'|'receipt_jti'|'challenge_digest'|'support_digest',string>>
export type Journal = {recordDenial(input:{requestDigest:string;bindings:Bindings;reason:string}):Promise<void>}
export type ReceiptContext = {
 receipt:string; supportProof:string; challenge:string; portalSubject:string; now?:number;
 supportConfig:{enabled:true;issuer:string;audience:string;site:string;tenant:string;kid:string;publicJwk:JsonWebKey};
 portalConfig:{issuer:string;audience:string;site:string;kid:string;consentVersion:'portal-v7-1';publicJwk:JsonWebKey};
 session:{sub:string;sid:string;exp:number};
}
export function coordinatorDisposition():Denial
export function prepareReciprocal(context:ReceiptContext,journal?:Journal):Promise<Denial>
export function commitReciprocal():Promise<Denial>
export function authorizeDerivedUse():Promise<Denial>
export function createCoordinatorJournal(client:{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error?:unknown}>}):Journal
export type ServiceExpected = {
 kind:'current'|'revoke'|'ack';side:'support'|'portal';request:string;
 support_sub:string;portal_sub:string;support_site:string;portal_site:string;tenant:string;
 support_epoch:number;portal_epoch:number;old_epoch:number;new_epoch:number;state:'active'|'withdrawn';
 support_membership:'active'|'suspended'|'revoked';portal_membership:'active'|'suspended'|'revoked';
 support_version:'q02-support-v1';portal_version:'portal-v7-1';scopes:readonly ['derived_summary','preferences'];
}
export function inspectServiceMessage(token:string,trust:{issuer:string;audience:string;kid:string;authoritySide:'support'|'portal';publicJwk:JsonWebKey;proofKeys:readonly [JsonWebKey,JsonWebKey]},expected:ServiceExpected,now?:number):Promise<Readonly<{signatureVerified:true;decision:'DENY';deliveryConfirmed:false}>>
