#!/usr/bin/env tsx
/**
 * E2E Quality Linter (ADR 0036 Rev3 — @business + Nível 2 detection)
 *
 * Validates:
 * 1. All test() blocks tagged @business (not @smoke, not untagged)
 * 2. @business tests have action + assertion (existing)
 * 3. @business tests are Nível 2 (mutation + post-mutation verification)
 *
 * Exit 0 = pass, Exit 1 = fail
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const E2E_DIR = join(__dirname, ".")

interface LintConfig {
  pendingRefactor: string[]
  pendingLevelUpgrade?: string[]
}

function loadConfig(): LintConfig {
  try {
    const raw = readFileSync(join(E2E_DIR, "lint-e2e.config.json"), "utf-8")
    return JSON.parse(raw) as LintConfig
  } catch {
    return { pendingRefactor: [], pendingLevelUpgrade: [] }
  }
}

const BUSINESS_ACTION_PATTERNS = [
  /\.fill\(/, /\.click\(/, /\.check\(/, /\.selectOption\(/,
  /page\.request\.(post|put|patch|delete)\(/,
  /\.press\(/, /fillField\(/, /fillTextarea\(/, /fillByPlaceholder\(/,
  /\.dispatchEvent\(/, /gotoAndWait\(/,
]

const BUSINESS_ASSERT_PATTERNS = [
  /\.toHaveValue\(/, /\.toHaveCount\(/, /\.toHaveText\(/,
  /\.toBeDisabled\(/, /\.toBeEnabled\(/, /\.toBeChecked\(/,
  /\.not\.toContain/, /\.not\.toMatch/, /\.not\.toHaveURL/,
  /response\.(ok|json|status)\(/, /expect\(.*\)\.toBe\(/,
  /expect\(.*\)\.toEqual\(/, /expect\(.*\)\.toHaveProperty\(/,
  /expect\(.*\)\.toMatch\(/, /\.toContainText\(/, /expect\(url\)/,
  /getByText\(["'][^/].*\)\.toBeVisible/, /\.first\(\)\.toBeVisible/,
  /\.toHaveAttribute\(/, /\.not\.toHaveValue\(/, /\.toHaveURL\(/,
  /locator\(.*\).*\.toBeVisible/, /expect\(.*first\(\)\)\.toBeVisible/,
]

// Patterns that indicate a DESTRUCTIVE mutation (submit, delete, confirm)
const MUTATION_PATTERNS = [
  /button\[type=["']submit["']\].*\.click/,
  /type=['"]submit['"].*\.click/,
  /has-text\(["'](Salvar|Criar|Confirmar|Excluir|Enviar|Deletar|Remover|Cadastrar|Registrar)/i,
  /name:\s*\/(Salvar|Criar|Confirmar|Excluir|Enviar|Deletar|Remover|Cadastrar|Registrar)/i,
  /page\.request\.(post|put|patch|delete)\(/,
]

// Patterns that indicate post-mutation verification
const POST_MUTATION_VERIFY_PATTERNS = [
  /\.toHaveURL\(/,
  /\.not\.toBeVisible/,
  /\.toHaveText\(/,
]

type Level = "level-2" | "level-1.5" | "level-1"

function detectLevel(body: string): Level {
  const lines = body.split("\n")

  // Find first mutation line
  let mutationIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (MUTATION_PATTERNS.some((p) => p.test(lines[i]!))) {
      mutationIdx = i
      break
    }
  }

  if (mutationIdx === -1) {
    // No destructive mutation found
    return /fillField|fillTextarea|fillByPlaceholder|\.fill\(/.test(body) ? "level-1.5" : "level-1"
  }

  // Mutation found — check for meaningful verification AFTER it
  const afterMutation = lines.slice(mutationIdx + 1).join("\n")

  const hasPostVerify =
    POST_MUTATION_VERIFY_PATTERNS.some((p) => p.test(afterMutation)) ||
    (/gotoAndWait/.test(afterMutation) && /toBeVisible|toContainText|toHaveCount/.test(afterMutation))

  return hasPostVerify ? "level-2" : "level-1.5"
}

interface TestInfo {
  file: string
  name: string
  tag: "business" | "smoke" | "untagged"
  line: number
  hasAction: boolean
  hasSpecificAssert: boolean
  valid: boolean
  level: Level
  body: string
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
    const level = detectLevel(body)

    tests.push({ file: fileName, name, tag, line: lineNum, hasAction, hasSpecificAssert, valid, level, body })
  }

  return tests
}

function main() {
  const config = loadConfig()
  const refactorSet = new Set(config.pendingRefactor.map((p) => p.split("/").pop()!))
  const upgradeSet = new Set((config.pendingLevelUpgrade ?? []).map((p) => p.split("/").pop()!))

  const specFiles = readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => join(E2E_DIR, f))

  const allTests: TestInfo[] = []
  const fileResults: Map<string, { tests: TestInfo[]; mode: "validate" | "refactor" | "upgrade" }> = new Map()

  for (const file of specFiles) {
    const tests = extractTests(file)
    const fileName = file.split("/").pop()!
    let mode: "validate" | "refactor" | "upgrade" = "validate"
    if (refactorSet.has(fileName)) mode = "refactor"
    else if (upgradeSet.has(fileName)) mode = "upgrade"
    allTests.push(...tests)
    fileResults.set(fileName, { tests, mode })
  }

  const totalTests = allTests.length
  const totalBusiness = allTests.filter((t) => t.tag === "business" && t.valid).length
  const totalLevel2 = allTests.filter((t) => t.level === "level-2").length

  console.log("\n📊 E2E Lint Report (ADR 0036 Rev3 — @business + Nível 2)")
  console.log("═".repeat(60))

  let hasError = false

  // Validated files (full validation)
  for (const [fileName, { tests, mode }] of fileResults) {
    if (mode !== "validate") continue

    const businessCount = tests.filter((t) => t.tag === "business" && t.valid).length
    const nonBusiness = tests.filter((t) => t.tag !== "business" || !t.valid)
    const l2 = tests.filter((t) => t.level === "level-2").length
    const l15 = tests.filter((t) => t.level === "level-1.5").length
    const l1 = tests.filter((t) => t.level === "level-1").length

    if (nonBusiness.length > 0) {
      console.log(`\n❌ ${fileName}: ${businessCount}/${tests.length} @business — FAIL`)
      for (const t of nonBusiness) {
        console.log(`   :${t.line} "${t.name}" (tag=${t.tag})`)
      }
      hasError = true
    } else {
      const levelInfo = `L2=${l2} L1.5=${l15} L1=${l1}`
      const levelOk = l15 === 0 && l1 === 0
      if (levelOk) {
        console.log(`\n✅ ${fileName}: ${businessCount}/${tests.length} @business — ${levelInfo}`)
      } else {
        console.log(`\n⚠️  ${fileName}: ${businessCount}/${tests.length} @business — ${levelInfo}`)
        for (const t of tests.filter((t) => t.level !== "level-2")) {
          console.log(`   :${t.line} "${t.name}" → ${t.level}`)
        }
        // Level issues are warnings for now, not errors
      }
    }
  }

  // pendingLevelUpgrade files (warnings with level stats)
  const upgradeFiles = [...fileResults].filter(([, { mode }]) => mode === "upgrade")
  if (upgradeFiles.length > 0) {
    console.log(`\n${"─".repeat(60)}`)
    console.log(`🔼 Upgrade pendente (Nível 2): ${upgradeFiles.length} arquivos`)
    console.log(`${"─".repeat(60)}`)
    for (const [fileName, { tests }] of upgradeFiles) {
      const l2 = tests.filter((t) => t.level === "level-2").length
      const l15 = tests.filter((t) => t.level === "level-1.5").length
      const l1 = tests.filter((t) => t.level === "level-1").length
      console.log(`   ⚠️  ${fileName}: L2=${l2} L1.5=${l15} L1=${l1} (${tests.length} total)`)
    }
  }

  // pendingRefactor files (existing behavior)
  const refactorFiles = [...fileResults].filter(([, { mode }]) => mode === "refactor")
  if (refactorFiles.length > 0) {
    console.log(`\n${"─".repeat(60)}`)
    console.log(`📋 Whitelist refactor: ${refactorFiles.length} arquivos`)
    console.log(`${"─".repeat(60)}`)
    for (const [fileName, { tests }] of refactorFiles) {
      const bc = tests.filter((t) => t.tag === "business" && t.valid).length
      console.log(`   ⚠️  ${fileName}: ${bc}/${tests.length} @business`)
    }
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`)
  console.log(`📈 @business: ${totalBusiness}/${totalTests} (${Math.round((totalBusiness / totalTests) * 100)}%)`)
  console.log(`📊 Nível 2: ${totalLevel2}/${totalTests} (${Math.round((totalLevel2 / totalTests) * 100)}%)`)
  console.log(`📋 Whitelists: refactor=${refactorFiles.length} upgrade=${upgradeFiles.length}`)

  if (!hasError) {
    console.log(`\n✅ Push liberado.`)
  }

  process.exit(hasError ? 1 : 0)
}

main()
