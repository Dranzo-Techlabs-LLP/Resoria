import Photo from "./Photo";
import Placeholder from "./Placeholder";
import ViewPhoto from "./lightbox/ViewPhoto";
import { moreStays, stays, type PhotoGroup, type Stay } from "@/lib/content";

function StayItem({ stay }: { stay: Stay }) {
  return (
    <article className="stay" id={stay.slug}>
      <div className="stay-media">
        <div className="stay-main">
          {stay.image ? (
            <ViewPhoto group={stay.slug as PhotoGroup} index={0} label={stay.name}>
              <Photo src={stay.image.src} alt={stay.image.alt} position={stay.image.position} flow={stay.image.flow} />
            </ViewPhoto>
          ) : (
            <Placeholder caption={stay.placeholderCaption} seed={stay.slug} />
          )}
        </div>
      </div>
      <div className="stay-body">
        <h3 className="stay-name">{stay.name}</h3>
        <p className="stay-summary">{stay.summary}</p>
        <p className="stay-desc">{stay.description}</p>
        <dl className="stay-specs">
          {stay.facts.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="stay-foot">
          <a href="#enquire" className="text-link">
            Enquire about {stay.name.replace(/^The /, "the ").toLowerCase()}
          </a>
        </div>
      </div>

      {stay.units && (
        <div className="units">
          <ul className="units-grid units-list" aria-label={stay.name}>
            {stay.units.map((u) => (
              <li key={u.id} className="unit">
                <h4 className="unit-name">{u.name}</h4>
                <p className="unit-note">{u.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export default function Stays() {
  return (
    <>
      <section id="stays" className="stays" aria-labelledby="stays-title">
        <div className="wrap">
          <div className="stays-head">
            <h2 id="stays-title" className="section-title">
              Two pool villas and <em>three waterfall suites.</em>
            </h2>
            <p className="lede">
              Each villa has a pool of its own; each suite looks out on the falls. Every stay comes
              with the run of the grounds: the infinity pool, the kids&apos; park and the hills.
            </p>
          </div>
          <div>
            {stays.map((stay) => (
              <StayItem key={stay.slug} stay={stay} />
            ))}
          </div>
        </div>
      </section>

      <section id="rooms" className="stays stays-more" aria-labelledby="rooms-title">
        <div className="wrap">
          <div className="stays-head">
            <h2 id="rooms-title" className="section-title">
              Rooms for one or two, and <em>a dormitory for sixty.</em>
            </h2>
            <p className="lede">
              For guests travelling light, and for groups that want to stay together.
            </p>
          </div>
          <div>
            {moreStays.map((stay) => (
              <StayItem key={stay.slug} stay={stay} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
