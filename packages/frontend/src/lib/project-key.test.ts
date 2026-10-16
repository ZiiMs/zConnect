import { describe, expect, test } from "vitest"
import { slugifyProjectKey } from "./project-key.js"

describe("slugifyProjectKey", () => {
  test("takes the first four alphanumerics uppercased", () => {
    expect(slugifyProjectKey("Web App")).toBe("WEBA")
    expect(slugifyProjectKey("my_cool-project!")).toBe("MYCO")
    expect(slugifyProjectKey("ab")).toBe("AB")
  })

  test("skips to the first letter so the key stays valid", () => {
    expect(slugifyProjectKey("3D Game")).toBe("DGAM")
    expect(slugifyProjectKey(" 42 launch")).toBe("LAUN")
  })

  test("short or letterless names yield short or empty slugs", () => {
    expect(slugifyProjectKey("A")).toBe("A")
    expect(slugifyProjectKey("123")).toBe("")
    expect(slugifyProjectKey("!!!")).toBe("")
    expect(slugifyProjectKey("")).toBe("")
  })
})
