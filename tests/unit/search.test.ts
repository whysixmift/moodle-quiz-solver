import { describe, it, expect } from 'vitest';
import { SearchProvider } from '../../src/search/search';

describe('Search Provider Query Formulation', () => {
  const provider = new SearchProvider(3);

  it('formulates concise search query by removing boilerplate', () => {
    const rawQ = 'Select one: What is the main advantage of BGP over OSPF in WAN routing?';
    const query = provider.formulateQuery(rawQ);
    expect(query).not.toContain('Select one:');
    expect(query).toContain('advantage of BGP over OSPF in WAN routing');
  });

  it('handles Indonesian boilerplate removal', () => {
    const rawQ = 'Pilih satu atau lebih: [CODE-B] Manakah dari berikut yang merupakan classful network?';
    const query = provider.formulateQuery(rawQ);
    expect(query).not.toContain('Pilih satu atau lebih:');
    expect(query).not.toContain('[CODE-B]');
    expect(query).toContain('Manakah dari berikut yang merupakan classful network?');
  });
});
