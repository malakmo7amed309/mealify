(function () {
  'use strict'
  var L = window.MealifyLogic
  var $ = function (s, r) { return (r || document).querySelector(s) }
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) }
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem('mealify-' + k)); return v == null ? d : v } catch (e) { return d } },
    set: function (k, v) { try { localStorage.setItem('mealify-' + k, JSON.stringify(v)) } catch (e) { /* private mode */ } },
  }
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }

  // Cairo time: the restaurant's hours are in its own time zone, whatever the visitor's clock says.
  function cairoNow() {
    var p = {}
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value })
    var hh = Number(p.hour) % 24
    return { iso: p.year + '-' + p.month + '-' + p.day, min: hh * 60 + Number(p.minute) }
  }
  var toastT
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show') }, 2600) }

  /* ---- theme, nav ---- */
  function setTheme(t) { document.documentElement.dataset.theme = t; store.set('theme', t); $('#theme i').className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon' }
  $('#theme').onclick = function () { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') }
  $('#theme i').className = document.documentElement.dataset.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon'
  $('#burger').onclick = function () { var o = $('#nav').classList.toggle('open'); this.setAttribute('aria-expanded', o) }
  $$('#links a').forEach(function (a) { a.onclick = function () { $('#nav').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false') } })
  var secs = $$('main section[id]')
  function spy() {
    var y = window.scrollY + 120, cur = secs[0].id
    secs.forEach(function (s) { if (s.offsetTop <= y) cur = s.id })
    $$('#links a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + cur) })
  }
  window.addEventListener('scroll', spy, { passive: true }); spy()

  function paintStatus() {
    var n = cairoNow(), dow = L.dayOfWeek(n.iso), s = L.openLabel(dow, n.min)
    var el = $('#status'); el.textContent = s.text; el.className = 'status ' + (s.open ? 'on' : 'off')
  }
  paintStatus(); setInterval(paintStatus, 60000)

  /* ---- menu ---- */
  var cat = 'all', cart = store.get('cart', {}), promo = store.get('promo', ''), mode = store.get('mode', 'pickup')
  $('#chips').innerHTML = L.CATS.map(function (c) { return '<button class="chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === 'all') + '">' + c[1] + '</button>' }).join('')
  $('#chips').onclick = function (e) {
    var b = e.target.closest('.chip'); if (!b) return
    cat = b.dataset.c; $$('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b) }); paintMenu()
  }
  $('#q').oninput = paintMenu
  function paintMenu() {
    var list = L.filterMenu(L.MENU, cat, $('#q').value)
    $('#dishes').innerHTML = list.map(function (m) {
      var q = cart[m.id] || 0
      return '<article class="dish-card"><img src="' + m.img + '" alt="' + esc(m.name) + '" loading="lazy"><div class="dc"><div class="top"><h3>' + esc(m.name) + '</h3><b>' + L.money(m.price) + '</b></div>' +
        '<p>' + esc(m.desc) + '</p><div class="foot">' + m.tags.map(function (t) { return '<span class="tag ' + t + '">' + (t === 'spicy' ? 'Spicy' : 'Vegetarian') + '</span>' }).join('') +
        (q ? '<span class="inbag">' + q + ' in order</span>' : '') + '<button class="btn small" data-add="' + m.id + '" aria-label="Add ' + esc(m.name) + ' to order">Add</button></div></div></article>'
    }).join('')
    $('#no-dishes').hidden = list.length > 0
  }
  $('#dishes').onclick = function (e) {
    var b = e.target.closest('[data-add]'); if (!b) return
    var id = b.dataset.add; cart[id] = Math.min((cart[id] || 0) + 1, L.MAX_QTY); saveCart(); toast('Added to your order'); paintMenu()
  }

  /* ---- cart drawer ---- */
  function saveCart() { store.set('cart', cart); store.set('promo', promo); store.set('mode', mode); paintCart() }
  function lines() { return L.cartLines(cart, L.MENU) }
  function paintCount() { var n = lines().reduce(function (s, l) { return s + l.qty }, 0), c = $('#cart-count'); c.textContent = n; c.hidden = !n }
  var lastFocus
  function openDrawer() { lastFocus = document.activeElement; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; $('#cart-close').focus(); paintCart() }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; if (lastFocus) lastFocus.focus() }
  $('#cart-open').onclick = openDrawer; $('#cart-close').onclick = closeDrawer; $('#scrim').onclick = closeDrawer

  var form = { name: store.get('who', {}).name || '', phone: store.get('who', {}).phone || '', address: store.get('who', {}).address || '' }
  var orderErr = {}, promoMsg = ''
  function paintCart() {
    paintCount()
    var ls = lines(), body = $('#drawer-body'), orders = store.get('orders', [])
    var html = ''
    if (!ls.length) html += '<p class="empty">Your order is empty. Add something from the menu.</p>'
    else {
      var t = L.totals(ls, mode, promo)
      html += '<ul class="lines">' + ls.map(function (l) {
        return '<li><img src="' + l.item.img + '" alt=""><div><b>' + esc(l.item.name) + '</b><span>' + L.money(l.item.price) + '</span></div><div class="qty"><button data-q="' + l.item.id + '" data-d="-1" aria-label="Fewer ' + esc(l.item.name) + '">-</button><output>' + l.qty + '</output><button data-q="' + l.item.id + '" data-d="1" aria-label="More ' + esc(l.item.name) + '">+</button></div><button class="rm" data-rm="' + l.item.id + '" aria-label="Remove ' + esc(l.item.name) + '">&times;</button></li>'
      }).join('') + '</ul>'
      html += '<div class="seg" role="group" aria-label="Order type"><button data-mode="pickup" aria-pressed="' + (mode === 'pickup') + '">Pickup</button><button data-mode="delivery" aria-pressed="' + (mode === 'delivery') + '">Delivery</button></div>'
      html += '<form id="promo" class="promo"><input id="promo-in" value="' + esc(promo) + '" placeholder="Promo code" aria-label="Promo code"><button class="btn small ghost">Apply</button></form><small class="' + (promoMsg.indexOf('off') > -1 ? 'ok' : 'err') + '">' + esc(promoMsg) + '</small>'
      html += '<dl class="sum"><div><dt>Subtotal</dt><dd>' + L.money(t.subtotal) + '</dd></div>' + (t.discount ? '<div class="disc"><dt>Promo</dt><dd>-' + L.money(t.discount) + '</dd></div>' : '') + '<div><dt>Service (12%)</dt><dd>' + L.money(t.service) + '</dd></div>' + (mode === 'delivery' ? '<div><dt>Delivery</dt><dd>' + (t.delivery ? L.money(t.delivery) : 'Free') + '</dd></div>' : '') + '<div class="total"><dt>Total</dt><dd>' + L.money(t.total) + '</dd></div></dl>'
      if (mode === 'delivery') html += '<p class="hint">Delivery is free over 400 EGP.</p>'
      html += '<form id="checkout" novalidate><label>Name<input id="o-name" value="' + esc(form.name) + '" autocomplete="name"><small class="err">' + esc(orderErr.name || '') + '</small></label><label>Mobile<input id="o-phone" value="' + esc(form.phone) + '" inputmode="tel" autocomplete="tel"><small class="err">' + esc(orderErr.phone || '') + '</small></label>' +
        (mode === 'delivery' ? '<label>Address<input id="o-address" value="' + esc(form.address) + '" autocomplete="street-address"><small class="err">' + esc(orderErr.address || '') + '</small></label>' : '') +
        '<button class="btn block">Place order, ' + L.money(t.total) + '</button><p class="hint">Pay in cash on ' + (mode === 'delivery' ? 'delivery' : 'pickup') + '. Demo: nothing is sent.</p></form>'
    }
    if (orders.length) html += '<h3 class="past">Recent orders</h3><ul class="orders">' + orders.slice(0, 5).map(function (o) { return '<li><b>' + esc(o.ref) + '</b><span>' + o.count + ' items, ' + L.money(o.total) + ', ' + esc(o.mode) + '</span><small>' + esc(o.when) + '</small></li>' }).join('') + '</ul><button class="link" id="clear-orders">Clear order history</button>'
    body.innerHTML = html
  }
  $('#drawer-body').onclick = function (e) {
    var q = e.target.closest('[data-q]'), rm = e.target.closest('[data-rm]'), md = e.target.closest('[data-mode]')
    if (q) { var id = q.dataset.q, n = (cart[id] || 0) + Number(q.dataset.d); if (n <= 0) delete cart[id]; else cart[id] = Math.min(n, L.MAX_QTY); saveCart(); paintMenu() }
    else if (rm) { delete cart[rm.dataset.rm]; saveCart(); paintMenu() }
    else if (md) { mode = md.dataset.mode; orderErr = {}; saveCart() }
    else if (e.target.id === 'clear-orders') { store.set('orders', []); paintCart() }
  }
  $('#drawer-body').onsubmit = function (e) {
    e.preventDefault()
    if (e.target.id === 'promo') {
      var c = $('#promo-in').value.trim()
      if (!c) { promo = ''; promoMsg = '' } else if (L.promoRate(c)) { promo = c.toUpperCase(); promoMsg = Math.round(L.promoRate(c) * 100) + '% off applied.' } else { promo = ''; promoMsg = 'That code is not valid.' }
      saveCart()
    } else if (e.target.id === 'checkout') {
      form = { name: $('#o-name').value, phone: $('#o-phone').value, address: $('#o-address') ? $('#o-address').value : form.address }
      orderErr = L.validateOrder(form, mode)
      if (Object.keys(orderErr).length) return paintCart()
      var ls = lines(), t = L.totals(ls, mode, promo)
      var ref = 'ML-' + String(Date.now()).slice(-6)
      var orders = store.get('orders', []); orders.unshift({ ref: ref, count: t.count, total: t.total, mode: mode, when: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }) })
      store.set('orders', orders.slice(0, 20)); store.set('who', form)
      cart = {}; promo = ''; promoMsg = ''; orderErr = {}; saveCart(); paintMenu(); closeDrawer()
      showModal('Order placed', '<p>Thank you, ' + esc(form.name.trim().split(' ')[0]) + '. Your order <b>' + ref + '</b> (' + t.count + ' items, <b>' + L.money(t.total) + '</b>) will be ready for ' + (mode === 'delivery' ? 'delivery in about 40 minutes' : 'pickup in about 20 minutes') + '.</p><p class="hint">This is a demo, so no real order was sent.</p>')
    }
  }

  /* ---- reservations ---- */
  var today = cairoNow(), res = store.get('res', []), rt = null, guests = 2
  var rd = $('#r-date'); rd.min = today.iso
  var first = new Date(today.iso + 'T00:00:00Z'); do { first.setUTCDate(first.getUTCDate() + (rd.value ? 1 : 0)); rd.value = first.toISOString().slice(0, 10) } while (L.dayOfWeek(rd.value) === 0)
  function paintSlots() {
    var html = L.SLOTS.map(function (m) {
      var st = L.slotState(rd.value, m, guests, res, today.min, today.iso)
      return '<button type="button" class="slot' + (rt === m ? ' sel' : '') + '" data-m="' + m + '"' + (st !== 'free' ? ' disabled' : '') + ' aria-pressed="' + (rt === m) + '">' + L.hhmm(m) + '</button>'
    }).join('')
    $('#slots').innerHTML = html
    if (rt != null && $('#slots [data-m="' + rt + '"]').disabled) rt = null, paintSlots()
  }
  function dateChanged() { $('#e-date').textContent = ''; rt = null; paintSlots() }
  rd.addEventListener('change', dateChanged); rd.addEventListener('input', dateChanged)
  $('#slots').onclick = function (e) { var b = e.target.closest('.slot'); if (!b || b.disabled) return; rt = Number(b.dataset.m); $('#e-time').textContent = ''; paintSlots() }
  $('#g-minus').onclick = function () { guests = Math.max(1, guests - 1); $('#r-guests').textContent = guests; paintSlots() }
  $('#g-plus').onclick = function () { guests = Math.min(10, guests + 1); $('#r-guests').textContent = guests; paintSlots() }
  function paintRes() {
    var upcoming = res.filter(function (r) { return r.date >= today.iso }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time, 'en', { numeric: true }) })
    $('#res-list').innerHTML = upcoming.map(function (r) { return '<li><div><b>' + esc(r.date) + ' at ' + L.hhmm(r.time) + '</b><span>' + r.guests + ' guest' + (r.guests > 1 ? 's' : '') + ', ' + esc(r.name) + '</span><small>Ref ' + esc(r.ref) + (r.notes ? ' - ' + esc(r.notes) : '') + '</small></div><button class="link" data-cancel="' + esc(r.ref) + '">Cancel</button></li>' }).join('')
    $('#res-empty').hidden = upcoming.length > 0
  }
  $('#res-list').onclick = function (e) { var b = e.target.closest('[data-cancel]'); if (!b) return; res = res.filter(function (r) { return r.ref !== b.dataset.cancel }); store.set('res', res); paintRes(); paintSlots(); toast('Reservation cancelled') }
  $('#res-form').onsubmit = function (e) {
    e.preventDefault()
    var r = { name: $('#r-name').value, phone: $('#r-phone').value, date: rd.value, time: rt, guests: guests, notes: $('#r-notes').value.trim() }
    var err = L.validateReservation(r, today.iso)
    ;['date', 'guests', 'time', 'name', 'phone'].forEach(function (k) { $('#e-' + k).textContent = err[k] || '' })
    if (Object.keys(err).length) { var f = $('#res-form .err:not(:empty)'); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
    if (L.slotState(r.date, r.time, r.guests, res, today.min, today.iso) !== 'free') { $('#e-time').textContent = 'That time was just taken. Pick another.'; return paintSlots() }
    r.ref = 'TB-' + String(Date.now()).slice(-5); r.name = r.name.trim()
    res.push(r); store.set('res', res); store.set('who', Object.assign(store.get('who', {}), { name: r.name, phone: r.phone }))
    rt = null; $('#r-notes').value = ''; paintRes(); paintSlots()
    showModal('Table reserved', '<p>' + r.guests + ' guest' + (r.guests > 1 ? 's' : '') + ' on <b>' + r.date + ' at ' + L.hhmm(r.time) + '</b>, under ' + esc(r.name) + '. Reference <b>' + r.ref + '</b>.</p><p class="hint">Demo: no real booking was made. You can cancel it from the list.</p>')
  }
  $('#r-name').value = store.get('who', {}).name || ''; $('#r-phone').value = store.get('who', {}).phone || ''

  /* ---- gallery + lightbox ---- */
  var photos = [['images/img.1.jpg', 'Pizza', 'Hawaiian pizza with ham and pineapple'], ['images/img.3.jpg', 'Burger', 'Cheeseburger with fries and a cold drink'], ['images/img.2.jpg', 'Ribeye', 'Steak over open flames'], ['images/img.4.jpg', 'Pizza slices', 'Pizza slices on a dark background'], ['images/img.5.jpg', 'Fried chicken', 'Golden, crunchy chicken legs'], ['images/img.6.jpg', 'Lyulya kebab', 'Spiced skewers on flatbread'], ['images/img.7.jpg', 'Frittata', 'Potato frittata in a ceramic pan']]
  $('#gallery').innerHTML = photos.map(function (p, i) { return '<button class="g" data-i="' + i + '" aria-label="Open photo: ' + esc(p[1]) + '"><img src="' + p[0] + '" alt="' + esc(p[2]) + '" loading="lazy"><span>' + esc(p[1]) + '</span></button>' }).join('')
  var li = 0
  function lb(i) { li = (i + photos.length) % photos.length; $('#lb-img').src = photos[li][0]; $('#lb-img').alt = photos[li][2]; $('#lb-cap').textContent = photos[li][1] + ' - ' + photos[li][2]; $('#lightbox').hidden = false }
  $('#gallery').onclick = function (e) { var b = e.target.closest('.g'); if (b) { lastFocus = b; lb(Number(b.dataset.i)); $('#lb-close').focus() } }
  $('#lb-close').onclick = function () { $('#lightbox').hidden = true; if (lastFocus) lastFocus.focus() }
  $('#lb-prev').onclick = function () { lb(li - 1) }; $('#lb-next').onclick = function () { lb(li + 1) }
  $('#lightbox').onclick = function (e) { if (e.target === this) $('#lb-close').click() }

  /* ---- modal, keyboard ---- */
  function showModal(title, html) { lastFocus = document.activeElement; $('#modal-title').textContent = title; $('#modal-body').innerHTML = html; $('#modal').hidden = false; $('#modal-close').focus() }
  $('#modal-close').onclick = function () { $('#modal').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus() }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!$('#lightbox').hidden) $('#lb-close').click(); else if (!$('#modal').hidden) $('#modal-close').click(); else if ($('#drawer').classList.contains('open')) closeDrawer() }
    if (!$('#lightbox').hidden) { if (e.key === 'ArrowRight') lb(li + 1); if (e.key === 'ArrowLeft') lb(li - 1) }
  })

  /* ---- contact + newsletter ---- */
  $('#msg-form').onsubmit = function (e) {
    e.preventDefault()
    var n = $('#m-name').value.trim(), m = $('#m-email').value, t = $('#m-text').value.trim()
    $('#em-name').textContent = n.length < 2 ? 'Enter your name.' : ''
    $('#em-email').textContent = L.validEmail(m) ? '' : 'Enter a valid email.'
    $('#em-text').textContent = t.length < 10 ? 'Write at least 10 characters.' : ''
    if ($('#msg-form .err:not(:empty)')) return
    $('#m-ok').textContent = 'Thanks ' + n.split(' ')[0] + ', your message is noted. (Demo: nothing was sent.)'; this.reset()
  }
  $('#news').onsubmit = function (e) {
    e.preventDefault(); var v = $('#n-email').value
    $('#en-email').textContent = L.validEmail(v) ? '' : 'Enter a valid email.'
    $('#n-ok').textContent = ''
    if (L.validEmail(v)) { $('#n-ok').textContent = 'You are on the list. (Demo.)'; this.reset() }
  }

  paintMenu(); paintCart(); paintSlots(); paintRes()
})()
