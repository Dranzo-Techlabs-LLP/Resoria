import { facilities, site } from "@/lib/content";

export default function About() {
  return (
    <section className="wrap about" aria-labelledby="about-title">
      <div className="about-grid">
        <dl className="about-facts">
          {site.location && (
            <>
              <dt>Where</dt>
              <dd>{site.location}</dd>
            </>
          )}
          <dt>Villas</dt>
          <dd>2, each with a private pool</dd>
          <dt>Suites</dt>
          <dd>3, facing the waterfall</dd>
          <dt>Rooms</dt>
          <dd>7 single rooms and the Cave Room</dd>
          <dt>Groups</dt>
          <dd>Dormitory for 60</dd>
          <dt>Grounds</dt>
          <dd>{facilities.join(", ")}</dd>
          {site.checkIn && (
            <>
              <dt>Check-in</dt>
              <dd>{site.checkIn}</dd>
            </>
          )}
          {site.checkOut && (
            <>
              <dt>Check-out</dt>
              <dd>{site.checkOut}</dd>
            </>
          )}
        </dl>
        <div className="about-body">
          <h2 id="about-title" className="about-claim">
            A retreat among the hills, with a waterfall for a neighbour.
          </h2>
          <p className="about-text">{site.description}</p>
          <p className="about-text">
            It is made for the stays that matter: a couple&apos;s weekend in a villa with its own
            pool, a family together under one roof, a team offsite with the hall booked and the
            dormitory full. Tell us what you are planning and we will help you put it together.
          </p>
        </div>
      </div>
    </section>
  );
}
