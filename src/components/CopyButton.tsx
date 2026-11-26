import { useEffect, useState } from 'react';
import { Button, IconButton } from '@primer/react';
import { CheckIcon, CopyIcon } from '@primer/octicons-react';

interface Props {
  value: string;
  /** Accessible name, and the button text when `showLabel` is set. */
  label: string;
  showLabel?: boolean | undefined;
}

/** Copies `value` and confirms it in place for two seconds. */
export function CopyButton({ value, label, showLabel = false }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is refused outside a secure context or without focus.
      // The value is on screen beside every copy button, so nothing is lost.
    }
  };

  const icon = copied ? CheckIcon : CopyIcon;
  if (showLabel) {
    return (
      <Button size="small" leadingVisual={icon} onClick={copy}>
        {copied ? 'Copied' : label}
      </Button>
    );
  }
  return (
    <IconButton
      size="small"
      variant="invisible"
      icon={icon}
      aria-label={copied ? 'Copied' : label}
      onClick={copy}
    />
  );
}
