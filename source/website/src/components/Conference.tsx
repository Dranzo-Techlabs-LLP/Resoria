import Photo from "./Photo";
import Placeholder from "./Placeholder";
import { events } from "@/lib/content";

export default function Conference() {
  return (
    <section id="events" className="conference" aria-labelledby="events-title">
      <div className="wrap conference-grid">
        <div className="conference-body">
          <h2 id="events-title" className="section-title">
            {events.title}
          </h2>
          <p className="conference-text">{events.text}</p>
          <dl className="conference-facts">
            {events.facts.map(([label, value]) => (
              <div key={label} className="conference-fact">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <a href="#enquire" className="btn btn-ghost">
            Enquire about the halls
          </a>
        </div>
        <div className="conference-media">
          <div className="conference-main">
            {events.image ? (
              <Photo src={events.image.src} alt={events.image.alt} />
            ) : (
              <Placeholder caption={events.placeholderCaption} seed="conference-hall" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
