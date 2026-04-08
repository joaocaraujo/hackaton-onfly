import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import landingHtml from '../landing-body.html?raw'
import landingLogo from '../assets/logo.png'
import '../landing.css'

const LANDING_LOGO_PLACEHOLDER = '__LANDING_LOGO_SRC__'

function animateCounter(
  el: HTMLElement,
  target: number,
  suffix: string,
  isDecimal: boolean,
  duration: number,
) {
  const start = 0
  let startTime: number | null = null

  function ease(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  function step(timestamp: number) {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    const easedProgress = ease(progress)
    const current = start + (target - start) * easedProgress

    if (isDecimal) {
      el.textContent = current.toFixed(1) + suffix
    } else {
      el.textContent = Math.round(current) + suffix
    }

    if (progress < 1) {
      requestAnimationFrame(step)
    }
  }

  requestAnimationFrame(step)
}

export default function LandingPage() {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const html = useMemo(
    () => landingHtml.replaceAll(LANDING_LOGO_PLACEHOLDER, landingLogo),
    [],
  )

  useEffect(() => {
    document.title =
      'BrainFly — O Custo Invisível do Turnover em Times de Engenharia'
  }, [])

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const onChatClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const a = t.closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (href === '/chat') {
        e.preventDefault()
        navigate('/chat')
      }
    }
    root.addEventListener('click', onChatClick)

    const nav = root.querySelector('#nav') as HTMLElement | null
    const scrolledClass = 'scrolled'
    let lastScroll = 0

    const onScroll = () => {
      if (!nav) return
      const y = window.scrollY || document.documentElement.scrollTop
      if (y > 60 && lastScroll <= 60) nav.classList.add(scrolledClass)
      else if (y <= 60 && lastScroll > 60) nav.classList.remove(scrolledClass)
      lastScroll = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const revealEls = root.querySelectorAll<HTMLElement>('.reveal')
    let revealIo: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      revealIo = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible')
              revealIo?.unobserve(entry.target)
            }
          })
        },
        { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
      )
      revealEls.forEach(el => revealIo?.observe(el))
    } else {
      revealEls.forEach(el => el.classList.add('visible'))
    }

    const counterEls = root.querySelectorAll<HTMLElement>('[data-target]')
    let counterIo: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      counterIo = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return
            const el = entry.target as HTMLElement
            const target = parseFloat(el.getAttribute('data-target') || '0')
            const suffix = el.getAttribute('data-suffix') || ''
            const isDecimal = el.getAttribute('data-decimal') === 'true'
            animateCounter(el, target, suffix, isDecimal, 2000)
            counterIo?.unobserve(el)
          })
        },
        { threshold: 0.5 },
      )
      counterEls.forEach(el => counterIo?.observe(el))
    } else {
      setCounterTextFallback(counterEls)
    }

    const navLinks = root.querySelectorAll<HTMLAnchorElement>('.nav-links a[href^="#"]')
    const anchors: Array<{ el: HTMLAnchorElement; handler: (e: Event) => void }> = []
    navLinks.forEach(link => {
      const handler = (e: Event) => {
        e.preventDefault()
        const targetId = link.getAttribute('href')?.slice(1)
        if (!targetId || !nav) return
        const targetEl = document.getElementById(targetId)
        if (!targetEl) return
        const navHeight = nav.offsetHeight
        const targetPos =
          targetEl.getBoundingClientRect().top + window.scrollY - navHeight - 20
        window.scrollTo({ top: targetPos, behavior: 'smooth' })
      }
      link.addEventListener('click', handler)
      anchors.push({ el: link, handler })
    })

    return () => {
      root.removeEventListener('click', onChatClick)
      window.removeEventListener('scroll', onScroll)
      revealIo?.disconnect()
      counterIo?.disconnect()
      anchors.forEach(({ el, handler }) => el.removeEventListener('click', handler))
    }
  }, [navigate])

  return (
    <div
      ref={ref}
      className="landing-page"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function setCounterTextFallback(counterEls: NodeListOf<HTMLElement>) {
  counterEls.forEach(el => {
    const target = el.getAttribute('data-target')
    const suffix = el.getAttribute('data-suffix') || ''
    if (target) el.textContent = target + suffix
  })
}
