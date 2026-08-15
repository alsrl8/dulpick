import './style.css'
import './interaction.css'
import './theme.css'
import { createPlan, getPlan, chooseCandidate, isCloudEnabled } from './store.js'

const app = document.querySelector('#app')
const sharedId = new URLSearchParams(location.search).get('p')
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))

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
  area: '',
  budget: '',
  moods: [],
  avoids: [],
  title: '',
  message: '',
  templateIndex: -1,
  candidates: [{ name: '', menu: '', price: '', reason: '', link: '' }, { name: '', menu: '', price: '', reason: '', link: '' }, { name: '', menu: '', price: '', reason: '', link: '' }],
}

const steps = [
  { key: 'area', title: '어디서 만나요?', description: '지역이나 가까운 역을 알려주세요.' },
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
  if (step.key === 'area') body = `<label class="hero-input"><span class="sr-only">만날 지역</span><input id="area" autocomplete="off" maxlength="30" value="${escapeHtml(draft.area)}" placeholder="예: 마곡나루역"></label><div class="quick-row"><span>최근 많이 찾는 곳</span>${['성수', '강남', '을지로', '마곡'].map((x) => `<button type="button" data-area="${x}">${x}</button>`).join('')}</div>`
  if (step.key === 'budget') body = chips('budget', ['3만 원 미만', '3~5만 원', '5~7만 원', '7~10만 원', '10만 원 이상'], draft.budget ? [draft.budget] : [])
  if (step.key === 'moods') body = chips('moods', ['조용한', '편안한', '분위기 있는', '활기찬', '대화하기 좋은', '특별한'], draft.moods, true)
  if (step.key === 'avoids') body = chips('avoids', ['술집', '고깃집', '매운 음식', '긴 웨이팅', '시끄러운 곳', '없어요'], draft.avoids, true)
  if (step.key === 'message') body = `<button type="button" id="suggest-message" class="template-button"><span>문구 추천받기</span><small>누를 때마다 다른 문구를 보여드려요</small></button><div class="simple-fields"><label><span>제안서 제목 <em>필수</em></span><input id="title" maxlength="60" required value="${escapeHtml(draft.title || `${draft.area} 약속 후보`)}"></label><label><span>한마디 <em>선택</em></span><textarea id="message" maxlength="160" placeholder="상대방에게 전할 말을 적어주세요.">${escapeHtml(draft.message)}</textarea></label></div>`
  if (step.key === 'candidates') body = `<div id="candidate-list" class="simple-candidates">${draft.candidates.map(candidateEditor).join('')}</div><button type="button" id="add-candidate" class="add-row">+ 후보 추가하기</button><p class="privacy-note">익명 ID와 약속·선택 정보만 저장해요. 이름과 전화번호는 받지 않아요. <button type="button" id="privacy-open">자세히</button></p>`

  app.innerHTML = shell(`<section class="step"><p class="step-count">${draft.step + 1} / ${steps.length}</p><h1>${step.title}</h1><p class="step-description">${step.description}</p><div class="step-body">${body}</div></section><nav class="bottom-actions">${draft.step ? '<button type="button" id="back" class="back-button">이전</button>' : ''}<button type="button" id="next" class="next-button">${draft.step === steps.length - 1 ? '링크 만들기' : '다음'}</button></nav><p id="flow-status" class="flow-status"></p><dialog id="privacy"><button class="dialog-close" aria-label="닫기">×</button><h2>저장하는 정보</h2><p>제안서와 선택을 다시 확인할 수 있도록 익명 사용자 ID, 약속 후보, 선택 결과와 처리 시각을 Firebase에 저장해요.</p><p>이름, 전화번호, 정확한 현재 위치는 수집하지 않아요.</p></dialog>`)
  bindStep(step.key)
}

function candidateEditor(candidate, index) {
  return `<article class="candidate-mini" data-index="${index}"><span class="candidate-number">${index + 1}</span><div class="candidate-main"><input name="name" maxlength="50" value="${escapeHtml(candidate.name)}" placeholder="장소 이름"><details><summary>메뉴와 근거도 추가할게요</summary><div class="candidate-details"><input name="menu" maxlength="60" value="${escapeHtml(candidate.menu)}" placeholder="대표 메뉴"><input name="price" maxlength="30" value="${escapeHtml(candidate.price)}" placeholder="2인 예상 금액"><textarea name="reason" maxlength="140" placeholder="추천 이유">${escapeHtml(candidate.reason)}</textarea><input name="link" type="url" value="${escapeHtml(candidate.link)}" placeholder="지도 또는 예약 링크"></div></details></div>${draft.candidates.length > 2 ? `<button type="button" class="remove-candidate" aria-label="후보 ${index + 1} 삭제">×</button>` : ''}</article>`
}

