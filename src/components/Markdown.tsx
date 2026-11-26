/**
 * Registry Markdown, rendered without raw HTML.
 *
 * react-markdown builds React elements, so contributor-written text cannot
 * inject markup. `skipHtml` drops embedded HTML rather than showing its tags
 * as text, which READMEs full of badges and layout tags would otherwise do.
 * Do not add rehype-raw.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

const SAFE_URL = /^(https?:|mailto:)/i;

interface Props {
  children: string;
  inline?: boolean | undefined;
  /** A whole file, with headings sized as headings rather than as labels. */
  document?: boolean | undefined;
}

export function Markdown({ children, inline = false, document = false }: Props) {
  const variant = inline ? styles.inline : document ? styles.document : undefined;
  return (
    <div className={variant ? `${styles.markdown} ${variant}` : styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={url => (SAFE_URL.test(url) ? url : '')}
        components={{
          a: ({ href, children: text }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {text}
            </a>
          ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
