/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Harvest — pure, testable extraction of capture data from a page (extension surface).
 *
 * The browser content script reads the live DOM; this module is the pure, string-based equivalent
 * used by the test harness and shared by the request-building step. It does NOT parse bookings or
 * places — that's the shared ingestion core's job. The extension is a thin capture client: it
 * harvests schema.org JSON-LD + selection + page title, builds an IngestionRequest, and POSTs it to
 * /api/ingest, which runs the SAME parsers as the copilot. No parsing logic forks into the extension.
 */
export interface HarvestInput {
  url?: string;
  html?: string;        // page HTML (the harness path)
  jsonld?: unknown[];   // pre-extracted nodes (the DOM content-script path)
  selection?: string;   // user-selected text
}

/** Pull schema.org JSON-LD blocks out of raw HTML (mirror of the DOM `script[type=ld+json]` read).
 *  Bounded, backtracking-safe pattern: attribute spans are length-capped ({0,200}) and each block
 *  size-capped so a hostile page can't drive pathological scanning. This regex is IDENTICAL to the
 *  backend's extractJsonLd (server-domain.ts) — keep the two in lockstep (no forked rules). */
export function extractJsonLdFromHtml(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]{0,200}type=["']application\/ld\+json["'][^>]{0,200}>([\s\S]{0,200000}?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* malformed block — skip */
    }
  }
  return out;
}

export function pageTitle(html: string): string | undefined {
  return (
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  );
}

/** Shape mirrors the shared `IngestionRequest` envelope (graduating to shared/types — see proposal). */
export interface ExtensionIngestionRequest {
  surface: 'extension';
  content: 'jsonld' | 'text';
  jsonld?: unknown[];
  rawText?: string;
  url?: string;
  pageTitle?: string;
}

/** Build the request the extension POSTs to /api/ingest. JSON-LD wins; else the selected text. */
export function buildIngestionRequest(input: HarvestInput): ExtensionIngestionRequest {
  const jsonld = input.jsonld ?? (input.html ? extractJsonLdFromHtml(input.html) : []);
  const hasJsonld = jsonld.length > 0;
  return {
    surface: 'extension',
    content: hasJsonld ? 'jsonld' : 'text',
    ...(hasJsonld ? { jsonld } : {}),
    ...(input.selection ? { rawText: input.selection } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.html ? { pageTitle: pageTitle(input.html) } : {}),
  };
}
