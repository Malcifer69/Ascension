import type { Metadata } from 'next'
import MentorPage from './MentorPage'

export const metadata: Metadata = {
  title: 'Mentor · Vitality',
}

// The Mentor is a full page, not a popup: y — the overseer. Your goals, the
// weight of every tile on them, and what the mentor noticed in your data.
export default function Page() {
  return <MentorPage />
}
