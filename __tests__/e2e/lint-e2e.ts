#!/usr/bin/env tsx
/**
 * E2E Quality Linter (ADR 0036 — 100% @business per-file with whitelist)
 *
 * Validates that ALL test() blocks are tagged @business with real action + assertion.
 * Files in lint-e2e.config.json::pendingRefactor are reported as warnings (not errors).
 * Files NOT in whitelist must be 100% @business or linter fails.
 *
 * Run: npx tsx __tests__/e2e/lint-e2e.ts
 * Exit 0 = pass, Exit 1 = fail
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const E2E_DIR = join(__dirname, ".")

interface LintConfig {
  pendingRefactor: string[]
}

function loadConfig(): LintConfig {
  try {
    const raw = readFileSync(join(E2E_DIR, "lint-e2e.config.json"), "utf-8")
    return JSON.parse(raw) as LintConfig
  } catch {
    return { pendingRefactor: [] }
  }
}

const BUSINESS_ACTION_PATTERNS = [
  /\.fill\(/,
  /\.click\(/,
  /\.check\(/,
  /\.selectOption\(/,
  /page\.request\.(post|put|patch|delete)\(/,
  /\.press\(/,
  /fillField\(/,          // form.helper.ts
  /fillTextarea\(/,       // form.helper.ts
  /fillByPlaceholder\(/,  // form.helper.ts
  /\.dispatchEvent\(/,    // Radix UI radio/checkbox
  /gotoAndWait\(/,        // navigation.helper.ts
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
  /\.toContainText\(/,   // specific text content check
  /expect\(url\)/,
  /getByText\(["'][^/].*\)\.toBeVisible/,
  /\.first\(\)\.toBeVisible/,
  /\.toHaveAttribute\(/,
  /\.not\.toHaveValue\(/,
  /\.toHaveURL\(/,
  /locator\(.*\).*\.toBeVisible/,   // specific locator + toBeVisible
  /expect\(.*first\(\)\)\.toBeVisible/,  // expect(x.first()).toBeVisible()
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
  const config = loadConfig()
  const whitelistSet = new Set(config.pendingRefactor.map((p) => p.split("/").pop()!))

  const specFiles = readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => join(E2E_DIR, f))

  const allTests: TestInfo[] = []
  const fileResults: Map<string, { tests: TestInfo[]; whitelisted: boolean }> = new Map()

  for (const file of specFiles) {
    const tests = extractTests(file)
    const fileName = file.split("/").pop()!
    const whitelisted = whitelistSet.has(fileName)
    allTests.push(...tests)
    fileResults.set(fileName, { tests, whitelisted })
  }

  const totalTests = allTests.length
  const totalBusiness = allTests.filter((t) => t.tag === "business" && t.valid).length

  console.log("\n📊 E2E Quality Lint Report (ADR 0036 — per-file + whitelist)")
  console.log("═".repeat(60))

  let hasError = false

  // Validated files (NOT whitelisted)
  const whitelistedFiles: string[] = []

  for (const [fileName, { tests, whitelisted }] of fileResults) {
    if (whitelisted) {
      whitelistedFiles.push(fileName)
      continue
    }

    const businessCount = tests.filter((t) => t.tag === "business" && t.valid).length
    const nonBusiness = tests.filter((t) => t.tag !== "business" || !t.valid)

    if (nonBusiness.length > 0) {
      console.log(`\n❌ ${fileName}: ${businessCount}/${tests.length} @business — FAIL`)
      for (const t of nonBusiness) {
        console.log(`   :${t.line} "${t.name}" (tag=${t.tag}, action=${t.hasAction}, assert=${t.hasSpecificAssert})`)
      }
      hasError = true
    } else if (tests.length > 0) {
      console.log(`\n✅ ${fileName}: ${businessCount}/${tests.length} @business`)
    }
  }

  // Whitelisted files (warnings only)
  if (whitelistedFiles.length > 0) {
    console.log(`\n${"─".repeat(60)}`)
    console.log(`📋 Whitelist (refatoração pendente): ${whitelistedFiles.length} arquivos`)
    console.log(`${"─".repeat(60)}`)

    for (const fileName of whitelistedFiles) {
      const { tests } = fileResults.get(fileName)!
      const businessCount = tests.filter((t) => t.tag === "business" && t.valid).length
      const pct = tests.length > 0 ? Math.round((businessCount / tests.length) * 100) : 0

      if (businessCount === tests.length && tests.length > 0) {
        console.log(`\n✨ ${fileName}: ${businessCount}/${tests.length} (${pct}%) — PRONTO`)
        console.log(`   → Remova de lint-e2e.config.json::pendingRefactor`)
      } else {
        console.log(`   ⚠️  ${fileName}: ${businessCount}/${tests.length} (${pct}%)`)
      }
    }
  }

  console.log(`\n${"═".repeat(60)}`)
  console.log(`📈 Progresso: ${totalBusiness}/${totalTests} @business (${Math.round((totalBusiness / totalTests) * 100)}%)`)
  console.log(`📋 Whitelist: ${whitelistedFiles.length} arquivos pendentes`)

  if (!hasError) {
    console.log(`\n✅ Arquivos validados estão 100% @business. Push liberado.`)
  }

  process.exit(hasError ? 1 : 0)
}

main()
