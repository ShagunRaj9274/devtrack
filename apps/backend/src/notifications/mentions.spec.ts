import { extractMentions } from './mentions';

describe('extractMentions', () => {
  it('finds unique, lower-cased usernames', () => {
    expect(extractMentions('@Marco can you and @sara check? cc @marco')).toEqual(['marco', 'sara']);
  });

  it('handles mentions at the start, after punctuation and with - or _', () => {
    expect(extractMentions('@dev_1, (@qa-team) and "@ops"')).toEqual(['dev_1', 'qa-team', 'ops']);
  });

  it('ignores email addresses, too-short names and double @', () => {
    expect(extractMentions('mail me at jane@example.com or @ab or @@admin')).toEqual([]);
  });
});
