import { Star } from 'lucide-react'
import { PageTitle } from '../components/ui/PageTitle'
import { EmptyState } from '../components/ui/EmptyState'
import { refCardCls } from '../components/styles'

/** Rating: listed in the menu; the rating source is still to be decided. */
export function Rating() {
  return (
    <>
      <PageTitle title="Rating" subtitle="Guest ratings and reviews." />
      <div className={refCardCls}>
        <EmptyState
          icon={<Star size={22} />}
          title="No ratings yet"
          message="Guest ratings and reviews will appear here once the rating source is decided, for example Google reviews or post-checkout feedback."
        />
      </div>
    </>
  )
}
