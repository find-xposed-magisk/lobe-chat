// @vitest-environment node
import { runPageBash } from '@lobechat/builtin-tool-page-agent/bash';
import { EditorRuntime } from '@lobechat/editor-runtime';
import { createHeadlessEditor } from '@lobehub/editor/headless';
import { describe, expect, it } from 'vitest';

const setup = (markdown: string) => {
  const headless = createHeadlessEditor();
  headless.hydrateMarkdown(markdown, { keepId: true });
  const runtime = new EditorRuntime();
  runtime.setEditor(headless.kernel as unknown as Parameters<EditorRuntime['setEditor']>[0]);
  runtime.setTitleHandlers(
    () => {},
    () => 'Page',
  );

  return {
    markdown: () => headless.export().markdown.trim(),
    run: (command: string) => runPageBash(runtime, command),
    xml: () => runtime.getPageContentContext('xml').xml ?? '',
  };
};

describe('runPageBash on rich content', () => {
  it('edits a table cell and keeps the table', async () => {
    const page = setup('| Plan | Price |\n| --- | --- |\n| Basic | 10 |\n| Pro | 25 |\n');

    const { state } = await page.run("sed -i 's/>25</>30</' /doc.xml");

    expect(state.changed).toBe(true);
    expect(page.markdown()).toContain('| Pro');
    expect(page.markdown()).toContain('30');
    expect(page.markdown()).not.toContain('25');
    expect(page.markdown()).toContain('| Basic');
  });

  it('edits a list item and keeps the list', async () => {
    const page = setup('- first\n- second\n- third\n');

    const { state } = await page.run("sed -i 's/second/SECOND/' /doc.xml");

    expect(state.changed).toBe(true);
    expect(page.markdown()).toBe('- first\n- SECOND\n- third');
  });

  it('edits one line of a code block and keeps the rest verbatim', async () => {
    const page = setup('```ts\nconst a = 1;\nif (a < 2) console.log("<ok>");\n```\n');
    const before = page.markdown();

    const { state } = await page.run("sed -i 's/const a = 1;/const a = 3;/' /doc.xml");

    expect(state.changed).toBe(true);
    expect(page.markdown()).toBe(before.replace('const a = 1;', 'const a = 3;'));
  });

  it('edits a paragraph next to an image without touching the image', async () => {
    const page = setup('![logo](https://example.com/logo.png)\n\nCaption text\n');
    const before = page.markdown();

    const { state } = await page.run("sed -i 's/Caption text/New caption/' /doc.xml");

    expect(state.changed).toBe(true);
    expect(page.markdown()).toBe(before.replace('Caption text', 'New caption'));
  });

  // The editor's LiteXML import re-wraps a math node's code ("$E=mc^2$" comes
  // back as "$$E=mc^2$$"); plain modifyNodes does the same, so only the formula
  // text is asserted here.
  it('edits text around inline math and keeps the formula', async () => {
    const page = setup('Energy is $E=mc^2$ here\n');

    const { state } = await page.run("sed -i 's/ here/ indeed/' /doc.xml");

    expect(state.changed).toBe(true);
    expect(page.markdown()).toMatch(/^Energy is \$+E=mc\^2\$+ indeed$/);
  });
});
