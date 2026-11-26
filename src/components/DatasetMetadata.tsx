import { useEffect, useState, type ReactNode } from 'react';
import { Button, Flash, Heading, Label, Link, Spinner } from '@primer/react';
import { LinkExternalIcon } from '@primer/octicons-react';
import { loadDetail } from '../modules/registry/load';
import {
  registryPage,
  resourceKey,
  type DatasetDetail,
  type UsageLink,
} from '../modules/registry/types';
import { formatDate } from '../modules/format';
import { s3Uri } from '../modules/s3/urls';
import { hrefFor, navigate } from '../state/route';
import { AccessLabel } from './AccessLabel';
import { Markdown } from './Markdown';
import styles from './Panel.module.css';

const USAGE_SHOWN = 5;

/**
 * The registry's full metadata for a dataset, fetched when it is shown. It
 * appears in a dialog, whose title is the dataset's name.
 */
export function DatasetMetadata({ slug }: { slug: string }) {
  const [state, setState] = useState<{
    slug: string;
    detail: DatasetDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let current = true;
    loadDetail(slug).then(
      detail => current && setState({ slug, detail, error: null }),
      (error: unknown) =>
        current &&
        setState({
          slug,
          detail: null,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      current = false;
    };
  }, [slug]);

  if (state?.slug !== slug) {
    return (
      <div className={styles.section}>
        <Spinner size="small" />
      </div>
    );
  }
  if (state.error != null || !state.detail) {
    return <Flash variant="danger">{state.error}</Flash>;
  }
  return <Metadata key={slug} detail={state.detail} />;
}

function Metadata({ detail }: { detail: DatasetDetail }) {
  return (
    <div className={styles.dialogContent}>
      <section className={styles.section} aria-label="Description">
        {detail.tags.length > 0 && (
          <ul className={styles.tags} aria-label="Tags">
            {detail.tags.map(tag => (
              <li key={tag}>
                <a
                  href={hrefFor({ tag })}
                  onClick={event => {
                    event.preventDefault();
                    navigate({ tag });
                  }}
                >
                  <Label>{tag}</Label>
                </a>
              </li>
            ))}
          </ul>
        )}
        <Markdown>{detail.description}</Markdown>
        {detail.descriptionTruncated && (
          <p className={styles.muted}>
            The description is shortened here.{' '}
            <Link href={registryPage(detail.slug)} target="_blank" rel="noreferrer">
              Read it in full on the registry
            </Link>
            .
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="about-heading">
        <Heading as="h2" id="about-heading" className={styles.subheading}>
          About
        </Heading>
        <dl className={styles.fields}>
          <dt>Managed by</dt>
          <dd>
            <Markdown inline>{detail.managedBy}</Markdown>
          </dd>
          <dt>Contact</dt>
          <dd>
            <Contact value={detail.contact} />
          </dd>
          {detail.documentation !== '' && (
            <>
              <dt>Documentation</dt>
              <dd>
                <ExternalLink href={detail.documentation}>{detail.documentation}</ExternalLink>
              </dd>
            </>
          )}
          <dt>Updated</dt>
          <dd>
            <Markdown inline>{detail.updateFrequency}</Markdown>
          </dd>
          <dt>License</dt>
          <dd>
            <Markdown inline>{detail.license}</Markdown>
          </dd>
          {detail.citation != null && (
            <>
              <dt>Citation</dt>
              <dd>
                <Markdown inline>{detail.citation}</Markdown>
              </dd>
            </>
          )}
          <dt>In registry</dt>
          <dd>
            Added {formatDate(detail.added)}, changed {formatDate(detail.modified)}.{' '}
            <ExternalLink href={registryPage(detail.slug)}>Registry page</ExternalLink>
          </dd>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="resources-heading">
        <Heading as="h2" id="resources-heading" className={styles.subheading}>
          Buckets
        </Heading>
        <ul className={styles.resources}>
          {detail.buckets.map(bucket => {
            const explore = detail.explore[resourceKey(bucket)] ?? [];
            return (
              <li key={resourceKey(bucket)}>
                <div className={styles.resourceTitle}>
                  <a
                    href={hrefFor({ bucket: bucket.bucket, prefix: bucket.prefix, object: null })}
                    onClick={event => {
                      event.preventDefault();
                      navigate({ bucket: bucket.bucket, prefix: bucket.prefix, object: null });
                    }}
                  >
                    <code>{s3Uri(bucket.bucket, bucket.prefix)}</code>
                  </a>
                  {bucket.access === 'unchecked' && <AccessLabel access={bucket.access} />}
                </div>
                <div className={styles.muted}>{bucket.region}</div>
                <Markdown>{bucket.description}</Markdown>
                {explore.length > 0 && (
                  <ul className={styles.explore}>
                    {explore.map(link => (
                      <li key={link}>
                        <Markdown inline>{link}</Markdown>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {detail.otherResources.length > 0 && (
          <>
            <Heading as="h3" className={styles.minorheading}>
              Other resources
            </Heading>
            <ul className={styles.resources}>
              {detail.otherResources.map((resource, i) => (
                <li key={`${resource.identifier}-${i}`}>
                  <div className={styles.resourceTitle}>
                    <span>{resource.type}</span>
                    {resource.requesterPays && <Label variant="attention">Requester pays</Label>}
                    {resource.accountRequired && <Label variant="attention">AWS account</Label>}
                    {resource.controlledAccess != null && (
                      <Label variant="attention">Controlled access</Label>
                    )}
                    {resource.access != null && <AccessLabel access={resource.access} />}
                  </div>
                  <code className={styles.identifier}>{resource.identifier}</code>
                  <Markdown>{resource.description}</Markdown>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Usage title="Tutorials" links={detail.tutorials} />
      <Usage title="Tools and applications" links={detail.tools} />
      <Usage title="Publications" links={detail.publications} />
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <>{children}</>;
  return (
    <Link href={href} target="_blank" rel="noreferrer" className={styles.external}>
      {children}
      <LinkExternalIcon size={12} />
    </Link>
  );
}

function Contact({ value }: { value: string }) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return <Link href={`mailto:${value}`}>{value}</Link>;
  }
  if (/^https?:\/\/\S+$/i.test(value)) return <ExternalLink href={value}>{value}</ExternalLink>;
  return <Markdown inline>{value}</Markdown>;
}

function Usage({ title, links }: { title: string; links: UsageLink[] }) {
  const [all, setAll] = useState(false);
  if (links.length === 0) return null;
  const shown = all ? links : links.slice(0, USAGE_SHOWN);
  return (
    <section className={styles.section}>
      <Heading as="h2" className={styles.subheading}>
        {title} ({links.length})
      </Heading>
      <ul className={styles.usage}>
        {shown.map((link, i) => (
          <li key={`${link.url}-${i}`}>
            <ExternalLink href={link.url}>{link.title}</ExternalLink>
            {link.author != null && <span className={styles.muted}> by {link.author}</span>}
          </li>
        ))}
      </ul>
      {links.length > USAGE_SHOWN && (
        <div>
          <Button size="small" variant="invisible" onClick={() => setAll(a => !a)}>
            {all ? 'Show fewer' : `Show all ${links.length}`}
          </Button>
        </div>
      )}
    </section>
  );
}
