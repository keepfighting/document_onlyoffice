import { describe, expect, it } from 'vitest';

// Tests for the URL parameter parsing logic used in index.ts.
// The production code uses: new URLSearchParams(window.location.search)
// These tests validate the parsing rules directly.

function parseParams(search: string) {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const documentUrl = q.get('file') || q.get('src');
  const readonlyMode = q.get('readonly') === 'true' || q.get('readonly') === '1';
  return { documentUrl, readonlyMode };
}

describe('URL parameter parsing', () => {
  describe('document URL resolution', () => {
    it('reads src param', () => {
      const { documentUrl } = parseParams('?src=https://example.com/file.docx');
      expect(documentUrl).toBe('https://example.com/file.docx');
    });

    it('reads file param', () => {
      const { documentUrl } = parseParams('?file=https://example.com/file.docx');
      expect(documentUrl).toBe('https://example.com/file.docx');
    });

    it('prefers file over src when both are present', () => {
      const { documentUrl } = parseParams('?file=a.docx&src=b.docx');
      expect(documentUrl).toBe('a.docx');
    });

    it('falls back to src when file is absent', () => {
      const { documentUrl } = parseParams('?src=b.docx');
      expect(documentUrl).toBe('b.docx');
    });

    it('returns null when neither param is present', () => {
      const { documentUrl } = parseParams('?readonly=true');
      expect(documentUrl).toBeNull();
    });

    it('returns null for empty query string', () => {
      const { documentUrl } = parseParams('');
      expect(documentUrl).toBeNull();
    });
  });

  describe('signed URL preservation (fixes #48)', () => {
    it('preserves = characters in src value (base64 signature)', () => {
      const signedUrl = 'https://example.com/file.docx?sign=ghG9-fPc64t0VEu==:0';
      const { documentUrl } = parseParams(`?src=${signedUrl}`);
      expect(documentUrl).toBe(signedUrl);
    });

    it('preserves multiple = in query value', () => {
      // & in nested URL is an outer param delimiter — only = is the issue being fixed here
      const url = 'https://cdn.example.com/doc.xlsx?token=abc==';
      const { documentUrl } = parseParams(`?src=${url}`);
      expect(documentUrl).toBe(url);
    });

    it('preserves nested query string in file param', () => {
      const url = 'https://storage.example.com/report.pptx?key=x==';
      const { documentUrl } = parseParams(`?file=${url}`);
      expect(documentUrl).toBe(url);
    });
  });

  describe('readonly param', () => {
    it('returns true for readonly=true', () => {
      const { readonlyMode } = parseParams('?readonly=true');
      expect(readonlyMode).toBe(true);
    });

    it('returns true for readonly=1', () => {
      const { readonlyMode } = parseParams('?readonly=1');
      expect(readonlyMode).toBe(true);
    });

    it('returns false when readonly is absent', () => {
      const { readonlyMode } = parseParams('?src=file.docx');
      expect(readonlyMode).toBe(false);
    });

    it('returns false for readonly=false', () => {
      const { readonlyMode } = parseParams('?readonly=false');
      expect(readonlyMode).toBe(false);
    });

    it('returns false for readonly=0', () => {
      const { readonlyMode } = parseParams('?readonly=0');
      expect(readonlyMode).toBe(false);
    });

    it('works alongside src param', () => {
      const { documentUrl, readonlyMode } = parseParams('?src=https://example.com/file.xlsx&readonly=true');
      expect(documentUrl).toBe('https://example.com/file.xlsx');
      expect(readonlyMode).toBe(true);
    });
  });
});
