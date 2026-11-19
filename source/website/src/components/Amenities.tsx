import { Baby, Droplets, Music, Presentation, Sun, Users, Waves, type LucideIcon } from "lucide-react";
import { amenities } from "@/lib/content";

/** The icon names used in content.ts, mapped to Lucide components. */
export const ICONS: Record<string, LucideIcon> = {
  waves: Waves,
  droplets: Droplets,
  sun: Sun,
  baby: Baby,
  music: Music,
  presentation: Presentation,
  users: Users,
};

export default function Amenities() {
  return (
    <section id="grounds" className="amenities" aria-labelledby="grounds-title">
      <div className="wrap">
        <div className="amenities-head">
          <h2 id="grounds-title" className="section-title">
            Around <em>the grounds.</em>
          </h2>
          <p className="lede">
            Every stay comes with the run of the resort, from the infinity pool to the halls.
          </p>
        </div>
        <ul className="amenities-grid">
          {amenities.map((a) => {
            const Icon = ICONS[a.icon];
            return (
              <li key={a.title} className="amenity">
                <span className="amenity-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <h3 className="amenity-title">{a.title}</h3>
                <p className="amenity-text">{a.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
