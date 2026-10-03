import type { BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { DocumentApiName, PageAgentIdentifier } from './types';

export const PageAgentManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Run a shell command in a sandboxed workspace that holds only the current page. Read the page with cat/grep, edit /doc.xml in place (sed, awk, heredoc), or write /title to rename it. One command can make many edits. Every call starts from the latest page; only /tmp is scratch space.',
      name: DocumentApiName.bash,
      parameters: {
        properties: {
          command: {
            description:
              'Shell command to run. Files: /doc.xml (LiteXML, editable), /title, /.meta/outline (read-only), /tmp (scratch).',
            type: 'string',
          },
        },
        required: ['command'],
        type: 'object',
      },
    },
    {
      description:
        'Replace the whole page with Markdown content. Use it for a new page or a full rewrite, not for targeted edits. A leading "# Heading" line becomes the page title.',
      name: DocumentApiName.initPage,
      parameters: {
        properties: {
          markdown: {
            description:
              'The complete page as Markdown: headings, paragraphs, lists, tables, images, links, code blocks.',
            type: 'string',
          },
        },
        required: ['markdown'],
        type: 'object',
      },
    },
  ],
  identifier: PageAgentIdentifier,
  meta: {
    avatar: '📄',
    description: 'Read and edit the current page with shell commands',
    readme:
      'Read and edit the current page through a sandboxed shell: grep and sed over the page as LiteXML, rewrite it from Markdown, or rename it.',
    title: 'Document',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
