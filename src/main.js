import './style.css'
import { createPlan, getPlan, chooseCandidate, isCloudEnabled } from './store.js'

const app = document.querySelector('#app')
const params = new URLSearchParams(location.search)
const sharedId = params.get('p')

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))

const candidateFields = (index, data = {}) => `
  <article class="candidate-editor" data-index="${index}">
    <div class="editor-head"><span class="number">${index + 1}</span><button type="button" class="text-button remove">삭제</button></div>
    <label>장소 이름<input name="name" required maxlength="50" value="${escapeHtml(data.name)}" placeholder="예: 로마옥 마곡"></label>
    <div class="field-row">
      <label>대표 메뉴<input name="menu" maxlength="60" value="${escapeHtml(data.menu)}" placeholder="예: 전복 게우 파스타"></label>
      <label>2인 예상 금액<input name="price" maxlength="30" value="${escapeHtml(data.price)}" placeholder="예: 6만~9만 원"></label>
    </div>
    <label>추천 이유<textarea name="reason" maxlength="140" placeholder="분위기, 거리, 리뷰 등의 근거를 적어주세요">${escapeHtml(data.reason)}</textarea></label>
    <label>지도 또는 예약 링크<input name="link" type="url" value="${escapeHtml(data.link)}" placeholder="https://"></label>
  </article>`

function renderCreator() {
  app.innerHTML = `
    <main class="shell">
      <header class="brand"><a href="./">둘픽</a><span class="mode">${isCloudEnabled ? 'Cloud' : 'Link mode'}</span></header>
      <section class="intro">
        <p class="eyebrow">둘이 고르는 가장 쉬운 방법</p>
        <h1>약속 후보를<br>한 장으로 보내세요.</h1>
        <p>장소와 근거를 정리하면 상대방이 링크에서 바로 고를 수 있어요.</p>
      </section>
      <form id="plan-form">
        <section class="panel">
          <h2>약속 정보</h2>
          <label>제안서 제목<input name="title" required maxlength="60" placeholder="예: 토요일 저녁 후보"></label>
          <div class="field-row">
            <label>지역<input name="area" required maxlength="30" placeholder="마곡·발산"></label>
            <label>예산<input name="budget" maxlength="30" placeholder="2인 10만 원 이하"></label>
          </div>
          <label>전하고 싶은 말<textarea name="message" maxlength="160" placeholder="몇 군데 골라봤어요. 마음에 드는 곳을 알려주세요 :) "></textarea></label>
        </section>
        <section class="candidate-section">
          <div class="section-head"><div><p class="eyebrow">CHOICES</p><h2>장소 후보</h2></div><button type="button" id="add-candidate" class="outline-button">+ 후보 추가</button></div>
          <div id="candidate-list">
            ${candidateFields(0)}${candidateFields(1)}${candidateFields(2)}
          </div>
        </section>
        <label class="notice-check"><input type="checkbox" required><span><b>필수 정보 처리 안내를 확인했습니다.</b><small>제안서 생성과 선택 기록을 위해 익명 ID, 약속 후보, 선택 결과를 처리합니다. 이름과 전화번호는 수집하지 않습니다.</small></span></label>
        <button class="primary-button" type="submit">공유 링크 만들기</button>
        <p id="form-status" class="status" role="status"></p>
      </form>
      <footer><button class="text-button" data-dialog="privacy">개인정보 처리 안내</button><span>둘픽 MVP</span></footer>
    </main>
    <dialog id="privacy"><button class="dialog-close" aria-label="닫기">×</button><h2>개인정보 처리 안내</h2><p>둘픽은 서비스 제공을 위해 익명 사용자 ID, 작성한 약속 정보, 후보와 선택 결과, 생성·수정 시각을 처리합니다.</p><p>이름, 전화번호, 정확한 현재 위치는 요구하지 않습니다. 현재 Link mode에서는 내용이 공유 URL에 포함되며, Cloud mode에서는 Firebase에 저장됩니다.</p></dialog>`

  bindCreator()
}

