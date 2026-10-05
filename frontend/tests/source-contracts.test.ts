import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync("src/main.tsx", "utf8");
const componentSource = readFileSync("src/components/FiringComponents.tsx", "utf8");
const allSource = `${appSource}\n${componentSource}`;
const compactSource = allSource.replace(/\s+/g, "");
const translations = JSON.parse(readFileSync("src/translations.json", "utf8"));

describe("important user-interface contracts", () => {
  it("requires explicit CC0 consent", () => {
    expect(compactSource).toContain('requiredname="cc0_consent"');
    expect(allSource).toContain("t.cc0Consent");
  });

  it("uses a collapsed semantic metadata panel", () => {
    expect(componentSource).toContain('<section className="card metadata-card">');
    expect(componentSource).toContain("<details>");
    expect(componentSource).toContain('<dl className="metadata">');
  });

  it("plots candidates and spot prices as separate data sets", () => {
    expect(compactSource).toContain("data={cheap.candidates||[]}");
    expect(compactSource).toContain("data={cheap.spot_prices||[]}");
    expect(allSource).toContain('dataKey="spot_price_sek_kwh"');
  });

  it("keeps accessibility support", () => {
    expect(allSource).toContain("skip-link");
    expect(allSource).toContain('aria-live="polite"');
    expect(allSource).toContain('htmlFor="firing-name"');
  });

  it("contains the same translation keys for every language", () => {
    const languages = Object.keys(translations);
    const englishKeys = Object.keys(translations.en).sort();

    for (const language of languages) {
      expect(Object.keys(translations[language]).sort()).toEqual(englishKeys);
    }
  });

  it("guards optional tooltip numbers against NaN", () => {
    expect(compactSource).toContain("Number.isFinite(Number(p.total_cost_sek))");
    expect(compactSource).toContain("p.start_time||p.time||p.start_ms");
  });

  it("shows firing and program information", () => {
    expect(compactSource).toContain("fmt(sel.controller_metadata?.start_time)");
    expect(allSource).toContain("sel.controller_metadata.program_name");
    expect(compactSource).toContain("{t.programName}:{p.program_name}");
  });

  it("dismisses messages automatically", () => {
    expect(compactSource).toContain('window.setTimeout(()=>setMsg(""),5000)');
  });
});
