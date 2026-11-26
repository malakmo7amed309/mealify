const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../docs/logic.js')

test('menu filter by category and text', () => {
  assert.equal(L.filterMenu(L.MENU, 'pizza', '').length, 2)
  assert.equal(L.filterMenu(L.MENU, 'all', '').length, L.MENU.length)
  assert.deepEqual(L.filterMenu(L.MENU, 'all', 'KEBAB').map((m) => m.id), ['kofta'])
  assert.equal(L.filterMenu(L.MENU, 'all', 'zzz').length, 0)
  assert.ok(L.filterMenu(L.MENU, 'all', 'veggie').length >= 2)
})

test('cart lines ignore unknown ids and bad quantities, and cap quantity', () => {
  const l = L.cartLines({ burger: 2, ghost: 3, hawaiian: 0, ribeye: -1, kofta: 'x', pepperoni: 99 }, L.MENU)
  assert.deepEqual(l.map((x) => [x.item.id, x.qty]), [['pepperoni', 20], ['burger', 2]])
  assert.equal(l.find((x) => x.item.id === 'burger').total, 330)
})

test('totals: discount, service charge, delivery fee', () => {
  const lines = L.cartLines({ burger: 2 }, L.MENU) // 330
  let t = L.totals(lines, 'pickup', '')
  assert.equal(t.subtotal, 330); assert.equal(t.service, 39.6); assert.equal(t.total, 369.6); assert.equal(t.delivery, 0)
  t = L.totals(lines, 'delivery', '')
  assert.equal(t.delivery, 25); assert.equal(t.total, 394.6)
  t = L.totals(lines, 'pickup', ' mealify10 ')
  assert.equal(t.discount, 33); assert.equal(t.service, 35.64); assert.equal(t.total, 332.64)
  assert.equal(L.totals(L.cartLines({ ribeye: 1 }, L.MENU), 'delivery', '').delivery, 0) // 420 ships free
  assert.equal(L.totals([], 'delivery', '').total, 0)
})

test('promo codes', () => {
  assert.equal(L.promoRate('WELCOME15'), 0.15)
  assert.equal(L.promoRate('nope'), null)
  assert.equal(L.promoRate('constructor'), null)
})

test('phone and email validation', () => {
  for (const ok of ['01012345678', '010 1234 5678', '+201012345678', '+1 5589 554 885'.replace(/ /g, '')]) assert.ok(L.validPhone(ok), ok)
  for (const bad of ['', '123', '0212345678', 'abc', '010123']) assert.ok(!L.validPhone(bad), bad)
  assert.ok(L.validEmail('a@b.co')); assert.ok(!L.validEmail('a@b')); assert.ok(!L.validEmail('a b@c.com'))
})

test('opening hours', () => {
  assert.equal(L.isOpen(1, 11 * 60), true)
  assert.equal(L.isOpen(1, 10 * 60 + 59), false)
  assert.equal(L.isOpen(6, 22 * 60 + 59), true)
  assert.equal(L.isOpen(6, 23 * 60), false)
  assert.equal(L.isOpen(0, 15 * 60), false)
  assert.match(L.openLabel(0, 900).text, /Monday/)
  assert.match(L.openLabel(2, 600).text, /today at 11:00/)
})

test('reservation slots', () => {
  assert.equal(L.dayOfWeek('2026-11-29'), 0) // Sunday
  assert.equal(L.dayOfWeek('2026-11-26'), 4)
  assert.equal(L.slotState('2026-11-29', 720, 2, [], 0, '2026-11-26'), 'closed')
  assert.equal(L.slotState('2026-11-26', 13 * 60, 2, [], 13 * 60, '2026-11-26'), 'past')
  assert.equal(L.slotState('2026-11-27', 720, 2, [], 0, '2026-11-26'), L.slotState('2026-11-27', 720, 2, [], 0, '2026-11-26')) // stable
  assert.equal(L.hhmm(750), '12:30')
  // my own booking can fill a slot
  const free = L.SLOTS.find((m) => L.slotState('2026-11-27', m, 1, [], 0, '2026-11-26') === 'free')
  assert.equal(L.slotState('2026-11-27', free, 1, [{ date: '2026-11-27', time: free, guests: 12 }], 0, '2026-11-26'), 'full')
})

test('reservation and order validation', () => {
  const today = '2026-11-26'
  assert.deepEqual(L.validateReservation({ name: 'Malak', phone: '01012345678', date: '2026-11-27', time: 720, guests: 2 }, today), {})
  const e = L.validateReservation({ name: '', phone: '1', date: '2026-11-29', time: null, guests: 11 }, today)
  assert.deepEqual(Object.keys(e).sort(), ['date', 'guests', 'name', 'phone', 'time'])
  assert.match(L.validateReservation({ name: 'Malak', phone: '01012345678', date: '2026-11-20', time: 720, guests: 2 }, today).date, /past/)
  assert.deepEqual(Object.keys(L.validateOrder({ name: 'M', phone: '', address: '' }, 'delivery')).sort(), ['address', 'name', 'phone'])
  assert.deepEqual(L.validateOrder({ name: 'Malak', phone: '01012345678' }, 'pickup'), {})
})

test('money format', () => {
  assert.equal(L.money(1234), '1,234 EGP'); assert.equal(L.money(39.6), '39.60 EGP')
})
