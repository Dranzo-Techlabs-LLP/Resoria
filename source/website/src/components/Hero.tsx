import Photo from "./Photo";
import { ICONS } from "./Amenities";
import { heroFacts, images, site } from "@/lib/content";

export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo-badge.png"
          alt={site.name}
          className="hero-logo"
          width={512}
          height={512}
          fetchPriority="high"
        />
        <h1 id="hero-title" className="hero-display">
          For those who seek elegance, privacy, <em>and unforgettable experiences.</em>
        </h1>
        <p className="hero-note">
          Two private pool villas, three suites facing the waterfall, rooms and a dormitory for
          groups, an infinity pool, and two halls for the occasions worth gathering for.
        </p>
        <div className="hero-actions">
          <a href="#enquire" className="btn btn-primary">
            Reserve a stay
          </a>
          <a href="#stays" className="btn btn-ghost">
            See the stays
          </a>
        </div>
        <ul className="hero-facts" aria-label="At a glance">
          {heroFacts.map((f) => {
            const Icon = ICONS[f.icon];
            return (
              <li key={f.text}>
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                {f.text}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="hero-media">
        {/* Taller than the frame; ScrollMotion drifts it for depth as the page scrolls */}
        <div className="hero-media-inner" data-hero-parallax>
          <Photo src={images.hero.src} alt={images.hero.alt} position="62% 50%" flow={images.hero.flow} priority />
        </div>
      </div>
    </section>
  );
}
