/* Menu: header "Menu" button and the tab bar's "More" open the same sheet */
const drawer = document.querySelector('#site-drawer')
const toggles = document.querySelectorAll('.menu-btn, [data-more]')
function setMenu(open) {
  drawer.toggleAttribute('hidden', !open)
  document.body.classList.toggle('sheet-open', open)
  toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)))
}
if (drawer) {
  toggles.forEach((t) => t.addEventListener('click', (e) => {
    e.stopPropagation()
    setMenu(drawer.hasAttribute('hidden'))
  }))
  drawer.querySelector('[data-close]')?.addEventListener('click', () => setMenu(false))
  // tap on the dimmed backdrop closes it
  document.addEventListener('click', (e) => {
    if (!drawer.hasAttribute('hidden') && !drawer.contains(e.target)) setMenu(false)
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false) })
}

/* Hero slider: autoplay + swipe; pauses only while someone types or tabs inside it */
;(() => {
  const root = document.querySelector('[data-slider]')
  if (!root) return
  const slides = [...root.querySelectorAll('.hero3-slide')]
  const DELAY = 6000
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let i = 0
  let timer

  function go(n) {
    i = (n + slides.length) % slides.length
    slides.forEach((s, idx) => {
      s.classList.toggle('is-on', idx === i)
      s.toggleAttribute('inert', idx !== i)
    })
    arm()
  }
  function arm() {
    clearTimeout(timer)
    if (!still && !root.classList.contains('is-paused')) timer = setTimeout(() => go(i + 1), DELAY)
  }
  function pause(on) {
    root.classList.toggle('is-paused', on)
    if (on) clearTimeout(timer)
    else arm()
  }

  root.addEventListener('focusin', () => pause(true))
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) pause(false) })
  let x0 = null
  root.addEventListener('pointerdown', (e) => { x0 = e.target.closest('.hero-quote') ? null : e.clientX })
  root.addEventListener('pointerup', (e) => {
    if (x0 !== null && Math.abs(e.clientX - x0) > 50) go(i + (e.clientX < x0 ? 1 : -1))
    x0 = null
  })
  arm()
})()

/* Simple reveal on scroll — CSS only hides .reveal under html.js */
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in')
        revealObserver.unobserve(entry.target)
      }
    })
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })

  document.querySelectorAll('.reveal').forEach(el => {
    // already on screen: show without animating, so first paint never blinks
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in')
    else revealObserver.observe(el)
  })
  document.documentElement.classList.add('js')
}

/* Contact form (mailto fallback) */
document.querySelectorAll('[data-contact]').forEach(form => {
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const name = form.querySelector('[name="name"]')?.value || ''
    const phone = form.querySelector('[name="phone"]')?.value || ''
    const service = form.querySelector('[name="service"]')?.value || ''
    const message = form.querySelector('[name="message"]')?.value || ''
    
    const body = `Name: ${name}%0APhone: ${phone}%0AService: ${service}%0AMessage: ${message}`
    const waText = `Hello, I'm ${name}. Phone: ${phone}. Service: ${service}. ${message}`
    
    // Open WhatsApp with pre-filled message
    window.open(`https://wa.me/919491656200?text=${encodeURIComponent(waText)}`, '_blank')
    
    const status = form.querySelector('[data-contact-status]')
    if (status) {
      status.hidden = false
      status.textContent = 'Redirecting to WhatsApp...'
    }
  })
})

/* Quick WhatsApp form */
document.querySelectorAll('[data-quick]').forEach(form => {
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const name = form.querySelector('[name="name"]')?.value || ''
    const phone = form.querySelector('[name="phone"]')?.value || ''
    const waText = `Hello, I'm ${name}. My number is ${phone}. I want to book a pest control visit.`
    window.open(`https://wa.me/919491656200?text=${encodeURIComponent(waText)}`, '_blank')
  })
})

/* Smooth scroll for anchor links */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'))
    if (target) {
      e.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
})

/* Product Booking & Quote Forms */
document.querySelectorAll('[data-product-book]').forEach((form) => {
  const liveSize = form.querySelector('[data-live-size]')
  const livePrice = form.querySelector('[data-live-price]')
  const fromPrice = document.querySelector('[data-from-price]')
  const mirror = form.querySelector('[data-size-mirror]')

  function sync() {
    const selected = form.querySelector('input[name="variant_id"]:checked')
    if (!selected) return
    const label = selected.dataset.label || ''
    const price = selected.dataset.price || ''
    if (liveSize) liveSize.textContent = label
    if (livePrice && price) livePrice.textContent = `₹${Number(price).toLocaleString('en-IN')}`
    if (fromPrice && price) fromPrice.textContent = `₹${Number(price).toLocaleString('en-IN')}`
    if (mirror) mirror.value = label
  }
  form.querySelectorAll('input[name="variant_id"]').forEach((el) => el.addEventListener('change', sync))
  sync()

  // quote card: published price for the chosen service + size (null = quoted after photos)
  const prices = form.dataset.prices ? JSON.parse(form.dataset.prices) : null
  const estimate = () => prices?.[form.elements.service.value]?.[form.elements.property_size.selectedIndex] ?? null
  const estOut = form.querySelector('[data-estimate]')
  const estLabel = form.querySelector('[data-estimate-label]')
  function showEstimate() {
    const n = estimate()
    estOut.textContent = n ? `₹${n.toLocaleString('en-IN')}` : 'Quoted on WhatsApp'
    estLabel.textContent = n ? 'Listed price' : 'Price after a quick look at photos'
  }
  if (prices && estOut) {
    form.elements.service.addEventListener('change', showEstimate)
    form.elements.property_size.addEventListener('change', showEstimate)
    showEstimate()
  }
  // mobile field: digits only
  const phoneIn = form.querySelector('input[name="phone"][pattern]')
  phoneIn?.addEventListener('input', () => { phoneIn.value = phoneIn.value.replace(/\D/g, '').slice(0, 10) })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const serviceName = form.querySelector('[name="service"]')?.value || form.getAttribute('data-service') || 'Pest Control'
    const selected = form.querySelector('input[name="variant_id"]:checked')
    const variantLabel = selected ? selected.dataset.label : (form.querySelector('[name="property_size"]')?.value || '')
    const listed = !selected && prices ? estimate() : null
    const variantPrice = selected ? ` (₹${Number(selected.dataset.price).toLocaleString('en-IN')})`
      : listed ? ` (listed price ₹${listed.toLocaleString('en-IN')})` : ''
    const name = form.querySelector('[name="name"]')?.value || ''
    const phone = form.querySelector('[name="phone"]')?.value || ''

    let text = `Hello Green Pest Management, I want to book ${serviceName}.`
    if (variantLabel) text += `\nProperty Size: ${variantLabel}${variantPrice}`
    if (name) text += `\nName: ${name}`
    if (phone) text += `\nPhone: ${phoneIn ? '+91 ' : ''}${phone}`

    window.open(`https://wa.me/919491656200?text=${encodeURIComponent(text)}`, '_blank')
  })
})


