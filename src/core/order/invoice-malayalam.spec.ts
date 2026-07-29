import { InvoiceService } from './invoice.service';

/**
 * Guards two distinct failures:
 *
 * 1. Malayalam product names must actually render. pdfkit's built-in Helvetica is
 *    Latin-only and silently emits blank/notdef glyphs rather than throwing, so the
 *    meaningful assertion is that a Malayalam-capable font is *embedded*.
 * 2. fontkit@2.0.4 hard-crashes shaping common Malayalam conjuncts
 *    ("Cannot read properties of null (reading 'xCoordinate')") unless the `abvm`
 *    OpenType feature is disabled. "വെണ്ടയ്ക്ക" (okra) reproduces it.
 */
const order = (productName: string) => ({
  id: 'ord-1',
  createdAt: new Date('2026-07-29T10:00:00Z'),
  status: 'CONFIRMED',
  paymentMethod: 'COD',
  totalAmount: 250,
  user: { name: 'Test Customer', phone: '9999999999' },
  deliveryDetails: {
    name: 'Test Customer',
    phone: '9999999999',
    address: 'Kochi',
    pinCode: '682001',
  },
  orderItems: [
    {
      id: 'item-1',
      quantity: 2,
      price: 125,
      totalPrice: 250,
      cleaning: false,
      cutting: false,
      product: { name: productName },
      variant: { weight: 500 },
    },
  ],
});

describe('InvoiceService — Malayalam', () => {
  const service = new InvoiceService();

  it('embeds a Malayalam-capable font in the bill', async () => {
    const buf = await service.generateBill(order('വെണ്ടയ്ക്ക'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('NotoSansMalayalam');
  });

  it('does not crash shaping conjunct-heavy Malayalam', async () => {
    for (const name of ['മുരിങ്ങയ്ക്ക', 'വെണ്ടയ്ക്ക', 'കാബേജ്', 'പച്ചമുളക്']) {
      const buf = await service.generateBill(order(name));
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it('renders a mixed English/Malayalam name', async () => {
    const buf = await service.generateBill(order('Spinach / ചീര'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renders the label, including its continued-text chain', async () => {
    const o = order('വെണ്ടയ്ക്ക');
    const buf = await service.generateLabel(o.orderItems[0], o);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('NotoSansMalayalam');
  });
});
