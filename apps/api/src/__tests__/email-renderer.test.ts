import { describe, expect, it } from 'vitest';
import { htmlToText, personalize, renderEmail } from '../modules/campaigns/email-renderer.js';

const contact = {
  email: 'ava@example.com',
  firstName: 'Ava',
  lastName: null,
  attributes: { company: 'Acme <Corp>' },
};

describe('email renderer', () => {
  it('personalizes with fallbacks and escapes HTML', () => {
    expect(personalize('Hi {{firstName}} {{lastName|friend}} at {{attr.company}}', contact)).toBe(
      'Hi Ava friend at Acme &lt;Corp&gt;',
    );
  });

  it('rewrites links for click tracking and adds the compliance footer + pixel', () => {
    const html = renderEmail({
      html: '<p>Hello <a href="https://shop.example.com">Shop</a></p>',
      brandName: 'Demo',
      sendId: 's1',
      contact,
    });
    expect(html).not.toContain('href="https://shop.example.com"');
    expect(html).toMatch(/\/t\/c\//);
    expect(html).toMatch(/Unsubscribe/);
    expect(html).toMatch(/\/t\/o\/.+\.gif/);
  });

  it('produces a plain-text alternative', () => {
    expect(htmlToText('<p>Hi</p><a href="https://x.io">Go</a>')).toBe('Hi\nGo (https://x.io)');
  });
});