function bindCreator() {
  const list = document.querySelector('#candidate-list')
  const reindex = () => [...list.children].forEach((card, index) => { card.dataset.index = index; card.querySelector('.number').textContent = index + 1 })
  document.querySelector('#add-candidate').addEventListener('click', () => {
    if (list.children.length >= 5) return
    list.insertAdjacentHTML('beforeend', candidateFields(list.children.length))
  })
  list.addEventListener('click', (event) => {
    if (!event.target.classList.contains('remove') || list.children.length <= 2) return
    event.target.closest('.candidate-editor').remove(); reindex()
  })
  document.querySelector('#plan-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = event.submitter
    const status = document.querySelector('#form-status')
    button.disabled = true; button.textContent = '링크 만드는 중…'
    try {
      const form = new FormData(event.currentTarget)
      const candidates = [...list.children].map((card) => Object.fromEntries(new FormData(card.querySelector ? wrapCard(card) : card))).filter((item) => item.name)
      if (candidates.length < 2) throw new Error('후보를 두 곳 이상 입력해주세요.')
      const plan = { title: form.get('title'), area: form.get('area'), budget: form.get('budget'), message: form.get('message'), candidates }
      const url = await createPlan(plan)
      await navigator.clipboard.writeText(url).catch(() => {})
      status.innerHTML = `링크를 복사했어요.<br><a href="${url}">공유 페이지 확인하기</a>`
      button.textContent = '링크 복사 완료'
    } catch (error) {
      status.textContent = error.message; button.disabled = false; button.textContent = '공유 링크 만들기'
    }
  })
  bindDialog()
}

function wrapCard(card) {
  const form = document.createElement('form')
  form.append(...[...card.querySelectorAll('input, textarea')].map((el) => el.cloneNode(true)))
  return form
}

function renderPlan(plan, id) {
  app.innerHTML = `
    <main class="shell shared">
      <header class="brand"><a href="./">둘픽</a><span class="mode">선택하기</span></header>
      <section class="shared-head"><p class="eyebrow">${escapeHtml(plan.area)} · ${escapeHtml(plan.budget)}</p><h1>${escapeHtml(plan.title)}</h1>${plan.message ? `<p class="message">“${escapeHtml(plan.message)}”</p>` : ''}<p class="helper">마음에 드는 곳을 하나 골라주세요.</p></section>
      <section class="choice-list">
        ${plan.candidates.map((candidate, index) => `
          <article class="choice-card">
            <div class="choice-top"><span class="number">${index + 1}</span><div><h2>${escapeHtml(candidate.name)}</h2><p>${escapeHtml(candidate.menu || '대표 메뉴 확인')}</p></div></div>
            <p class="reason">${escapeHtml(candidate.reason || '후보로 골라둔 장소예요.')}</p>
            <div class="facts"><span>${escapeHtml(candidate.price || '가격 확인')}</span>${candidate.link ? `<a href="${escapeHtml(candidate.link)}" target="_blank" rel="noreferrer">지도·예약 ↗</a>` : ''}</div>
            <button class="select-button ${plan.selection === index ? 'selected' : ''}" data-choice="${index}">${plan.selection === index ? '선택했어요 ✓' : '여기가 좋아요'}</button>
          </article>`).join('')}
      </section>
      <p id="choice-status" class="status" role="status">${plan.selection !== undefined ? '선택이 저장되어 있어요.' : ''}</p>
      <a class="secondary-link" href="./">나도 후보 만들어보기</a>
      <footer><button class="text-button" data-dialog="privacy">개인정보 처리 안내</button><span>둘픽 MVP</span></footer>
    </main>
    <dialog id="privacy"><button class="dialog-close" aria-label="닫기">×</button><h2>선택 정보 안내</h2><p>선택 결과와 익명 참여자 ID가 제안서에 저장됩니다. 이름과 연락처는 수집하지 않습니다.</p></dialog>`
  document.querySelector('.choice-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-choice]'); if (!button) return
    document.querySelectorAll('.select-button').forEach((item) => { item.classList.remove('selected'); item.textContent = '여기가 좋아요' })
    button.classList.add('selected'); button.textContent = '선택했어요 ✓'
    await chooseCandidate(id, Number(button.dataset.choice), plan)
    document.querySelector('#choice-status').textContent = '선택을 저장했어요. 이제 이 창을 닫아도 됩니다.'
  })
  bindDialog()
}

function bindDialog() {
  const dialog = document.querySelector('#privacy')
  document.querySelector('[data-dialog="privacy"]').addEventListener('click', () => dialog.showModal())
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close())
}

async function start() {
  if (!sharedId) return renderCreator()
  app.innerHTML = '<div class="loading">둘픽을 불러오는 중…</div>'
  try { renderPlan(await getPlan(sharedId), sharedId) } catch { app.innerHTML = '<div class="loading"><b>제안서를 열 수 없어요.</b><p>링크가 잘렸거나 만료되었을 수 있습니다.</p><a href="./">새로 만들기</a></div>' }
}

start()
