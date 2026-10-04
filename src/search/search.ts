import { logger } from '../utils/logger';

export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  success: boolean;
  error?: string;
}

export class SearchProvider {
  private maxResults: number;

  constructor(maxResults = 3) {
    this.maxResults = maxResults;
  }

  /**
   * Cleans and prepares a concise search query from the question text.
   */
  public formulateQuery(rawQuestionText: string, optionsText?: string): string {
    // Remove boilerplate question instructions and unwanted punctuation
    let cleaned = rawQuestionText
      .replace(/select one or more:/gi, '')
      .replace(/select one:/gi, '')
      .replace(/pilih satu atau lebih:/gi, '')
      .replace(/pilih satu:/gi, '')
      .replace(/jawaban benar:/gi, '')
      .replace(/\[[a-zA-Z0-9\-_]+\]/g, '') // remove code tags like [CODE-B]
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\w\s\-\.\?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // If there are key option terms, append relevant ones
    if (optionsText && optionsText.length > 0) {
      const topOpts = optionsText
        .split('\n')
        .slice(0, 3)
        .map(o => o.trim())
        .filter(o => o.length > 0 && o.length < 50)
        .join(' ');
      cleaned = `${cleaned} ${topOpts}`.trim();
    }

    // Keep query under 160 characters for fast targeted search
    if (cleaned.length > 160) {
      cleaned = cleaned.slice(0, 160);
    }

    return cleaned;
  }

  /**
   * Performs an HTTP search query using DuckDuckGo HTML / Lite endpoint.
   */
  public async search(query: string): Promise<SearchResponse> {
    logger.debug({ query }, 'Executing web search fallback');

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout max for fast quiz pacing

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        body: `q=${encodedQuery}&b=`,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Search request failed with HTTP ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseDuckDuckGoHtml(html);

      logger.info({ count: results.length, query }, 'Search completed successfully');

      return {
        query,
        results: results.slice(0, this.maxResults),
        success: true
      };
    } catch (err: any) {
      logger.warn({ err: err.message, query }, 'Web search encountered an error or timeout');
      return {
        query,
        results: [],
        success: false,
        error: err.message
      };
    }
  }

  private parseDuckDuckGoHtml(html: string): SearchResultItem[] {
    const results: SearchResultItem[] = [];

    // Simple regex parser for DDG HTML results to avoid loading full jsdom
    const resultBlocks = html.split('<div class="result results_links results_links_deep web-result');

    for (let i = 1; i < resultBlocks.length; i++) {
      const block = resultBlocks[i];

      // Extract title & link
      const titleMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                         block.match(/<a class="result__snippet"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                         block.match(/<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

      // Extract snippet
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
                           block.match(/<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

      if (snippetMatch) {
        const rawSnippet = snippetMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();

        let rawTitle = 'Result';
        let rawUrl = '';
        if (titleMatch) {
          rawUrl = titleMatch[1];
          rawTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        }

        if (rawSnippet.length > 20) {
          results.push({
            title: rawTitle,
            snippet: rawSnippet,
            url: rawUrl
          });
        }
      }

      if (results.length >= this.maxResults) break;
    }

    return results;
  }
}
