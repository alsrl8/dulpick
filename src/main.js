import './style.css'
import './interaction.css'
import './theme.css'
import { createPlan, getPlan, getPlaces, chooseCandidate, writeAuditLog, isCloudEnabled } from './store.js'

const app = document.querySelector('#app')
const sharedId = new URLSearchParams(location.search).get('p')
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
const recentPlanKey = 'dulpick.recentPlans'
const legacyRecentPlanKey = 'dulpick.recentPlan'
const sessionId = sessionStorage.getItem('dulpick.sessionId') || crypto.randomUUID()
sessionStorage.setItem('dulpick.sessionId', sessionId)

function audit(event, payload = {}) {
  writeAuditLog(event, { sessionId, ...payload }).catch(() => {})
}

function rememberPlan(id, scheduledAt) {
  if (!id || id.startsWith('local.') || !scheduledAt) return
  const expiresAt = new Date(new Date(scheduledAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
  const savedAt = new Date().toISOString()
  const plans = getRememberedPlans().filter((plan) => plan.id !== id)
  localStorage.setItem(recentPlanKey, JSON.stringify([{ id, expiresAt, savedAt }, ...plans].slice(0, 10)))
}

function getRememberedPlans() {
  try {
    const stored = JSON.parse(localStorage.getItem(recentPlanKey) || 'null')
    const legacy = JSON.parse(localStorage.getItem(legacyRecentPlanKey) || 'null')
    const source = Array.isArray(stored) ? stored : legacy?.id ? [legacy] : []
    const active = source.filter((plan) => plan?.id && plan.expiresAt && Date.now() < new Date(plan.expiresAt).getTime()).slice(0, 10)
    localStorage.setItem(recentPlanKey, JSON.stringify(active))
    localStorage.removeItem(legacyRecentPlanKey)
    return active
  } catch {
    localStorage.removeItem(recentPlanKey)
    localStorage.removeItem(legacyRecentPlanKey)
    return []
  }
}

function forgetPlan(id) {
  localStorage.setItem(recentPlanKey, JSON.stringify(getRememberedPlans().filter((plan) => plan.id !== id)))
}

function getDefaultSchedule() {
  const date = new Date(Date.now() + 30 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

app.addEventListener('pointermove', (event) => {
  const target = event.target.closest('button, .next-button')
  if (!target) return
  const rect = target.getBoundingClientRect()
  target.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`)
  target.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`)
})

app.addEventListener('pointerdown', (event) => {
  event.target.closest('button, .next-button')?.classList.add('is-pressing')
})

for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
  app.addEventListener(eventName, () => {
    app.querySelectorAll('.is-pressing').forEach((element) => element.classList.remove('is-pressing'))
  })
}

const draft = {
  step: 0,
  city: '성남시',
  districts: [],
  area: '',
  scheduledAt: getDefaultSchedule(),
  budget: '',
  moods: [],
  avoids: [],
  title: '',
  message: '',
  templateIndex: -1,
  candidates: [],
}

const steps = [
  { key: 'area', title: '어디서 만나요?', description: '시를 확인하고 지역을 골라주세요.' },
  { key: 'schedule', title: '언제 만나요?', description: '이 날짜가 지나고 하루 뒤 안전하게 삭제돼요.' },
  { key: 'budget', title: '예산은 어느 정도가 좋아요?', description: '두 명이 함께 쓰는 금액으로 골라주세요.' },
  { key: 'moods', title: '어떤 분위기가 좋아요?', description: '여러 개 골라도 괜찮아요.' },
  { key: 'avoids', title: '피하고 싶은 곳이 있나요?', description: '실패할 가능성이 있는 후보를 먼저 뺄게요.' },
  { key: 'message', title: '어떻게 전할까요?', description: '받는 사람에게 보일 제목과 한마디예요.' },
  { key: 'candidates', title: '후보를 알려주세요', description: '지금은 장소 이름만 입력해도 충분해요.' },
]

function shell(content, options = {}) {
  const progress = options.progress === false ? '' : `<div class="progress"><i style="width:${((draft.step + 1) / steps.length) * 100}%"></i></div>`
  return `<main class="flow-shell"><header class="flow-brand"><a href="./">둘픽</a><span>${isCloudEnabled ? '안전하게 저장 중' : '링크로 저장 중'}</span></header>${progress}${content}</main>`
}

const chips = (name, values, selected, multiple = false) => `<div class="chip-grid">${values.map((value) => `<button type="button" class="chip ${selected.includes(value) ? 'active' : ''}" data-chip="${name}" data-value="${value}" data-multiple="${multiple}">${value}</button>`).join('')}</div>`

const messageTemplates = () => [
  { title: `${draft.area} 약속 후보`, message: '몇 군데 골라봤어요. 마음에 드는 곳을 알려주세요 :)' },
  { title: `${draft.area}, 어디가 좋을까요?`, message: '괜찮아 보이는 곳들로 추려봤어요. 가장 끌리는 곳을 골라주세요!' },
  { title: '우리 여기서 만나요', message: '편하게 보고 마음에 드는 곳 하나만 골라주세요.' },
  { title: `${draft.area} 맛집 후보`, message: '메뉴와 분위기를 보고 더 마음에 드는 곳을 알려주세요.' },
]

function renderStep() {
  const step = steps[draft.step]
  let body = ''
  if (step.key === 'area') body = `<div class="area-picker"><div><span class="picker-label">시 선택</span><button type="button" class="city-option active" aria-pressed="true">성남시</button></div><div><span class="picker-label">지역 선택 <small>여러 곳 선택 가능</small></span>${chips('districts', ['수정구', '중원구', '분당구'], draft.districts, true)}</div></div>`
  if (step.key === 'schedule') body = `<label class="schedule-field"><span>예약 날짜와 시간</span><input id="scheduled-at" type="datetime-local" required value="${escapeHtml(draft.scheduledAt)}"></label>`
  if (step.key === 'budget') body = chips('budget', ['3만 원 미만', '3~5만 원', '5~7만 원', '7~10만 원', '10만 원 이상'], draft.budget ? [draft.budget] : [])
  if (step.key === 'moods') body = chips('moods', ['조용한', '편안한', '분위기 있는', '활기찬', '대화하기 좋은', '특별한'], draft.moods, true)
  if (step.key === 'avoids') body = chips('avoids', ['술집', '고깃집', '매운 음식', '긴 웨이팅', '시끄러운 곳', '없어요'], draft.avoids, true)
  if (step.key === 'message') body = `<button type="button" id="suggest-message" class="template-button"><span>문구 추천받기</span><small>누를 때마다 다른 문구를 보여드려요</small></button><div class="simple-fields"><label><span>제안서 제목 <em>필수</em></span><input id="title" maxlength="60" required value="${escapeHtml(draft.title || `${draft.area} 약속 후보`)}"></label><label><span>한마디 <em>선택</em></span><textarea id="message" maxlength="160" placeholder="상대방에게 전할 말을 적어주세요.">${escapeHtml(draft.message)}</textarea></label></div>`
  if (step.key === 'candidates') body = `<div id="candidate-list" class="simple-candidates">${draft.candidates.length ? draft.candidates.map(candidateEditor).join('') : '<p class="candidate-empty">아직 추가한 후보가 없어요.</p>'}</div><button type="button" id="add-candidate" class="add-row">+ 후보 추가하기</button><p class="privacy-note">익명 ID와 약속·선택 정보만 저장해요. 이름과 전화번호는 받지 않아요. <button type="button" id="privacy-open">자세히</button></p><dialog id="candidate-source" class="candidate-source"><button class="dialog-close" aria-label="닫기">×</button><button type="button" id="source-back" class="source-back" hidden>← 추가 방식</button><h2 id="source-title">어떻게 추가할까요?</h2><div id="source-options" class="source-options"><button type="button" id="from-dulpick"><b>둘픽에서 찾기</b><span>저장된 장소를 빠르게 골라요</span></button><button type="button" id="from-direct"><b>직접 입력</b><span>장소 이름부터 간단히 적어요</span></button></div><div id="place-results" class="place-results" hidden></div></dialog>`

  app.innerHTML = shell(`<section class="step"><p class="step-count">${draft.step + 1} / ${steps.length}</p><h1>${step.title}</h1><p class="step-description">${step.description}</p><div class="step-body">${body}</div></section><nav class="bottom-actions">${draft.step ? '<button type="button" id="back" class="back-button">이전</button>' : ''}<button type="button" id="next" class="next-button">${draft.step === steps.length - 1 ? '링크 만들기' : '다음'}</button></nav><p id="flow-status" class="flow-status"></p><dialog id="privacy"><button class="dialog-close" aria-label="닫기">×</button><h2>저장하는 정보</h2><p>제안서와 선택을 다시 확인할 수 있도록 익명 사용자 ID, 약속 후보, 선택 결과와 처리 시각을 Firebase에 저장해요.</p><p>서비스 개선을 위해 화면 이동, 후보 추가 방식, 생성·열람·선택·삭제 이벤트를 자동 기록해요. 입력한 제목, 메시지와 장소명은 행동 로그에 저장하지 않아요.</p><p>이름, 전화번호, 정확한 현재 위치는 수집하지 않아요.</p></dialog>`)
  bindStep(step.key)
  audit('step_view', { step: step.key })
}

function candidateEditor(candidate, index) {
  if (candidate.source === 'dulpick') return `<article class="candidate-mini saved-candidate" data-index="${index}" data-source="dulpick"><div class="saved-media">${candidate.image ? `<img src="${escapeHtml(candidate.image)}" alt="${escapeHtml(candidate.name)}">` : '<span>사진 준비 중</span>'}</div><div class="candidate-main"><div class="saved-heading"><div><b>${escapeHtml(candidate.name)}</b>${candidate.menu ? `<p>${escapeHtml(candidate.menu)}</p>` : ''}</div>${candidate.reservation ? `<i class="reservation-badge">${escapeHtml(candidate.reservation)}</i>` : ''}</div>${candidate.rating ? `<small class="saved-rating">★ ${escapeHtml(candidate.rating)}${candidate.reviewCount ? ` · 리뷰 ${escapeHtml(candidate.reviewCount)}개` : ''}</small>` : ''}${candidate.description || candidate.reason ? `<p class="saved-description">${escapeHtml(candidate.description || candidate.reason)}</p>` : ''}<div class="saved-meta">${candidate.price ? `<span><small>예산</small><b>${escapeHtml(candidate.price)}</b></span>` : ''}${candidate.hours ? `<span><small>영업</small><b>${escapeHtml(candidate.hours)}</b></span>` : ''}</div>${candidate.reviewSummary ? `<p class="saved-review">“${escapeHtml(candidate.reviewSummary)}”</p>` : ''}${candidate.link ? `<a class="saved-link" href="${escapeHtml(candidate.link)}" target="_blank" rel="noreferrer">상세 정보 확인 ↗</a>` : ''}${candidateFields(candidate)}</div><button type="button" class="remove-candidate" aria-label="후보 ${index + 1} 삭제">×</button></article>`
  return `<article class="candidate-mini" data-index="${index}" data-source="direct"><span class="candidate-number">${index + 1}</span><div class="candidate-main"><input name="name" maxlength="50" value="${escapeHtml(candidate.name)}" placeholder="장소 이름"><details><summary>메뉴와 근거도 추가할게요</summary><div class="candidate-details"><input name="menu" maxlength="60" value="${escapeHtml(candidate.menu)}" placeholder="대표 메뉴"><input name="price" maxlength="30" value="${escapeHtml(candidate.price)}" placeholder="2인 예상 금액"><textarea name="reason" maxlength="140" placeholder="추천 이유">${escapeHtml(candidate.reason)}</textarea><input name="link" type="url" value="${escapeHtml(candidate.link)}" placeholder="지도 또는 예약 링크"></div></details></div><button type="button" class="remove-candidate" aria-label="후보 ${index + 1} 삭제">×</button></article>`
}

function candidateFields(candidate) {
  return ['placeId', 'name', 'menu', 'price', 'reason', 'link', 'image', 'description', 'rating', 'reviewCount', 'reviewSummary', 'reservation', 'category', 'hours', 'address', 'phone', 'station'].map((field) => `<input type="hidden" name="${field}" value="${escapeHtml(candidate[field] ?? '')}">`).join('')
}

function placeOption(place, selected = false) {
  const rating = place.rating ? `<span class="place-rating">★ ${escapeHtml(place.rating)}${place.reviewCount ? ` <small>리뷰 ${escapeHtml(place.reviewCount)}개</small>` : ''}</span>` : ''
  const reservation = place.reservation ? `<span class="reservation-badge">${escapeHtml(place.reservation)}</span>` : ''
  const facts = [
    place.category && `<span><small>종류</small><b>${escapeHtml(place.category)}</b></span>`,
    place.price && `<span><small>예산</small><b>${escapeHtml(place.price)}</b></span>`,
    place.hours && `<span><small>영업</small><b>${escapeHtml(place.hours)}</b></span>`,
  ].filter(Boolean).join('')
  return `<article class="place-option ${selected ? 'selected' : ''}" data-place="${escapeHtml(place.id)}"><span class="place-thumb">${place.image ? `<img src="${escapeHtml(place.image)}" alt="">` : '<i>둘픽</i>'}</span><div class="place-content"><span class="place-heading"><b>${escapeHtml(place.name)}</b>${reservation}</span><span class="place-meta">${escapeHtml([place.area, place.menu].filter(Boolean).join(' · '))}</span>${rating}<p class="place-description">${escapeHtml(place.description || '장소 설명을 준비하고 있어요.')}</p>${facts ? `<div class="place-facts">${facts}</div>` : ''}${place.reason ? `<p class="pick-reason"><small>둘픽 한줄</small>${escapeHtml(place.reason)}</p>` : ''}${place.reviewSummary ? `<p class="place-review">“${escapeHtml(place.reviewSummary)}”</p>` : ''}<div class="place-actions">${place.link ? `<a href="${escapeHtml(place.link)}" target="_blank" rel="noreferrer">정보 확인 ↗</a>` : '<span></span>'}<button type="button" class="${selected ? 'selected' : ''}" data-select-place="${escapeHtml(place.id)}">${selected ? '추가됨 ✓' : '이 후보 추가'}</button></div></div></article>`
}

function bindStep(key) {
  const save = () => {
    if (key === 'area') draft.area = [draft.city, draft.districts.join('·')].filter(Boolean).join(' ')
    if (key === 'schedule') draft.scheduledAt = document.querySelector('#scheduled-at').value
    if (key === 'message') { draft.title = document.querySelector('#title').value.trim(); draft.message = document.querySelector('#message').value.trim() }
    if (key === 'candidates') draft.candidates = [...document.querySelectorAll('.candidate-mini')].map((card) => ({ source: card.dataset.source, ...Object.fromEntries([...card.querySelectorAll('input, textarea')].map((field) => [field.name, field.value.trim()])) }))
  }
  document.querySelector('#back')?.addEventListener('click', () => { save(); draft.step--; renderStep() })
  document.querySelector('#next').addEventListener('click', async () => {
    save(); const status = document.querySelector('#flow-status')
    if (key === 'area' && !draft.districts.length) return showError(status, '지역을 하나 이상 골라주세요.')
    if (key === 'schedule' && !draft.scheduledAt) return showError(status, '예약 날짜와 시간을 입력해주세요.')
    if (key === 'schedule' && new Date(draft.scheduledAt).getTime() <= Date.now()) return showError(status, '지금 이후의 날짜와 시간을 골라주세요.')
    if (key === 'budget' && !draft.budget) return showError(status, '예산을 하나 골라주세요.')
    if (key === 'moods' && !draft.moods.length) return showError(status, '원하는 분위기를 하나 이상 골라주세요.')
    if (key === 'message' && !draft.title) return showError(status, '제안서 제목을 입력해주세요.')
    if (key === 'candidates') {
      const candidates = draft.candidates.filter((item) => item.name)
      if (candidates.length < 2) return showError(status, '후보를 두 곳 이상 입력해주세요.')
      const button = document.querySelector('#next'); button.disabled = true; button.textContent = '링크 만드는 중…'
      try { return renderSuccess(await createPlan({ title: draft.title, area: draft.area, scheduledAt: draft.scheduledAt, budget: draft.budget, moods: draft.moods, avoids: draft.avoids, message: draft.message, candidates })) } catch (error) { button.disabled = false; button.textContent = '링크 만들기'; return showError(status, error.message) }
    }
    audit('step_complete', { step: key }); draft.step++; renderStep()
  })
  document.querySelectorAll('[data-chip]').forEach((button) => button.addEventListener('click', () => {
    const keyName = button.dataset.chip; const value = button.dataset.value
    if (button.dataset.multiple === 'true') {
      if (value === '없어요') draft[keyName] = draft[keyName].includes(value) ? [] : ['없어요']
      else { draft[keyName] = draft[keyName].filter((x) => x !== '없어요'); draft[keyName] = draft[keyName].includes(value) ? draft[keyName].filter((x) => x !== value) : [...draft[keyName], value] }
    } else draft[keyName] = value
    renderStep()
  }))
  document.querySelector('#suggest-message')?.addEventListener('click', () => {
    draft.templateIndex = (draft.templateIndex + 1) % messageTemplates().length
    const template = messageTemplates()[draft.templateIndex]
    draft.title = template.title
    draft.message = template.message
    renderStep()
  })
  const sourceDialog = document.querySelector('#candidate-source')
  document.querySelector('#add-candidate')?.addEventListener('click', () => { save(); audit('candidate_source_open'); sourceDialog.showModal() })
  document.querySelector('#from-direct')?.addEventListener('click', () => { save(); audit('candidate_added', { source: 'direct' }); if (draft.candidates.length < 5) draft.candidates.push({ source: 'direct', name: '', menu: '', price: '', reason: '', link: '' }); renderStep() })
  document.querySelector('#from-dulpick')?.addEventListener('click', async () => {
    audit('place_search', { source: 'dulpick' })
    const results = document.querySelector('#place-results')
    document.querySelector('#source-options').hidden = true
    document.querySelector('#source-back').hidden = false
    document.querySelector('#source-title').textContent = '둘픽 후보를 골라주세요'
    results.hidden = false
    results.innerHTML = '<p>둘픽 후보를 불러오는 중…</p>'
    try {
      const places = await getPlaces(draft.districts)
      const directCandidates = draft.candidates.filter((candidate) => candidate.source !== 'dulpick')
      const selectedPlaces = new Map(draft.candidates.filter((candidate) => candidate.source === 'dulpick' && candidate.placeId).map((candidate) => [candidate.placeId, candidate]))
      const renderPlaces = () => {
        results.innerHTML = places.length ? places.map((place) => placeOption(place, selectedPlaces.has(place.id))).join('') + `<div class="place-selection-bar"><span><b>${selectedPlaces.size}</b>개 선택 · 최대 ${5 - directCandidates.length}개</span><button type="button" id="complete-place-selection">선택 완료</button></div>` : '<p>이 지역에 저장된 후보가 아직 없어요.</p>'
        bindPlaceSelection()
      }
      const bindPlaceSelection = () => {
      results.querySelectorAll('[data-select-place]').forEach((button) => button.addEventListener('click', () => {
        const place = places.find((item) => item.id === button.dataset.selectPlace)
        if (!place) return
        if (selectedPlaces.has(place.id)) selectedPlaces.delete(place.id)
        else if (selectedPlaces.size < 5 - directCandidates.length) selectedPlaces.set(place.id, { source: 'dulpick', placeId: place.id, name: place.name || '', menu: place.menu || '', price: place.price || '', reason: place.reason || '', link: place.link || '', image: place.image || '', description: place.description || '', rating: place.rating || '', reviewCount: place.reviewCount || '', reviewSummary: place.reviewSummary || '', reservation: place.reservation || '', category: place.category || '', hours: place.hours || '', address: place.address || '', phone: place.phone || '', station: place.station || '' })
        renderPlaces()
      }))
        results.querySelector('#complete-place-selection')?.addEventListener('click', () => {
          draft.candidates = [...directCandidates, ...selectedPlaces.values()]
          audit('candidate_added', { source: 'dulpick' })
          renderStep()
        })
      }
      renderPlaces()
    } catch { results.innerHTML = '<p>후보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>' }
  })
  document.querySelector('#source-back')?.addEventListener('click', () => {
    document.querySelector('#source-options').hidden = false
    document.querySelector('#source-back').hidden = true
    document.querySelector('#source-title').textContent = '어떻게 추가할까요?'
    const results = document.querySelector('#place-results')
    results.hidden = true
    results.innerHTML = ''
  })
  document.querySelector('#candidate-list')?.addEventListener('click', (event) => { if (!event.target.classList.contains('remove-candidate')) return; save(); draft.candidates.splice(Number(event.target.closest('.candidate-mini').dataset.index), 1); renderStep() })
  const dialog = document.querySelector('#privacy'); document.querySelector('#privacy-open')?.addEventListener('click', () => dialog.showModal()); dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close())
  sourceDialog?.querySelector('.dialog-close').addEventListener('click', () => sourceDialog.close())
}

function showError(target, text) { target.textContent = text; target.classList.add('show') }

function renderSuccess(url) {
  const id = new URL(url).searchParams.get('p')
  rememberPlan(id, draft.scheduledAt)
  audit('plan_created', { planId: id })
  navigator.clipboard.writeText(url).catch(() => {})
  app.innerHTML = shell(`<section class="success-screen"><div class="success-icon">✓</div><h1>보낼 준비가 끝났어요</h1><p>링크를 열면 상대방이 후보를 고를 수 있어요.</p><div class="share-box"><span>${escapeHtml(url)}</span><button id="copy">복사</button></div><a class="next-button preview-link" href="${url}">받는 화면 확인하기</a><button class="restart" onclick="location.href='./'">새로 만들기</button></section>`, { progress: false })
  document.querySelector('#copy').addEventListener('click', async (event) => { await navigator.clipboard.writeText(url); event.target.textContent = '복사했어요' })
}

function renderPlan(plan, id) {
  rememberPlan(id, plan.scheduledAt)
  audit('plan_opened', { planId: id })
  app.innerHTML = `<main class="receiver-shell"><header class="flow-brand"><a href="./">둘픽</a><span>하나만 골라주세요</span></header><section class="receiver-head"><p>${escapeHtml(plan.area)} · ${escapeHtml(plan.budget)}</p><h1>${escapeHtml(plan.title)}</h1>${plan.message ? `<blockquote>${escapeHtml(plan.message)}</blockquote>` : ''}</section><section class="receiver-list">${plan.candidates.map((candidate, index) => `<article class="receiver-card">${candidate.image ? `<img class="receiver-image" src="${escapeHtml(candidate.image)}" alt="${escapeHtml(candidate.name)}">` : ''}<div class="receiver-title"><span>${index + 1}</span><div><h2>${escapeHtml(candidate.name)}</h2>${candidate.menu ? `<p>${escapeHtml(candidate.menu)}</p>` : ''}</div>${candidate.reservation ? `<i class="reservation-badge">${escapeHtml(candidate.reservation)}</i>` : ''}</div>${candidate.rating ? `<p class="receiver-rating">★ ${escapeHtml(candidate.rating)}${candidate.reviewCount ? ` · 리뷰 ${escapeHtml(candidate.reviewCount)}` : ''}</p>` : ''}${candidate.description || candidate.reason ? `<p class="receiver-reason">${escapeHtml(candidate.description || candidate.reason)}</p>` : ''}${candidate.reviewSummary ? `<p class="review-summary">“${escapeHtml(candidate.reviewSummary)}”</p>` : ''}<div class="receiver-meta">${candidate.price ? `<b>${escapeHtml(candidate.price)}</b>` : '<b>가격 확인</b>'}${candidate.link ? `<a href="${escapeHtml(candidate.link)}" target="_blank" rel="noreferrer">지도·예약 보기 ↗</a>` : ''}</div><button class="pick-button ${plan.selection === index ? 'picked' : ''}" data-choice="${index}">${plan.selection === index ? '선택했어요 ✓' : '여기가 좋아요'}</button></article>`).join('')}</section><p id="choice-status" class="choice-status">${plan.selection !== undefined ? '선택이 저장되어 있어요.' : ''}</p><a class="make-own" href="./">나도 후보 만들어보기</a></main>`
  document.querySelector('.receiver-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-choice]'); if (!button) return
    document.querySelectorAll('.pick-button').forEach((item) => { item.classList.remove('picked'); item.textContent = '여기가 좋아요' })
    button.classList.add('picked'); button.textContent = '선택했어요 ✓'; await chooseCandidate(id, Number(button.dataset.choice), plan); audit('candidate_selected', { planId: id, choice: Number(button.dataset.choice) }); document.querySelector('#choice-status').textContent = '선택을 저장했어요.'
  })
}

