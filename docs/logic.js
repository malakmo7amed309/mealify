/* Mealify logic: pure functions, no DOM. Works in the browser (window.MealifyLogic) and in Node tests. */
(function (root) {
  'use strict'

  var MENU = [
    { id: 'chili-tofu', name: 'Crispy chili bowl', cat: 'veggie', price: 130, img: 'images/dish.png', desc: 'Crispy tofu, roasted peppers, peanuts and fresh mint in a sticky chili glaze.', tags: ['veggie', 'spicy'] },
    { id: 'hawaiian', name: 'Hawaiian pizza', cat: 'pizza', price: 185, img: 'images/img.1.jpg', desc: 'Smoked turkey, pineapple and stretchy mozzarella on a thin, blistered crust.', tags: [] },
    { id: 'pepperoni', name: 'Pepperoni pizza', cat: 'pizza', price: 195, img: 'images/img.4.jpg', desc: 'Spicy pepperoni, tomato sauce and a double layer of cheese.', tags: ['spicy'] },
    { id: 'ribeye', name: 'Fire-grilled ribeye', cat: 'grill', price: 420, img: 'images/img.2.jpg', desc: 'Dry-aged ribeye over open flame with rosemary and sea salt. Served with grilled vegetables.', tags: [] },
    { id: 'kofta', name: 'Lyulya kebab', cat: 'grill', price: 210, img: 'images/img.6.jpg', desc: 'Two skewers of spiced ground beef on flatbread with sumac onions.', tags: [] },
    { id: 'burger', name: 'Classic cheeseburger', cat: 'burgers', price: 165, img: 'images/img.3.jpg', desc: 'Beef patty, cheddar, pickles and house sauce in a toasted bun. Comes with fries.', tags: [] },
    { id: 'chicken', name: 'Crispy fried chicken', cat: 'burgers', price: 150, img: 'images/img.5.jpg', desc: 'Golden, crunchy chicken legs with a juicy middle. Comes with garlic dip.', tags: ['spicy'] },
    { id: 'frittata', name: 'Potato frittata', cat: 'veggie', price: 110, img: 'images/img.7.jpg', desc: 'Baked potato and egg pie with herbs, served warm in the pan.', tags: ['veggie'] },
  ]
  var CATS = [['all', 'All'], ['pizza', 'Pizza'], ['grill', 'Grill'], ['burgers', 'Burgers & chicken'], ['veggie', 'Vegetarian']]

  var PROMOS = { MEALIFY10: 0.1, WELCOME15: 0.15 }
  var SERVICE_RATE = 0.12
  var DELIVERY_FEE = 25
  var FREE_DELIVERY_OVER = 400
  var MAX_QTY = 20

  function round2(n) { return Math.round(n * 100) / 100 }

  function filterMenu(menu, cat, query) {
    var q = String(query || '').trim().toLowerCase()
    return menu.filter(function (m) {
      if (cat && cat !== 'all' && m.cat !== cat) return false
      if (!q) return true
      return (m.name + ' ' + m.desc + ' ' + m.tags.join(' ')).toLowerCase().indexOf(q) !== -1
    })
  }

  /* cart is { id: qty }. Unknown ids and bad quantities are ignored. */
  function cartLines(cart, menu) {
    var out = []
    menu.forEach(function (m) {
      var q = Math.floor(Number(cart[m.id]))
      if (q > 0) out.push({ item: m, qty: Math.min(q, MAX_QTY), total: m.price * Math.min(q, MAX_QTY) })
    })
    return out
  }

  function promoRate(code) {
    var c = String(code || '').trim().toUpperCase()
    return Object.prototype.hasOwnProperty.call(PROMOS, c) ? PROMOS[c] : null
  }

  /* mode is 'pickup' or 'delivery'. The discount applies to food only. Service charge is on food after discount. */
  function totals(lines, mode, code) {
    var subtotal = lines.reduce(function (s, l) { return s + l.total }, 0)
    var rate = promoRate(code) || 0
    var discount = round2(subtotal * rate)
    var food = subtotal - discount
    var service = round2(food * SERVICE_RATE)
    var delivery = mode === 'delivery' && subtotal > 0 && subtotal < FREE_DELIVERY_OVER ? DELIVERY_FEE : 0
    return { subtotal: subtotal, discount: discount, service: service, delivery: delivery, total: round2(food + service + delivery), count: lines.reduce(function (s, l) { return s + l.qty }, 0) }
  }

  /* Egyptian mobile (01x xxxx xxxx) or a plain international number. Spaces and dashes are allowed. */
  function validPhone(s) {
    var d = String(s || '').replace(/[\s-]/g, '')
    return /^(\+?20|0)?1[0125]\d{8}$/.test(d) || /^\+\d{9,14}$/.test(d)
  }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()) }

  /* Opening hours: Monday to Saturday 11:00 to 23:00, closed Sunday. dow: 0 = Sunday. */
  function isOpen(dow, minutes) { return dow !== 0 && minutes >= 11 * 60 && minutes < 23 * 60 }
  function openLabel(dow, minutes) {
    if (isOpen(dow, minutes)) return { open: true, text: 'Open now, until 23:00' }
    if (dow !== 0 && minutes < 11 * 60) return { open: false, text: 'Closed, opens today at 11:00' }
    var next = dow === 6 ? 'Monday' : dow === 0 ? 'Monday' : 'tomorrow'
    return { open: false, text: 'Closed, opens ' + next + ' at 11:00' }
  }

  var SLOTS = []
  for (var m = 12 * 60; m <= 22 * 60 + 30; m += 30) SLOTS.push(m)
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }

  function dayOfWeek(iso) { var p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() }

  /* Some slots are always full, decided by the date and time so the page behaves the same on every visit. */
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h }
  var TABLE_CAPACITY = 12 // guests per slot
  function slotState(iso, minutes, guests, booked, nowMin, todayIso) {
    if (dayOfWeek(iso) === 0) return 'closed'
    if (iso === todayIso && minutes <= nowMin + 30) return 'past'
    var taken = (hash(iso + ':' + minutes) % 5 === 0) ? TABLE_CAPACITY : (hash(iso + minutes) % 7)
    var mine = (booked || []).filter(function (b) { return b.date === iso && b.time === minutes }).reduce(function (s, b) { return s + b.guests }, 0)
    return taken + mine + guests > TABLE_CAPACITY ? 'full' : 'free'
  }

  function validateReservation(r, todayIso) {
    var e = {}
    if (!r.name || r.name.trim().length < 2) e.name = 'Enter your name.'
    if (!validPhone(r.phone)) e.phone = 'Enter a valid mobile number, like 010 1234 5678.'
    if (!r.date) e.date = 'Pick a date.'
    else if (r.date < todayIso) e.date = 'That date is in the past.'
    else if (dayOfWeek(r.date) === 0) e.date = 'We are closed on Sundays.'
    if (r.time == null) e.time = 'Pick a time.'
    if (!(r.guests >= 1 && r.guests <= 10)) e.guests = 'Tables seat 1 to 10 guests.'
    return e
  }

  function validateOrder(o, mode) {
    var e = {}
    if (!o.name || o.name.trim().length < 2) e.name = 'Enter your name.'
    if (!validPhone(o.phone)) e.phone = 'Enter a valid mobile number, like 010 1234 5678.'
    if (mode === 'delivery' && (!o.address || o.address.trim().length < 6)) e.address = 'Enter your delivery address.'
    return e
  }

  function money(n) { return (Math.round(n) === n ? String(n) : n.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' EGP' }

  var api = { MENU: MENU, CATS: CATS, SLOTS: SLOTS, MAX_QTY: MAX_QTY, filterMenu: filterMenu, cartLines: cartLines, promoRate: promoRate, totals: totals, validPhone: validPhone, validEmail: validEmail, isOpen: isOpen, openLabel: openLabel, hhmm: hhmm, dayOfWeek: dayOfWeek, slotState: slotState, validateReservation: validateReservation, validateOrder: validateOrder, money: money }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.MealifyLogic = api
})(typeof window !== 'undefined' ? window : this)
