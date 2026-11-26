import { Label } from '@primer/react';
import type { ComponentProps } from 'react';
import type { BucketAccess } from '../modules/registry/types';

type Variant = NonNullable<ComponentProps<typeof Label>['variant']>;

const ACCESS: Record<BucketAccess, { text: string; variant: Variant; explain: string }> = {
  browsable: {
    text: 'Browsable',
    variant: 'success',
    explain: 'This bucket allows anonymous listing from a web page.',
  },
  'no-cors': {
    text: 'CLI only',
    variant: 'attention',
    explain:
      'This bucket allows anonymous listing, but it has no CORS configuration, so a web page ' +
      'cannot read the listing. The AWS CLI can. Object downloads still work from here.',
  },
  denied: {
    text: 'Listing denied',
    variant: 'danger',
    explain:
      'This bucket refuses anonymous listing. Individual objects may still be readable if you ' +
      'know their keys.',
  },
  missing: {
    text: 'Bucket missing',
    variant: 'danger',
    explain: 'S3 reports that this bucket does not exist.',
  },
  unreachable: {
    text: 'Unreachable',
    variant: 'secondary',
    explain: 'The bucket did not answer when the index was built.',
  },
  unchecked: {
    text: 'Not checked',
    variant: 'secondary',
    explain: 'The index was built without checking bucket access.',
  },
};

export function AccessLabel({ access }: { access: BucketAccess }) {
  const { text, variant, explain } = ACCESS[access];
  return (
    <Label variant={variant} title={explain}>
      {text}
    </Label>
  );
}
