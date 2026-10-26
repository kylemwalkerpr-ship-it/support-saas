// Compile-only acceptance fixture; no trust, keys, or live transport.
import { commitReciprocal, authorizeDerivedUse, type Denial, type ServiceExpected } from '../lib/privacy/coordinator.mjs'
async function denies():Promise<Denial> {
 const decision=await commitReciprocal()
 const falseOnly:false=(await authorizeDerivedUse()).derivedUse
 void falseOnly
 // @ts-expect-error A denial can never be accepted as a successful commit.
 const positive:'COMMIT'=decision.decision
 void positive
 return decision
}
void denies
const scopes:ServiceExpected['scopes']=['derived_summary','preferences']
// @ts-expect-error V7 exact scopes cannot be replaced with a subset.
const subset:ServiceExpected['scopes']=['preferences']
void scopes; void subset
