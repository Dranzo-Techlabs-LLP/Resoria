import Hero from "@/components/Hero";
import BookingStrip from "@/components/BookingStrip";
import About from "@/components/About";
import Amenities from "@/components/Amenities";
import MistSection from "@/components/mist/MistSection";
import Stays from "@/components/Stays";
import Conference from "@/components/Conference";
import Enquire from "@/components/Enquire";
import Footer from "@/components/Footer";
import ScrollMotion from "@/components/ScrollMotion";
import LightboxProvider from "@/components/lightbox/LightboxProvider";

export default function Home() {
  return (
    <LightboxProvider>
      <main id="top">
        <Hero />
        <BookingStrip />
        <About />
        <Amenities />
        <MistSection />
        <Stays />
        <Conference />
        <Enquire />
      </main>
      <Footer />
      {/* All page-level scroll effects live in one place; renders nothing */}
      <ScrollMotion />
    </LightboxProvider>
  );
}
