#!/usr/bin/env tsx
/**
 * E2E Quality Linter (ADR 0036 — revisado para 100% @business)
 *
 * Validates that ALL test() blocks in __tests__/e2e/*.spec.ts are tagged
 * with @business and contain real action + specific assertion.
 *
 * @smoke is NO LONGER a valid category. Every test must be @business.
 *
 * Run: npx tsx __tests__/e2e/lint-e2e.ts
 * Exit 0 = pass, Exit 1 = fail
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const E2E_DIR = join(__dirname, ".")
const MIN_BUSINESS_PERCENT = 100

// Patterns that indicate real business logic (not just "page loaded")
const BUSINESS_ACTION_PATTERNS = [
  /\.fill\(/,        // filling a form field
  /\.click\(/,       // clicking (could be submit)
  /\.check\(/,       // checking a checkbox
  /\.selectOption\(/, // selecting from dropdown
  /page\.request\.(post|put|patch|delete)\(/, // API calls
  /\.press\(/,       // keyboard input
]

const BUSINESS_ASSERT_PATTERNS = [
  /\.toHaveValue\(/,
  /\.toHaveCount\(/,
  /\.toHaveText\(/,
  /\.toBeDisabled\(/,
  /\.toBeEnabled\(/,
  /\.toBeChecked\(/,
  /\.not\.toContain/,
  /\.not\.toMatch/,
  /\.not\.toHaveURL/,
  /response\.(ok|json|status)\(/,
  /expect\(.*\)\.toBe\(/,
  /expect\(.*\)\.toEqual\(/,
  /expect\(.*\)\.toHaveProperty\(/,
  /expect\(.*\)\.toMatch\(/,
  /expect\(url\)/,
  /getByText\(["'][^/].*\)\.toBeVisible/, // specific text (not regex) + toBeVisible
  /\.first\(\)\.toBeVisible/,
]

interface TestInfo {
  file: string
  name: string
  tag: "business" | "smoke" | "untagged"
  line: number
  hasAction: boolean
  hasSpecificAssert: boolean
  valid: boolean
}

function extractTests(filePath: string): TestInfo[] {
  const content = readFileSync(filePath, "utf-8")
  const fileName = filePath.split("/").pop() ?? filePath
  const tests: TestInfo[] = []

  const testRegex = /test\(\s*["'`](.+?)["'`]/g
  let match: RegExpExecArray | null
  const matches: Array<{ name: string; pos: number; lineNum: number }> = []

  while ((match = testRegex.exec(content)) !== null) {
    const pos = match.index
    const lineNum = content.substring(0, pos).split("\n").length
    matches.push({ name: match[1]!, pos, lineNum })
  }

  for (let i = 0; i < matches.length; i++) {
    const { name, lineNum } = matches[i]!
    const bodyStart = matches[i]!.pos
    const bodyEnd = i + 1 < matches.length ? matches[i + 1]!.pos : content.length
    const body = content.substring(bodyStart, bodyEnd)

    let tag: "business" | "smoke" | "untagged" = "untagged"
    if (name.startsWith("@business")) tag = "business"
    else if (name.startsWith("@smoke")) tag = "smoke"

    const hasAction = BUSINESS_ACTION_PATTERNS.some((p) => p.test(body))
    const hasSpecificAssert = BUSINESS_ASSERT_PATTERNS.some((p) => p.test(body))

    const valid = tag === "business" && hasAction && hasSpecificAssert

    tests.push({ file: fileName, name, tag, line: lineNum, hasAction, hasSpecificAssert, valid })
  }

  return tests
}

function main() {
  const specFiles = readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => join(E2E_DIR, f))

  const allTests: TestInfo[] = []
  for (const file of specFiles) {
    allTests.push(...extractTests(file))
  }

  const total = allTests.length
  const untagged = allTests.filter((t) => t.tag === "untagged")
  const business = allTests.filter((t) => t.tag === "business")
  const smoke = allTests.filter((t) => t.tag === "smoke")
  const invalidBusiness = business.filter((t) => !t.valid)
  const businessPercent = total > 0 ? Math.round((business.length / total) * 100) : 0

  console.log("\n📊 E2E Quality Lint Report (ADR 0036 — 100% @business)")
  console.log("═".repeat(55))
  console.log(`Total tests:       ${total}`)
  console.log(`@business:         ${business.length} (${businessPercent}%)`)
  console.log(`@smoke (invalid):  ${smoke.length}`)
  console.log(`Untagged:          ${untagged.length}`)
  console.log(`Invalid @business: ${invalidBusiness.length}`)
  console.log(`Required:          ${MIN_BUSINESS_PERCENT}% @business`)
  console.log("═".repeat(55))

  let hasError = false

  if (smoke.length > 0) {
    console.log(`\n❌ ${smoke.length} test(s) tagged @smoke — category no longer accepted.`)
    console.log(`   Every test() must be @business with real action + specific assertion.`)
    console.log(`   Refactor to @business or remove if page has no testable logic.`)
    for (const t of smoke.slice(0, 10)) {
      console.log(`   ${t.file}:${t.line} — "${t.name}"`)
    }
    if (smoke.length > 10) {
      console.log(`   ... and ${smoke.length - 10} more`)
    }
    hasError = true
  }

  if (untagged.length > 0) {
    console.log(`\n❌ ${untagged.length} test(s) without tag:`)
    for (const t of untagged.slice(0, 10)) {
      console.log(`   ${t.file}:${t.line} — "${t.name}"`)
    }
    if (untagged.length > 10) {
      console.log(`   ... and ${untagged.length - 10} more`)
    }
    hasError = true
  }

  if (invalidBusiness.length > 0) {
    console.log(`\n❌ ${invalidBusiness.length} @business test(s) missing action or specific assert:`)
    for (const t of invalidBusiness) {
      console.log(`   ${t.file}:${t.line} — "${t.name}" (action=${t.hasAction}, assert=${t.hasSpecificAssert})`)
    }
    hasError = true
  }

  if (businessPercent < MIN_BUSINESS_PERCENT && total > 0) {
    console.log(`\n❌ Business coverage ${businessPercent}% is below required ${MIN_BUSINESS_PERCENT}%`)
    hasError = true
  }

  if (!hasError) {
    console.log("\n✅ All E2E tests are @business with real action + assertion.")
  }

  process.exit(hasError ? 1 : 0)
}

main()
