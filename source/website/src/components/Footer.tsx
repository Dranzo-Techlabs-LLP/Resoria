import { Phone } from "lucide-react";
import InstagramIcon from "./InstagramIcon";
import WhatsAppIcon from "./WhatsAppIcon";
import { nav, site } from "@/lib/content";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <a href="#top" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/emblem.png" alt="" className="brand-mark" width={92} height={92} />
            <span>
              {site.shortName}
              <small>{site.suffix}</small>
            </span>
          </a>
          <p className="footer-tagline">{site.tagline}</p>
          <a href="#enquire" className="btn btn-paper footer-cta">
            Reserve a stay
          </a>
        </div>

        <nav className="footer-col" aria-label="Footer">
          <h2 className="footer-heading">Explore</h2>
          <a href="#grounds">Around the grounds</a>
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <a href="#enquire">Enquire</a>
        </nav>

        <div className="footer-col">
          <h2 className="footer-heading">Contact</h2>
          <a href={site.phoneHref} className="footer-contact">
            <Phone size={16} strokeWidth={1.7} aria-hidden="true" />
            {site.phone}
          </a>
          <a href={site.whatsappHref} className="footer-contact" target="_blank" rel="noreferrer">
            <WhatsAppIcon size={16} />
            WhatsApp us
          </a>
          {site.email && (
            <a href={`mailto:${site.email}`} className="footer-contact">
              {site.email}
            </a>
          )}
          {site.instagram && (
            <a href={site.instagram.href} className="footer-contact" target="_blank" rel="noreferrer">
              <InstagramIcon size={16} />
              {site.instagram.handle}
            </a>
          )}
        </div>

        <p className="footer-small">
          © {new Date().getFullYear()} {site.name}.{site.location && ` ${site.location}.`}
          {site.checkIn && site.checkOut && ` Check-in ${site.checkIn}, check-out ${site.checkOut}.`}
        </p>
      </div>
    </footer>
  );
}
