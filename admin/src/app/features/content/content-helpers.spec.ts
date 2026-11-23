import { applyMdTool, auditActionSeverity, auditLink, autoSlug, moveItem, stockAlertCount } from './content-helpers';

describe('content helpers', () => {
  it('bold wraps the selection or inserts a placeholder', () => {
    expect(applyMdTool('a word b', 2, 6, 'bold')).toEqual({ text: 'a **word** b', start: 4, end: 8 });
    const e = applyMdTool('', 0, 0, 'bold');
    expect(e.text).toBe('**bold text**');
    expect(e.text.slice(e.start, e.end)).toBe('bold text');
  });
  it('link selects the url placeholder', () => {
    const e = applyMdTool('see here', 4, 8, 'link');
    expect(e.text).toBe('see [here](https://)');
    expect(e.text.slice(e.start, e.end)).toBe('https://');
  });
  it('h2 prefixes the current line once', () => {
    expect(applyMdTool('one\ntwo', 5, 5, 'h2').text).toBe('one\n## two');
    expect(applyMdTool('## x', 3, 3, 'h2').text).toBe('## x');
  });
  it('list prefixes every selected line', () => {
    expect(applyMdTool('a\nb\nc', 0, 3, 'list').text).toBe('- a\n- b\nc');
    expect(applyMdTool('- a\nb', 0, 5, 'list').text).toBe('- a\n- b');
  });
  it('autoSlug and moveItem', () => {
    expect(autoSlug('Why ECE 22.06 matters!')).toBe('why-ece-22-06-matters');
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2], 5, 0)).toEqual([1, 2]);
  });
  it('audit links and severities', () => {
    expect(auditLink('Product', '42')).toEqual(['/products', '42']);
    expect(auditLink('Guide', '3')).toEqual(['/guides', '3']);
    expect(auditLink('Order', 'GD-1')).toBeNull();
    expect(auditLink('Brand', '1')).toBeNull();
    expect(auditLink('Product', null)).toBeNull();
    expect(auditActionSeverity('product.delete')).toBe('danger');
    expect(auditActionSeverity('guide.publish')).toBe('success');
  });
  it('sums stock alerts', () => {
    expect(stockAlertCount({ lowStock: 2, soldOut: 1 })).toBe(3);
    expect(stockAlertCount(null)).toBe(0);
  });
});
