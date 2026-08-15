import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, addDoc, collection, doc, getDoc, getDocs, limit, query, updateDoc, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isCloudEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
let db, auth
if (isCloudEnabled) {
  const app = initializeApp(firebaseConfig)
  db = getFirestore(app); auth = getAuth(app)
}

const encode = (data) => btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const decode = (data) => JSON.parse(decodeURIComponent(escape(atob(data.replaceAll('-', '+').replaceAll('_', '/')))))
const ensureAuth = async () => auth.currentUser || (await signInAnonymously(auth)).user

export async function createPlan(plan) {
  if (!isCloudEnabled) return `${location.origin}${location.pathname}?p=local.${encode(plan)}`
  const user = await ensureAuth()
  const ref = await addDoc(collection(db, 'plans'), { ...plan, ownerId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'shared' })
  return `${location.origin}${location.pathname}?p=${ref.id}`
}

export async function getPlan(id) {
  if (id.startsWith('local.')) return decode(id.slice(6))
  if (!isCloudEnabled) throw new Error('Firebase 설정 없음')
  await ensureAuth(); const snapshot = await getDoc(doc(db, 'plans', id))
  if (!snapshot.exists()) throw new Error('제안서 없음')
  return snapshot.data()
}

export async function chooseCandidate(id, selection, plan) {
  if (id.startsWith('local.')) { plan.selection = selection; return }
  await ensureAuth()
  await updateDoc(doc(db, 'plans', id), { selection, selectedAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

export async function getPlaces(area = '') {
  if (!isCloudEnabled) return []
  await ensureAuth()
  const snapshot = await getDocs(query(collection(db, 'places'), limit(30)))
  const keyword = area.trim().toLowerCase()
  return snapshot.docs
    .map((place) => ({ id: place.id, ...place.data() }))
    .filter((place) => !keyword || !place.area || String(place.area).toLowerCase().includes(keyword) || keyword.includes(String(place.area).toLowerCase()))
}