function renderResume(items) {
  const cards = items.map(({ plan, id }) => {
    const date = new Date(plan.scheduledAt)
    const dateText = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
    const status = plan.selection !== undefined ? '선택 완료' : '선택 대기 중'
    return `<article class="resume-card" data-recent-id="${escapeHtml(id)}"><div><b>${escapeHtml(plan.title)}</b><span>${escapeHtml([dateText, plan.area].filter(Boolean).join(' · '))}</span><small class="resume-status ${plan.selection !== undefined ? 'done' : ''}">${status}</small></div><div class="resume-actions"><a href="?p=${escapeHtml(id)}">확인하기</a><button type="button" data-forget="${escapeHtml(id)}">삭제</button></div></article>`
  }).join('')
  app.innerHTML = shell(`<section class="resume-screen"><p class="step-count">최근 작업 · ${items.length}/10</p><h1>이어서 확인할까요?</h1><div class="resume-list">${cards}</div><button type="button" id="new-plan" class="next-button new-plan-button">새 제안서 만들기</button></section>`, { progress: false })
  document.querySelector('#new-plan').addEventListener('click', renderStep)
  document.querySelectorAll('[data-forget]').forEach((button) => button.addEventListener('click', () => {
    forgetPlan(button.dataset.forget)
    audit('recent_plan_removed', { planId: button.dataset.forget })
    const next = items.filter((item) => item.id !== button.dataset.forget)
    if (next.length) renderResume(next)
    else renderStep()
  }))
}

async function start() {
  audit('app_opened', sharedId ? { planId: sharedId } : {})
  if (!sharedId) {
    const recent = getRememberedPlans()
    if (!recent.length) return renderStep()
    const items = (await Promise.all(recent.map(async ({ id }) => {
      try { return { id, plan: await getPlan(id) } } catch { forgetPlan(id); return null }
    }))).filter(Boolean)
    if (items.length) return renderResume(items)
    return renderStep()
  }
  app.innerHTML = '<div class="loading">둘픽을 불러오는 중…</div>'
  try { renderPlan(await getPlan(sharedId), sharedId) } catch { app.innerHTML = '<div class="loading"><b>제안서를 열 수 없어요.</b><p>링크가 잘렸거나 만료되었을 수 있어요.</p><a href="./">새로 만들기</a></div>' }
}

start()