function bindStep(key) {
  const save = () => {
    if (key === 'area') draft.area = document.querySelector('#area').value.trim()
    if (key === 'message') { draft.title = document.querySelector('#title').value.trim(); draft.message = document.querySelector('#message').value.trim() }
    if (key === 'candidates') draft.candidates = [...document.querySelectorAll('.candidate-mini')].map((card) => Object.fromEntries([...card.querySelectorAll('input, textarea')].map((field) => [field.name, field.value.trim()])))
  }
  document.querySelector('#back')?.addEventListener('click', () => { save(); draft.step--; renderStep() })
  document.querySelector('#next').addEventListener('click', async () => {
    save(); const status = document.querySelector('#flow-status')
    if (key === 'area' && !draft.area) return showError(status, '만날 지역을 입력해주세요.')
    if (key === 'budget' && !draft.budget) return showError(status, '예산을 하나 골라주세요.')
    if (key === 'moods' && !draft.moods.length) return showError(status, '원하는 분위기를 하나 이상 골라주세요.')
    if (key === 'message' && !draft.title) return showError(status, '제안서 제목을 입력해주세요.')
    if (key === 'candidates') {
      const candidates = draft.candidates.filter((item) => item.name)
      if (candidates.length < 2) return showError(status, '후보를 두 곳 이상 입력해주세요.')
      const button = document.querySelector('#next'); button.disabled = true; button.textContent = '링크 만드는 중…'
      try { return renderSuccess(await createPlan({ title: draft.title, area: draft.area, budget: draft.budget, moods: draft.moods, avoids: draft.avoids, message: draft.message, candidates })) } catch (error) { button.disabled = false; button.textContent = '링크 만들기'; return showError(status, error.message) }
    }
    draft.step++; renderStep()
  })
  document.querySelectorAll('[data-chip]').forEach((button) => button.addEventListener('click', () => {
    const keyName = button.dataset.chip; const value = button.dataset.value
    if (button.dataset.multiple === 'true') {
      if (value === '없어요') draft[keyName] = draft[keyName].includes(value) ? [] : ['없어요']
      else { draft[keyName] = draft[keyName].filter((x) => x !== '없어요'); draft[keyName] = draft[keyName].includes(value) ? draft[keyName].filter((x) => x !== value) : [...draft[keyName], value] }
    } else draft[keyName] = value
    renderStep()
  }))
  document.querySelectorAll('[data-area]').forEach((button) => button.addEventListener('click', () => { draft.area = button.dataset.area; renderStep() }))
  document.querySelector('#suggest-message')?.addEventListener('click', () => {
    draft.templateIndex = (draft.templateIndex + 1) % messageTemplates().length
    const template = messageTemplates()[draft.templateIndex]
    draft.title = template.title
    draft.message = template.message
    renderStep()
  })
  document.querySelector('#add-candidate')?.addEventListener('click', () => { save(); if (draft.candidates.length < 5) draft.candidates.push({ name: '', menu: '', price: '', reason: '', link: '' }); renderStep() })
  document.querySelector('#candidate-list')?.addEventListener('click', (event) => { if (!event.target.classList.contains('remove-candidate')) return; save(); draft.candidates.splice(Number(event.target.closest('.candidate-mini').dataset.index), 1); renderStep() })
  const dialog = document.querySelector('#privacy'); document.querySelector('#privacy-open')?.addEventListener('click', () => dialog.showModal()); dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close())
}

function showError(target, text) { target.textContent = text; target.classList.add('show') }

function renderSuccess(url) {
  navigator.clipboard.writeText(url).catch(() => {})
  app.innerHTML = shell(`<section class="success-screen"><div class="success-icon">✓</div><h1>보낼 준비가 끝났어요</h1><p>링크를 열면 상대방이 후보를 고를 수 있어요.</p><div class="share-box"><span>${escapeHtml(url)}</span><button id="copy">복사</button></div><a class="next-button preview-link" href="${url}">받는 화면 확인하기</a><button class="restart" onclick="location.href='./'">새로 만들기</button></section>`, { progress: false })
  document.querySelector('#copy').addEventListener('click', async (event) => { await navigator.clipboard.writeText(url); event.target.textContent = '복사했어요' })
}

function renderPlan(plan, id) {
  app.innerHTML = `<main class="receiver-shell"><header class="flow-brand"><a href="./">둘픽</a><span>하나만 골라주세요</span></header><section class="receiver-head"><p>${escapeHtml(plan.area)} · ${escapeHtml(plan.budget)}</p><h1>${escapeHtml(plan.title)}</h1>${plan.message ? `<blockquote>${escapeHtml(plan.message)}</blockquote>` : ''}</section><section class="receiver-list">${plan.candidates.map((candidate, index) => `<article class="receiver-card"><div class="receiver-title"><span>${index + 1}</span><div><h2>${escapeHtml(candidate.name)}</h2>${candidate.menu ? `<p>${escapeHtml(candidate.menu)}</p>` : ''}</div></div>${candidate.reason ? `<p class="receiver-reason">${escapeHtml(candidate.reason)}</p>` : ''}<div class="receiver-meta">${candidate.price ? `<b>${escapeHtml(candidate.price)}</b>` : '<b>가격 확인</b>'}${candidate.link ? `<a href="${escapeHtml(candidate.link)}" target="_blank" rel="noreferrer">지도 보기 ↗</a>` : ''}</div><button class="pick-button ${plan.selection === index ? 'picked' : ''}" data-choice="${index}">${plan.selection === index ? '선택했어요 ✓' : '여기가 좋아요'}</button></article>`).join('')}</section><p id="choice-status" class="choice-status">${plan.selection !== undefined ? '선택이 저장되어 있어요.' : ''}</p><a class="make-own" href="./">나도 후보 만들어보기</a></main>`
  document.querySelector('.receiver-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-choice]'); if (!button) return
    document.querySelectorAll('.pick-button').forEach((item) => { item.classList.remove('picked'); item.textContent = '여기가 좋아요' })
    button.classList.add('picked'); button.textContent = '선택했어요 ✓'; await chooseCandidate(id, Number(button.dataset.choice), plan); document.querySelector('#choice-status').textContent = '선택을 저장했어요.'
  })
}

async function start() {
  if (!sharedId) return renderStep()
  app.innerHTML = '<div class="loading">둘픽을 불러오는 중…</div>'
  try { renderPlan(await getPlan(sharedId), sharedId) } catch { app.innerHTML = '<div class="loading"><b>제안서를 열 수 없어요.</b><p>링크가 잘렸거나 만료되었을 수 있어요.</p><a href="./">새로 만들기</a></div>' }
}

start()
